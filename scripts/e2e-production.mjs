import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const ARTIFACT_DIR = resolve(process.cwd(), "artifacts/e2e");
const AUTH_EMAIL = process.env.E2E_EMAIL || process.env.AUTH_EMAIL || "";
const AUTH_PASSWORD = process.env.E2E_PASSWORD || process.env.AUTH_PASSWORD || "";
const HEADLESS = !["0", "false", "no"].includes(
  String(process.env.HEADLESS || "true").toLowerCase(),
);

if (existsSync(ARTIFACT_DIR)) rmSync(ARTIFACT_DIR, { recursive: true });
mkdirSync(ARTIFACT_DIR, { recursive: true });

const results = [];
const runtimeErrors = [];
let screenshotIndex = 0;

const cleanName = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);

function record(status, name, detail = "") {
  results.push({ status, name, detail });
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${status}] ${name}${suffix}`);
}

async function shot(page, name, fullPage = false) {
  screenshotIndex += 1;
  const file = `${String(screenshotIndex).padStart(2, "0")}-${cleanName(name)}.png`;
  await page.screenshot({
    path: resolve(ARTIFACT_DIR, file),
    fullPage,
    animations: "disabled",
  });
  return file;
}

async function step(page, name, action, { optional = false } = {}) {
  try {
    await action();
    record("PASS", name);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    if (optional) {
      record("SKIP", name, detail);
      return false;
    }
    record("FAIL", name, detail);
    await shot(page, `failure-${name}`, true).catch(() => undefined);
    return false;
  }
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(250);
}

async function visible(locator, description, timeout = 10_000) {
  await locator.first().waitFor({ state: "visible", timeout });
  if (!(await locator.first().isVisible())) throw new Error(`${description} is not visible`);
}

async function clickText(page, text) {
  const target = page.getByText(text, { exact: true }).last();
  await visible(target, text);
  await target.click();
  await page.waitForTimeout(250);
}

async function navigateTab(page, label, marker) {
  await clickText(page, label);
  await visible(marker, `${label} screen`);
}

function attachRuntimeGuards(page, scope) {
  page.on("pageerror", (error) => {
    runtimeErrors.push({ scope, type: "pageerror", message: error.message });
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push({ scope, type: "console.error", message: message.text() });
    }
  });
}

async function enterDemo(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await settle(page);

  const demoButton = page.getByText("Explore the interactive demo", { exact: true });
  if (await demoButton.isVisible().catch(() => false)) {
    await demoButton.click();
  }

  await visible(page.getByText("Home", { exact: true }).last(), "Home navigation", 15_000);
  await visible(page.getByText("Discover Activities", { exact: false }), "Feed content");
}

async function assertMobileLayout(page, label) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  const widest = Math.max(metrics.documentWidth, metrics.bodyWidth);
  if (widest > metrics.viewportWidth + 3) {
    throw new Error(`${label} overflows horizontally (${widest}px > ${metrics.viewportWidth}px)`);
  }
}

async function runDemoSuite(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  attachRuntimeGuards(page, "demo-mobile");

  await step(page, "Explicit demo login opens the feed", async () => {
    await enterDemo(page);
    await shot(page, "feed-light");
  });

  await step(page, "Feed is responsive on a mobile viewport", async () => {
    await assertMobileLayout(page, "Feed");
  });

  await step(page, "Dark theme persists between Feed and Profile", async () => {
    const darkToggle = page.getByLabel("Switch to dark mode");
    await visible(darkToggle, "dark-mode toggle");
    await darkToggle.click();
    await visible(page.getByLabel("Switch to light mode"), "light-mode toggle");
    await shot(page, "feed-dark");

    await navigateTab(
      page,
      "Profile",
      page.getByText("Suchit Pradhan", { exact: true }),
    );
    await visible(page.getByLabel("Switch to light mode"), "persisted dark-mode state");
    await shot(page, "profile-dark");
  });

  await step(page, "All main navigation tabs render their modules", async () => {
    await navigateTab(page, "Home", page.getByText("Discover Activities", { exact: false }));
    await navigateTab(page, "Vibes", page.getByLabel("Next vibe"));
    const reelCounter = page.getByText(/^\d+\/\d+$/).first();
    const before = await reelCounter.textContent();
    await page.getByLabel("Next vibe").click();
    await page.waitForTimeout(300);
    const after = await reelCounter.textContent();
    if (!before || !after || before === after) {
      throw new Error(`Next vibe did not advance the reel counter (${before} -> ${after})`);
    }
    await shot(page, "vibes-reel");
    await navigateTab(page, "Host", page.getByText("Create & Share", { exact: true }));
    await shot(page, "host");
    await navigateTab(page, "Chat", page.getByPlaceholder("Search people and groups"));
    await shot(page, "chat");
    await navigateTab(page, "Profile", page.getByLabel("Settings"));
  });

  await step(page, "Activities and search workflow is interactive", async () => {
    await navigateTab(page, "Home", page.getByText("Discover Activities", { exact: false }));
    await page.getByLabel("Explore activities").click();
    await visible(page.getByText("Activities in & around", { exact: false }), "activities list");
    await shot(page, "activities");

    await page.getByText("Search Activities", { exact: true }).click();
    await visible(page.getByText("Search", { exact: true }).first(), "search screen");
    const search = page.getByPlaceholder("Study buddy, badminton, cricket...");
    await search.fill("study");
    await visible(page.getByText(/study/i).first(), "filtered search result");
    await shot(page, "search-results");
  });

  await step(page, "Vibe composer supports activity selection and captions", async () => {
    await navigateTab(page, "Host", page.getByText("Create & Share", { exact: true }));
    await page.getByText("Post a Vibe", { exact: true }).first().click();
    await visible(page.getByText("Choose an activity", { exact: true }), "activity picker");
    const caption = page.getByPlaceholder("What is the update, request, or moment?");
    await caption.fill("Sunrise badminton with the WeNitro crew in Bhubaneswar.");
    await visible(page.getByText("55/2200", { exact: true }), "caption counter");
    await visible(page.getByText("Post Vibe", { exact: true }).last(), "post action");
    await shot(page, "vibe-composer", true);
  });

  await step(page, "Communities discovery and filters work", async () => {
    await navigateTab(page, "Home", page.getByText("Discover Activities", { exact: false }));
    const communitiesLink = page.getByText("Explore all communities", { exact: false });
    await communitiesLink.scrollIntoViewIfNeeded();
    await communitiesLink.click();
    await visible(page.getByPlaceholder("Search Community"), "communities search");
    await page.getByText("Joined", { exact: true }).first().click();
    await page.getByText("All", { exact: true }).first().click();
    await page.getByPlaceholder("Search Community").fill("Bhubaneswar");
    await visible(page.getByText(/Bhubaneswar/i).first(), "community search result");
    await shot(page, "communities", true);
  });

  await step(page, "Profile settings and appearance controls open", async () => {
    await navigateTab(page, "Profile", page.getByLabel("Settings"));
    await page.getByLabel("Settings").click();
    await visible(page.getByText("Settings", { exact: true }).first(), "settings heading");
    await visible(page.getByText("Privacy", { exact: true }), "privacy settings row");
    await visible(page.getByText("Dark theme", { exact: true }), "appearance setting");
    await shot(page, "settings-dark", true);
  });

  await step(page, "Theme returns to light and remains persistent", async () => {
    const settingsSwitch = page.getByRole("switch");
    await visible(settingsSwitch, "settings theme switch");
    await settingsSwitch.click();
    await page.getByText("Home", { exact: true }).last().click();
    await visible(page.getByLabel("Switch to dark mode"), "persisted light-mode state");
    await shot(page, "feed-light-restored");
  });

  await context.tracing.stop({ path: resolve(ARTIFACT_DIR, "demo-trace.zip") });
  await context.close();
}

async function runCompactViewportSuite(browser) {
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  attachRuntimeGuards(page, "compact-mobile");

  await step(page, "Compact Android-size viewport remains usable", async () => {
    await enterDemo(page);
    await assertMobileLayout(page, "Compact feed");
    await visible(page.getByText("Profile", { exact: true }).last(), "bottom navigation");
    await shot(page, "compact-mobile-feed");
  });

  await context.close();
}

async function runAuthenticatedSuite(browser) {
  if (!AUTH_EMAIL || !AUTH_PASSWORD) {
    record(
      "SKIP",
      "Authenticated account smoke",
      "Set E2E_EMAIL and E2E_PASSWORD to enable authenticated-only checks",
    );
    return;
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  attachRuntimeGuards(page, "authenticated-mobile");

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await settle(page);
  const email = page
    .getByLabel(/email/i)
    .or(page.getByPlaceholder(/you@example\.com/i));
  const password = page
    .getByLabel(/password/i)
    .or(page.getByPlaceholder(/password|minimum 6 characters/i));
  if (!(await email.first().isVisible().catch(() => false))) {
    record(
      "SKIP",
      "Authenticated account smoke",
      "Email/password authentication UI is unavailable (current screen is OAuth-only)",
    );
    await context.close();
    return;
  }

  await step(
    page,
    "Authenticated account smoke",
    async () => {
      await email.first().fill(AUTH_EMAIL);
      await password.first().fill(AUTH_PASSWORD);
      const submit = page.getByRole("button", { name: /continue|log in|sign in/i }).first();
      await submit.click();
      await visible(page.getByText("Home", { exact: true }).last(), "authenticated feed", 20_000);
      await navigateTab(page, "Chat", page.getByPlaceholder("Search people and groups"));
      await navigateTab(page, "Profile", page.getByLabel("Settings"));
      await shot(page, "authenticated-profile");
    },
  );

  await context.close();
}

let browser;
try {
  browser = await chromium.launch({ headless: HEADLESS });
  await runDemoSuite(browser);
  await runCompactViewportSuite(browser);
  await runAuthenticatedSuite(browser);
} catch (error) {
  record("FAIL", "Suite bootstrap", error instanceof Error ? error.message : String(error));
} finally {
  await browser?.close().catch(() => undefined);
}

if (runtimeErrors.length) {
  record(
    "FAIL",
    "No uncaught page or console errors occurred",
    runtimeErrors.map((item) => `${item.scope} ${item.type}: ${item.message}`).join(" | "),
  );
} else {
  record("PASS", "No uncaught page or console errors occurred");
}

const summary = {
  baseUrl: BASE_URL,
  generatedAt: new Date().toISOString(),
  totals: {
    passed: results.filter((item) => item.status === "PASS").length,
    failed: results.filter((item) => item.status === "FAIL").length,
    skipped: results.filter((item) => item.status === "SKIP").length,
  },
  results,
  runtimeErrors,
};

writeFileSync(resolve(ARTIFACT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Artifacts: ${ARTIFACT_DIR}`);
console.log(
  `Summary: ${summary.totals.passed} passed, ${summary.totals.failed} failed, ${summary.totals.skipped} skipped`,
);

if (summary.totals.failed > 0) process.exitCode = 1;
