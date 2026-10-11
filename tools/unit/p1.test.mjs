import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCsv, counts, floorSummary, matchesFilter, filterActive, roomOptions, tilePrice, fmtPriceRange, fmtAreaRange } from '../../public/js/ui/floorPicker.js';
import { pricePerM2, fmtPpm } from '../../public/js/ui/format.js';
import { minFrameRect, MIN_FRAME } from '../../public/js/scene/framing.js';
import { highlightTarget, stepToward, HIGHLIGHT_FADE, HOVER_GLOW, SELECT_GLOW, DIM } from '../../public/js/scene/highlight.js';
import * as PLAN from '../../public/js/data/plan.js';

const units = parseCsv(await readFile(new URL('../../public/data/units.csv', import.meta.url), 'utf8'));
const NB = '\u202f';

test('P1-5 €/m²: #16 = 213 000 € / 73.0 m² = 2 918 €/m², computed from the CSV; missing data → "—"', () => {
  const u16 = units.find((u) => u.unit === '16');
  assert.equal(pricePerM2(u16.price_eur, u16.area_m2), 2918);
  assert.equal(pricePerM2(PLAN.UNIT.priceEur, PLAN.UNIT.areaM2), 2918);
  assert.equal(fmtPpm(2918), `2${NB}918 €/m²`);
  assert.equal(pricePerM2(null, 73), null);
  assert.equal(pricePerM2(330000, 0), null);
  assert.equal(fmtPpm(null), '—');
});

test('P1-2 tiles: listed price or "—" (reserved / sold have no public price — never invented)', () => {
  const byId = (id) => units.find((u) => u.unit === id);
  assert.equal(tilePrice(byId('16')), `213${NB}000 €`);
  assert.equal(byId('19').status, 'sold');
  assert.equal(tilePrice(byId('19')), '—');
  assert.equal(byId('7').status, 'reserved');
  assert.equal(tilePrice(byId('7')), '—');
  for (const u of units) {
    if (u.price_eur == null) assert.equal(tilePrice(u), '—', `unit ${u.unit}`);
    else assert.match(tilePrice(u), /^\d{1,3}(\u202f\d{3})* €$/, `unit ${u.unit}`);
  }
});

test('P1-2 floor summary: counts, price / area ranges and room mix computed from the data', () => {
  const f2 = units.filter((u) => u.floor === 2);
  const s = floorSummary(f2);
  assert.equal(s.total, 14);
  assert.deepEqual([s.free, s.reserved, s.sold], [11, 2, 1]);
  const prices = f2.map((u) => u.price_eur).filter((n) => n != null);
  assert.deepEqual(s.price, [Math.min(...prices), Math.max(...prices)]);
  assert.equal(s.priced, prices.length);
  assert.equal(s.priced, s.free, 'on the as-of date exactly the free units have a public price');
  const areas = f2.map((u) => u.area_m2);
  assert.deepEqual(s.area, [Math.min(...areas), Math.max(...areas)]);
  assert.equal(s.rooms.reduce((n, r) => n + r.n, 0) + s.commercial, 14);
  const f1 = floorSummary(units.filter((u) => u.floor === 1));
  assert.equal(f1.commercial, 6);
  for (const f of [1, 2, 3, 4, 5]) {
    const x = floorSummary(units.filter((u) => u.floor === f));
    assert.deepEqual(counts(units.filter((u) => u.floor === f)), { free: x.free, reserved: x.reserved, sold: x.sold });
  }
  assert.equal(fmtPriceRange([159000, 435000]), `159${NB}000 – 435${NB}000\u00a0€`);
  assert.equal(fmtPriceRange([330000, 330000]), `330${NB}000\u00a0€`);
  assert.equal(fmtPriceRange(null), '—');
  assert.equal(fmtAreaRange([32.8, 102.4]), '32.8 – 102.4\u00a0m²');
  assert.deepEqual(floorSummary([]).price, null);
});

test('P1-2 filters: only free, exact room count, both; commercial units never match a room count', () => {
  const free = { onlyFree: true, rooms: null };
  const two = { onlyFree: false, rooms: 2 };
  assert.equal(filterActive({}), false);
  assert.equal(filterActive(free), true);
  assert.equal(filterActive(two), true);
  assert.equal(units.filter((u) => matchesFilter(u, free)).length, 55);
  assert.equal(units.filter((u) => matchesFilter(u, two)).length, units.filter((u) => u.rooms === 2).length);
  assert.ok(units.filter((u) => matchesFilter(u, { onlyFree: true, rooms: 2 })).every((u) => u.status === 'free' && u.rooms === 2));
  assert.ok(units.filter((u) => u.commercial).every((u) => !matchesFilter(u, { rooms: 1 })));
  assert.equal(units.filter((u) => matchesFilter(u, {})).length, units.length);
  assert.deepEqual(roomOptions(units), [1, 2, 3, 4, 5]);
});

test('P1-3 small rooms: framed as ≥ MIN_FRAME m around their centre, big rooms unchanged', () => {
  const bath = PLAN.ROOMS.find((r) => r.id === 'bath').rect;
  const f = minFrameRect(bath, MIN_FRAME['3d']);
  assert.equal(f.w, MIN_FRAME['3d']);
  assert.equal(f.d, MIN_FRAME['3d']);
  assert.ok(Math.abs(f.x + f.w / 2 - (bath.x + bath.w / 2)) < 1e-9 && Math.abs(f.z + f.d / 2 - (bath.z + bath.d / 2)) < 1e-9, 'not centred');
  const living = PLAN.ROOMS.find((r) => r.id === 'living').rect;
  const g = minFrameRect(living, MIN_FRAME['3d']);
  assert.ok(g.w >= living.w && g.d >= living.d);
  if (living.w >= MIN_FRAME['3d']) assert.equal(g.w, living.w);
  assert.ok(MIN_FRAME.plan >= MIN_FRAME['3d'], 'the floor plan keeps at least as much context');
  assert.deepEqual(minFrameRect({ x: 1, z: 2, w: 6, d: 5 }, 4.5), { x: 1, z: 2, w: 6, d: 5 });
});

test('P1-1 highlight: hover is warmer than selection, others dim only while something is selected', () => {
  const none = highlightTarget('bath', null, null);
  assert.deepEqual(none, { bright: 1, glow: 0, line: 0 });
  const hov = highlightTarget('bath', null, 'bath');
  assert.equal(hov.glow, HOVER_GLOW);
  assert.ok(hov.line > 0 && hov.bright === 1);
  const sel = highlightTarget('bath', 'bath', 'bath');
  assert.equal(sel.glow, SELECT_GLOW, 'hovering the selected room keeps the selection look');
  assert.equal(highlightTarget('wc', 'bath', null).bright, DIM);
  assert.equal(highlightTarget('wc', 'bath', 'wc').bright, 1, 'a hovered room is not dimmed');
});

test('P1-1 highlight fades: in ≤ 100 ms, out ≈ 200 ms, never overshoot', () => {
  const run = (from, to, dt) => {
    let v = from;
    let t = 0;
    while (v !== to && t < 2) {
      v = stepToward(v, to, dt, HOVER_GLOW);
      assert.ok(from < to ? v <= to : v >= to, 'overshoot');
      t += dt;
    }
    return t;
  };
  assert.ok(HIGHLIGHT_FADE.in < 0.1 && HIGHLIGHT_FADE.out <= 0.2);
  assert.ok(run(0, HOVER_GLOW, 1 / 60) <= HIGHLIGHT_FADE.in + 1 / 60 + 1e-9);
  const out = run(HOVER_GLOW, 0, 1 / 60);
  assert.ok(out <= HIGHLIGHT_FADE.out + 1 / 60 + 1e-9 && out >= HIGHLIGHT_FADE.out - 1 / 60 - 1e-9, `fade-out ${out}s`);
  assert.equal(stepToward(0.2, 0.2, 1, 1), 0.2);
});

// ── P1-4 colour discipline ───────────────────────────────────────────
const css = await readFile(new URL('../../public/css/style.css', import.meta.url), 'utf8');
const { THEMES } = await import('../../public/js/theme.js');
const lum = (hex) => {
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('P1-4 every pressed / active navigation rule uses the ink colour, never the accent', () => {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const nav = rules.filter((r) => /aria-pressed='true'\]/.test(r.sel) || /\.chip\.is-active/.test(r.sel));
  assert.ok(nav.length >= 8, `only ${nav.length} pressed-state rules found`);
  for (const r of nav) {
    if (/night/.test(r.sel)) continue; // fixed light-on-dark values for the night top bar
    assert.ok(!/var\(--accent/.test(r.body), `accent used in "${r.sel}"`);
    if (/background:/.test(r.body) && !/\.chip\.is-active:hover/.test(r.sel)) assert.match(r.body, /--ink/, `"${r.sel}" does not use --ink`);
  }
  // Accent stays for: main button, eyebrows, hero, selected room.
  assert.match(css, /\.btn-primary \{[^}]*background: var\(--accent\)/);
  assert.match(css, /\.listing__eyebrow \{[^}]*color: var\(--accent\)/);
});

test('P1-4 all themes: ink ≠ accent, readable pressed pills (on-ink vs ink ≥ 4.5:1)', () => {
  for (const [id, t] of Object.entries(THEMES)) {
    const u = t.ui;
    assert.ok(u.ink && u.onInk, `${id}: no ink`);
    assert.notEqual(u.ink.toLowerCase(), u.accent.toLowerCase(), `${id}: ink = accent`);
    assert.ok(contrast(u.ink, u.onInk) >= 4.5, `${id}: on-ink contrast ${contrast(u.ink, u.onInk).toFixed(2)}`);
    assert.ok(contrast(u.ink, u.bg) >= 3, `${id}: ink pill does not stand out from the page (${contrast(u.ink, u.bg).toFixed(2)})`);
  }
  assert.equal(THEMES['warm-terracotta'].ui.ink, '#3b2f28');
});
