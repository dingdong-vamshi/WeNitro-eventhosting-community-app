import assert from "node:assert/strict";
import { existsSync, promises as fs } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";

let server;
let baseUrl = process.env.QA_APP_BASE_URL;
if (!baseUrl) {
  const root = path.resolve("dist");
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
    const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = path.resolve(root, requested);
    if (!file.startsWith(`${root}${path.sep}`) && file !== path.join(root, "index.html")) {
      response.writeHead(403).end(); return;
    }
    try {
      const body = await fs.readFile(file);
      const contentType = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "application/octet-stream";
      response.writeHead(200, { "Content-Type": contentType }); response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
});

try {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.route("https://cxsznhrkzqndhseodcyy.supabase.co/**", async (route) => {
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

  await page.goto(`${baseUrl}/#/signup`);
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
  if (server) await new Promise(resolve => server.close(resolve));
}
