import { expect, test } from "@playwright/test";
import { findOptionValueByText, firstNonEmptyOptionValue, hasAuthCredentials, openAuthenticatedPage, uniqueSuffix } from "./helpers/auth";

test.describe("clinic workflows", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!hasAuthCredentials, "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to enable clinic workflow tests.");

  const createPatient = async (page: import("@playwright/test").Page, patientName: string, phone: string, gender: "male" | "female" | "other") => {
    await page.goto("/dashboard/patients");
    await expect(page).toHaveURL(/\/dashboard\/patients/, { timeout: 15_000 });
    await page.getByTestId("add-patient-button").click();
    await expect(page.getByTestId("patient-form-modal")).toBeVisible();
    await page.getByTestId("patient-full-name-input").fill(patientName);
    await page.getByTestId("patient-gender-select").selectOption(gender);
    await page.getByTestId("patient-phone-input").fill(phone);
    await page.getByTestId("patient-email-input").fill(`${patientName.toLowerCase().replace(/\s+/g, ".")}@example.com`);

    const rateLimitMessage = page.getByText(/too many api requests\. please slow down and try again\./i);
    let saved = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.getByTestId("patient-submit-button").click();
      try {
        await expect(page.getByTestId("patient-form-modal")).toBeHidden({ timeout: 10_000 });
        saved = true;
        break;
      } catch (error) {
        if (attempt === 1 || !(await rateLimitMessage.isVisible().catch(() => false))) {
          throw error;
        }
        await page.waitForTimeout(2_000);
      }
    }

    expect(saved).toBeTruthy();
    await page.getByPlaceholder(/search by patient id, name, phone, or email/i).fill(patientName);
    const patientRow = page.locator("tr", { hasText: patientName }).first();
    await expect(patientRow).toBeVisible();
    const profileHref = await patientRow.getByRole("link", { name: /profile/i }).getAttribute("href");
    const patientId = profileHref?.split("/").pop() || "";
    expect(patientId).not.toBe("");
    return { patientId };
  };

  const selectAvailableAppointmentSlotAndSubmit = async (page: import("@playwright/test").Page, notes: string) => {
    const doctorSelect = page.getByTestId("appointment-doctor-select");
    const doctorOptions = await doctorSelect.evaluate((element) => {
      const select = element as HTMLSelectElement;
      return Array.from(select.options)
        .map((option) => option.value)
        .filter(Boolean);
    });

    expect(doctorOptions.length).toBeGreaterThan(0);

    for (const doctorValue of doctorOptions) {
      await doctorSelect.selectOption(doctorValue);
      await page.waitForTimeout(150);

      const timeSelect = page.getByTestId("appointment-time-select");
      const timeOptions = await timeSelect.evaluate((element) => {
        const select = element as HTMLSelectElement;
        return Array.from(select.options)
          .map((option) => option.value)
          .filter(Boolean);
      });

      if (timeOptions.length === 0) {
        continue;
      }

      for (const timeValue of timeOptions) {
        await timeSelect.selectOption(timeValue);
        await page.getByTestId("appointment-notes-input").fill(notes);
        await page.getByTestId("appointment-submit-button").click();

        try {
          await expect(page.getByTestId("appointment-form-modal")).toBeHidden({ timeout: 3_000 });
          return;
        } catch (error) {
          const hasConflictMessage = await page
            .getByText(/already booked for that time|time slot conflict/i)
            .first()
            .isVisible()
            .catch(() => false);

          if (!hasConflictMessage) {
            throw error;
          }
        }
      }
    }

    throw new Error("No non-conflicting appointment slot was available for any doctor.");
  };

  const selectInvoicePatient = async (page: import("@playwright/test").Page, patientName: string) => {
    const patientValue = await findOptionValueByText(page, '[data-testid="invoice-patient-select"]', patientName);
    expect(patientValue).not.toBe("");
    await page.getByTestId("invoice-patient-select").selectOption(patientValue);
  };

  const selectMedicalRecordPatient = async (page: import("@playwright/test").Page, patientName: string) => {
    const patientValue = await findOptionValueByText(page, '[data-testid="medical-record-patient-select"]', patientName);
    expect(patientValue).not.toBe("");
    await page.getByTestId("medical-record-patient-select").selectOption(patientValue);
  };

  test("can create a patient from the patients screen", async ({ page }) => {
    const suffix = uniqueSuffix();
    const patientName = `Playwright Patient ${suffix}`;
    const phone = `9${String(Date.now()).slice(-9)}`;

    await openAuthenticatedPage(page);
    await createPatient(page, patientName, phone, "male");
  });

  test("can create an appointment for a newly created patient", async ({ page }) => {
    const suffix = uniqueSuffix();
    const patientName = `Playwright Appointment ${suffix}`;
    const phone = `8${String(Date.now()).slice(-9)}`;

    await openAuthenticatedPage(page);
    const { patientId } = await createPatient(page, patientName, phone, "female");

    await page.goto(`/dashboard/appointments?patientId=${encodeURIComponent(patientId)}`);
    await page.getByTestId("add-appointment-button").click();
    await expect(page.getByTestId("appointment-form-modal")).toBeVisible();

    await selectAvailableAppointmentSlotAndSubmit(page, `Playwright appointment ${suffix}`);
    await expect(page.getByText(/no appointments match the current view\./i)).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(patientName).first()).toBeVisible({ timeout: 10_000 });
  });

  test("can create an invoice for a newly created patient", async ({ page }) => {
    const suffix = uniqueSuffix();
    const patientName = `Playwright Billing ${suffix}`;
    const phone = `7${String(Date.now()).slice(-9)}`;

    await openAuthenticatedPage(page);
    const { patientId } = await createPatient(page, patientName, phone, "other");

    await page.goto(`/dashboard/billings?patientId=${encodeURIComponent(patientId)}`);
    await page.getByTestId("create-invoice-button").click();
    await expect(page.getByTestId("invoice-form-modal")).toBeVisible();
    await selectInvoicePatient(page, patientName);
    await page.getByTestId("invoice-item-description-input").fill(`Consultation ${suffix}`);
    await page.getByTestId("invoice-item-quantity-input").fill("1");
    await page.getByTestId("invoice-item-unit-price-input").fill("500");
    await page.getByTestId("invoice-notes-input").fill(`Playwright invoice ${suffix}`);
    await page.getByTestId("invoice-submit-button").click();

    await expect(page.getByTestId("invoice-form-modal")).toBeHidden();
    await expect(page.getByText(/no invoices found\./i)).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^issue$/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("can create a medical record for a newly created patient", async ({ page }) => {
    const suffix = uniqueSuffix();
    const patientName = `Playwright Record ${suffix}`;
    const phone = `6${String(Date.now()).slice(-9)}`;

    await openAuthenticatedPage(page);
    const { patientId } = await createPatient(page, patientName, phone, "female");

    await page.goto(`/dashboard/medical-records?patientId=${encodeURIComponent(patientId)}`);
    await page.getByTestId("add-medical-record-button").click();
    await expect(page.getByTestId("medical-record-form-modal")).toBeVisible();
    await selectMedicalRecordPatient(page, patientName);

    const doctorValue = await firstNonEmptyOptionValue(page, '[data-testid="medical-record-doctor-select"]');
    expect(doctorValue).not.toBe("");
    await page.getByTestId("medical-record-doctor-select").selectOption(doctorValue);

    await page.getByTestId("medical-record-type-input").fill("Consultation");
    await page.getByTestId("medical-record-symptoms-input").fill("Mild pain");
    await page.getByTestId("medical-record-diagnosis-input").fill("Observation");
    await page.getByTestId("medical-record-prescription-input").fill("Rest and hydration");
    await page.getByTestId("medical-record-date-input").fill(new Date().toISOString().slice(0, 10));
    await page.getByTestId("medical-record-notes-input").fill(`Playwright medical record ${suffix}`);
    await page.getByTestId("medical-record-submit-button").click();

    await expect(page.getByTestId("medical-record-form-modal")).toBeHidden();
    await expect(page.getByText(patientName).first()).toBeVisible({ timeout: 10_000 });
  });

  test("can record a payment for a created invoice", async ({ page }) => {
    const suffix = uniqueSuffix();
    const patientName = `Playwright Payment ${suffix}`;
    const phone = `5${String(Date.now()).slice(-9)}`;

    await openAuthenticatedPage(page);
    const { patientId } = await createPatient(page, patientName, phone, "male");

    await page.goto(`/dashboard/billings?patientId=${encodeURIComponent(patientId)}`);
    await page.getByTestId("create-invoice-button").click();
    await expect(page.getByTestId("invoice-form-modal")).toBeVisible();
    await selectInvoicePatient(page, patientName);
    await page.getByTestId("invoice-item-description-input").fill(`Payment test ${suffix}`);
    await page.getByTestId("invoice-item-quantity-input").fill("1");
    await page.getByTestId("invoice-item-unit-price-input").fill("400");
    await page.getByTestId("invoice-submit-button").click();
    await expect(page.getByTestId("invoice-form-modal")).toBeHidden();

    const issueButton = page.getByRole("button", { name: /^issue$/i }).first();
    await expect(issueButton).toBeVisible({ timeout: 10_000 });
    await issueButton.click();
    const addPaymentButton = page.getByRole("button", { name: /add payment/i }).first();
    await expect(addPaymentButton).toBeVisible({ timeout: 10_000 });

    await addPaymentButton.click();
    await expect(page.getByTestId("payment-form-modal")).toBeVisible();
    await page.getByTestId("payment-amount-input").fill("400");
    await page.getByTestId("payment-method-select").selectOption("cash");
    await page.getByTestId("payment-reference-input").fill(`PW-${suffix}`);
    await page.getByTestId("payment-submit-button").click();

    await expect(page.getByTestId("payment-form-modal")).toBeHidden();
  });
});
