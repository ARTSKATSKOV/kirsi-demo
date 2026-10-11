/**
 * theme.js — colour palettes for the whole demo (UI + 3D).
 * Pick with the URL param ?theme=<id>; default 'warm-terracotta'. No visible switcher yet.
 *
 * `ui` values become CSS custom properties (see applyThemeCss); `model`
 * values are read by the 3D modules (materials, furniture, plan finishes,
 * lights, contact shadow). Status colours (free / reserved / sold) and the
 * hero-unit colour are tuned per theme so they stay clearly distinct.
 * `ink` = dark "navigation active" colour for pressed pills (room chips, floor
 * buttons), so the accent stays reserved for the unit / selected room / CTA.
 */
const THEMES = {
  sage: {
    name: 'Sage',
    ui: {
      bg: '#eeebe6', bgSoft: '#f5f2ed', surface: '#ffffff', panelAlpha: 0.88,
      text: '#1f2422', muted: '#6a736e', soft: '#3a413d',
      accent: '#3f7a66', accentStrong: '#2f5f4f', onAccent: '#ffffff', ink: '#2a332f', onInk: '#ffffff',
      gradA: '#f7f4ef', gradB: '#eeebe6', gradC: '#e4dfd7',
      disclaimerBg: '#2a2f2c', disclaimerText: '#f4f1eb', shadowC: '#28241e',
      free: '#3f7a66', reserved: '#b8863a', reservedText: '#8d6320', sold: '#8d938f',
      hero: '#3a6f96', onHero: '#ffffff', today: '#c45c2e', handover: '#d4a24a',
    },
    model: {
      wallSide: '#f6f4f0', wallTop: '#bdb3a5', sill: '#ebe7e1', frame: '#a79f94', edge: '#a89f92',
      glass: '#dfe9ec', door: '#ece7df', slab: '#dcd6cd', highlight: '#8fb8a2', outline: '#4f8f78',
      floorWood: '#e6dccd', floorTile: '#eeece8', grout: '#e0dcd6', deck: '#ddd6cb',
      rug: '#efebe5', rugBed: '#ece7e0', doormat: '#d3ccc2', accentFabric: '#c3d0c6',
      fabric: '#dcd7cf', fabricDark: '#c9c2b8', cushion: '#ece8e2',
      woodDark: '#b9a58d', woodMid: '#cdb99f', woodLight: '#dccbb4',
      white: '#f7f6f3', cabinet: '#f1eee9', worktop: '#d3cdc4', steel: '#dedcd8', black: '#8d877f',
      linen: '#faf8f5', throw: '#a9bcae', leaf: '#a9bfa7', leafDark: '#93ab91', pot: '#e6e2dc', rail: '#a89f92',
      hemiSky: '#fbf8f3', hemiGround: '#cbc2b4', hemi: 2.3, sunColor: '#fff4e6', sun: 1.7,
      shadowRgb: '60,50,40', catcher: '#4a3f33', catcherOpacity: 0.14,
    },
  },

  'nordic-stone': {
    name: 'Nordic Stone',
    ui: {
      bg: '#e8eaed', bgSoft: '#f2f3f5', surface: '#ffffff', panelAlpha: 0.9,
      text: '#1b2230', muted: '#626c7c', soft: '#354052',
      accent: '#25395e', accentStrong: '#16264a', onAccent: '#ffffff', ink: '#1b2230', onInk: '#ffffff',
      gradA: '#f5f6f8', gradB: '#e8eaee', gradC: '#d9dde3',
      disclaimerBg: '#1b2230', disclaimerText: '#eef0f3', shadowC: '#1a2030',
      free: '#3d7a5c', reserved: '#bf872a', reservedText: '#8a5f14', sold: '#8f96a0',
      hero: '#3566a8', onHero: '#ffffff', today: '#cc5536', handover: '#c49a3f',
    },
    model: {
      wallSide: '#f4f5f6', wallTop: '#a3aab3', sill: '#e6e8eb', frame: '#7d8793', edge: '#949daa',
      glass: '#dde7ef', door: '#e9ecef', slab: '#cdd2d8', highlight: '#93a9d0', outline: '#2f4a7a',
      floorWood: '#dcd8d1', floorTile: '#eceef0', grout: '#d9dde1', deck: '#cdd1d6',
      rug: '#e7e9ec', rugBed: '#e2e5e9', doormat: '#b9c0c8', accentFabric: '#b3bfd3',
      fabric: '#d7dade', fabricDark: '#bfc5cc', cushion: '#e9ebee',
      woodDark: '#a9a397', woodMid: '#c3bdb1', woodLight: '#d6d1c7',
      white: '#f6f7f8', cabinet: '#eef0f2', worktop: '#b9bfc6', steel: '#d9dce0', black: '#6f7782',
      linen: '#f8f9fa', throw: '#9aacc8', leaf: '#a3b5a5', leafDark: '#8da391', pot: '#e3e6ea', rail: '#7d8793',
      hemiSky: '#f3f6fa', hemiGround: '#b9c0c8', hemi: 2.3, sunColor: '#f4f6ff', sun: 1.6,
      shadowRgb: '30,38,52', catcher: '#1f2838', catcherOpacity: 0.14,
    },
  },

  'baltic-sea': {
    name: 'Baltic Sea',
    ui: {
      bg: '#edf1f2', bgSoft: '#f6f8f9', surface: '#ffffff', panelAlpha: 0.9,
      text: '#16282e', muted: '#5b7076', soft: '#2f454b',
      accent: '#1d7278', accentStrong: '#12555a', onAccent: '#ffffff', ink: '#16282e', onInk: '#ffffff',
      gradA: '#f8fbfb', gradB: '#ecf1f2', gradC: '#dce6e8',
      disclaimerBg: '#16282e', disclaimerText: '#eef4f5', shadowC: '#16282e',
      free: '#4f8a3a', reserved: '#c7872a', reservedText: '#8a5c13', sold: '#939fa3',
      hero: '#1d7278', onHero: '#ffffff', today: '#cf533a', handover: '#cfa24a',
    },
    model: {
      wallSide: '#f7f9fa', wallTop: '#9cb0b6', sill: '#e8eef0', frame: '#6f8a91', edge: '#8fa5ab',
      glass: '#d6eaee', door: '#eaf0f1', slab: '#d0dbde', highlight: '#84c0c2', outline: '#1d7278',
      floorWood: '#e4e0d8', floorTile: '#edf2f3', grout: '#d7e0e2', deck: '#d2dadc',
      rug: '#e6edee', rugBed: '#e3eaec', doormat: '#b3c4c8', accentFabric: '#a6cacd',
      fabric: '#d9e1e3', fabricDark: '#bfcdd0', cushion: '#ebf0f1',
      woodDark: '#b3a894', woodMid: '#cbc1ae', woodLight: '#ddd5c6',
      white: '#f8fafb', cabinet: '#eef3f4', worktop: '#bdcbce', steel: '#dbe2e4', black: '#6d8288',
      linen: '#f9fbfb', throw: '#8cbec1', leaf: '#9fbfae', leafDark: '#88ab99', pot: '#e2e9eb', rail: '#6f8a91',
      hemiSky: '#f2f9fb', hemiGround: '#b8c8cb', hemi: 2.3, sunColor: '#fbfdff', sun: 1.6,
      shadowRgb: '22,40,46', catcher: '#16282e', catcherOpacity: 0.14,
    },
  },

  'warm-terracotta': {
    name: 'Warm Terracotta',
    ui: {
      bg: '#f1e9df', bgSoft: '#f8f2ea', surface: '#fffcf8', panelAlpha: 0.9,
      text: '#2b211b', muted: '#76665a', soft: '#4a3b31',
      accent: '#b0513a', accentStrong: '#8c3c27', onAccent: '#ffffff', ink: '#3b2f28', onInk: '#ffffff',
      gradA: '#fbf5ed', gradB: '#f1e9df', gradC: '#e5d7c6',
      disclaimerBg: '#2b211b', disclaimerText: '#f6eee4', shadowC: '#3a2a1e',
      free: '#4d7f55', reserved: '#c4952a', reservedText: '#80600f', sold: '#978c83',
      hero: '#b0513a', onHero: '#ffffff', today: '#2b6f8f', handover: '#c4952a',
    },
    model: {
      wallSide: '#fbf6ef', wallTop: '#cdb398', sill: '#f0e6d9', frame: '#a88c73', edge: '#b59b82',
      glass: '#e6ece9', door: '#f2e8dc', slab: '#e0cfbb', highlight: '#e3a68d', outline: '#b0513a',
      floorWood: '#e2cba9', floorTile: '#f1e9df', grout: '#e2d5c5', deck: '#dac8b0',
      rug: '#efe4d6', rugBed: '#eadcc9', doormat: '#c9ae94', accentFabric: '#d9a792',
      fabric: '#e6dccf', fabricDark: '#d3c3b1', cushion: '#f2e9de',
      woodDark: '#b08b66', woodMid: '#c9a680', woodLight: '#dcc2a0',
      white: '#fbf8f3', cabinet: '#f5eee5', worktop: '#d8c8b5', steel: '#e2dbd2', black: '#8a7564',
      linen: '#fcf8f2', throw: '#cf8f76', leaf: '#a8b58f', leafDark: '#929f79', pot: '#d6a88d', rail: '#a88c73',
      hemiSky: '#fff7ec', hemiGround: '#d2bea5', hemi: 2.2, sunColor: '#fff0dc', sun: 1.8,
      shadowRgb: '70,45,25', catcher: '#4a3222', catcherOpacity: 0.14,
    },
  },

  'graphite-brass': {
    name: 'Graphite & Brass',
    dark: true,
    ui: {
      bg: '#1c1e21', bgSoft: '#202226', surface: '#2a2d31', panelAlpha: 0.92,
      text: '#ece7de', muted: '#a39c90', soft: '#cfc8bc',
      accent: '#c9a15a', accentStrong: '#dfba74', onAccent: '#1c1e21', ink: '#ece7de', onInk: '#1c1e21',
      gradA: '#34373c', gradB: '#232529', gradC: '#161719',
      disclaimerBg: '#0e0f11', disclaimerText: '#e8e2d6', shadowC: '#000000',
      free: '#6fae88', reserved: '#e0a640', reservedText: '#ebb95c', sold: '#80868d',
      hero: '#86abdc', onHero: '#14171a', today: '#e57c57', handover: '#c9a15a',
    },
    model: {
      wallSide: '#f2efe9', wallTop: '#3d4046', sill: '#e6e1d8', frame: '#6b6660', edge: '#8a847a',
      glass: '#cfd8dc', door: '#e8e3da', slab: '#3d4046', highlight: '#e6c88c', outline: '#e8bd62',
      floorWood: '#ddd3c4', floorTile: '#e8e4dd', grout: '#d6d0c6', deck: '#c9c2b7',
      rug: '#e5ddd1', rugBed: '#e0d6c8', doormat: '#7c766c', accentFabric: '#c9b594',
      fabric: '#d9d2c6', fabricDark: '#bdb3a4', cushion: '#ebe5dc',
      woodDark: '#8c7356', woodMid: '#b0946f', woodLight: '#cbb391',
      white: '#f3f0ea', cabinet: '#ece7df', worktop: '#6a6d72', steel: '#cfc9bf', black: '#5a5d63',
      linen: '#f6f3ee', throw: '#bfa06c', leaf: '#9fae90', leafDark: '#879879', pot: '#3e4146', rail: '#8f887d',
      hemiSky: '#fff2df', hemiGround: '#5a5248', hemi: 2.0, sunColor: '#ffe7c4', sun: 2.0,
      shadowRgb: '0,0,0', catcher: '#000000', catcherOpacity: 0.35,
    },
  },
};

function pickTheme() {
  let id = 'warm-terracotta';
  try {
    const q = new URLSearchParams(location.search).get('theme');
    if (q && THEMES[q]) id = q;
  } catch { /* non-browser */ }
  return { id, ...THEMES[id] };
}

export const THEME_IDS = Object.keys(THEMES);
export { THEMES };
export const THEME = pickTheme();
export const M = THEME.model;

/** Writes the UI palette to CSS custom properties on <html>. */
export function applyThemeCss(theme = THEME) {
  const r = document.documentElement;
  const u = theme.ui;
  const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  for (const [k, v] of Object.entries(u)) if (typeof v === 'string') r.style.setProperty(`--${kebab(k)}`, v);
  r.style.setProperty('--panel', `color-mix(in srgb, ${u.surface} ${Math.round(u.panelAlpha * 100)}%, transparent)`);
  r.dataset.theme = theme.id;
  r.dataset.themeTone = theme.dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', u.bg);
}
