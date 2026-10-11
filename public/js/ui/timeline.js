/** timeline.js — project milestones (illustrative sample data). */
const MILESTONES = [
  { id: 'sales', date: '2026-04-02', label: 'Sales start announced', detail: '2 Apr 2026', phase: 'sales' },
  { id: 'presale', date: '2026-06-01', label: 'Pre-sale', detail: 'From June 2026', phase: 'sales' },
  { id: 'vacate', date: '2026-11-01', label: 'Current occupant vacates', detail: 'Nov 2026', phase: 'sales' },
  { id: 'build', date: '2027-01-01', label: 'Construction', detail: 'Jan 2027 – ~mid 2028', span: true, phase: 'build' },
  { id: 'handover', date: '2028-07-01', label: 'Handover', detail: 'June–August 2028', phase: 'handover' },
];
const RANGE = { start: '2026-03-01', end: '2028-09-01' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local calendar date → '2026-09-29'. */
export function isoDay(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Local calendar date → '29 Sep 2026' (fixed English month names, no locale drift). */
export function formatDay(date) {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Position of an ISO day on the track, in % (clamped to 0–100). */
export function pct(iso, start = RANGE.start, end = RANGE.end) {
  const t = (s) => Date.parse(`${s}T00:00:00Z`);
  return Math.max(0, Math.min(100, ((t(iso) - t(start)) / (t(end) - t(start))) * 100));
}

/** Milestones plus a 'Today' entry for `today`, sorted by date. */
export function milestonesWithToday(today) {
  const t = { id: 'today', date: isoDay(today), label: 'Today', detail: formatDay(today), today: true, phase: 'today' };
  // Stable: on a tie 'Today' goes after the milestone of that day.
  return [...MILESTONES, t].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.today ? 1 : b.today ? -1 : 0));
}

export function initTimeline({ now = new Date() } = {}) {
  const root = document.getElementById('timeline');
  if (!root) return;
  const items = milestonesWithToday(now);
  const todayIso = isoDay(now);

  root.innerHTML = `
    <div class="tl-head">
      <h2 class="tl-title">Project timeline</h2>
      <p class="tl-sub">Sample project timeline · illustrative dates</p>
    </div>
    <div class="tl-track" aria-hidden="true">
      <div class="tl-seg tl-seg--sales" style="left:${pct('2026-06-01')}%;right:${100 - pct('2028-06-01')}%"></div>
      <div class="tl-seg tl-seg--build" style="left:${pct('2027-01-01')}%;right:${100 - pct('2028-06-01')}%"></div>
      <div class="tl-seg tl-seg--handover" style="left:${pct('2028-06-01')}%;right:${100 - pct('2028-09-01')}%"></div>
      <div class="tl-tick tl-tick--start" style="left:0%"><span>2026</span></div>
      ${['2027-01-01', '2028-01-01'].map((d) => `<div class="tl-tick" style="left:${pct(d)}%"><span>${d.slice(0, 4)}</span></div>`).join('')}
      <div class="tl-today" data-today="${todayIso}" style="left:${pct(todayIso)}%"></div>
      ${MILESTONES.filter((m) => !m.span).map((m) => `<div class="tl-dot" style="left:${pct(m.date)}%"></div>`).join('')}
    </div>
    <ul class="tl-key" aria-hidden="true">
      <li><span class="tl-key__sw tl-seg--sales"></span>Sales</li>
      <li><span class="tl-key__sw tl-seg--build"></span>Construction</li>
      <li><span class="tl-key__sw tl-seg--handover"></span>Handover</li>
    </ul>
    <ol class="tl-list">
      ${items.map((m) => `
        <li class="tl-item tl-item--${m.phase}${m.today ? ' is-today' : ''}">
          <span class="tl-item__date">${m.detail}</span>
          <span class="tl-item__label">${m.label}</span>
        </li>`).join('')}
    </ol>
    <p class="tl-source">Illustrative sample timeline. Dates are indicative.</p>`;
}
