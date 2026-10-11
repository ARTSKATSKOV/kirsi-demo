/**
 * listing.js — fills the apartment panel: key facts from the price list and
 * the (conceptual) room schedule computed from plan.js, so the list can
 * never disagree with the 3D model.
 */
import { fmt1, fmtEur, fmtPpm, pricePerM2 } from './format.js';

/**
 * @param {object} opts
 * @param {{id, floor, rooms, areaM2, balconyM2, priceEur}} opts.unit  hero unit (plan.js; refreshed from the CSV via setUnit)
 * @param {(id: string) => void} opts.onSelect      schedule row clicked
 * @param {(id: string|null) => void} [opts.onHover] schedule row hovered (mouse only)
 * @param {() => void} [opts.onSeeUnit]              "See unit #16 on Floor 2 →"
 */
export function renderListing({ unit, rooms, order, onSelect, onHover = () => {}, onSeeUnit }) {
  const panel = document.getElementById('listing');
  const $ = (sel) => panel.querySelector(sel);
  const area = (r) => r.rect.w * r.rect.d;

  $('[data-title]').textContent = `${unit.rooms}-room apartment`;
  const facts = $('[data-facts]');
  const ppmEl = $('[data-ppm]');
  const seeUnit = $('[data-see-unit]');
  /** Price, €/m², balcony pill and the Floors link — all from the unit data. */
  function showUnit(u) {
    panel.querySelectorAll('[data-price]').forEach((el) => (el.textContent = fmtEur(u.priceEur)));
    const ppm = pricePerM2(u.priceEur, u.areaM2);
    if (ppmEl) {
      ppmEl.textContent = fmtPpm(ppm);
      ppmEl.hidden = ppm == null;
    }
    facts.innerHTML = [
      `<li>${u.rooms} rooms</li>`,
      `<li>${fmt1(u.areaM2)} m²</li>`,
      u.balconyM2 ? `<li class="listing__fact--pill"><span class="pill-balcony">Balcony ${fmt1(u.balconyM2)} m²</span></li>` : '',
    ].join('');
    if (seeUnit) seeUnit.querySelector('[data-see-unit-label]').textContent = `See unit #${u.id} on Floor ${u.floor}`;
  }
  showUnit(unit);
  seeUnit?.addEventListener('click', () => onSeeUnit?.());

  const sorted = order.map((id) => rooms.find((r) => r.id === id)).filter(Boolean);
  const indoor = sorted.filter((r) => !r.outdoor);
  const outdoor = sorted.filter((r) => r.outdoor);
  const total = indoor.reduce((s, r) => s + area(r), 0);
  const row = (r) =>
    `<li><button type="button" data-room="${r.id}"><span>${r.name}</span><span>${fmt1(area(r))} m²</span></button></li>`;
  const list = $('[data-schedule]');
  list.innerHTML = `
    ${indoor.map(row).join('')}
    <li class="schedule__total"><span>Interior total</span><span>${fmt1(total)} m²</span></li>
    ${outdoor.map(row).join('')}`;
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-room]');
    if (b) onSelect(b.dataset.room);
  });
  // Linked hover (mouse only: touch has no hover, so nothing can stick).
  for (const b of list.querySelectorAll('[data-room]')) {
    b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && onHover(b.dataset.room));
    b.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && onHover(null));
  }
  return {
    setActive(id) {
      for (const b of list.querySelectorAll('[data-room]')) b.classList.toggle('is-active', b.dataset.room === id);
    },
    setHover(id) {
      for (const b of list.querySelectorAll('[data-room]')) b.classList.toggle('is-hover', b.dataset.room === id);
    },
    /** Refresh from the CSV row of the hero unit (price may be missing → "—"). */
    setUnit(row) {
      showUnit({ ...unit, floor: row.floor ?? unit.floor, areaM2: row.area_m2 ?? unit.areaM2, balconyM2: row.balcony, priceEur: row.price_eur });
    },
  };
}
