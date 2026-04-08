import { expect, Page } from "@playwright/test";

export const testEmail = process.env.PLAYWRIGHT_TEST_EMAIL;
export const testPassword = process.env.PLAYWRIGHT_TEST_PASSWORD;

export const hasAuthCredentials = Boolean(testEmail && testPassword);

export const login = async (page: Page) => {
  if (!hasAuthCredentials) {
    throw new Error("Missing PLAYWRIGHT_TEST_EMAIL or PLAYWRIGHT_TEST_PASSWORD");
  }

  await page.goto("/auth/signin");
  await page.getByPlaceholder(/doctor@hospital\.com/i).fill(testEmail || "");
  await page.getByPlaceholder(/enter your password/i).fill(testPassword || "");
  await page.getByRole("button", { name: /^sign in$/i }).click();

  try {
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  } catch {
    const signInError = await page.locator("text=Failed to fetch").first().isVisible().catch(() => false);
    if (signInError) {
      throw new Error(
        "Login request failed before navigation. Check that the backend is running, the API base URL is reachable, and local CORS allows the Playwright origin."
      );
    }

    const pageText = await page.locator("body").innerText().catch(() => "");
    throw new Error(`Login did not reach dashboard. Current URL: ${page.url()}. Visible page text: ${pageText.slice(0, 200)}`);
  }

  await expect(page).toHaveURL(/\/dashboard/);
  await dismissProductTour(page);
};

export const openAuthenticatedPage = async (page: Page, path = "/dashboard") => {
  await page.goto(path);
  await dismissProductTour(page);
};

export const uniqueSuffix = (length = 8) => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
};

export const dismissProductTour = async (page: Page) => {
  const skipButton = page.getByRole("button", { name: /^skip$/i });
  await page.waitForTimeout(500);
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
    await expect(skipButton).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
  }
};

export const findOptionValueByText = async (page: Page, selector: string, text: string) => {
  let foundValue = "";
  await expect
    .poll(
      async () => {
        foundValue = await page.locator(selector).evaluate((element, expectedText) => {
          const select = element as HTMLSelectElement;
          const option = Array.from(select.options).find(
            (entry) => entry.value && entry.textContent?.toLowerCase().includes(String(expectedText).toLowerCase())
          );
          return option?.value || "";
        }, text);

        return foundValue;
      },
      { timeout: 15_000 }
    )
    .not.toBe("");

  return foundValue;
};

export const firstNonEmptyOptionValue = async (page: Page, selector: string) => {
  let foundValue = "";
  await expect
    .poll(
      async () => {
        foundValue = await page.locator(selector).evaluate((element) => {
          const select = element as HTMLSelectElement;
          const option = Array.from(select.options).find((entry) => entry.value);
          return option?.value || "";
        });

        return foundValue;
      },
      { timeout: 15_000 }
    )
    .not.toBe("");

  return foundValue;
};
