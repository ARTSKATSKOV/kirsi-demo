/**
 * boot.js — page entry point.
 *
 * 1. Theme, section navigation, apartment listing, Floors and Timeline are
 *    set up first: none of them needs WebGL.
 * 2. Then the 3D viewer (main.js) is loaded. Without WebGL 2, or if the
 *    viewer throws while starting, a fallback message replaces the 3D view
 *    and the rest of the site keeps working.
 * 3. The loading overlay is always removed: when the 3D view has rendered,
 *    when it fails, or at the latest after BOOT_TIMEOUT_MS.
 */
import { applyThemeCss, THEME } from './theme.js';
import * as PLAN from './data/plan.js';
import { UNITS_SOURCE } from './data/unitsSource.js';
import { app } from './app.js';
import { renderListing } from './ui/listing.js';
import { trackHeaderHeight } from './ui/layout.js';
import { initFloorPicker, STATUS_LABEL } from './ui/floorPicker.js';
import { initTimeline } from './ui/timeline.js';

applyThemeCss();
if (app.debug) {
  window.__theme = THEME.id;
  window.__themeName = THEME.name;
}

const BOOT_TIMEOUT_MS = 15000;
const bootEl = document.getElementById('boot');
const hideBoot = () => bootEl?.classList.add('is-done');
const bootTimer = setTimeout(hideBoot, BOOT_TIMEOUT_MS); // never an endless spinner
window.addEventListener('viewer-ready', () => { clearTimeout(bootTimer); hideBoot(); }, { once: true });

// ── Listing (works without 3D) ────────────────────────────────────────
trackHeaderHeight(document.getElementById('listing'));
trackHeaderHeight(document.querySelector('.disclaimer'), '--disclaimer-h');
app.schedule = renderListing({
  unit: PLAN.UNIT,
  rooms: PLAN.ROOMS,
  order: PLAN.CHIP_ORDER,
  onSelect: (id) => app.viewer?.selectRoom(id),
  onHover: (id) => app.viewer?.setHover(id),
  onSeeUnit: () => {
    showSection('floors', { updateUrl: true });
    app.picker?.showUnit(PLAN.UNIT.id, { focus: true });
  },
});

// ── Sections: Apartment / Floors / Timeline ───────────────────────────
const SECTIONS = ['apartment', 'floors', 'timeline'];
const sectionEls = Object.fromEntries(SECTIONS.map((id) => [id, document.getElementById(`section-${id}`)]));
const sectionFromHash = () => {
  const h = location.hash.replace('#', '');
  return SECTIONS.includes(h) ? h : 'apartment';
};

/**
 * Shows one section. State lives in body[data-current-section] (NOT
 * data-section, which the nav buttons use), so a click anywhere can never be
 * mistaken for a nav click. No-op when the section is already shown.
 */
function showSection(id, { force = false, updateUrl = false } = {}) {
  if (!SECTIONS.includes(id)) return;
  if (id === app.section && !force) return;
  app.section = id;
  for (const [k, el] of Object.entries(sectionEls)) el.hidden = k !== id;
  for (const b of document.querySelectorAll('button[data-section]')) {
    b.setAttribute('aria-pressed', String(b.dataset.section === id));
  }
  document.body.dataset.currentSection = id;
  if (updateUrl) {
    const url = id === 'apartment' ? location.pathname + location.search : `#${id}`;
    history.pushState(null, '', url);
  }
  app.viewer?.onSection(id);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-section]');
  if (b) showSection(b.dataset.section, { updateUrl: true });
});
window.addEventListener('popstate', () => showSection(sectionFromHash()));
showSection(sectionFromHash(), { force: true });

// ── Floors + Timeline ─────────────────────────────────────────────────
initTimeline({ now: new Date() });
const pickerReady = initFloorPicker({
  csvUrl: 'data/units.csv',
  heroUnit: PLAN.UNIT.id,
  initialFloor: PLAN.UNIT.floor ?? 2,
  initialUnit: PLAN.UNIT.id,
  source: UNITS_SOURCE,
  debug: app.debug,
  onView3d: () => {
    showSection('apartment', { updateUrl: true });
    app.viewer?.resetView({ animate: false });
    (app.viewer ? document.getElementById('reset-view') : document.querySelector('.viewport-fallback'))?.focus?.({ preventScroll: true });
  },
});
pickerReady.then((picker) => {
  app.picker = picker;
  // Listing eyebrow shows the hero unit's live status from the CSV.
  const u = picker?.find(PLAN.UNIT.id);
  const eyebrow = document.querySelector('#listing [data-eyebrow]');
  if (u && eyebrow) eyebrow.textContent = `Unit #${u.unit} · Floor ${u.floor} · ${STATUS_LABEL[u.status] || 'Status unknown'}`;
  if (u) app.schedule.setUnit(u); // price, €/m² and balcony from the CSV row

});

// Escape in Floors closes the unit details (the 3D view handles its own Escape).
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.section === 'floors') app.picker?.closeDetail();
});

if (app.debug) window.__showSection = (id) => showSection(id);

// ── 3D viewer ─────────────────────────────────────────────────────────
/** Three.js r18x renders with WebGL 2 only. */
function hasWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context
    return true;
  } catch {
    return false;
  }
}

function showFallback(error) {
  if (error) console.warn('3D view could not start:', error);
  app.viewer = null;
  document.body.classList.add('no-webgl');
  document.body.classList.remove('has-selection');
  for (const b of document.querySelectorAll('#listing .schedule button')) b.disabled = true;
  const viewport = document.getElementById('viewport');
  viewport.replaceChildren();
  const box = document.createElement('div');
  box.className = 'viewport-fallback';
  box.setAttribute('role', 'status');
  box.tabIndex = -1;
  box.innerHTML = `
    <p class="viewport-fallback__title">3D view unavailable in this browser</p>
    <p class="viewport-fallback__text">The interactive apartment needs WebGL 2 (hardware acceleration). Floors and Timeline work as usual.</p>
    <button type="button" class="btn-primary" data-go-floors>Open Floors</button>`;
  box.querySelector('[data-go-floors]').addEventListener('click', () => showSection('floors', { updateUrl: true }));
  viewport.append(box);
  clearTimeout(bootTimer);
  hideBoot();
  window.__bootDone = true;
}

if (hasWebGL2()) {
  import('./main.js')
    .then((m) => m.startViewer())
    .then(() => (window.__bootDone = true))
    .catch(showFallback);
} else {
  showFallback();
}
