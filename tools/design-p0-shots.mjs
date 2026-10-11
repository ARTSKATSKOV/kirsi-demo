/**
 * Before/after screenshots for the "Design P0" pass (dev tool).
 *   node tools/design-p0-shots.mjs [--root <siteDir>] [--out <dir>]
 * Defaults: serves ../public, writes ../screenshots/design-p0/after/.
 * Fresh browser context per shot (= first visit, empty localStorage).
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(arg('--out') || path.join(here, '../screenshots/design-p0/after'));
fs.mkdirSync(outDir, { recursive: true });
const server = await startServer(arg('--root') ? { root: arg('--root') } : {});
const URL_DEBUG = new URL('?debug', server.url).href;

const DESKTOP = { viewport: { width: 1440, height: 900 } };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const external = new Set();

async function shot(name, device, fn) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  page.on('request', (r) => { if (!r.url().startsWith(server.url) && !r.url().startsWith('data:')) external.add(r.url()); });
  page.on('pageerror', (e) => console.log(`[${name}] pageerror: ${e.message}`));
  await page.goto(URL_DEBUG, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await fn(page);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log('saved', file);
  await context.close();
}
const booted = (page) => page.waitForFunction(() => document.getElementById('boot')?.classList.contains('is-done'), null, { timeout: 20000 });

// 3D: the splash fade (room labels must not jump around behind it)
await shot('desktop-00-boot-fade', DESKTOP, (page) => page.waitForTimeout(200));
// 3D: first load, ~2 s after the splash (first-visit hint + auto-rotate)
await shot('desktop-01-first-load', DESKTOP, async (page) => { await booted(page); await page.waitForTimeout(2000); });
// 3D: select a chip with the mouse, then Escape → keyboard focus ring on the chip
await shot('desktop-02-chip-focus', DESKTOP, async (page) => {
  await booted(page);
  await page.locator('.chips .chip', { hasText: /^Bath$/ }).click();
  await page.waitForTimeout(1800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1800);
});
// Floors: floor 1 with the ÄP (commercial) tiles
await shot('desktop-03-floors-floor1', DESKTOP, async (page) => {
  await booted(page);
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit');
  await page.click('button[data-pick-floor="1"]');
  await page.waitForTimeout(600);
});
await shot('phone-00-boot-fade', PHONE, (page) => page.waitForTimeout(200));
await shot('phone-01-first-load', PHONE, async (page) => { await booted(page); await page.waitForTimeout(2000); });
// Phone chips: a room selected from the 3D view / listing → its chip must scroll into view
await shot('phone-02-chips-bath', PHONE, async (page) => {
  await booted(page);
  await page.evaluate(() => window.__selectRoom('bath'));
  await page.waitForTimeout(1200);
});
await shot('phone-03-floors-floor1', PHONE, async (page) => {
  await booted(page);
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit');
  await page.click('button[data-pick-floor="1"]');
  await page.waitForTimeout(600);
});

await browser.close();
await server.close();
console.log(external.size ? `\nExternal requests:\n${[...external].join('\n')}` : '\nNo external requests.');
