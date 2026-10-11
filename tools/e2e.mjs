/**
 * End-to-end checks with real input (Playwright + SwiftShader software WebGL).
 *
 *   node tools/e2e.mjs                 serves ../public itself on a free port
 *   node tools/e2e.mjs --root <dir>    serves another copy (e.g. an old backup)
 *   node tools/e2e.mjs --url <baseUrl> tests an already running server
 *
 * Exits 1 if any check fails.
 */
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
let server = null;
let base = arg('--url');
if (!base) {
  server = await startServer(arg('--root') ? { root: arg('--root') } : {});
  base = server.url;
}
const URL_DEBUG = new URL('?debug', base).href;
const DESKTOP = { width: 1440, height: 900 };
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const NO_WEBGL = () => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    return /webgl/i.test(type) ? null : orig.call(this, type, ...a);
  };
};

const results = [];
async function check(name, fn, { viewport = DESKTOP, init, ...ctx } = {}) {
  const context = await browser.newContext({ viewport, ...ctx });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await fn(page, errors);
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}\n      ${e.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function open(page, url = URL_DEBUG) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('is-done'), null, { timeout: 20000 });
  await page.waitForTimeout(500);
}

const azimuth = (page) => page.evaluate(() => (window.__floorplan.controls.getAzimuthalAngle() * 180) / Math.PI);
const pose = (page) =>
  page.evaluate(() => {
    const { camera, controls } = window.__floorplan;
    return { p: camera.position.toArray(), t: controls.target.toArray(), d: camera.position.distanceTo(controls.target) };
  });
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/** Counts camera flights / jumps started from now on. */
const spyCamera = (page) =>
  page.evaluate(() => {
    const { rig } = window.__floorplan;
    window.__camCalls = { fly: 0, jump: 0 };
    for (const k of ['flyTo', 'jumpTo']) {
      const orig = rig[k].bind(rig);
      rig[k] = (...a) => {
        window.__camCalls[k === 'flyTo' ? 'fly' : 'jump']++;
        return orig(...a);
      };
    }
  });
const camCalls = (page) => page.evaluate(() => window.__camCalls);

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

/**
 * Waits until orbit damping has settled. SwiftShader can drop to ~5 fps, so
 * a single quiet 250 ms poll may just fall between two frames: require the
 * pose to stay put for 4 polls in a row (1 s).
 */
async function settle(page, maxMs = 10000) {
  let prev = await pose(page);
  let still = 0;
  for (let t = 0; t < maxMs; t += 250) {
    await page.waitForTimeout(250);
    const cur = await pose(page);
    still = dist3(prev.p, cur.p) < 1e-4 ? still + 1 : 0;
    if (still >= 4) return;
    prev = cur;
  }
}

/** Ends the first-visit intro (auto-rotate) the way a user would: a click on empty canvas. */
async function endIntro(page) {
  await page.mouse.click(1380, 200);
  await settle(page);
}

/** Tabs until `pred(activeElement)` (evaluated in the page) is true. */
async function tabTo(page, predSrc, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(predSrc)) return true;
  }
  return false;
}

// ── Critical #1: a real orbit drag must stick (the click after a drag used to reset the camera)
await check('mouse drag rotates the model and it stays rotated after 2 s', async (page) => {
  await open(page);
  const before = await azimuth(page);
  await drag(page, { x: 900, y: 450 }, { x: 1150, y: 450 });
  const onRelease = await azimuth(page);
  assert(angleDiff(onRelease, before) > 10, `drag did not rotate (${before.toFixed(1)}° → ${onRelease.toFixed(1)}°)`);
  await settle(page);
  const settled = await azimuth(page);
  await page.waitForTimeout(2000);
  const later = await azimuth(page);
  assert(angleDiff(later, before) > 10 && angleDiff(later, settled) < 2,
    `camera snapped back: ${before.toFixed(1)}° → ${onRelease.toFixed(1)}° on release → ${later.toFixed(1)}° 2 s later`);
});

await check('wheel zoom + click on listing text / empty page does not reset the camera', async (page) => {
  await open(page);
  await page.mouse.move(900, 450);
  await page.mouse.wheel(0, -400);
  await settle(page);
  await spyCamera(page);
  const before = await pose(page);
  await page.click('#listing .listing__note');
  await page.click('#listing [data-title]');
  await page.click('.disclaimer');
  await page.waitForTimeout(1500);
  const c = await camCalls(page);
  const after = await pose(page);
  assert(c.fly === 0 && c.jump === 0, `camera reset called (flyTo ×${c.fly}, jumpTo ×${c.jump})`);
  assert(dist3(before.p, after.p) < 1e-3, 'camera moved');
  const attrs = await page.evaluate(() => document.body.getAttributeNames());
  assert(!attrs.some((a) => ['data-floor', 'data-view', 'data-time', 'data-section', 'aria-pressed'].includes(a)), `body carries button attributes: ${attrs}`);
});

await check('Escape without a selection keeps a rotated view', async (page) => {
  await open(page);
  await drag(page, { x: 900, y: 450 }, { x: 1100, y: 450 });
  await settle(page);
  const rotated = await azimuth(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  assert(angleDiff(await azimuth(page), rotated) < 2, 'Escape reset the camera');
});

await check('clicking the already active 3D / Day / Apartment button is a no-op (camera + focus kept)', async (page) => {
  await open(page);
  await drag(page, { x: 900, y: 450 }, { x: 1100, y: 450 });
  await settle(page);
  const rotated = await azimuth(page);
  await spyCamera(page);
  for (const sel of ['.view-toggle button[data-view="3d"]', '.seg--time button[data-time="day"]', 'button[data-section="apartment"]']) {
    await page.click(sel);
    await page.waitForTimeout(400);
    const focused = await page.evaluate((s) => document.activeElement?.matches(s), sel);
    assert(focused, `focus left ${sel}`);
  }
  await page.waitForTimeout(800);
  const c = await camCalls(page);
  assert(c.fly === 0 && c.jump === 0, `no-op click moved the camera (fly ×${c.fly}, jump ×${c.jump})`);
  assert(angleDiff(await azimuth(page), rotated) < 2, 'camera moved');
});

await check('keyboard: Tab to a room chip + Enter selects it and keeps focus; closing the card returns focus', async (page) => {
  await open(page);
  const ok = await tabTo(page, () => document.activeElement?.classList.contains('chip'));
  assert(ok, 'never reached a chip with Tab');
  const label = await page.evaluate(() => document.activeElement.textContent);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1800);
  const s = await page.evaluate(() => ({
    chip: document.activeElement?.classList.contains('chip'),
    text: document.activeElement?.textContent,
    pressed: document.activeElement?.getAttribute('aria-pressed'),
    selected: window.__floorplan.state.selectedId,
    card: document.getElementById('room-card').classList.contains('is-open'),
  }));
  assert(s.chip && s.text === label && s.pressed === 'true', `focused ${s.text} (pressed=${s.pressed}), expected chip ${label}`);
  assert(s.selected && s.card, 'no room selected / card closed');
  // Close via the card's close button (keyboard) → focus back on the chip
  await page.focus('#room-card [data-close]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const back = await page.evaluate(() => ({ text: document.activeElement?.textContent, tag: document.activeElement?.tagName, sel: window.__floorplan.state.selectedId }));
  assert(back.sel === null, 'card close did not reset the selection');
  assert(back.tag === 'BUTTON' && back.text === label, `focus went to <${back.tag}> "${back.text}" after closing the card`);
});

await check('listing: clicking a room in the schedule selects it', async (page) => {
  await open(page);
  await page.click('#listing .schedule button[data-room]');
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => ({ sel: window.__floorplan.state.selectedId, first: document.querySelector('#listing .schedule button[data-room]').dataset.room }));
  assert(s.sel === s.first, `selected ${s.sel}, expected ${s.first}`);
});

await check('render on demand: no frames idle, none on the Timeline tab, frames while dragging', async (page) => {
  await open(page);
  await endIntro(page); // the first-visit auto-rotate renders by design
  const count = (ms) =>
    page.evaluate(async (ms) => {
      const { renderer } = window.__floorplan;
      let n = 0;
      const orig = renderer.render;
      renderer.render = function (...a) { n++; return orig.apply(this, a); };
      await new Promise((r) => setTimeout(r, ms));
      renderer.render = orig;
      return n;
    }, ms);
  const idle = await count(1500);
  assert(idle === 0, `${idle} frames rendered while idle`);
  const busy = count(1500);
  await drag(page, { x: 900, y: 450 }, { x: 1000, y: 460 });
  assert((await busy) > 0, 'nothing rendered during a drag');
  await page.click('button[data-section="timeline"]');
  await page.waitForTimeout(300);
  const hidden = await count(1500);
  assert(hidden === 0, `${hidden} frames rendered while the Timeline tab is shown`);
});

await check('Floors: tiles are real buttons, keyboard Tab + Enter selects, Escape closes and returns focus', async (page) => {
  await open(page);
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit');
  const roles = await page.evaluate(() => ({
    buttons: document.querySelectorAll('.fp-grid > li > button.fp-unit[aria-pressed]').length,
    listitems: document.querySelectorAll('.fp-unit[role]').length,
  }));
  assert(roles.buttons === 14 && roles.listitems === 0, `tiles: ${JSON.stringify(roles)}`);
  const n8 = await page.getByRole('button', { name: /#8\b/ }).count();
  assert(n8 === 1, `getByRole('button', #8) → ${n8}`);
  // keyboard: floor buttons
  assert(await tabTo(page, () => document.activeElement?.dataset?.pickFloor === '3'), 'Tab never reached "Floor 3"');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const fl = await page.evaluate(() => ({ focus: document.activeElement?.dataset?.pickFloor, pressed: document.activeElement?.getAttribute('aria-pressed'), first: document.querySelector('.fp-unit')?.dataset.unit }));
  assert(fl.focus === '3' && fl.pressed === 'true' && fl.first === '21', `floor 3 via keyboard: ${JSON.stringify(fl)}`);
  // keyboard: unit tile
  assert(await tabTo(page, () => document.activeElement?.dataset?.unit === '22'), 'Tab never reached tile #22');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const t = await page.evaluate(() => ({ focus: document.activeElement?.dataset?.unit, pressed: document.activeElement?.getAttribute('aria-pressed'), title: document.querySelector('.fp-detail__title')?.textContent }));
  assert(t.focus === '22' && t.pressed === 'true' && /#22/.test(t.title || ''), `tile via keyboard: ${JSON.stringify(t)}`);
  await page.focus('.fp-detail__close');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const e = await page.evaluate(() => ({ focus: document.activeElement?.dataset?.unit, open: document.querySelector('.floor-picker').classList.contains('has-detail') }));
  assert(!e.open && e.focus === '22', `Escape: ${JSON.stringify(e)}`);
});

await check('Floors: unit #16 on floor 2 is the hero, "View in 3D" opens the apartment', async (page) => {
  await open(page);
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit.is-hero');
  const hero = await page.evaluate(() => {
    const b = document.querySelector('.fp-unit.is-hero');
    return { unit: b.dataset.unit, status: b.querySelector('.fp-unit__status').textContent, asOf: document.querySelector('.fp-source')?.dataset.asOf };
  });
  assert(hero.unit === '16', `hero tile is ${hero.unit}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(hero.asOf || ''), 'no as-of date on the source line');
  await page.click('.fp-unit.is-hero');
  await page.click('[data-view3d]');
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => ({ section: document.body.dataset.currentSection, visible: !document.getElementById('section-apartment').hidden }));
  assert(s.section === 'apartment' && s.visible, `after View in 3D: ${JSON.stringify(s)}`);
});

await check('Timeline: "Today" is the current date, marker placed for it', async (page) => {
  await open(page);
  await page.click('button[data-section="timeline"]');
  const s = await page.evaluate(() => {
    const d = new Date();
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    const p = (n) => String(n).padStart(2, '0');
    return {
      want: `${d.getDate()} ${m} ${d.getFullYear()}`,
      wantIso: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      got: document.querySelector('.tl-item.is-today .tl-item__date')?.textContent,
      marker: document.querySelector('.tl-today')?.dataset.today,
    };
  });
  assert(s.got === s.want, `Today shows "${s.got}", expected "${s.want}"`);
  assert(s.marker === s.wantIso, `marker at ${s.marker}, expected ${s.wantIso}`);
});

await check('Timeline: a date after 28 Sep 2026 is used at runtime (clock mocked to 15 Mar 2027)', async (page) => {
  await page.clock.setFixedTime(new Date(2027, 2, 15, 12, 0));
  await page.goto(URL_DEBUG, { waitUntil: 'load' });
  await page.waitForSelector('.tl-item.is-today', { state: 'attached' });
  const got = await page.evaluate(() => document.querySelector('.tl-item.is-today .tl-item__date')?.textContent);
  assert(got === '15 Mar 2027', `Today shows "${got}"`);
});

await check('no WebGL: fallback in the 3D area, loader gone, Floors + Timeline still work', async (page, errors) => {
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('.viewport-fallback', { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('is-done'), null, { timeout: 5000 });
  const s = await page.evaluate(() => ({
    msg: document.querySelector('.viewport-fallback')?.textContent,
    canvas: !!document.querySelector('#viewport canvas'),
    title: document.querySelector('#listing [data-title]')?.textContent,
    schedule: document.querySelectorAll('#listing .schedule button').length,
  }));
  assert(/3D view unavailable/.test(s.msg || ''), 'fallback text missing');
  assert(!s.canvas, 'a dead canvas is left in the page');
  assert(s.title && s.schedule > 0, 'listing not rendered');
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit');
  await page.click('.fp-unit[data-unit="16"]');
  const d = await page.textContent('.fp-detail__title');
  assert(/#16/.test(d || ''), `unit detail: ${d}`);
  await page.click('button[data-section="timeline"]');
  const t = await page.evaluate(() => ({ items: document.querySelectorAll('.tl-item').length, visible: !document.getElementById('section-timeline').hidden }));
  assert(t.items >= 6 && t.visible, `timeline: ${JSON.stringify(t)}`);
  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
}, { init: NO_WEBGL });

await check('deep link #floors opens Floors; Back returns to it', async (page) => {
  await open(page, new URL('?debug#floors', base).href);
  assert(await page.evaluate(() => document.body.dataset.currentSection === 'floors'), 'hash #floors not honoured');
  await page.click('button[data-section="timeline"]');
  await page.goBack();
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => document.body.dataset.currentSection === 'floors'), 'Back did not return to Floors');
});

await check('phone landscape 844×390: listing + disclaimer leave most of the height to the model', async (page) => {
  await open(page);
  const s = await page.evaluate(() => {
    const vh = innerHeight;
    const disc = document.querySelector('.disclaimer').getBoundingClientRect();
    const top = document.getElementById('topbar').getBoundingClientRect();
    const listing = document.getElementById('listing').getBoundingClientRect();
    return { vh, chrome: top.bottom, discH: disc.height, listingW: listing.width, listingH: listing.height };
  });
  assert(s.chrome <= s.vh * 0.2, `disclaimer + top bar take ${s.chrome}px of ${s.vh}px`);
  assert(s.listingW < 260, `listing spans ${s.listingW}px wide`);
}, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });


// ── Design P0: first-visit intro, labels, chips, disclaimers, fonts, ÄP tiles ──
await check('intro: slow auto-rotate + coach mark on first visit; the first drag stops both for good', async (page) => {
  await open(page);
  await page.waitForTimeout(1500);
  const coach = await page.evaluate(() => ({
    visible: document.getElementById('coach').classList.contains('is-visible') && !document.getElementById('coach').hidden,
    text: document.querySelector('#coach .coach__mouse')?.innerText,
    seen: localStorage.getItem('kirsi-hint-seen'),
  }));
  assert(coach.visible, 'coach mark not shown on the first visit');
  assert(/Drag to explore · click a room/.test(coach.text || ''), `coach text: ${coach.text}`);
  assert(coach.seen === '1', 'hint not remembered in localStorage');
  const a1 = await azimuth(page);
  await page.waitForTimeout(2000);
  const a2 = await azimuth(page);
  const turned = angleDiff(a2, a1);
  assert(turned > 0.3 && turned < 12, `auto-rotate turned ${turned.toFixed(2)}° in 2 s (expected slow, > 0)`);
  const polar = await page.evaluate(() => (window.__floorplan.controls.getPolarAngle() * 180) / Math.PI);
  assert(polar >= 8 && polar <= 78, `polar ${polar.toFixed(1)}° outside the orbit limits`);
  await drag(page, { x: 900, y: 450 }, { x: 960, y: 450 });
  await settle(page);
  const s1 = await azimuth(page);
  await page.waitForTimeout(2500);
  const s2 = await azimuth(page);
  const st = await page.evaluate(() => ({ intro: window.__floorplan.intro, auto: window.__floorplan.controls.autoRotate, coachHidden: !document.getElementById('coach').classList.contains('is-visible') }));
  assert(st.intro.done && !st.auto, `intro still running after a drag: ${JSON.stringify(st)}`);
  assert(angleDiff(s2, s1) < 0.2, `camera kept turning after the drag (${s1.toFixed(2)}° → ${s2.toFixed(2)}°)`);
  assert(st.coachHidden, 'coach mark still visible after the drag');
});

await check('intro: choosing a room chip stops auto-rotate; a return visit shows no coach mark', async (page) => {
  await open(page);
  await page.waitForTimeout(1200);
  await page.locator('.chips .chip', { hasText: /^Bath$/ }).click();
  await page.waitForTimeout(1800);
  await page.click('#reset-view');
  await page.waitForTimeout(1800);
  const a1 = await azimuth(page);
  await page.waitForTimeout(2000);
  assert(angleDiff(await azimuth(page), a1) < 0.2, 'auto-rotate resumed after a chip selection + reset');
  // Second visit in the same browser: hint already seen
  await open(page);
  await page.waitForTimeout(1500);
  const shown = await page.evaluate(() => !document.getElementById('coach').hidden);
  assert(!shown, 'coach mark shown again on a return visit');
});

await check('intro: prefers-reduced-motion → no auto-rotate and no idle frames', async (page) => {
  await open(page);
  await page.waitForTimeout(1500);
  const a1 = await azimuth(page);
  const frames = await page.evaluate(async () => {
    const { renderer } = window.__floorplan;
    let n = 0;
    const orig = renderer.render;
    renderer.render = function (...a) { n++; return orig.apply(this, a); };
    await new Promise((r) => setTimeout(r, 1500));
    renderer.render = orig;
    return n;
  });
  assert(angleDiff(await azimuth(page), a1) < 0.05, 'camera turned with reduced motion');
  assert(frames === 0, `${frames} frames rendered while idle with reduced motion`);
  assert(await page.evaluate(() => window.__floorplan.intro.reduceMotion), 'reduced motion not detected');
}, { reducedMotion: 'reduce' });

await check('room labels stay hidden while loading and appear in place once the viewer is ready', async (page) => {
  await page.goto(URL_DEBUG, { waitUntil: 'domcontentloaded' });
  const early = await page.evaluate(() => ({
    ready: window.__ready === true,
    booting: document.getElementById('room-tags').classList.contains('is-booting'),
    opacity: getComputedStyle(document.getElementById('room-tags')).opacity,
  }));
  assert(!early.ready, 'viewer was ready before the first check (cannot test)');
  assert(early.booting && Number(early.opacity) === 0, `labels visible before ready: ${JSON.stringify(early)}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.waitForFunction(() => !document.getElementById('room-tags').classList.contains('is-booting'), null, { timeout: 5000 });
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => {
    const { camera, rooms, scene } = window.__floorplan;
    const prop = scene.getObjectByName('property');
    const vp = document.getElementById('viewport').getBoundingClientRect();
    const tags = [...document.querySelectorAll('#room-tags .room-tag:not(.is-off)')];
    // every shown label must sit on (near) its room's projected centre
    const off = [];
    for (const el of tags) {
      const e = [...rooms.values()].find((r) => (r.data.short || r.data.name) === el.textContent);
      if (!e) continue;
      const r = e.data.rect;
      const at = r.tagAt || { x: r.w / 2, z: r.d / 2 };
      const v = prop.localToWorld(new camera.position.constructor(r.x + at.x, 0.1, r.z + at.z)).project(camera);
      const x = vp.left + ((v.x + 1) / 2) * vp.width;
      const y = vp.top + ((1 - v.y) / 2) * vp.height;
      const b = el.getBoundingClientRect();
      const d = Math.hypot(b.left + b.width / 2 - x, b.top + b.height / 2 - y);
      if (d > 6) off.push(`${el.textContent} ${d.toFixed(0)}px`);
    }
    return { n: tags.length, off, opacity: getComputedStyle(document.getElementById('room-tags')).opacity };
  });
  assert(s.n >= 5, `only ${s.n} labels shown`);
  assert(Number(s.opacity) === 1, `labels container opacity ${s.opacity}`);
  assert(s.off.length === 0, `labels away from their rooms: ${s.off.join(', ')}`);
});

await check('chips: Balcony is 2nd, focus ring after Escape is not clipped, active chip uses the dark pill', async (page) => {
  await open(page);
  const order = await page.evaluate(() => [...document.querySelectorAll('.chips .chip')].map((b) => b.textContent));
  assert(order[1] === 'Balcony', `chip order: ${order.join(', ')}`);
  await page.locator('.chips .chip', { hasText: /^Bath$/ }).click();
  await page.waitForTimeout(1500);
  const active = await page.evaluate(() => getComputedStyle(document.querySelector('.chip.is-active')).backgroundColor);
  assert(active === 'rgb(59, 47, 40)', `active chip background ${active}, expected #3b2f28`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const el = document.activeElement;
    const c = el.closest('.chips');
    const cs = getComputedStyle(el);
    const ring = parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset);
    const a = el.getBoundingClientRect();
    const b = c.getBoundingClientRect();
    return {
      chip: el.classList.contains('chip'), fv: el.matches(':focus-visible'), style: cs.outlineStyle,
      top: a.top - ring - b.top, bottom: b.bottom - (a.bottom + ring), left: a.left - ring - b.left, right: b.right - (a.right + ring),
    };
  });
  assert(r.chip && r.fv && r.style !== 'none', `no visible focus ring on the chip: ${JSON.stringify(r)}`);
  assert(Math.min(r.top, r.bottom, r.left, r.right) >= -0.5, `focus ring clipped by the chip row: ${JSON.stringify(r)}`);
});

await check('phone: short chip labels, Balcony visible without scrolling, selected chip scrolled to the centre', async (page) => {
  await open(page);
  const s = await page.evaluate(() => {
    const row = document.querySelector('.chips').getBoundingClientRect();
    const chips = [...document.querySelectorAll('.chips .chip')];
    const vis = (b) => { const r = b.getBoundingClientRect(); return r.left >= row.left - 1 && r.right <= row.right + 1; };
    return { labels: chips.map((b) => b.innerText.trim()), balconyVisible: vis(chips[1]) };
  });
  assert(s.labels[0] === 'Kitchen' && s.labels.includes('Bed 1') && s.labels.includes('Bed 2'), `labels: ${s.labels.join(', ')}`);
  assert(s.balconyVisible, 'Balcony chip is not fully visible on a phone');
  for (const id of ['hall', 'wc']) {
    await page.evaluate((id) => window.__selectRoom(id), id);
    await page.waitForTimeout(1500);
    const c = await page.evaluate(() => {
      const el = document.querySelector('.chips');
      const row = el.getBoundingClientRect();
      const a = document.querySelector('.chip.is-active').getBoundingClientRect();
      return {
        rowMid: row.left + row.width / 2, chipMid: a.left + a.width / 2, inside: a.left >= row.left && a.right <= row.right,
        atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1, // can't scroll further: centring is impossible
      };
    });
    assert(c.inside && (Math.abs(c.chipMid - c.rowMid) < 12 || c.atEnd), `${id}: active chip not centred: ${JSON.stringify(c)}`);
  }
  const listing = await page.evaluate(() => document.getElementById('listing').getBoundingClientRect().bottom);
  assert(listing < 200, `disclaimer + top bar + listing end at ${listing}px`);
}, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

await check('disclaimers: EN + ET banner stays (light, ~28px), listing note without a dashed border, noindex kept', async (page) => {
  await open(page);
  const s = await page.evaluate(() => {
    const d = document.querySelector('.disclaimer');
    // color-mix() computes to "color(srgb r g b)" (0–1), plain colours to "rgb(…)" (0–255)
    const raw = getComputedStyle(d).backgroundColor;
    const bg = raw.match(/\d*\.?\d+/g).map(Number).slice(0, 3).map((v) => (raw.startsWith('color(') ? v * 255 : v));
    const note = getComputedStyle(document.querySelector('.listing__note'));
    return {
      en: d.querySelector('[lang="en"]')?.textContent, et: d.querySelector('[lang="et"]')?.textContent,
      h: d.getBoundingClientRect().height, lum: (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255,
      noteBorder: note.borderTopStyle, noteText: document.querySelector('.listing__note').textContent,
      robots: document.querySelector('meta[name="robots"]')?.content,
    };
  });
  assert(/illustrative sample data/.test(s.en || '') && /näidisandmed/.test(s.et || ''), 'EN/ET disclaimer text missing');
  assert(s.h <= 30, `disclaimer is ${s.h}px tall`);
  assert(s.lum > 0.6, `disclaimer background is dark (luminance ${s.lum.toFixed(2)})`);
  assert(s.noteBorder === 'none' && /Conceptual layout — not an architectural drawing/.test(s.noteText), `listing note: ${s.noteBorder}`);
  assert(s.robots === 'noindex,nofollow', `robots meta: ${s.robots}`);
  const robotsTxt = await (await page.request.get(new URL('robots.txt', base).href)).text();
  assert(/Disallow:\s*\/\s*$/m.test(robotsTxt), 'robots.txt no longer disallows all');
});

await check('fonts: Inter + Newsreader self-hosted (woff2 from /fonts), no external requests', async (page) => {
  const external = [];
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url()); });
  await open(page);
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit');
  await page.evaluate(() => document.fonts.ready);
  const f = await page.evaluate(() => ({
    loaded: [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family.replace(/["']/g, '')),
    serif: getComputedStyle(document.querySelector('.fp-title')).fontFamily,
  }));
  assert(f.loaded.includes('Inter') && f.loaded.includes('Newsreader'), `loaded fonts: ${f.loaded.join(', ')}`);
  assert(/^"?Newsreader/.test(f.serif), `headings use ${f.serif}`);
  assert(external.length === 0, `external requests: ${external.join(', ')}`);
  const lic = await page.request.get(new URL('fonts/OFL-Inter.txt', base).href);
  assert(lic.ok() && /Open Font License/.test(await lic.text()), 'OFL licence file not served');
});

await check('Floors: commercial ÄP tiles on floor 1 show their area', async (page) => {
  await open(page);
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit');
  await page.click('button[data-pick-floor="1"]');
  await page.waitForTimeout(200);
  const t = await page.evaluate(() => document.querySelector('.fp-unit[data-unit="ÄP 1"] .fp-unit__meta')?.textContent.replace(/\s+/g, ' ').trim());
  assert(/^Commercial 100\.7 m²$/.test(t || ''), `ÄP 1 tile meta: "${t}"`);
});

// ── Design P1 ─────────────────────────────────────────────────────────
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
/** Canvas point over a room's floor (fz = depth fraction inside the room). */
const roomPoint = (page, id, fz = 0.5) =>
  page.evaluate(([id, fz]) => {
    const { rooms, camera, scene } = window.__floorplan;
    const r = rooms.get(id).data.rect;
    const prop = scene.getObjectByName('property');
    const v = prop.localToWorld(new camera.position.constructor(r.x + r.w / 2, 0, r.z + r.d * fz)).project(camera);
    const c = document.querySelector('#viewport canvas').getBoundingClientRect();
    return { x: c.left + ((v.x + 1) / 2) * c.width, y: c.top + ((1 - v.y) / 2) * c.height };
  }, [id, fz]);
const hoverState = (page) =>
  page.evaluate(() => ({
    id: window.__floorplan.state.hoverId,
    rows: [...document.querySelectorAll('#listing .schedule button.is-hover')].map((b) => b.dataset.room),
    chips: [...document.querySelectorAll('.chips .chip.is-hover')].map((b) => b.title),
    tags: [...document.querySelectorAll('#room-tags .room-tag.is-hover')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()),
    cursor: document.querySelector('#viewport canvas').style.cursor,
    glow: Object.fromEntries([...window.__floorplan.rooms].map(([k, e]) => [k, e.floors[0].material.emissiveIntensity])),
  }));

await check('P1 hover link: schedule row ↔ 3D room ↔ chip ↔ tag (with area), no camera move', async (page) => {
  await open(page);
  await endIntro(page);
  await spyCamera(page);
  const before = await pose(page);
  // 1) list → model + chip + tag
  await page.hover('#listing .schedule button[data-room="master"]');
  await page.waitForTimeout(400);
  let h = await hoverState(page);
  assert(h.id === 'master' && h.rows.join() === 'master', `list hover: ${JSON.stringify(h)}`);
  assert(h.chips.length === 1 && /Bedroom 1/.test(h.chips[0]), `chip not linked: ${h.chips}`);
  assert(h.tags.length === 1 && /Bedroom 1 13\.2 m²/.test(h.tags[0]), `tag without area: ${h.tags}`);
  assert(h.glow.master > 0.3 && h.glow.living === 0, `3D highlight: ${JSON.stringify(h.glow)}`);
  // 2) chip → list
  await page.locator('.chips .chip', { hasText: /^Balcony$/ }).hover();
  await page.waitForTimeout(400);
  h = await hoverState(page);
  assert(h.id === 'balcony' && h.rows.join() === 'balcony' && h.tags.length === 1 && /36\.2 m²/.test(h.tags[0]), `chip hover: ${JSON.stringify(h)}`);
  // 3) model → list + chip, pointer cursor
  const pt = await roomPoint(page, 'living', 0.55);
  await page.mouse.move(pt.x - 10, pt.y - 10);
  await page.mouse.move(pt.x, pt.y, { steps: 3 });
  await page.waitForTimeout(500);
  h = await hoverState(page);
  assert(h.id === 'living' && h.rows.join() === 'living' && h.chips.length === 1 && h.cursor === 'pointer', `3D hover: ${JSON.stringify(h)}`);
  // 4) off the model → everything clears
  await page.mouse.move(1400, 140);
  await page.waitForTimeout(400);
  h = await hoverState(page);
  assert(h.id == null && !h.rows.length && !h.chips.length && !h.tags.length && h.cursor !== 'pointer', `hover stuck: ${JSON.stringify(h)}`);
  await page.waitForTimeout(400);
  const c = await camCalls(page);
  assert(c.fly === 0 && c.jump === 0 && dist3(before.p, (await pose(page)).p) < 1e-3, `hover moved the camera (fly ×${c.fly}, jump ×${c.jump})`);
  assert(await page.evaluate(() => window.__floorplan.state.selectedId) === null, 'hover selected a room');
});

await check('P1 hover link: selection look wins, hovering others keeps it; click on listing text still no reset', async (page) => {
  await open(page);
  await page.locator('.chips .chip', { hasText: /^Bath$/ }).click();
  await page.waitForTimeout(2000);
  const tagsSel = await page.evaluate(() => [...document.querySelectorAll('#room-tags .room-tag:not(.is-off)')].map((t) => ({ t: t.innerText.replace(/\s+/g, ' '), sel: t.classList.contains('is-selected') })));
  assert(tagsSel.length === 1 && tagsSel[0].sel && /Bath 5\.9 m²/.test(tagsSel[0].t), `selected tag: ${JSON.stringify(tagsSel)}`);
  await page.hover('#listing .schedule button[data-room="hall"]');
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => ({ sel: window.__floorplan.state.selectedId, hov: window.__floorplan.state.hoverId, card: document.querySelector('#room-card [data-name]').textContent }));
  assert(s.sel === 'bath' && s.hov === 'hall' && s.card === 'Bathroom', `hover changed the selection: ${JSON.stringify(s)}`);
  await spyCamera(page);
  await page.click('#listing .listing__note');
  await page.click('#listing .listing__ppm');
  await page.waitForTimeout(800);
  const c = await camCalls(page);
  assert(c.fly === 0 && c.jump === 0, `camera moved on a text click (fly ×${c.fly}, jump ×${c.jump})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1800);
  const n = await page.evaluate(() => document.querySelectorAll('#room-tags .room-tag:not(.is-off)').length);
  assert(n >= 5, `after reset only ${n} tags are back`);
});

await check('P1 hover link: touch taps never leave a sticky hover (phone)', async (page) => {
  await open(page);
  await page.locator('.chips .chip', { hasText: /^Hall$/ }).tap();
  await page.waitForTimeout(1600);
  const pt = await roomPoint(page, 'hall');
  await page.touchscreen.tap(pt.x, pt.y);
  await page.waitForTimeout(800);
  const h = await hoverState(page);
  assert(h.id == null && !h.chips.length && !h.tags.length && !h.rows.length, `sticky hover on touch: ${JSON.stringify(h)}`);
  const cs = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.chips .chip')].find((x) => x.title === 'Entrance hall');
    return getComputedStyle(b).transform;
  });
  assert(cs === 'none', `tapped chip keeps a :hover lift (${cs})`);
}, PHONE);

await check('P1 hover: highlight fades and then the renderer idles again', async (page) => {
  await open(page);
  await endIntro(page);
  await page.hover('#listing .schedule button[data-room="bed2"]');
  const mid = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(window.__floorplan.rooms.get('bed2').floors[0].material.emissiveIntensity))));
  await page.waitForTimeout(500);
  const end = await page.evaluate(() => window.__floorplan.rooms.get('bed2').floors[0].material.emissiveIntensity);
  assert(end > 0.3 && mid <= end, `fade-in: ${mid} → ${end}`);
  const idle = await page.evaluate(async () => {
    const { renderer } = window.__floorplan;
    let n = 0;
    const orig = renderer.render;
    renderer.render = function (...a) { n++; return orig.apply(this, a); };
    await new Promise((r) => setTimeout(r, 1200));
    renderer.render = orig;
    return n;
  });
  assert(idle === 0, `${idle} frames rendered while hovering still`);
});

await check('P1 small rooms: Bath keeps context in 3D and in the floor plan', async (page) => {
  await open(page);
  const bboxOf = () => page.evaluate(() => {
    const { rooms, camera, scene } = window.__floorplan;
    const prop = scene.getObjectByName('property');
    const V = camera.position.constructor;
    const vp = document.getElementById('viewport').getBoundingClientRect();
    const proj = (r) => {
      const xs = []; const ys = [];
      for (const [x, z] of [[r.x, r.z], [r.x + r.w, r.z], [r.x, r.z + r.d], [r.x + r.w, r.z + r.d]]) {
        const v = prop.localToWorld(new V(x, 0, z)).project(camera);
        xs.push((v.x + 1) / 2 * vp.width); ys.push((1 - v.y) / 2 * vp.height);
      }
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    return { bath: proj(rooms.get('bath').data.rect), vw: vp.width, vh: vp.height };
  });
  await page.evaluate(() => window.__selectRoom('bath'));
  await page.waitForTimeout(300);
  const b3 = await bboxOf();
  // before P1 (desktop): 3D 250×271 px, plan 186×340 px of 1440×808; now ≈ 176×189 / 114×209
  assert(b3.bath.h < b3.vh * 0.27 && b3.bath.w < b3.vw * 0.15, `Bath fills the 3D view: ${JSON.stringify(b3)}`);
  await page.evaluate(() => window.__setView('plan'));
  await page.waitForTimeout(300);
  const bp = await bboxOf();
  assert(bp.bath.h < bp.vh * 0.3 && bp.bath.w < bp.vw * 0.1, `Bath fills the plan view: ${JSON.stringify(bp)}`);
});

await check('P1 Floors: prices on tiles (— for reserved / sold), €/m² in details, status clear', async (page) => {
  await open(page);
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit');
  const t = await page.evaluate(() => {
    const tile = (id) => document.querySelector(`.fp-unit[data-unit="${id}"]`);
    const txt = (el, s) => el.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim();
    return {
      p16: txt(tile('16'), '.fp-unit__price'), p19: txt(tile('19'), '.fp-unit__price'), s19: txt(tile('19'), '.fp-unit__status'),
      p7: txt(tile('7'), '.fp-unit__price'), s7: txt(tile('7'), '.fp-unit__status'),
      s7bg: getComputedStyle(tile('7').querySelector('.fp-unit__status')).backgroundColor,
      ppm: document.querySelector('.fp-detail [data-ppm]')?.textContent.replace(/\s+/g, ' '),
      n: document.querySelectorAll('.fp-unit__price').length,
    };
  });
  assert(t.p16 === '213 000 €' && t.p19 === '—' && t.s19 === 'Sold' && t.p7 === '—' && t.s7 === 'Reserved', `tiles: ${JSON.stringify(t)}`);
  assert(t.s7bg !== 'rgba(0, 0, 0, 0)', 'reserved status has no badge');
  assert(t.n === 14, `${t.n} price lines`);
  assert(t.ppm === '2 918 €/m²', `#16 €/m²: ${t.ppm}`);
  await page.click('.fp-unit[data-unit="7"]');
  const d = await page.evaluate(() => ({ ppm: document.querySelector('.fp-detail [data-ppm]').textContent, price: document.querySelector('.fp-detail__price dd').textContent }));
  assert(d.ppm === '—' && /^—Reserved · no public price$/.test(d.price), `reserved detail: ${JSON.stringify(d)}`);
  // every tile price equals the CSV
  const csv = await (await page.request.get(new URL('data/units.csv', base).href)).text();
  const rows = csv.trim().split('\n').slice(1).map((l) => l.split(','));
  for (const f of ['1', '3', '5']) {
    await page.click(`button[data-pick-floor="${f}"]`);
    const shown = await page.evaluate(() => [...document.querySelectorAll('.fp-unit')].map((b) => [b.dataset.unit, b.querySelector('.fp-unit__price').textContent.replace(/\D/g, '')]));
    for (const [id, p] of shown) {
      const row = rows.find((r) => r[0] === id);
      assert(row && (row[5] || '') === p, `unit ${id}: tile ${p || '—'}, CSV ${row?.[5] || '—'}`);
    }
  }
});

await check('P1 Floors: summary card for a floor without a selection (counts, price + area range)', async (page) => {
  await open(page);
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit');
  await page.click('button[data-pick-floor="4"]');
  const s = await page.evaluate(() => ({
    title: document.querySelector('.fp-detail__title')?.textContent,
    counts: document.querySelector('.fp-sum__counts')?.textContent.replace(/\s+/g, ' ').trim(),
    price: document.querySelector('[data-sum-price]')?.textContent.replace(/\s+/g, ' '),
    area: document.querySelector('[data-sum-area]')?.textContent.replace(/\s+/g, ' '),
    empty: !!document.querySelector('.fp-detail__empty'),
    tiles: [...document.querySelectorAll('.fp-unit')].map((b) => ({ p: Number(b.querySelector('.fp-unit__price').textContent.replace(/\D/g, '')) || null, a: parseFloat(b.querySelector('.fp-unit__meta').textContent.split('·').pop()) })),
  }));
  const ps = s.tiles.map((t) => t.p).filter(Boolean);
  const as = s.tiles.map((t) => t.a);
  const f = (n) => n.toLocaleString('en-US').replace(/,/g, ' ');
  assert(s.title === '14 units on floor 4' && s.counts === '12 free 1 reserved 1 sold' && !s.empty, `summary: ${JSON.stringify(s)}`);
  assert(s.price === `${f(Math.min(...ps))} – ${f(Math.max(...ps))} €`, `price range ${s.price}`);
  assert(s.area === `${Math.min(...as).toFixed(1)} – ${Math.max(...as).toFixed(1)} m²`, `area range ${s.area}`);
  // floor 2: the summary links to #16
  await page.click('button[data-pick-floor="2"]');
  await page.click('.fp-sum__hero');
  const sel = await page.evaluate(() => document.querySelector('.fp-unit.is-selected')?.dataset.unit);
  assert(sel === '16', `summary link selected ${sel}`);
});

await check('P1 Floors: building column on desktop (5 on top, click selects, #16 badge), pills on phone', async (page) => {
  await open(page);
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit');
  const b = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.fp-floors [data-pick-floor]')];
    const y = (f) => btns.find((x) => x.dataset.pickFloor === f).getBoundingClientRect();
    const grid = document.querySelector('.fp-grid').getBoundingClientRect();
    return {
      n: btns.length, top5: y('5').top < y('4').top && y('4').top < y('1').top, left: y('3').right <= grid.left,
      hero: btns.find((x) => x.querySelector('.fp-floor__hero'))?.dataset.pickFloor,
      pressed: btns.filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.dataset.pickFloor),
      meta: btns.map((x) => x.querySelector('.fp-floor__meta').textContent),
      bg: getComputedStyle(btns.find((x) => x.dataset.pickFloor === '2')).backgroundColor,
    };
  });
  assert(b.n === 5 && b.top5 && b.left, `building layout: ${JSON.stringify(b)}`);
  assert(b.hero === '2' && b.pressed.join() === '2' && b.bg === 'rgb(59, 47, 40)', `floor 2 state: ${JSON.stringify(b)}`);
  assert(b.meta.join('|') === '12 free|11 free|13 free|12 free|7 free', `free counts: ${b.meta.join('|')}`);
  await page.click('.fp-floors [data-pick-floor="5"]');
  const first = await page.evaluate(() => ({ unit: document.querySelector('.fp-unit').dataset.unit, pressed: document.querySelector('[data-pick-floor="5"]').getAttribute('aria-pressed') }));
  assert(first.pressed === 'true' && first.unit === '49', `floor 5: ${JSON.stringify(first)}`);
  // phone: the same buttons as a row of pills, no building chrome
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.fp-floors [data-pick-floor]')].map((x) => x.getBoundingClientRect());
    return { row: btns.every((r) => Math.abs(r.top - btns[0].top) < 2), roof: getComputedStyle(document.querySelector('.fp-building__roof')).display, over: document.getElementById('section-floors').scrollWidth - innerWidth };
  });
  assert(p.row && p.roof === 'none' && p.over <= 0, `phone floors: ${JSON.stringify(p)}`);
});

await check('P1 Floors: filters "Only free" + room count dim (never hide) non-matching tiles', async (page) => {
  await open(page);
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit');
  const st = () => page.evaluate(() => ({
    tiles: document.querySelectorAll('.fp-unit').length,
    visible: [...document.querySelectorAll('.fp-unit')].filter((b) => b.offsetParent && getComputedStyle(b).display !== 'none').length,
    dim: [...document.querySelectorAll('.fp-unit.is-dim')].map((b) => b.dataset.unit),
    opacity: document.querySelector('.fp-unit.is-dim') ? getComputedStyle(document.querySelector('.fp-unit.is-dim')).opacity : null,
    chip: document.querySelector('.fp-floor-chip').textContent,
    meta2: document.querySelector('[data-pick-floor="2"] .fp-floor__meta').textContent,
  }));
  await page.click('button[data-filter="free"]');
  await page.waitForTimeout(300);
  let s = await st();
  assert(s.tiles === 14 && s.visible === 14, `tiles hidden: ${JSON.stringify(s)}`);
  assert(s.dim.sort().join() === ['10', '19', '7'].sort().join(), `only-free dims ${s.dim}`);
  assert(Number(s.opacity) < 0.5, `dimmed opacity ${s.opacity}`);
  assert(/11 match the filter/.test(s.chip) && s.meta2 === '11 match', `counts: ${s.chip} / ${s.meta2}`);
  await page.click('button[data-filter-rooms="3"]');
  await page.waitForTimeout(300);
  s = await st();
  const want = await page.evaluate(() => [...document.querySelectorAll('.fp-unit')].filter((b) => !(b.classList.contains('free') && /^3 rm/.test(b.querySelector('.fp-unit__meta').textContent))).map((b) => b.dataset.unit));
  assert(s.dim.sort().join() === want.sort().join(), `free + 3 rooms dims ${s.dim}, want ${want}`);
  // a dimmed tile can still be opened
  await page.click('.fp-unit[data-unit="19"]');
  assert(await page.evaluate(() => /#19/.test(document.querySelector('.fp-detail__title').textContent)), 'dimmed tile not selectable');
  // second click clears the room filter; "Only free" off again → no dimming
  await page.click('button[data-filter-rooms="3"]');
  await page.click('button[data-filter="free"]');
  await page.waitForTimeout(300);
  s = await st();
  assert(!s.dim.length && s.meta2 === '11 free', `filters did not clear: ${JSON.stringify(s)}`);
  assert(await page.evaluate(() => document.querySelector('[data-filter-rooms="any"]').getAttribute('aria-pressed')) === 'true', '"Any" not pressed after clearing');
});

await check('P1 listing: balcony pill, €/m² from the data, "See unit #16 on Floor 2 →" opens Floors with #16', async (page) => {
  await open(page);
  const l = await page.evaluate(() => ({
    pill: document.querySelector('#listing .pill-balcony')?.textContent,
    pillBg: getComputedStyle(document.querySelector('#listing .pill-balcony')).backgroundColor,
    ppm: document.querySelector('#listing [data-ppm]')?.textContent.replace(/\s+/g, ' '),
    link: document.querySelector('#listing [data-see-unit]')?.innerText.replace(/\s+/g, ' ').trim(),
    body: document.body.innerText,
  }));
  assert(l.pill === 'Balcony 36.2 m²' && l.pillBg !== 'rgba(0, 0, 0, 0)', `pill: ${JSON.stringify(l.pill)}`);
  assert(l.ppm === '4 521 €/m²', `ppm: ${l.ppm}`);
  assert(l.link === 'See unit #16 on Floor 2 →', `link: ${l.link}`);
  assert(!/book a viewing|contact us|contact sales|request a call/i.test(l.body), 'fake contact CTA on the page');
  await spyCamera(page);
  await page.click('#listing [data-see-unit]');
  await page.waitForTimeout(600);
  const s = await page.evaluate(() => ({
    section: document.body.dataset.currentSection, hash: location.hash,
    floor: document.querySelector('.fp-floors [aria-pressed="true"]')?.dataset.pickFloor,
    sel: document.querySelector('.fp-unit.is-selected')?.dataset.unit, focus: document.activeElement?.dataset?.unit,
    title: document.querySelector('.fp-detail__title')?.textContent,
  }));
  assert(s.section === 'floors' && s.hash === '#floors' && s.floor === '2' && s.sel === '16' && s.focus === '16' && s.title === 'Apartment #16', `after link: ${JSON.stringify(s)}`);
  // after browsing another floor the link still lands on #16
  await page.click('button[data-pick-floor="4"]');
  await page.click('button[data-section="apartment"]');
  await page.click('#listing [data-see-unit]');
  await page.waitForTimeout(400);
  assert(await page.evaluate(() => document.querySelector('.fp-unit.is-selected')?.dataset.unit) === '16', 'link did not reselect #16');
});

await check('P1 colour discipline: nav states use umber #3b2f28; accent only for #16 / selection / CTA / eyebrows', async (page) => {
  await open(page);
  const s = await page.evaluate(() => {
    const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor;
    const col = (sel) => getComputedStyle(document.querySelector(sel)).color;
    return {
      seg: bg('.seg--time button[aria-pressed="true"]'), mark: bg('.topbar__mark'), view: col('.view-toggle button[aria-pressed="true"]'),
      eyebrow: col('.listing__eyebrow'), price: col('.listing__price--full'),
    };
  });
  const INK = 'rgb(59, 47, 40)';
  const ACC = 'rgb(176, 81, 58)';
  assert(s.seg === INK && s.mark === INK && s.view === INK, `nav colours: ${JSON.stringify(s)}`);
  assert(s.eyebrow === ACC && s.price !== ACC, `accent use: ${JSON.stringify(s)}`);
  await page.click('button[data-section="floors"]');
  await page.waitForSelector('.fp-unit');
  const f = await page.evaluate(() => ({
    floor: getComputedStyle(document.querySelector('.fp-floors [aria-pressed="true"]')).backgroundColor,
    any: getComputedStyle(document.querySelector('[data-filter-rooms="any"]')).backgroundColor,
    cta: getComputedStyle(document.querySelector('.fp-detail .btn-primary')).backgroundColor,
    badge: getComputedStyle(document.querySelector('.fp-unit__badge')).backgroundColor,
    link: getComputedStyle(document.querySelector('.fp-source a')).color,
  }));
  assert(f.floor === INK && f.any === INK && f.cta === ACC && f.badge === ACC && f.link !== ACC, `floors colours: ${JSON.stringify(f)}`);
});

await check('P1 themes: pressed floor = theme ink (≠ accent), no errors, every theme renders the new Floors UI', async (page, errors) => {
  for (const theme of ['sage', 'nordic-stone', 'baltic-sea', 'graphite-brass']) {
    await page.goto(new URL(`?debug&theme=${theme}`, base).href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    await page.click('button[data-section="floors"]');
    await page.waitForSelector('.fp-sum__hero, .fp-unit.is-selected');
    const s = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const probe = (v) => { const d = document.createElement('i'); d.style.color = `var(${v})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      return {
        ink: probe('--ink'), accent: probe('--accent'),
        floor: getComputedStyle(document.querySelector('.fp-floors [aria-pressed="true"]')).backgroundColor,
        price: document.querySelector('.fp-unit[data-unit="16"] .fp-unit__price')?.textContent.replace(/\s+/g, ' '),
        theme: document.documentElement.dataset.theme, _r: root.length,
      };
    });
    assert(s.theme === theme && s.floor === s.ink && s.ink !== s.accent && s.price === '213 000 €', `${theme}: ${JSON.stringify(s)}`);
  }
  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
});

await check('P1 phone landscape + portrait: listing and Floors fit (no horizontal overflow)', async (page) => {
  for (const vp of [{ width: 844, height: 390 }, { width: 390, height: 844 }, { width: 360, height: 740 }]) {
    await page.setViewportSize(vp);
    await page.goto(URL_DEBUG, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    await page.evaluate(() => window.__showSection('floors'));
    await page.waitForSelector('.fp-unit');
    await page.click('button[data-filter="free"]');
    const s = await page.evaluate(() => ({
      over: document.getElementById('section-floors').scrollWidth - innerWidth,
      filtersInside: document.querySelector('.fp-filters').getBoundingClientRect().right <= innerWidth + 0.5,
      tileOver: [...document.querySelectorAll('.fp-unit__price')].some((p) => p.scrollWidth > p.clientWidth + 1),
    }));
    assert(s.over <= 0 && s.filtersInside && !s.tileOver, `${vp.width}×${vp.height}: ${JSON.stringify(s)}`);
  }
}, PHONE);

await browser.close();
await server?.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} e2e checks passed`);
process.exitCode = failed ? 1 : 0;
