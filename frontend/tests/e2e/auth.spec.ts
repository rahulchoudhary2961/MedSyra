import { expect, test } from "@playwright/test";
import { hasAuthCredentials, openAuthenticatedPage } from "./helpers/auth";

test.describe("authenticated flow", () => {
  test.skip(!hasAuthCredentials, "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to enable auth flow tests.");

  test("user can sign in and reach dashboard", async ({ page }) => {
    await openAuthenticatedPage(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("button", { name: /logout/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/search patients, doctors/i)).toBeVisible({ timeout: 15_000 });
  });
});
