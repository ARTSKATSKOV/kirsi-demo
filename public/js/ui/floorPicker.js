/**
 * floorPicker.js — schematic floor grid coloured by unit status from the CSV.
 * Positions are schematic (not the real building plan).
 *
 * Floor buttons and unit tiles are real <button>s with aria-pressed; the
 * grid is only rebuilt when the floor changes, so keyboard focus stays on
 * the tile / button that was activated.
 *
 * Desktop: a schematic 5-floor building column (floor 5 on top) picks the
 * floor; on narrower screens the same buttons are a row of pills. Filters
 * ("Only free", room count) dim non-matching tiles — they never hide them.
 * With no unit selected the side card is a summary of the floor. Every
 * number shown is computed from the CSV; a missing price is shown as "—".
 */
import { fmt1, fmtEur, fmtPpm, pricePerM2, escapeHtml, formatIsoDay } from './format.js';

export const STATUS_LABEL = { free: 'Free', reserved: 'Reserved', sold: 'Sold' };
const STATUSES = new Set(Object.keys(STATUS_LABEL));

/** Splits CSV text into rows of fields (RFC 4180: quotes, "" escapes, CRLF). */
export function splitCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const num = (s) => {
  if (s == null || String(s).trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** CSV text → unit objects. Rows without a valid floor are dropped; unknown statuses become 'unknown'. */
export function parseCsv(text) {
  const [headers = [], ...lines] = splitCsv(text);
  const keys = headers.map((h) => h.trim());
  return lines
    .map((cols) => {
      const row = Object.fromEntries(keys.map((h, i) => [h, (cols[i] ?? '').trim()]));
      const status = row.status.toLowerCase();
      return {
        ...row,
        unit: row.unit,
        floor: num(row.floor),
        rooms: num(row.rooms),
        area_m2: num(row.area_m2),
        balcony: num(row.balcony),
        price_eur: num(row.price_eur),
        status: STATUSES.has(status) ? status : 'unknown',
        commercial: row.unit.startsWith('ÄP'),
      };
    })
    .filter((u) => u.unit && Number.isInteger(u.floor));
}

export function counts(units) {
  const c = { free: 0, reserved: 0, sold: 0 };
  for (const u of units) if (c[u.status] != null) c[u.status]++;
  return c;
}

const statusLabel = (s) => STATUS_LABEL[s] || 'Unknown';

/** Price text for a tile: the listed price, or "—" when the list has none (reserved / sold). */
export const tilePrice = (u) => (u.price_eur != null ? fmtEur(u.price_eur) : '—');

/** Distinct room counts of the apartments (commercial units have none), ascending. */
export const roomOptions = (units) => [...new Set(units.map((u) => u.rooms).filter((n) => Number.isInteger(n)))].sort((a, b) => a - b);

/**
 * @param {object} u unit
 * @param {{onlyFree?: boolean, rooms?: number|null}} f  rooms = exact room count, null = any
 */
export function matchesFilter(u, f = {}) {
  if (f.onlyFree && u.status !== 'free') return false;
  if (f.rooms != null && u.rooms !== f.rooms) return false;
  return true;
}
export const filterActive = (f = {}) => !!f.onlyFree || f.rooms != null;

const range = (vals) => (vals.length ? [Math.min(...vals), Math.max(...vals)] : null);

/**
 * Summary of one floor's units, all from the data: status counts, the range of
 * listed prices (reserved / sold units have no public price, so they are not
 * in it), the area range and the mix of room counts.
 */
export function floorSummary(units) {
  const c = counts(units);
  const prices = units.map((u) => u.price_eur).filter((n) => n != null);
  const areas = units.map((u) => u.area_m2).filter((n) => n != null);
  const mix = new Map();
  for (const u of units) if (Number.isInteger(u.rooms)) mix.set(u.rooms, (mix.get(u.rooms) || 0) + 1);
  return {
    total: units.length,
    ...c,
    price: range(prices),
    priced: prices.length,
    area: range(areas),
    rooms: [...mix.entries()].sort((a, b) => a[0] - b[0]).map(([rooms, n]) => ({ rooms, n })),
    commercial: units.filter((u) => u.commercial).length,
  };
}

const fmtRange = (r, f) => (!r ? '—' : r[0] === r[1] ? f(r[0]) : `${f(r[0])} – ${f(r[1])}`);
/** 185000–330000 → "185 000 – 330 000 €" (one € sign). */
export const fmtPriceRange = (r) => fmtRange(r, (n) => fmtEur(n).replace(/\s€$/, '')) + (r ? '\u00a0€' : '');
export const fmtAreaRange = (r) => fmtRange(r, fmt1) + (r ? '\u00a0m²' : '');

/** Free / reserved / sold proportions as a tiny stacked bar (decorative). */
const statusBar = (c, total) =>
  `<span class="fp-bar" aria-hidden="true">${['free', 'reserved', 'sold']
    .filter((k) => c[k])
    .map((k) => `<span class="fp-bar__seg ${k}" style="flex-grow:${c[k] / Math.max(1, total)}"></span>`)
    .join('')}</span>`;

/**
 * @returns {Promise<{units, find(id), closeDetail(): boolean, showUnit(id, opts?)} | null>}
 */
export async function initFloorPicker({ csvUrl, heroUnit, onView3d, initialFloor = 2, initialUnit = null, source, debug = false }) {
  const root = document.getElementById('floor-picker');
  if (!root) return null;
  let units;
  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`${res.status}`);
    units = parseCsv(await res.text());
    if (!units.length) throw new Error('no units');
  } catch (err) {
    root.innerHTML = `<p class="fp-error">Could not load unit data (${escapeHtml(err.message)}).</p>`;
    return null;
  }

  const floors = [...new Set(units.map((u) => u.floor))].sort((a, b) => a - b);
  let active = floors.includes(initialFloor) ? initialFloor : floors[0];
  let selected = initialUnit != null ? String(initialUnit) : null;
  /** Filter state (one object; see matchesFilter). */
  const filter = { onlyFree: false, rooms: null };
  const total = counts(units);
  const heroRow = units.find((u) => String(u.unit) === String(heroUnit)) || null;
  const asOf = source?.asOf ? formatIsoDay(source.asOf) : '';
  const srcLinks = '';
  const roomChoices = roomOptions(units);

  root.innerHTML = `
    <div class="fp-head">
      <div>
        <h2 class="fp-title">Building overview</h2>
        <p class="fp-sub">Concept demo · Tallinn · schematic floor grid</p>
      </div>
      <div class="fp-counts" data-counts></div>
    </div>
    <p class="fp-note">Unit positions are schematic — not an architectural drawing. Status colours follow the sample dataset${asOf ? ` as of ${asOf}` : ''}.</p>
    <div class="fp-toolbar">
      <div class="fp-filters" role="group" aria-label="Filter units (non-matching units are dimmed)">
        <button type="button" class="fp-filter" data-filter="free" aria-pressed="false"><span class="fp-filter__dot" aria-hidden="true"></span>Only free</button>
        <span class="fp-filters__label" aria-hidden="true">Rooms</span>
        <button type="button" class="fp-filter" data-filter-rooms="any" aria-pressed="true" aria-label="Any number of rooms">Any</button>
        ${roomChoices.map((n) => `<button type="button" class="fp-filter fp-filter--n" data-filter-rooms="${n}" aria-pressed="false" aria-label="${n} room${n > 1 ? 's' : ''}">${n}</button>`).join('')}
      </div>
      <ul class="fp-legend" aria-label="Status legend">
        <li><span class="fp-swatch free"></span>Free</li>
        <li><span class="fp-swatch reserved"></span>Reserved</li>
        <li><span class="fp-swatch sold"></span>Sold</li>
        <li><span class="fp-swatch hero"></span>Unit #${escapeHtml(heroUnit)} (3D)</li>
      </ul>
      <p class="fp-floor-chip" aria-live="polite"></p>
    </div>
    <div class="fp-body">
      <div class="fp-building">
        <div class="fp-building__roof" aria-hidden="true"></div>
        <div class="fp-floors" role="group" aria-label="Floor" data-floors></div>
        <div class="fp-building__ground" aria-hidden="true"></div>
        <p class="fp-building__note">Schematic · not to scale</p>
      </div>
      <ul class="fp-grid" data-grid aria-label="Units"></ul>
      <aside class="fp-detail panel-card" data-detail aria-live="polite"></aside>
    </div>
    <p class="fp-source" data-as-of="${escapeHtml(source?.asOf || '')}">Data${asOf ? ` as of ${asOf}` : ''}: illustrative sample dataset</p>`;

  const floorsEl = root.querySelector('[data-floors]');
  const filtersEl = root.querySelector('.fp-filters');
  const gridEl = root.querySelector('[data-grid]');
  const detailEl = root.querySelector('[data-detail]');
  const countsEl = root.querySelector('[data-counts]');
  const floorChip = root.querySelector('.fp-floor-chip');
  // Phone bottom sheet: pad the grid by the sheet height so no tile hides under it.
  new ResizeObserver(() => root.style.setProperty('--sheet-h', `${detailEl.offsetHeight}px`)).observe(detailEl);
  countsEl.innerHTML = `<span><strong>${total.free}</strong> free</span><span><strong>${total.reserved}</strong> reserved</span><span><strong>${total.sold}</strong> sold</span><span><strong>${units.length}</strong> units</span>`;

  // Floor buttons in floor order (1 → 5). On desktop CSS stacks them bottom-up
  // as a building (column-reverse), on phones they are a row of pills.
  floorsEl.innerHTML = floors
    .map((f) => {
      const hasHero = heroRow?.floor === f;
      return `<button type="button" class="fp-floor" data-pick-floor="${f}" aria-pressed="false">
        <span class="fp-floor__name">Floor <span class="fp-floor__n">${f}</span></span>
        <span class="fp-floor__meta" data-floor-meta></span>
        ${hasHero ? `<span class="fp-floor__hero">#${escapeHtml(heroUnit)}</span>` : ''}
        <span class="fp-floor__bar" data-floor-bar></span>
      </button>`;
    })
    .join('');
  floorsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pick-floor]');
    if (!b) return;
    const f = Number(b.dataset.pickFloor);
    if (f === active) return; // no-op: keep selection and focus
    active = f;
    selected = null;
    renderFloor();
  });

  filtersEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.filter === 'free') filter.onlyFree = !filter.onlyFree;
    else if (b.dataset.filterRooms) {
      const n = b.dataset.filterRooms === 'any' ? null : Number(b.dataset.filterRooms);
      filter.rooms = filter.rooms === n ? null : n; // a second click clears it
    } else return;
    renderFilter();
  });

  gridEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-unit]');
    if (!b) return;
    select(b.dataset.unit);
  });

  detailEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-dismiss]')) closeDetail();
    else if (e.target.closest('[data-view3d]')) onView3d?.();
    else if (e.target.closest('[data-pick-unit]')) {
      const id = e.target.closest('[data-pick-unit]').dataset.pickUnit;
      select(id);
      tileOf(id)?.focus({ preventScroll: true });
    }
  });

  const find = (id) => units.find((x) => String(x.unit) === String(id)) || null;
  const tileOf = (id) => [...gridEl.querySelectorAll('button[data-unit]')].find((b) => b.dataset.unit === String(id)) || null;

  function select(id) {
    if (selected === String(id)) return;
    selected = String(id);
    renderSelection();
  }

  /** Closes the unit details; focus goes back to the unit's tile. @returns {boolean} whether it was open */
  function closeDetail() {
    if (!selected) return false;
    const tile = tileOf(selected);
    const hadFocus = detailEl.contains(document.activeElement);
    selected = null;
    renderSelection();
    if (hadFocus || document.activeElement === document.body) tile?.focus({ preventScroll: true });
    return true;
  }

  /** Opens a unit (switching floors if needed), e.g. from the listing link. */
  function showUnit(id, { focus = false } = {}) {
    const u = find(id);
    if (!u) return false;
    if (u.floor !== active) {
      active = u.floor;
      selected = null;
      renderFloor();
    }
    select(String(u.unit));
    const tile = tileOf(u.unit);
    if (tile) {
      tile.scrollIntoView?.({ block: 'nearest' });
      if (focus) tile.focus({ preventScroll: true });
    }
    return true;
  }

  function renderFloor() {
    for (const b of floorsEl.querySelectorAll('button[data-pick-floor]')) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.pickFloor) === active));
    }
    const onFloor = units.filter((u) => u.floor === active);
    gridEl.innerHTML = onFloor
      .map((u) => {
        const hero = String(u.unit) === String(heroUnit);
        const label = u.commercial ? String(u.unit) : `#${u.unit}`;
        // Commercial: "Commercial · 100.7 m²" — two parts that wrap cleanly
        // on narrow tiles (the separator dot is hidden when they wrap, see CSS).
        const split = u.commercial && u.area_m2 != null;
        const sub = u.commercial
          ? 'Commercial'
          : u.rooms
            ? `${u.rooms} rm · ${fmt1(u.area_m2)}\u00a0m²`
            : `${fmt1(u.area_m2)}\u00a0m²`;
        const price = tilePrice(u);
        return `<li><button type="button" class="fp-unit ${u.status}${hero ? ' is-hero' : ''}" data-unit="${escapeHtml(u.unit)}" aria-pressed="false">
          <span class="fp-unit__id">${escapeHtml(label)}</span>
          ${split
            ? `<span class="fp-unit__meta fp-unit__meta--split"><span>Commercial</span> <span>${fmt1(u.area_m2)}\u00a0m²</span></span>`
            : `<span class="fp-unit__meta">${escapeHtml(sub)}</span>`}
          <span class="fp-unit__price${u.price_eur == null ? ' is-none' : ''}">${price}</span>
          <span class="fp-unit__status">${escapeHtml(statusLabel(u.status))}</span>
          ${hero ? '<span class="fp-unit__badge">3D</span>' : ''}
        </button></li>`;
      })
      .join('');
    renderFilter();
    renderSelection();
  }

  /** Dims tiles that don't match; updates filter buttons and per-floor counts. */
  function renderFilter() {
    const on = filterActive(filter);
    root.classList.toggle('is-filtered', on);
    filtersEl.querySelector('[data-filter="free"]').setAttribute('aria-pressed', String(filter.onlyFree));
    for (const b of filtersEl.querySelectorAll('[data-filter-rooms]')) {
      const n = b.dataset.filterRooms === 'any' ? null : Number(b.dataset.filterRooms);
      b.setAttribute('aria-pressed', String(filter.rooms === n));
    }
    for (const b of gridEl.querySelectorAll('button[data-unit]')) {
      const m = matchesFilter(find(b.dataset.unit), filter);
      b.classList.toggle('is-dim', on && !m);
      b.dataset.match = String(m);
    }
    for (const b of floorsEl.querySelectorAll('button[data-pick-floor]')) {
      const list = units.filter((u) => u.floor === Number(b.dataset.pickFloor));
      const c = counts(list);
      const n = list.filter((u) => matchesFilter(u, filter)).length;
      b.querySelector('[data-floor-meta]').textContent = on ? `${n} match` : `${c.free} free`;
      b.querySelector('[data-floor-bar]').innerHTML = statusBar(c, list.length);
      b.classList.toggle('is-empty', on && n === 0);
    }
    const onFloor = units.filter((u) => u.floor === active);
    const c = counts(onFloor);
    const n = onFloor.filter((u) => matchesFilter(u, filter)).length;
    floorChip.textContent = `Floor ${active}: ${c.free} free · ${c.reserved} reserved · ${c.sold} sold · ${onFloor.length} units${on ? ` · ${n} match the filter` : ''}`;
    if (!selected) renderSummary();
  }

  function renderSummary() {
    const onFloor = units.filter((u) => u.floor === active);
    const s = floorSummary(onFloor);
    const on = filterActive(filter);
    const n = onFloor.filter((u) => matchesFilter(u, filter)).length;
    const hero = heroRow?.floor === active ? heroRow : null;
    const mix = [
      ...s.rooms.map((r) => `<li><span>${r.rooms}-room</span><span>${r.n}</span></li>`),
      ...(s.commercial ? [`<li><span>Commercial</span><span>${s.commercial}</span></li>`] : []),
    ].join('');
    detailEl.innerHTML = `
      <p class="fp-detail__eyebrow">Floor ${active} · Summary</p>
      <h3 class="fp-detail__title">${s.total} units on floor ${active}</h3>
      <div class="fp-sum__status">
        ${statusBar(s, s.total)}
        <ul class="fp-sum__counts">
          <li class="free"><strong>${s.free}</strong> free</li>
          <li class="reserved"><strong>${s.reserved}</strong> reserved</li>
          <li class="sold"><strong>${s.sold}</strong> sold</li>
        </ul>
      </div>
      <dl class="fp-detail__stats fp-sum__stats">
        <div class="fp-sum__wide"><dt>Listed prices</dt><dd data-sum-price>${fmtPriceRange(s.price)}</dd></div>
        <div class="fp-sum__wide"><dt>Areas</dt><dd data-sum-area>${fmtAreaRange(s.area)}</dd></div>
      </dl>
      ${mix ? `<ul class="fp-sum__mix" aria-label="Units by size">${mix}</ul>` : ''}
      ${on ? `<p class="fp-sum__match"><strong>${n}</strong> of ${s.total} match the filter</p>` : ''}
      ${hero ? `<button type="button" class="fp-sum__hero" data-pick-unit="${escapeHtml(hero.unit)}"><span class="fp-sum__hero-badge">3D</span>Unit #${escapeHtml(hero.unit)} · ${hero.rooms} rooms · ${fmt1(hero.area_m2)} m²<span aria-hidden="true">→</span></button>` : ''}
      <p class="fp-detail__hint">Pick a unit to see its details.${s.priced < s.total ? ' Reserved and sold units have no public price.' : ''}</p>`;
  }

  function renderSelection() {
    for (const b of gridEl.querySelectorAll('button[data-unit]')) {
      const on = b.dataset.unit === selected;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', String(on));
    }
    const u = selected ? find(selected) : null;
    root.classList.toggle('has-detail', !!u);
    if (!u) {
      renderSummary();
      return;
    }
    const hero = String(u.unit) === String(heroUnit);
    const title = u.commercial ? `Commercial ${u.unit}` : `Apartment #${u.unit}`;
    const ppm = pricePerM2(u.price_eur, u.area_m2);
    detailEl.innerHTML = `
      <button type="button" class="fp-detail__close" data-dismiss aria-label="Close details">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <p class="fp-detail__eyebrow">Floor ${u.floor} · ${escapeHtml(statusLabel(u.status))}</p>
      <h3 class="fp-detail__title">${escapeHtml(title)}</h3>
      <dl class="fp-detail__stats">
        ${u.rooms != null ? `<div><dt>Rooms</dt><dd>${u.rooms}</dd></div>` : '<div><dt>Type</dt><dd>Commercial</dd></div>'}
        <div><dt>Area</dt><dd>${u.area_m2 != null ? `${fmt1(u.area_m2)} m²` : '—'}</dd></div>
        <div><dt>Balcony</dt><dd>${u.balcony != null ? `${fmt1(u.balcony)} m²` : '—'}</dd></div>
        <div><dt>Per m²</dt><dd data-ppm>${fmtPpm(ppm)}</dd></div>
        <div class="fp-detail__price"><dt>Price</dt><dd>${u.price_eur != null ? fmtEur(u.price_eur) : '—'}${u.price_eur == null && u.status !== 'free' ? `<small>${escapeHtml(statusLabel(u.status))} · no public price</small>` : ''}</dd></div>
      </dl>
      ${hero ? `<button type="button" class="btn-primary" data-view3d>View in 3D</button>
        <p class="fp-detail__hint">Opens the conceptual 3D layout for unit #${escapeHtml(heroUnit)}.</p>` : ''}
      <p class="fp-detail__source">Source: illustrative sample dataset${asOf ? `, as of ${asOf}` : ''}</p>`;
  }

  if (debug) {
    window.__setPickerFloor = (f) => {
      active = Number(f);
      renderFloor();
      if (find(heroUnit)?.floor === active) select(heroUnit);
    };
    window.__selectPickerUnit = (id) => {
      const u = find(id);
      if (!u) return;
      if (u.floor !== active) { active = u.floor; renderFloor(); }
      select(id);
    };
  }
  renderFloor();
  return { units, find, closeDetail, showUnit };
}
