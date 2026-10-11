/** format.js — small number / text formatting helpers shared by the UI. */
export const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
/** 330000 → "330 000 €" (Estonian-style thin grouping). */
export const fmtEur = (n) => (n == null || n === '' ? '—' : `${Math.round(n).toLocaleString('en-US').replace(/,/g, '\u202f')} €`);
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-09-29' → '29 Sep 2026' (no time-zone shift: the ISO day is taken literally). */
export const formatIsoDay = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
/** Price per m² rounded to whole euros, or null when price / area is missing (never guessed). */
export const pricePerM2 = (price, area) => (price > 0 && area > 0 ? Math.round(price / area) : null);
/** 4520.5… → "4 521 €/m²"; missing → "—". */
export const fmtPpm = (n) => (n == null ? '—' : `${fmtEur(n)}/m²`);
