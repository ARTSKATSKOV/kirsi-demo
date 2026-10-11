/**
 * layout.js — measures how much of the viewport the UI panels cover, so the
 * camera can frame the house (or a room) in the free area between them.
 *
 * Every panel with class `.panel-inset` declares in CSS which screen edge it
 * occupies via `--inset-side: left | right | top | bottom | none` (this can
 * change per breakpoint). Hidden panels (display:none, or the closed room
 * card) are ignored. Measurements use offset* so slide-in transforms don't
 * affect the result.
 */
const GAP = 16; // px breathing room between a panel and the framed model

/**
 * Keeps the CSS variable --header-h equal to the listing header height, so
 * the compact layout can stack the chips right under it.
 */
export function trackHeaderHeight(listingEl, varName = '--header-h') {
  const apply = () => document.documentElement.style.setProperty(varName, `${listingEl.offsetHeight}px`);
  new ResizeObserver(apply).observe(listingEl);
  apply();
}

export function measureInsets(viewW, viewH) {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const el of document.querySelectorAll('.panel-inset')) {
    const side = getComputedStyle(el).getPropertyValue('--inset-side').trim();
    if (!side || side === 'none' || getComputedStyle(el).display === 'none') continue;
    if (el.classList.contains('room-card') && !el.classList.contains('is-open')) continue;
    const r = offsetRect(el);
    if (r.width === 0 || r.height === 0) continue;
    if (side === 'left') insets.left = Math.max(insets.left, r.right + GAP);
    if (side === 'right') insets.right = Math.max(insets.right, viewW - r.left + GAP);
    if (side === 'top') insets.top = Math.max(insets.top, r.bottom + GAP);
    if (side === 'bottom') insets.bottom = Math.max(insets.bottom, viewH - r.top + GAP);
  }
  return insets;
}

/** Element box relative to the viewport, ignoring CSS transforms. */
function offsetRect(el) {
  let left = 0;
  let top = 0;
  // Stop below the fixed section wrapper, so rects are relative to the 3D
  // viewport (which fills that section), not to the window.
  for (let n = el; n && n.offsetParent; n = n.offsetParent) {
    left += n.offsetLeft;
    top += n.offsetTop;
  }
  return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight, width: el.offsetWidth, height: el.offsetHeight };
}

/** Viewport rects of visible panels (used to keep room tags off the UI). */
export function panelRects() {
  const origin = document.getElementById('viewport').getBoundingClientRect();
  return [...document.querySelectorAll('.section-apartment .panel-inset')]
    .filter((el) => getComputedStyle(el).display !== 'none' && !(el.classList.contains('room-card') && !el.classList.contains('is-open')))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width && r.height)
    .map((r) => new DOMRect(r.left - origin.left, r.top - origin.top, r.width, r.height));
}
