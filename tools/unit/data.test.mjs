import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCsv, splitCsv, counts } from '../../public/js/ui/floorPicker.js';
import { UNITS_SOURCE } from '../../public/js/data/unitsSource.js';
import * as PLAN from '../../public/js/data/plan.js';

const csvText = await readFile(new URL('../../public/data/units.csv', import.meta.url), 'utf8');

test('splitCsv: quotes, escaped quotes, commas, CRLF, blank lines', () => {
  const rows = splitCsv('a,b,c\r\n"x, y","say ""hi""",\r\n\r\n1,2,3');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'say "hi"', ''], ['1', '2', '3']]);
});

test('parseCsv: numbers, empty cells, commercial units, bad rows dropped, unknown status', () => {
  const units = parseCsv('unit,floor,rooms,area_m2,balcony,price_eur,status\nÄP 1,1,,100.7,,304000,free\n7,2,2,56.2,4.6,,Reserved\n,3,1,1,1,1,free\nX,,1,1,1,1,free\n9,2,3,60.2,4.6,275000,"<b>odd</b>"\n');
  assert.equal(units.length, 3);
  assert.deepEqual(
    units.map((u) => [u.unit, u.floor, u.rooms, u.area_m2, u.balcony, u.price_eur, u.status, u.commercial]),
    [
      ['ÄP 1', 1, null, 100.7, null, 304000, 'free', true],
      ['7', 2, 2, 56.2, 4.6, null, 'reserved', false],
      ['9', 2, 3, 60.2, 4.6, 275000, 'unknown', false],
    ],
  );
});

test('counts: tallies known statuses only', () => {
  assert.deepEqual(counts([{ status: 'free' }, { status: 'free' }, { status: 'sold' }, { status: 'unknown' }]), { free: 2, reserved: 0, sold: 1 });
});

test('unit CSV: 63 units, statuses as fetched on the as-of date (55 free / 6 reserved / 2 sold)', () => {
  const units = parseCsv(csvText);
  assert.equal(units.length, 63);
  assert.deepEqual(counts(units), { free: 55, reserved: 6, sold: 2 });
  assert.equal(new Set(units.map((u) => u.unit)).size, 63, 'duplicate unit ids');
  assert.deepEqual([...new Set(units.map((u) => u.floor))].sort(), [1, 2, 3, 4, 5]);
  for (const u of units) {
    assert.ok(['free', 'reserved', 'sold'].includes(u.status), `unit ${u.unit}: status ${u.status}`);
    if (u.status === 'free') assert.ok(u.price_eur > 0, `free unit ${u.unit} has no price`);
  }
  assert.match(UNITS_SOURCE.asOf, /^\d{4}-\d{2}-\d{2}$/);
});

test('hero unit #16 exists in the CSV and matches plan.js (floor 2, 73.0 m², balcony 36.2 m²)', () => {
  const u = parseCsv(csvText).find((x) => x.unit === PLAN.UNIT.id);
  assert.ok(u, 'unit 16 missing');
  assert.equal(u.floor, PLAN.UNIT.floor);
  assert.equal(u.floor, 2);
  assert.equal(u.rooms, PLAN.UNIT.rooms);
  assert.equal(u.area_m2, 73.0);
  assert.equal(u.balcony, 36.2);
  assert.equal(u.price_eur, PLAN.UNIT.priceEur);
});

test('plan.js: conceptual room areas sum to the listed 73.0 m² and 36.2 m² balcony', () => {
  const area = (r) => r.rect.w * r.rect.d;
  const indoor = PLAN.ROOMS.filter((r) => !r.outdoor).reduce((s, r) => s + area(r), 0);
  const outdoor = PLAN.ROOMS.filter((r) => r.outdoor).reduce((s, r) => s + area(r), 0);
  assert.ok(Math.abs(indoor - PLAN.UNIT.areaM2) < 0.05, `interior ${indoor}`);
  assert.ok(Math.abs(outdoor - PLAN.UNIT.balconyM2) < 0.05, `balcony ${outdoor}`);
  for (const id of PLAN.CHIP_ORDER) assert.ok(PLAN.ROOMS.some((r) => r.id === id), `chip ${id} has no room`);
});

test('plan.js: every room has a chip, Balcony is the 2nd chip, mobile labels are short', () => {
  assert.equal(new Set(PLAN.CHIP_ORDER).size, PLAN.ROOMS.length, 'CHIP_ORDER must list every room once');
  assert.equal(PLAN.CHIP_ORDER[1], 'balcony');
  for (const r of PLAN.ROOMS) {
    const label = r.mobileShort || r.short || r.name;
    assert.ok(label.length <= 8, `mobile chip label "${label}" too long`);
  }
});
