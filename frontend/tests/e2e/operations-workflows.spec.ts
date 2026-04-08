import { expect, test } from "@playwright/test";
import {
  findOptionValueByText,
  firstNonEmptyOptionValue,
  hasAuthCredentials,
  openAuthenticatedPage,
  uniqueSuffix
} from "./helpers/auth";

const futureDate = (daysAhead: number) => {
  const value = new Date();
  value.setDate(value.getDate() + daysAhead);
  return value.toISOString().slice(0, 10);
};

test.describe("operations workflows", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!hasAuthCredentials, "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to enable operations workflow tests.");

  const createPatient = async (
    page: import("@playwright/test").Page,
    patientName: string,
    phone: string,
    gender: "male" | "female" | "other"
  ) => {
    await page.goto("/dashboard/patients");
    await expect(page).toHaveURL(/\/dashboard\/patients/, { timeout: 15_000 });
    await page.getByTestId("add-patient-button").click();
    await expect(page.getByTestId("patient-form-modal")).toBeVisible();
    await page.getByTestId("patient-full-name-input").fill(patientName);
    await page.getByTestId("patient-gender-select").selectOption(gender);
    await page.getByTestId("patient-phone-input").fill(phone);
    await page.getByTestId("patient-email-input").fill(`${patientName.toLowerCase().replace(/\s+/g, ".")}@example.com`);

    const rateLimitMessage = page.getByText(/too many api requests\. please slow down and try again\./i);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.getByTestId("patient-submit-button").click();

      try {
        await expect(page.getByTestId("patient-form-modal")).toBeHidden({ timeout: 10_000 });
        break;
      } catch (error) {
        if (attempt === 1 || !(await rateLimitMessage.isVisible().catch(() => false))) {
          throw error;
        }

        await page.waitForTimeout(2_000);
      }
    }

    await page.getByPlaceholder(/search by patient id, name, phone, or email/i).fill(patientName);
    const patientRow = page.locator("tr", { hasText: patientName }).first();
    await expect(patientRow).toBeVisible({ timeout: 10_000 });
    const profileHref = await patientRow.getByRole("link", { name: /profile/i }).getAttribute("href");
    const patientId = profileHref?.split("/").pop() || "";
    expect(patientId).not.toBe("");
    return { patientId };
  };

  const createInvoiceForPatient = async (
    page: import("@playwright/test").Page,
    patientId: string,
    patientName: string,
    suffix: string,
    amount = "650"
  ) => {
    await page.goto(`/dashboard/billings?patientId=${encodeURIComponent(patientId)}`);
    await page.getByTestId("create-invoice-button").click();
    await expect(page.getByTestId("invoice-form-modal")).toBeVisible();

    const patientValue = await findOptionValueByText(page, '[data-testid="invoice-patient-select"]', patientName);
    expect(patientValue).not.toBe("");
    await page.getByTestId("invoice-patient-select").selectOption(patientValue);
    await page.getByTestId("invoice-item-description-input").fill(`Workflow invoice ${suffix}`);
    await page.getByTestId("invoice-item-quantity-input").fill("1");
    await page.getByTestId("invoice-item-unit-price-input").fill(amount);
    await page.getByTestId("invoice-notes-input").fill(`Insurance support invoice ${suffix}`);
    await page.getByTestId("invoice-submit-button").click();
    await expect(page.getByTestId("invoice-form-modal")).toBeHidden();

    const invoiceRow = page.locator("tbody tr", { hasText: patientName }).first();
    await expect(invoiceRow).toBeVisible({ timeout: 10_000 });
    const invoiceNumber = (await invoiceRow.locator("td").first().locator("p").first().innerText()).trim();
    expect(invoiceNumber).toMatch(/^INV-/i);
    return { invoiceNumber };
  };

  test("can create a doctor profile", async ({ page }) => {
    const suffix = uniqueSuffix(6);
    const doctorName = `Playwright Doctor ${suffix}`;

    await openAuthenticatedPage(page, "/dashboard/doctors");
    await page.getByTestId("add-doctor-button").click();
    await expect(page.getByTestId("doctor-form-modal")).toBeVisible();
    await page.getByTestId("doctor-full-name-input").fill(doctorName);
    await page.getByTestId("doctor-specialty-input").fill(`General ${suffix}`);
    await page.getByTestId("doctor-experience-years-input").fill("7");
    await page.getByTestId("doctor-consultation-fee-input").fill("700");
    await page.getByTestId("doctor-phone-input").fill(`9${String(Date.now()).slice(-9)}`);
    await page.getByTestId("doctor-email-input").fill(`doctor.${suffix}@example.com`);
    await page.getByTestId("doctor-submit-button").click();
    await expect(page.getByTestId("doctor-form-modal")).toBeHidden();

    await page.getByTestId("doctor-search-input").fill(doctorName);
    await expect(page.getByTestId("doctor-card").filter({ hasText: doctorName }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("can create a CRM task for a patient", async ({ page }) => {
    const suffix = uniqueSuffix(6);
    const patientName = `Playwright Crm ${suffix}`;
    const taskTitle = `Follow up ${suffix}`;

    await openAuthenticatedPage(page);
    const { patientId } = await createPatient(page, patientName, `8${String(Date.now()).slice(-9)}`, "female");

    await page.goto(`/dashboard/crm?patientId=${encodeURIComponent(patientId)}`);
    await page.getByTestId("crm-create-task-button").click();
    await expect(page.getByTestId("crm-create-form")).toBeVisible();

    const patientValue = await findOptionValueByText(page, '[data-testid="crm-patient-select"]', patientName);
    await page.getByTestId("crm-patient-select").selectOption(patientValue);
    await page.getByTestId("crm-task-type-select").selectOption("follow_up");
    await page.getByTestId("crm-due-date-input").fill(futureDate(2));
    await page.getByTestId("crm-priority-select").selectOption("high");
    await page.getByTestId("crm-title-input").fill(taskTitle);
    await page.getByTestId("crm-notes-input").fill(`Playwright CRM task ${suffix}`);
    await page.getByTestId("crm-submit-button").click();

    await expect(page.getByTestId("crm-create-form")).toBeHidden();
    await expect(page.getByTestId("crm-task-card").filter({ hasText: taskTitle }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("can create a lab test and a lab order", async ({ page }) => {
    const suffix = uniqueSuffix(6);
    const patientName = `Playwright Lab ${suffix}`;
    const labTestName = `Playwright Test ${suffix}`;

    await openAuthenticatedPage(page);
    const { patientId } = await createPatient(page, patientName, `7${String(Date.now()).slice(-9)}`, "male");

    await page.goto(`/dashboard/lab?patientId=${encodeURIComponent(patientId)}`);
    await page.getByTestId("lab-add-test-button").click();
    await expect(page.getByTestId("lab-test-form")).toBeVisible();
    await page.getByTestId("lab-test-code-input").fill(`LAB${suffix.toUpperCase()}`);
    await page.getByTestId("lab-test-name-input").fill(labTestName);
    await page.getByTestId("lab-test-department-input").fill("Pathology");
    await page.getByTestId("lab-test-price-input").fill("450");
    await page.getByTestId("lab-test-turnaround-input").fill("24");
    await page.getByTestId("lab-test-instructions-input").fill("Collect fasting sample.");
    await page.getByTestId("lab-test-submit-button").click();
    await expect(page.getByTestId("lab-test-form")).toBeHidden();

    await page.getByTestId("lab-book-order-button").click();
    await expect(page.getByTestId("lab-order-form")).toBeVisible();
    const patientValue = await findOptionValueByText(page, '[data-testid="lab-order-patient-select"]', patientName);
    await page.getByTestId("lab-order-patient-select").selectOption(patientValue);
    const labTestValue = await findOptionValueByText(page, '[data-testid="lab-order-item-test-select"]', labTestName);
    await page.getByTestId("lab-order-item-test-select").selectOption(labTestValue);
    await page.getByTestId("lab-order-notes-input").fill(`Playwright lab order ${suffix}`);
    await page.getByTestId("lab-order-submit-button").click();

    await expect(page.getByTestId("lab-order-form")).toBeHidden();
    await expect(page.getByTestId("lab-order-card").filter({ hasText: patientName }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(labTestName).first()).toBeVisible({ timeout: 10_000 });
  });

  test("can create an inventory item and record movement", async ({ page }) => {
    const suffix = uniqueSuffix(6);
    const itemName = `Playwright Gauze ${suffix}`;
    const movementNote = `Initial stock ${suffix}`;

    await openAuthenticatedPage(page, "/dashboard/inventory");
    await page.getByTestId("inventory-add-item-button").click();
    await expect(page.getByTestId("inventory-item-form")).toBeVisible();
    await page.getByTestId("inventory-item-code-input").fill(`INV${suffix.toUpperCase()}`);
    await page.getByTestId("inventory-item-name-input").fill(itemName);
    await page.getByTestId("inventory-item-category-input").fill("Consumables");
    await page.getByTestId("inventory-item-unit-input").fill("pcs");
    await page.getByTestId("inventory-item-reorder-level-input").fill("5");
    await page.getByTestId("inventory-item-submit-button").click();
    await expect(page.getByTestId("inventory-item-form")).toBeHidden();

    await page.getByTestId("inventory-record-movement-button").click();
    await expect(page.getByTestId("inventory-movement-form")).toBeVisible();
    const itemValue = await findOptionValueByText(page, '[data-testid="inventory-movement-item-select"]', itemName);
    await page.getByTestId("inventory-movement-item-select").selectOption(itemValue);
    await page.getByTestId("inventory-movement-type-select").selectOption("stock_in");
    await page.getByTestId("inventory-movement-quantity-input").fill("25");
    await page.getByTestId("inventory-movement-unit-cost-input").fill("12");
    await page.getByTestId("inventory-movement-notes-input").fill(movementNote);
    await page.getByTestId("inventory-movement-submit-button").click();

    await expect(page.getByTestId("inventory-movement-form")).toBeHidden();
    await expect(page.getByTestId("inventory-movement-card").filter({ hasText: movementNote }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("can create pharmacy stock and dispense it to a patient", async ({ page }) => {
    const suffix = uniqueSuffix(6);
    const patientName = `Playwright Pharmacy ${suffix}`;
    const medicineName = `Playwright Med ${suffix}`;
    const batchNumber = `BAT${suffix.toUpperCase()}`;

    await openAuthenticatedPage(page);
    const { patientId } = await createPatient(page, patientName, `6${String(Date.now()).slice(-9)}`, "other");

    await page.goto(`/dashboard/pharmacy?patientId=${encodeURIComponent(patientId)}`);
    await page.getByTestId("pharmacy-add-medicine-button").click();
    await expect(page.getByTestId("pharmacy-medicine-form")).toBeVisible();
    await page.getByTestId("pharmacy-medicine-code-input").fill(`MED${suffix.toUpperCase()}`);
    await page.getByTestId("pharmacy-medicine-name-input").fill(medicineName);
    await page.getByTestId("pharmacy-medicine-generic-name-input").fill(`Generic ${suffix}`);
    await page.getByTestId("pharmacy-medicine-dosage-form-input").fill("Tablet");
    await page.getByTestId("pharmacy-medicine-strength-input").fill("500mg");
    await page.getByTestId("pharmacy-medicine-unit-input").fill("tablet");
    await page.getByTestId("pharmacy-medicine-reorder-level-input").fill("2");
    await page.getByTestId("pharmacy-medicine-submit-button").click();
    await expect(page.getByTestId("pharmacy-medicine-form")).toBeHidden();

    await page.getByTestId("pharmacy-add-batch-button").click();
    await expect(page.getByTestId("pharmacy-batch-form")).toBeVisible();
    const medicineValue = await findOptionValueByText(page, '[data-testid="pharmacy-batch-medicine-select"]', medicineName);
    await page.getByTestId("pharmacy-batch-medicine-select").selectOption(medicineValue);
    await page.getByTestId("pharmacy-batch-number-input").fill(batchNumber);
    await page.getByTestId("pharmacy-batch-manufacturer-input").fill("Playwright Pharma");
    await page.getByTestId("pharmacy-batch-expiry-date-input").fill(futureDate(365));
    await page.getByTestId("pharmacy-batch-received-quantity-input").fill("40");
    await page.getByTestId("pharmacy-batch-sale-price-input").fill("25");
    await page.getByTestId("pharmacy-batch-submit-button").click();
    await expect(page.getByTestId("pharmacy-batch-form")).toBeHidden();

    await page.getByTestId("pharmacy-dispense-button").click();
    await expect(page.getByTestId("pharmacy-dispense-form")).toBeVisible();
    const patientValue = await findOptionValueByText(page, '[data-testid="pharmacy-dispense-patient-select"]', patientName);
    await page.getByTestId("pharmacy-dispense-patient-select").selectOption(patientValue);
    const batchValue = await findOptionValueByText(page, '[data-testid="pharmacy-dispense-batch-select"]', batchNumber);
    await page.getByTestId("pharmacy-dispense-batch-select").selectOption(batchValue);
    await page.getByTestId("pharmacy-dispense-quantity-input").fill("2");
    await page.getByTestId("pharmacy-dispense-directions-input").fill("After meals");
    const createInvoiceCheckbox = page.getByTestId("pharmacy-dispense-create-invoice-checkbox");
    if (await createInvoiceCheckbox.isChecked()) {
      await createInvoiceCheckbox.uncheck();
    }
    await page.getByTestId("pharmacy-dispense-notes-input").fill(`Playwright dispense ${suffix}`);
    await page.getByTestId("pharmacy-dispense-submit-button").click();

    await expect(page.getByTestId("pharmacy-dispense-form")).toBeHidden();
    await expect(page.getByTestId("pharmacy-dispense-card").filter({ hasText: patientName }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(medicineName).first()).toBeVisible({ timeout: 10_000 });
  });

  test("can create an insurance provider and claim", async ({ page }) => {
    const suffix = uniqueSuffix(6);
    const patientName = `Playwright Insurance ${suffix}`;
    const providerName = `Playwright Cover ${suffix}`;

    await openAuthenticatedPage(page);
    const { patientId } = await createPatient(page, patientName, `5${String(Date.now()).slice(-9)}`, "male");
    const { invoiceNumber } = await createInvoiceForPatient(page, patientId, patientName, suffix, "900");

    await page.goto(`/dashboard/insurance?patientId=${encodeURIComponent(patientId)}`);
    await page.getByTestId("insurance-add-provider-button").click();
    await expect(page.getByTestId("insurance-provider-form")).toBeVisible();
    await page.getByTestId("insurance-provider-code-input").fill(`PAY${suffix.toUpperCase()}`);
    await page.getByTestId("insurance-provider-name-input").fill(providerName);
    await page.getByTestId("insurance-provider-email-input").fill(`payer.${suffix}@example.com`);
    await page.getByTestId("insurance-provider-phone-input").fill(`9${String(Date.now()).slice(-9)}`);
    await page.getByTestId("insurance-provider-submit-button").click();
    await expect(page.getByText(/insurance provider created\./i)).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("insurance-add-claim-button").click();
    await expect(page.getByTestId("insurance-claim-form")).toBeVisible();
    const patientValue = await findOptionValueByText(page, '[data-testid="insurance-claim-patient-select"]', patientName);
    await page.getByTestId("insurance-claim-patient-select").selectOption(patientValue);
    const providerValue = await findOptionValueByText(page, '[data-testid="insurance-claim-provider-select"]', providerName);
    await page.getByTestId("insurance-claim-provider-select").selectOption(providerValue);
    const invoiceValue = await findOptionValueByText(page, '[data-testid="insurance-claim-invoice-select"]', invoiceNumber);
    await page.getByTestId("insurance-claim-invoice-select").selectOption(invoiceValue);
    await page.getByTestId("insurance-claim-policy-number-input").fill(`POL-${suffix.toUpperCase()}`);
    await page.getByTestId("insurance-claim-member-id-input").fill(`MEM-${suffix.toUpperCase()}`);
    await page.getByTestId("insurance-claim-amount-input").fill("900");
    await page.getByTestId("insurance-claim-diagnosis-input").fill("Routine coverage request");
    await page.getByTestId("insurance-claim-treatment-input").fill("Consultation and diagnostics");
    await page.getByTestId("insurance-claim-notes-input").fill(`Playwright insurance claim ${suffix}`);
    await page.getByTestId("insurance-claim-submit-button").click();

    await expect(page.getByTestId("insurance-claim-form")).toBeHidden();
    await expect(page.getByText(/insurance claim submitted\./i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("insurance-claim-queue-item").filter({ hasText: patientName }).first()).toBeVisible({ timeout: 10_000 });
  });
});
