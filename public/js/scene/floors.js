/**
 * floors.js — builds one group per floor (rooms + walls, and a slab under
 * upper floors) and controls which floor is "active".
 *
 * Active = ground: the first floor is hidden entirely ("hide upper floor").
 * Active = first:  the first floor is shown on its slab; the ground floor is
 *                  reduced to its exterior walls (a solid base) plus the
 *                  garden, which stays visible and clickable.
 */
import * as THREE from 'three';
import { buildRooms } from './rooms.js';
import { buildWalls } from './walls.js';
import { COLORS, mat } from './materials.js';

/**
 * @param {object} plan  { floors, rooms, walls, footprint, wallSettings, openingDefaults }
 * @returns {{ floors: Map<string, FloorEntry>, rooms: Map<string, RoomEntry>, wallGroups: THREE.Group[] }}
 */
export function buildFloors(plan) {
  const floors = new Map();
  const rooms = new Map();
  const wallGroups = [];
  const floorOf = (item) => item.floor || 'ground';

  for (const f of plan.floors) {
    const group = new THREE.Group();
    group.name = `floor:${f.id}`;
    group.position.y = f.elevation;
    group.userData.floorId = f.id;

    const sub = {
      ...plan,
      rooms: plan.rooms.filter((r) => floorOf(r) === f.id),
      walls: plan.walls.filter((w) => floorOf(w) === f.id),
    };
    const built = buildRooms(sub, { voids: f.voids || [] });
    const walls = buildWalls(sub);
    for (const [id, entry] of built.rooms) {
      entry.floorId = f.id;
      entry.group.traverse((o) => o.isMesh && (o.userData.floorId = f.id));
      rooms.set(id, entry);
    }
    walls.traverse((o) => o.isMesh && (o.userData.floorId = f.id));
    wallGroups.push(...walls.children);
    group.add(built.group, walls);

    let slab = null;
    if (f.elevation > 0) {
      slab = buildSlab(plan, f);
      group.add(slab);
    }
    floors.set(f.id, { data: f, group, roomsGroup: built.group, wallsGroup: walls, slab });
  }
  return { floors, rooms, wallGroups };
}

/**
 * Slab under an upper floor, spanning the footprint to the outer wall faces,
 * with holes for the voids. Built from boxes around each hole.
 */
function buildSlab(plan, floor) {
  const t = floor.slab ?? 0.2;
  const ext = plan.wallSettings.exterior / 2;
  const fp = plan.footprint;
  const outer = { x: fp.x - ext, z: fp.z - ext, w: fp.w + 2 * ext, d: fp.d + 2 * ext };
  let pieces = [outer];
  for (const v of floor.voids || []) pieces = pieces.flatMap((p) => cut(p, v));

  const g = new THREE.Group();
  g.name = 'slab';
  const side = mat(COLORS.wallTop, { roughness: 0.8 });
  for (const p of pieces) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, t, p.d), side);
    // Top sits just under the room floors (which are at local y = 0.01).
    m.position.set(p.x + p.w / 2, -t / 2, p.z + p.d / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function cut(r, h) {
  const x0 = Math.max(r.x, h.x), x1 = Math.min(r.x + r.w, h.x + h.w);
  const z0 = Math.max(r.z, h.z), z1 = Math.min(r.z + r.d, h.z + h.d);
  if (x1 <= x0 || z1 <= z0) return [r];
  return [
    { x: r.x, z: r.z, w: r.w, d: z0 - r.z },
    { x: r.x, z: z1, w: r.w, d: r.z + r.d - z1 },
    { x: r.x, z: z0, w: x0 - r.x, d: z1 - z0 },
    { x: x1, z: z0, w: r.x + r.w - x1, d: z1 - z0 },
  ].filter((p) => p.w > 1e-3 && p.d > 1e-3);
}

/**
 * Shows the requested floor. Lower floors become a solid base (exterior
 * walls only); outdoor rooms (garden) always stay visible.
 */
export function setActiveFloor(floors, activeId) {
  const order = [...floors.keys()];
  const activeIdx = order.indexOf(activeId);
  // Voids (stairwells) of the visible upper floors: lower-floor rooms seen
  // through them stay visible, so the stairs don't end in a black hole.
  const voids = order.slice(1, activeIdx + 1).flatMap((id) => floors.get(id).data.voids || []);
  const overlapsVoid = (r) => voids.some((v) => r.x < v.x + v.w && r.x + r.w > v.x && r.z < v.z + v.d && r.z + r.d > v.z);
  order.forEach((id, idx) => {
    const f = floors.get(id);
    const above = idx > activeIdx;
    const below = idx < activeIdx;
    f.group.visible = !above;
    for (const roomGroup of f.roomsGroup.children) {
      const { outdoor, rect } = roomGroup.userData;
      roomGroup.visible = !below || outdoor || (rect && overlapsVoid(rect));
    }
    for (const wall of f.wallsGroup.children) {
      wall.visible = !below || wall.userData.type === 'exterior';
    }
  });
}
