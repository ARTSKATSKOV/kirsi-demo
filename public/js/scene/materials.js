/**
 * materials.js — shared colour palette, cached materials and tiny procedural
 * canvas textures (wood, tile, carpet, stone, grass). Everything is generated
 * at runtime, so there are no image files to download.
 */
import * as THREE from 'three';
import { M } from '../theme.js';

export const COLORS = {
  wallSide: M.wallSide,
  wallTop: M.wallTop,
  sill: M.sill,
  frame: M.frame,
  edge: M.edge,
  glass: M.glass,
  door: M.door,
  frontDoor: M.black,
  slab: M.slab,
  highlight: M.highlight,
  outline: M.outline,
};

// ─── Materials ──────────────────────────────────────────────────────────────

const materialCache = new Map();

/**
 * Returns a cached MeshStandardMaterial for a colour + options combination.
 * Use for anything that is never individually tinted (walls, furniture).
 */
export function mat(color, { roughness = 0.8, metalness = 0, emissive, emissiveIntensity = 1 } = {}) {
  const key = `${color}|${roughness}|${metalness}|${emissive}|${emissiveIntensity}`;
  if (!materialCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = emissiveIntensity;
    }
    materialCache.set(key, m);
  }
  return materialCache.get(key);
}

/** Light, transparent glass shared by windows, glazed doors and showers. */
export const glassMaterial = new THREE.MeshStandardMaterial({
  color: COLORS.glass,
  roughness: 0.05,
  metalness: 0.1,
  transparent: true,
  opacity: 0.22,
  depthWrite: false, // avoids sorting artefacts with other transparent panes
  side: THREE.DoubleSide,
});

/**
 * Lamp shades share one emissive material so the day/night controller can
 * make every lamp glow brighter at night with a single uniform change.
 */
export const lampMaterial = new THREE.MeshStandardMaterial({
  color: '#ffe2b0',
  roughness: 0.8,
  emissive: new THREE.Color('#ffd49a'),
  emissiveIntensity: 0.5,
});

// Window glass gets a warm emissive glow at night (intensity driven by dayNight.js).
glassMaterial.emissive = new THREE.Color('#ffc774');
glassMaterial.emissiveIntensity = 0;

// ─── Procedural textures ────────────────────────────────────────────────────

const TEX_SIZE = 256;
const canvasCache = new Map();

/** Small deterministic PRNG so textures look the same on every load. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

const painters = {
  /** Horizontal planks with random joints and faint grain. */
  wood(ctx, s, { color }, r) {
    const rows = 8;
    const h = s / rows;
    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = shade(color, (r() - 0.5) * 0.035);
      ctx.fillRect(0, i * h, s, h);
      // grain
      ctx.globalAlpha = 0.05;
      for (let g = 0; g < 6; g++) {
        ctx.fillStyle = shade(color, -0.15 + r() * 0.1);
        ctx.fillRect(0, i * h + r() * h, s, 1);
      }
      ctx.globalAlpha = 1;
      // plank gap + one butt joint per row
      ctx.fillStyle = shade(color, -0.07);
      ctx.fillRect(0, i * h, s, 1);
      ctx.fillRect(Math.floor(r() * s), i * h, 1, h);
    }
  },
  /** Square tiles separated by grout lines (2×2 tiles per repeat). */
  tile(ctx, s, { color, grout = '#aaa' }, r) {
    const n = 2;
    const t = s / n;
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = shade(color, (r() - 0.5) * 0.05);
        ctx.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
      }
    }
  },
  /** Soft speckled noise. */
  carpet(ctx, s, { color }, r) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = shade(color, (r() - 0.5) * 0.12);
      ctx.fillRect(r() * s, r() * s, 1.5, 1.5);
    }
  },
  /** Large paving slabs in a running bond. */
  stone(ctx, s, { color }, r) {
    ctx.fillStyle = shade(color, -0.18);
    ctx.fillRect(0, 0, s, s);
    const rows = 2;
    const h = s / rows;
    for (let i = 0; i < rows; i++) {
      const off = i % 2 ? s / 4 : 0;
      for (let k = -1; k < 2; k++) {
        ctx.fillStyle = shade(color, (r() - 0.5) * 0.08);
        ctx.fillRect(off + k * (s / 2) + 2, i * h + 2, s / 2 - 4, h - 4);
      }
    }
  },
  /** Short blades of varying greens. */
  grass(ctx, s, { color }, r) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 3500; i++) {
      ctx.fillStyle = shade(color, (r() - 0.45) * 0.14);
      ctx.fillRect(r() * s, r() * s, 1, 2 + r() * 3);
    }
  },
};

function getCanvas(spec) {
  const key = `${spec.type}|${spec.color}|${spec.grout || ''}`;
  if (!canvasCache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TEX_SIZE;
    const ctx = canvas.getContext('2d');
    const paint = painters[spec.type] || painters.carpet;
    paint(ctx, TEX_SIZE, spec, rng(key.length * 7919 + spec.color.charCodeAt(2)));
    canvasCache.set(key, canvas);
  }
  return canvasCache.get(key);
}

/**
 * Creates a floor material for a room. Each room gets its OWN material
 * instance so it can be highlighted (emissive tint) independently.
 * @param {{type:string,color:string,grout?:string,tile?:number}} spec
 * @param {number} w  floor width in meters
 * @param {number} d  floor depth in meters
 */
export function createFloorMaterial(spec, w, d) {
  const texture = new THREE.CanvasTexture(getCanvas(spec));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  const tile = spec.tile || 1.5;
  texture.repeat.set(w / tile, d / tile);

  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: spec.type === 'tile' ? 0.55 : 0.85,
    metalness: 0,
    emissive: new THREE.Color(COLORS.highlight),
    emissiveIntensity: 0, // raised when the room is selected / hovered
  });
}

/** Shared thin line material for the architectural-model edge lines. */
export const edgeMaterial = new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0.55 });

const edgeCache = new Map();
/** Adds crisp edge lines to a box mesh (child, so it follows scaling). */
export function addEdges(mesh) {
  const g = mesh.geometry;
  if (!edgeCache.has(g.uuid)) edgeCache.set(g.uuid, new THREE.EdgesGeometry(g, 40));
  const lines = new THREE.LineSegments(edgeCache.get(g.uuid), edgeMaterial);
  lines.raycast = () => {}; // never pickable
  lines.userData.isEdge = true;
  mesh.add(lines);
  return lines;
}
