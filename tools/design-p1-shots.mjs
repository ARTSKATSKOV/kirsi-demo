/**
 * Before/after screenshots for the "Design P1" pass (dev tool).
 *   node tools/design-p1-shots.mjs [--root <siteDir>] [--out <dir>]
 * Defaults: serves ../public, writes ../screenshots/design-p1/after/.
 * Fresh browser context per shot. Steps that need P1 features (filters,
 * listing link) are skipped quietly on older copies, so the same script
 * makes the "before" set from a backup.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(arg('--out') || path.join(here, '../screenshots/design-p1/after'));
fs.mkdirSync(outDir, { recursive: true });
const server = await startServer(arg('--root') ? { root: arg('--root') } : {});
const url = (q = '') => new URL(`?debug${q}`, server.url).href;

const DESKTOP = { viewport: { width: 1440, height: 900 } };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const LANDSCAPE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const NO_HINT = () => { try { localStorage.setItem('kirsi-hint-seen', '1'); } catch {} };

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const external = new Set();
const errors = [];

async function shot(name, device, fn, { query = '' } = {}) {
  const context = await browser.newContext({ ...device, reducedMotion: 'reduce' }); // no auto-swing: comparable frames
  await context.addInitScript(NO_HINT);
  const page = await context.newPage();
  page.on('request', (r) => { if (!r.url().startsWith(server.url) && !r.url().startsWith('data:')) external.add(r.url()); });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
  await page.goto(url(query), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('is-done'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  try { await fn(page); } catch (e) { console.log(`[${name}] step skipped: ${e.message.split('\n')[0]}`); }
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log('saved', file);
  await context.close();
}
const maybe = async (page, sel, action = 'click') => {
  const loc = page.locator(sel).first();
  if (!(await loc.count()) || !(await loc.isVisible())) return false;
  if (action === 'hover') await loc.hover(); else await loc.click();
  return true;
};
/** Screen point over a room's floor (plan coordinates → canvas). */
const roomPoint = (page, id, fz = 0.7) =>
  page.evaluate(([id, fz]) => {
    const { rooms, camera, scene } = window.__floorplan;
    const r = rooms.get(id).data.rect;
    const prop = scene.getObjectByName('property');
    const v = prop.localToWorld(new camera.position.constructor(r.x + r.w / 2, 0, r.z + r.d * fz)).project(camera);
    const c = document.querySelector('#viewport canvas').getBoundingClientRect();
    return [c.left + ((v.x + 1) / 2) * c.width, c.top + ((1 - v.y) / 2) * c.height];
  }, [id, fz]);
const floors = async (page, floor) => {
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit');
  if (floor) await page.locator(`button[data-pick-floor="${floor}"]:visible`).first().click();
  await page.waitForTimeout(500);
};

// ── Desktop ──────────────────────────────────────────────────────────
await shot('desktop-01-listing', DESKTOP, (p) => p.waitForTimeout(300));
await shot('desktop-02-hover-3d-living', DESKTOP, async (p) => {
  const [x, y] = await roomPoint(p, 'living', 0.55);
  await p.mouse.move(x - 20, y - 20);
  await p.mouse.move(x, y, { steps: 4 });
  await p.waitForTimeout(700);
});
await shot('desktop-03-hover-schedule-master', DESKTOP, async (p) => {
  await p.hover('#listing .schedule button[data-room="master"]');
  await p.waitForTimeout(700);
});
await shot('desktop-04-hover-chip-balcony', DESKTOP, async (p) => {
  await p.locator('.chips .chip', { hasText: /^Balcony$/ }).hover();
  await p.waitForTimeout(700);
});
await shot('desktop-05-bath-3d', DESKTOP, async (p) => {
  await p.locator('.chips .chip', { hasText: /^Bath$/ }).click();
  await p.waitForTimeout(2200);
});
await shot('desktop-06-bath-plan', DESKTOP, async (p) => {
  await p.click('.view-toggle button[data-view="plan"]');
  await p.waitForTimeout(1800);
  await p.locator('.chips .chip', { hasText: /^Bath$/ }).click();
  await p.waitForTimeout(2200);
});
await shot('desktop-07-floors-unit16', DESKTOP, (p) => floors(p));
await shot('desktop-08-floors-summary-floor3', DESKTOP, (p) => floors(p, 3));
await shot('desktop-09-floors-filtered', DESKTOP, async (p) => {
  await floors(p, 3);
  if (!(await maybe(p, 'button[data-filter="free"]'))) throw new Error('no filters');
  await maybe(p, 'button[data-filter-rooms="2"]');
  await p.waitForTimeout(400);
});
await shot('desktop-10-listing-link-floors', DESKTOP, async (p) => {
  if (!(await maybe(p, '#listing [data-see-unit]'))) throw new Error('no listing link');
  await p.waitForTimeout(700);
});
for (const theme of ['sage', 'nordic-stone', 'baltic-sea', 'graphite-brass']) {
  await shot(`desktop-11-theme-${theme}-floors`, DESKTOP, (p) => floors(p), { query: `&theme=${theme}` });
  await shot(`desktop-12-theme-${theme}-room`, DESKTOP, async (p) => {
    await p.hover('#listing .schedule button[data-room="bed2"]');
    await p.locator('.chips .chip').first().click();
    await p.waitForTimeout(2200);
  }, { query: `&theme=${theme}` });
}

// ── Phone ────────────────────────────────────────────────────────────
await shot('phone-01-listing', PHONE, (p) => p.waitForTimeout(300));
await shot('phone-02-bath-plan', PHONE, async (p) => {
  await p.tap('#mobile-bar button[data-view="plan"]');
  await p.waitForTimeout(1800);
  await p.locator('.chips .chip', { hasText: /^Bath$/ }).tap();
  await p.waitForTimeout(2200);
});
await shot('phone-03-floors-unit16', PHONE, (p) => floors(p));
await shot('phone-04-floors-summary-floor3', PHONE, async (p) => {
  await floors(p, 3);
  await p.evaluate(() => { const el = document.getElementById('section-floors'); el.scrollTop = el.scrollHeight; });
  await p.waitForTimeout(300);
});
await shot('phone-05-floors-filtered', PHONE, async (p) => {
  await floors(p, 3);
  if (!(await maybe(p, 'button[data-filter="free"]'))) throw new Error('no filters');
  await maybe(p, 'button[data-filter-rooms="2"]');
  await p.waitForTimeout(400);
});
await shot('landscape-01-listing', LANDSCAPE, (p) => p.waitForTimeout(300));
await shot('landscape-02-floors', LANDSCAPE, (p) => floors(p));

await browser.close();
await server.close();
if (errors.length) console.log(`\nPage errors:\n${errors.join('\n')}`);
console.log(external.size ? `\nExternal requests:\n${[...external].join('\n')}` : '\nNo external requests.');
