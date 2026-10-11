import test from 'node:test';
import assert from 'node:assert/strict';
import { fmt1, fmtEur, escapeHtml, formatIsoDay } from '../../public/js/ui/format.js';
import { isoDay, formatDay, pct, milestonesWithToday } from '../../public/js/ui/timeline.js';

test('fmt1 / fmtEur / escapeHtml', () => {
  assert.equal(fmt1(73), '73.0');
  assert.equal(fmt1(13.25), '13.3');
  assert.equal(fmtEur(330000), '330\u202f000 €');
  assert.equal(fmtEur(null), '—');
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('date formatting keeps the old "28 Sep 2026" style', () => {
  assert.equal(formatIsoDay('2026-09-28'), '28 Sep 2026');
  assert.equal(formatDay(new Date(2026, 8, 28)), '28 Sep 2026');
  assert.equal(formatDay(new Date(2027, 0, 5)), '5 Jan 2027');
  assert.equal(isoDay(new Date(2027, 0, 5, 23, 59)), '2027-01-05');
});

test('pct: linear, clamped to 0–100', () => {
  assert.equal(pct('2026-03-01'), 0);
  assert.equal(pct('2028-09-01'), 100);
  assert.equal(pct('2020-01-01'), 0);
  assert.equal(pct('2030-01-01'), 100);
  const a = pct('2026-09-28');
  const b = pct('2026-12-01');
  assert.ok(a > 0 && a < b && b < 100);
});

test('milestonesWithToday: "Today" uses the given date and sits in date order', () => {
  const list = milestonesWithToday(new Date(2026, 9, 15)); // 15 Oct 2026
  const i = list.findIndex((m) => m.today);
  assert.equal(list[i].detail, '15 Oct 2026');
  assert.equal(list[i].date, '2026-10-15');
  assert.equal(list[i - 1].id, 'presale');
  assert.equal(list[i + 1].id, 'vacate');
  const later = milestonesWithToday(new Date(2027, 5, 1));
  assert.equal(later[later.findIndex((m) => m.today) - 1].id, 'build');
  const dates = later.map((m) => m.date);
  assert.deepEqual(dates, [...dates].sort());
});
