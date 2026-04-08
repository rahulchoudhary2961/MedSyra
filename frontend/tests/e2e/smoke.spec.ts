import { expect, test } from "@playwright/test";

test.describe("public app smoke", () => {
  test("landing page renders primary marketing content", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /run your practice smoothly, without registers or manual work/i })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /book free demo/i }).first()).toBeVisible();
  });

  test("sign in page shows login form", async ({ page }) => {
    await page.goto("/auth/signin");

    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByPlaceholder(/doctor@hospital\.com/i)).toBeVisible();
    await expect(page.getByPlaceholder(/enter your password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});
