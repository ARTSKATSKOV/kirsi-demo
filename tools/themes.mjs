/**
 * Theme screenshots (dev tool): for every palette in js/theme.js takes
 *   screenshots/themes/<id>-3d.png      (Kitchen & Living selected)
 *   screenshots/themes/<id>-floors.png  (Floors tab, floor 2, #16 selected)
 *   screenshots/themes/<id>-combo.png   (both side by side + caption strip, ~1600px wide)
 * Usage: node tools/themes.mjs [baseUrl|-] [idRegex]   (without baseUrl, ../public is served automatically)
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from './serve.mjs';

const server = /^https?:/.test(process.argv[2] || '') ? null : await startServer();
const base = server ? server.url : process.argv[2];
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'screenshots/themes');
fs.mkdirSync(outDir, { recursive: true });

const { THEME_IDS } = await import(path.join(root, 'public/js/theme.js'));
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const problems = [];

for (const id of THEME_IDS) {
  if (only && !only.test(id)) continue;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${id}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${id}] pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`[${id}] HTTP ${r.status()}: ${r.url()}`); });

  await page.goto(`${base}?theme=${id}&debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const applied = await page.evaluate(() => document.documentElement.dataset.theme);
  if (applied !== id) problems.push(`[${id}] data-theme is ${applied}`);
  await page.evaluate(() => window.__selectRoom('living'));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, `${id}-3d.png`) });

  await page.evaluate(() => window.__showSection('floors'));
  await page.waitForSelector('.fp-unit', { timeout: 10000 });
  await page.evaluate(() => window.__setPickerFloor(2));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, `${id}-floors.png`) });
  const name = await page.evaluate(() => window.__themeName || document.documentElement.dataset.theme);
  await page.close();

  // Combo: 2 × 800px wide (1440×900 scaled to 800×500) + caption strip.
  const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(outDir, f)).toString('base64');
  const combo = await browser.newPage({ viewport: { width: 1600, height: 556 } });
  await combo.setContent(`<!doctype html><html><body style="margin:0;background:#15171a;font:500 18px system-ui,sans-serif;color:#f2efe9">
    <div style="height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;box-sizing:border-box">
      <span><b style="letter-spacing:.02em">${name}</b> <span style="opacity:.6">— ?theme=${id}</span></span>
      <span style="opacity:.6;font-size:14px">3D · Kitchen &amp; Living &nbsp;|&nbsp; Floors · floor 2, #16</span></div>
    <div style="display:flex"><img src="${b64(`${id}-3d.png`)}" width="800" height="500"><img src="${b64(`${id}-floors.png`)}" width="800" height="500"></div>
  </body></html>`);
  await combo.screenshot({ path: path.join(outDir, `${id}-combo.png`) });
  await combo.close();
  console.log('saved', id);
}
await browser.close();
await server?.close();
if (problems.length) { console.log('\nProblems:\n' + problems.join('\n')); process.exitCode = 1; }
else console.log('\nNo console errors or warnings.');
