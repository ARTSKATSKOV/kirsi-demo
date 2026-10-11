/**
 * Headless screenshots of the concept demo (dev tool, not part of the site).
 * Usage: node tools/screenshot.mjs [baseUrl|-] [nameRegex]   (without baseUrl, ../public is served automatically)
 * Renders with SwiftShader (software WebGL) and exits non-zero on console errors.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from './serve.mjs';

const server = /^https?:/.test(process.argv[2] || '') ? null : await startServer();
const base = new URL('?debug', server ? server.url : process.argv[2]).href;
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
const outDir = process.env.SHOTS_OUT ? path.resolve(process.env.SHOTS_OUT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
fs.mkdirSync(outDir, { recursive: true });

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844, mobile: true };
const SHOTS = [];
for (const [dev, vp] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  SHOTS.push(
    { name: `${dev}-1-hero-3d`, ...vp },
    { name: `${dev}-2-room-selected`, ...vp, select: 'living' },
    { name: `${dev}-3-night`, ...vp, time: 'night' },
    { name: `${dev}-4-plan-view`, ...vp, view: 'plan' },
    { name: `${dev}-5-floors-unit16`, ...vp, section: 'floors', pickFloor: 2 },
    { name: `${dev}-6-timeline`, ...vp, section: 'timeline' },
  );
}
SHOTS.push({ name: 'desktop-7-floor1-commercial', ...DESKTOP, section: 'floors', pickFloor: 1, pickUnit: 'ÄP 2' });
SHOTS.push({ name: 'desktop-8-bedroom-plan', ...DESKTOP, view: 'plan', select: 'master' });
SHOTS.push({ name: 'phone-7-room-bedroom', ...PHONE, select: 'master' });
SHOTS.push({ name: 'phone-8-floors-scrolled', ...PHONE, section: 'floors', scrollEnd: true });
SHOTS.push({ name: 'desktop-9-hover', ...DESKTOP, hover: 'bed2' });
SHOTS.push({ name: 'desktop-10-floors-default', ...DESKTOP, section: 'floors' });

/** Visible panels must not overlap each other or leave the viewport. */
function layoutCheck() {
  const problems = [];
  const vis = (el) => el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.offsetWidth > 0 && !el.closest('[hidden]');
  const sels = ['.disclaimer', '#topbar', '#listing', '#dock', '#room-card', '#mobile-bar'];
  const panels = sels.map((s) => [s, document.querySelector(s)]).filter(([, el]) => vis(el) && !(el.id === 'room-card' && !el.classList.contains('is-open')));
  const rects = panels.map(([s, el]) => [s, el.getBoundingClientRect()]);
  const hit = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      if (hit(rects[i][1], rects[j][1])) problems.push(`overlap ${rects[i][0]} × ${rects[j][0]}`);
  for (const [s, r] of rects)
    if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) problems.push(`${s} outside viewport`);
  return problems;
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const problems = [];
for (const s of SHOTS) {
  if (only && !only.test(s.name)) continue;
  const page = await browser.newPage({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: s.mobile ? 2 : 1,
    isMobile: !!s.mobile,
    hasTouch: !!s.mobile,
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${s.name}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[${s.name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`[${s.name}] requestfailed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`[${s.name}] HTTP ${r.status()}: ${r.url()}`); });

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  if (s.time) await page.evaluate((t) => window.__setTime(t, { animate: false }), s.time);
  if (s.view) await page.evaluate((v) => window.__setView(v), s.view);
  if (s.select) await page.evaluate((id) => window.__selectRoom(id), s.select);
  if (s.section) {
    await page.evaluate((id) => window.__showSection(id), s.section);
    if (s.section === 'floors') await page.waitForSelector('.fp-unit', { timeout: 10000 });
    if (s.pickFloor) await page.evaluate((f) => window.__setPickerFloor(f), s.pickFloor);
    if (s.pickUnit) await page.evaluate((u) => window.__selectPickerUnit(u), s.pickUnit);
  }
  if (s.scrollEnd) { await page.waitForTimeout(500); await page.evaluate(() => { const el = document.getElementById('section-floors'); el.scrollTop = el.scrollHeight; }); }
  if (s.hover) {
    await page.evaluate((id) => {
      const { rooms, camera, scene } = window.__floorplan;
      const e = rooms.get(id); const r = e.data.rect;
      const prop = scene.getObjectByName('property');
      const V = camera.position.constructor;
      const v = prop.localToWorld(new V(r.x + r.w / 2, 0, r.z + r.d * 0.8)).project(camera);
      const c = document.querySelector('#viewport canvas').getBoundingClientRect();
      window.__hoverAt = [c.left + (v.x + 1) / 2 * c.width, c.top + (1 - v.y) / 2 * c.height];
    }, s.hover);
    const [hx, hy] = await page.evaluate(() => window.__hoverAt);
    await page.mouse.move(hx - 20, hy - 20);
    await page.mouse.move(hx, hy, { steps: 4 });
  }
  await page.waitForTimeout(1500);
  for (const p of await page.evaluate(layoutCheck)) problems.push(`[${s.name}] layout: ${p}`);
  const file = path.join(outDir, `${s.name}.png`);
  await page.screenshot({ path: file });
  console.log('saved', file);
  await page.close();
}
await browser.close();
await server?.close();
if (problems.length) {
  console.log('\nProblems:\n' + problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nNo console errors, warnings or layout overlaps.');
}
