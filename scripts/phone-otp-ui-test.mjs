import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
});

try {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.route("https://klyjzbisgycegkkacbjw.supabase.co/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/auth/v1/otp")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    await route.abort();
  });

  await page.goto("http://localhost:8081/#/signup");
  const skipIntro = page.getByText("Skip", { exact: true }).first();
  const phoneTab = page.getByText("Phone", { exact: true });
  await Promise.race([
    skipIntro.waitFor({ timeout: 10_000 }).catch(() => undefined),
    phoneTab.waitFor({ timeout: 10_000 }).catch(() => undefined),
  ]);
  if (await skipIntro.isVisible().catch(() => false)) {
    await skipIntro.click();
  }
  const fallback = page.getByText("Use email or phone instead", { exact: true });
  await Promise.race([
    fallback.waitFor({ timeout: 10_000 }).catch(() => undefined),
    phoneTab.waitFor({ timeout: 10_000 }).catch(() => undefined),
  ]);
  if (await fallback.isVisible().catch(() => false)) {
    await fallback.click();
  }
  const createAccount = page.getByText("New to WeNitro? Create an account", { exact: true });
  if (await createAccount.isVisible().catch(() => false)) {
    await createAccount.click();
  }
  await phoneTab.click();
  const signupFields = page.locator("input:visible");
  await signupFields.nth(0).fill("Vamshi");
  await signupFields.nth(1).fill("9876543210");
  await page.getByRole("button", { name: "Send OTP" }).click();

  await page.getByText(/Verify your phone/).waitFor();
  assert.equal(await page.locator("input:visible").isVisible(), true);
  assert.equal(
    await page.getByRole("button", { name: "Verify & Create Account" }).isVisible(),
    true,
  );
  assert.match(await page.getByText(/Verify your phone/).textContent(), /\+91.*3210/);
  assert.doesNotMatch(await page.getByText(/Verify your phone/).textContent(), /9876543210/);
  assert.equal(await page.getByText("Resend OTP in 30s").isVisible(), true);
  await page.getByText("Edit phone number", { exact: true }).click();
  assert.equal(await page.locator("input:visible").nth(0).inputValue(), "Vamshi");

  console.log("Phone OTP signup UI transition passed");
} finally {
  await browser.close();
}
