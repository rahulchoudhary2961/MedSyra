import { expect, test } from "@playwright/test";
import { hasAuthCredentials, openAuthenticatedPage } from "./helpers/auth";

const pageChecks = [
  { path: "/dashboard", heading: /dashboard/i },
  { path: "/dashboard/reports", heading: /advanced reports/i },
  { path: "/dashboard/settings", heading: /^settings$/i },
  { path: "/dashboard/branches", heading: /branch management/i },
  { path: "/dashboard/assistant", heading: /medsyra guided chat/i },
  { path: "/dashboard/messages", heading: /^messages$/i }
];

test.describe("dashboard pages", () => {
  test.skip(!hasAuthCredentials, "Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to enable dashboard page tests.");

  for (const pageCheck of pageChecks) {
    test(`loads ${pageCheck.path}`, async ({ page }) => {
      await openAuthenticatedPage(page, pageCheck.path);
      await expect(page.getByRole("heading", { name: pageCheck.heading }).first()).toBeVisible({ timeout: 15_000 });
    });
  }
});
