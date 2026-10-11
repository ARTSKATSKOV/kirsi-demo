/**
 * Screenshots for the review-fix pass (dev tool).
 *   node tools/review-shots.mjs [--root <siteDir>] [--out <dir>]
 * Defaults: serves ../public, writes ../screenshots/review-fix/.
 * Uses only real clicks (no debug hooks), so it also runs against old copies
 * of the site for before/after comparisons.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(arg('--out') || path.join(here, '../screenshots/review-fix'));
fs.mkdirSync(outDir, { recursive: true });
const server = await startServer(arg('--root') ? { root: arg('--root') } : {});

const NO_WEBGL = () => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    return /webgl/i.test(type) ? null : orig.call(this, type, ...a);
  };
};
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const SHOTS = [
  ['desktop', '1-3d'], ['desktop', '2-floors-16'], ['desktop', '3-timeline'], ['desktop', '4-no-webgl'], ['desktop', '5-no-webgl-floors'],
  ['phone', '1-3d'], ['phone', '2-floors-16'], ['phone', '3-timeline'], ['phone', '4-no-webgl'],
  ['landscape', '1-3d'],
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
for (const [dev, name] of SHOTS) {
  const ctx = await browser.newContext(DEVICES[dev]);
  const noGl = name.includes('no-webgl');
  if (noGl) await ctx.addInitScript(NO_WEBGL);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${dev}-${name}] ${e.message}`));
  await page.goto(server.url, { waitUntil: 'load' });
  if (noGl) await page.waitForTimeout(3000);
  else await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  try {
    if (name.includes('floors')) {
      await page.click('button[data-section="floors"]', { timeout: 5000 });
      await page.waitForSelector('.fp-unit', { timeout: 10000 });
      await page.click('.fp-unit[data-unit="16"]', { timeout: 5000 });
    }
    if (name.includes('timeline')) await page.click('button[data-section="timeline"]', { timeout: 5000 });
  } catch (e) {
    problems.push(`[${dev}-${name}] could not interact: ${e.message.split('\n')[0]}`); // e.g. old code: loader never goes away
  }
  await page.waitForTimeout(1200);
  const file = path.join(outDir, `${dev}-${name}.png`);
  await page.screenshot({ path: file });
  console.log('saved', file);
  await ctx.close();
}
await browser.close();
await server.close();
if (problems.length) console.log('\nPage errors:\n' + problems.join('\n'));
