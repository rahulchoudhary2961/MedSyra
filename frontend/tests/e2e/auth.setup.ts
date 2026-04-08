import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

const authDir = path.resolve(__dirname, ".auth");
const authFile = path.join(authDir, "user.json");

async function writeEmptyStorageState() {
  await fs.mkdir(authDir, { recursive: true });
  await fs.writeFile(authFile, JSON.stringify({ cookies: [], origins: [] }, null, 2), "utf8");
}

async function globalSetup(config: FullConfig) {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD;

  if (!email || !password) {
    await writeEmptyStorageState();
    return;
  }

  const baseURL = config.projects.find((project) => project.name === "chromium-auth")?.use?.baseURL || "http://localhost:3000";
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseURL}/auth/signin`);
    await page.getByPlaceholder(/doctor@hospital\.com/i).fill(email);
    await page.getByPlaceholder(/enter your password/i).fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    const skipButton = page.getByRole("button", { name: /^skip$/i });
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click();
    }

    await fs.mkdir(authDir, { recursive: true });
    await context.storageState({ path: authFile });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
