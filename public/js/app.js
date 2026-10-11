/**
 * app.js — tiny shared state between boot.js (always runs: listing, Floors,
 * Timeline, navigation) and main.js (the optional 3D viewer).
 */
export const app = {
  /** Current page section: 'apartment' | 'floors' | 'timeline'. */
  section: 'apartment',
  /** Room schedule in the listing panel (set by boot.js). */
  schedule: { setActive() {} },
  /** Set by main.js once the 3D viewer runs; null without WebGL. */
  viewer: null,
  /** Debug hooks (window.__*) only with ?debug in the URL. */
  debug: (() => {
    try {
      return new URLSearchParams(location.search).has('debug');
    } catch {
      return false;
    }
  })(),
};
