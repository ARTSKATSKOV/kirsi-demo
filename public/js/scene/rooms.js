/**
 * rooms.js — builds one THREE.Group per room (floor + furniture), tagged
 * with `userData.roomId` on every mesh so raycasting can map a hit straight
 * back to a room. Also owns the room highlight (emissive floor + outline).
 */
import * as THREE from 'three';
import { COLORS, createFloorMaterial, mat, glassMaterial } from './materials.js';
import { M } from '../theme.js';
import { buildFurniture } from './furniture.js';
import { DIM, SELECT_LINE, HOVER_GLOW, highlightTarget, stepToward } from './highlight.js';

const FLOOR_Y = 0.01;
const OUTLINE_Y = 0.035; // above rugs, below furniture
const OUTLINE_INSET = 0.16; // keep the outline visible inside the walls
const OUTLINE_WIDTH = 0.045;

/**
 * @returns {{ group: THREE.Group, rooms: Map<string, RoomEntry> }}
 * RoomEntry = { data, group, floors: THREE.Mesh[], outline: THREE.Mesh }
 */
export function buildRooms(plan, { voids = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'rooms';
  const rooms = new Map();

  for (const data of plan.rooms) {
    const entry = buildRoom(data, voids);
    rooms.set(data.id, entry);
    group.add(entry.group);
  }
  return { group, rooms };
}

/**
 * Splits rect `r` into up to 4 rectangles that exclude the hole `h`
 * (all in the same local coordinates). Used to cut the stairwell out of
 * the landing floor.
 */
function subtractRect(r, h) {
  const x0 = Math.max(r.x, h.x), x1 = Math.min(r.x + r.w, h.x + h.w);
  const z0 = Math.max(r.z, h.z), z1 = Math.min(r.z + r.d, h.z + h.d);
  if (x1 <= x0 || z1 <= z0) return [r]; // no overlap
  const out = [
    { x: r.x, z: r.z, w: r.w, d: z0 - r.z }, // north strip
    { x: r.x, z: z1, w: r.w, d: r.z + r.d - z1 }, // south strip
    { x: r.x, z: z0, w: x0 - r.x, d: z1 - z0 }, // west piece
    { x: x1, z: z0, w: r.x + r.w - x1, d: z1 - z0 }, // east piece
  ];
  return out.filter((p) => p.w > 1e-3 && p.d > 1e-3);
}

function buildRoom(data, voids) {
  const { x, z, w, d } = data.rect;
  const g = new THREE.Group();
  g.name = `room:${data.id}`;
  g.userData.roomId = data.id;
  g.userData.outdoor = !!data.outdoor;
  g.userData.rect = data.rect;
  // Room-local origin at the rectangle's north-west corner.
  g.position.set(x, 0, z);

  const floors = [];
  // Floor rect(s) in room-local coordinates, minus any slab voids.
  let pieces = [{ x: 0, z: 0, w, d }];
  for (const v of voids) {
    const local = { x: v.x - x, z: v.z - z, w: v.w, d: v.d };
    pieces = pieces.flatMap((p) => subtractRect(p, local));
  }
  for (const p of pieces) floors.push(addFloor(g, data.finish, p, FLOOR_Y, 0, { w, d }));
  // Optional zones (e.g. a patio) drawn on top with a polygon offset.
  for (const zone of data.zones || []) floors.push(addFloor(g, zone.finish, zone.rect, FLOOR_Y + 0.004, -1));

  for (const item of data.furniture || []) {
    const piece = buildFurniture(item);
    if (!piece) continue;
    piece.position.x = item.x;
    piece.position.z = item.z;
    g.add(piece);
  }

  if (data.fence) g.add(buildFence(w, d, data.fence));
  if (data.balustrade) g.add(buildBalustrade(w, d, data.balustrade));

  const outline = buildOutline(w, d);
  outline.visible = false;
  g.add(outline);

  // Tag every mesh for picking.
  g.traverse((o) => {
    if (o.isMesh) o.userData.roomId = data.id;
  });

  return { data, group: g, floors, outline };
}

function addFloor(parent, spec, rect, y, polygonOffset, textureSize = rect) {
  // Pieces of one room share the texture scale of the whole room.
  const material = createFloorMaterial(spec, textureSize.w, textureSize.d);
  if (textureSize !== rect) {
    material.map.repeat.multiply(new THREE.Vector2(rect.w / textureSize.w, rect.d / textureSize.d));
    material.map.offset.set(rect.x / (spec.tile || 1.5), -rect.z / (spec.tile || 1.5));
  }
  if (polygonOffset) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = polygonOffset;
    material.polygonOffsetUnits = polygonOffset;
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rect.w, rect.d), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(rect.x + rect.w / 2, y, rect.z + rect.d / 2);
  mesh.receiveShadow = true;
  mesh.name = 'floor';
  parent.add(mesh);
  return mesh;
}

/**
 * Rectangular highlight frame made of four thin flat bars lying on the floor
 * (inset so it stays visible inside the walls). Built from boxes so it also
 * reads well from grazing camera angles.
 */
function buildOutline(w, d) {
  const material = new THREE.MeshBasicMaterial({ color: COLORS.outline, toneMapped: false, transparent: true, opacity: 0.85 });
  const g = new THREE.Group();
  g.name = 'outline';
  const iw = w - 2 * OUTLINE_INSET;
  const id = d - 2 * OUTLINE_INSET;
  const h = 0.012;
  const bars = [
    [iw, OUTLINE_WIDTH, w / 2, OUTLINE_INSET + OUTLINE_WIDTH / 2], // north
    [iw, OUTLINE_WIDTH, w / 2, d - OUTLINE_INSET - OUTLINE_WIDTH / 2], // south
    [OUTLINE_WIDTH, id - 2 * OUTLINE_WIDTH, OUTLINE_INSET + OUTLINE_WIDTH / 2, d / 2], // west
    [OUTLINE_WIDTH, id - 2 * OUTLINE_WIDTH, w - OUTLINE_INSET - OUTLINE_WIDTH / 2, d / 2], // east
  ];
  for (const [bw, bd, x, z] of bars) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bd), material);
    bar.position.set(x, OUTLINE_Y, z);
    g.add(bar);
  }
  return g;
}

/**
 * Simple post-and-rail timber fence along the chosen sides of a rectangle.
 * Sides: 'north' (z = 0), 'south' (z = d), 'west' (x = 0), 'east' (x = w).
 */
function buildFence(w, d, { sides = [], height = 1.2 }) {
  const g = new THREE.Group();
  g.name = 'fence';
  const wood = mat(M.woodDark, { roughness: 0.9 });
  const inset = 0.06;
  const segments = {
    north: [[inset, inset], [w - inset, inset]],
    south: [[inset, d - inset], [w - inset, d - inset]],
    west: [[inset, inset], [inset, d - 0.2]],
    east: [[w - inset, inset], [w - inset, d - 0.2]],
  };
  for (const side of sides) {
    const [[x1, z1], [x2, z2]] = segments[side];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const alongX = Math.abs(z1 - z2) < 1e-6;
    // posts
    const count = Math.max(2, Math.round(len / 1.8) + 1);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, height + 0.05, 0.09), wood);
      post.position.set(x1 + (x2 - x1) * t, (height + 0.05) / 2, z1 + (z2 - z1) * t);
      g.add(post);
    }
    // horizontal boards
    for (let r = 0; r < 4; r++) {
      const y = 0.2 + (r * (height - 0.3)) / 3;
      const geo = alongX ? new THREE.BoxGeometry(len, 0.12, 0.025) : new THREE.BoxGeometry(0.025, 0.12, len);
      const board = new THREE.Mesh(geo, wood);
      board.position.set((x1 + x2) / 2 + (alongX ? 0 : 0.055), y, (z1 + z2) / 2 + (alongX ? 0.055 : 0));
      g.add(board);
    }
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

/**
 * Glass balcony balustrade with a slim metal top rail along the chosen sides
 * ('north' | 'south' | 'west' | 'east') of a rectangle.
 */
function buildBalustrade(w, d, { sides = [], height = 1.1 }) {
  const g = new THREE.Group();
  g.name = 'balustrade';
  const rail = mat(M.rail, { roughness: 0.55 });
  const i = 0.05;
  const segs = {
    north: [[i, i], [w - i, i]],
    south: [[i, d - i], [w - i, d - i]],
    west: [[i, 0], [i, d - i]],
    east: [[w - i, 0], [w - i, d - i]],
  };
  for (const side of sides) {
    const [[x1, z1], [x2, z2]] = segs[side];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const alongX = Math.abs(z1 - z2) < 1e-6;
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const pane = new THREE.Mesh(alongX ? new THREE.BoxGeometry(len, height - 0.1, 0.02) : new THREE.BoxGeometry(0.02, height - 0.1, len), glassMaterial);
    pane.position.set(cx, (height - 0.1) / 2 + 0.03, cz);
    const top = new THREE.Mesh(alongX ? new THREE.BoxGeometry(len + 0.04, 0.05, 0.06) : new THREE.BoxGeometry(0.06, 0.05, len + 0.04), rail);
    top.position.set(cx, height, cz);
    top.castShadow = true;
    g.add(pane, top);
  }
  return g;
}

let currentSelected = null;
let currentHover = null;
let instant = false;

function outlineMaterial(entry) {
  return entry.outline.children[0]?.material;
}

function apply(entry) {
  const h = entry.hl;
  for (const floor of entry.floors) {
    floor.material.color.setScalar(h.bright);
    floor.material.emissiveIntensity = h.glow;
  }
  const m = outlineMaterial(entry);
  if (m) m.opacity = h.line;
  entry.outline.visible = h.line > 0.002;
}

function paint(rooms) {
  for (const [id, entry] of rooms) {
    entry.hlTarget = highlightTarget(id, currentSelected, currentHover);
    if (!entry.hl) entry.hl = { bright: 1, glow: 0, line: 0 };
    if (instant) {
      entry.hl = { ...entry.hlTarget };
      apply(entry);
    }
  }
}

/** With prefers-reduced-motion the highlight changes without fading. */
export function setHighlightInstant(v) {
  instant = !!v;
}

/**
 * Advances the highlight fades by dt seconds. Returns true while anything
 * changed (the caller renders a frame then), false when settled — so the
 * on-demand renderer stays idle once a fade has finished.
 */
export function updateRoomHighlight(rooms, dt) {
  let changed = false;
  for (const entry of rooms.values()) {
    const t = entry.hlTarget;
    if (!t || !entry.hl) continue;
    const h = entry.hl;
    if (h.bright === t.bright && h.glow === t.glow && h.line === t.line) continue;
    h.bright = stepToward(h.bright, t.bright, dt, 1 - DIM);
    h.glow = stepToward(h.glow, t.glow, dt, HOVER_GLOW);
    h.line = stepToward(h.line, t.line, dt, SELECT_LINE);
    apply(entry);
    changed = true;
  }
  return changed;
}

/**
 * Selection look: warm tint + a hairline outline on the selected room,
 * others dimmed very slightly. Pass null to restore the neutral look.
 */
export function applySelection(rooms, selectedId) {
  currentSelected = selectedId;
  paint(rooms);
}

/** Hover look (mouse only): warmer fill + a faint outline. */
export function applyHover(rooms, hoverId) {
  if (hoverId === currentHover) return false;
  currentHover = hoverId;
  paint(rooms);
  return true;
}
