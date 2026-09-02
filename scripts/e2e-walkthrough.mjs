import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const outputDir = 'artifacts/walkthrough';
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  recordVideo: { dir: outputDir, size: { width: 390, height: 844 } },
});
const page = await context.newPage();
const pause = (ms = 1800) => page.waitForTimeout(ms);

await page.goto('http://127.0.0.1:8090', { waitUntil: 'networkidle' });
await page.getByPlaceholder('you@example.com').fill('suchit.demo@wenitro.app');
await page.getByPlaceholder('Minimum 6 characters').fill('WeNitro!2026Demo');
await page.getByText('Continue', { exact: true }).click();
await page.getByText('Study buddy for a focused two-hour sprint', { exact: true }).waitFor();
await pause(6000);

await page.getByText('Vibes', { exact: true }).last().click();
await page.getByText('The founder coffee walk turned into three introductions and one new accountability partner.', { exact: true }).first().waitFor();
await pause(6000);
await page.getByLabel('Next vibe').click();
await pause(5500);
await page.getByLabel('Next vibe').click();
await pause(5500);

await page.getByText('Chat', { exact: true }).last().click();
await page.getByText('WeNitro QA Planning Circle', { exact: true }).waitFor();
await pause(6000);
await page.getByText('Maya Sharma', { exact: true }).click();
await pause(6000);
await page.mouse.click(24, 34);
await pause(1600);
await page.getByText('WeNitro QA Planning Circle', { exact: true }).click();
await pause(6000);

await page.getByText('Profile', { exact: true }).last().click();
await page.getByText('Suchit Pradhan', { exact: true }).waitFor();
await pause(6000);
await page.getByText('Vibes', { exact: true }).first().click();
await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
await pause(6500);

const video = page.video();
await context.close();
await video.saveAs(`${outputDir}/wenitro-live-walkthrough.webm`);
await browser.close();
console.log(`${outputDir}/wenitro-live-walkthrough.webm`);
