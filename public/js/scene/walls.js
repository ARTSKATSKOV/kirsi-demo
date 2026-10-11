/**
 * walls.js — turns the centerline wall data from plan.js into meshes.
 *
 * Each wall is split along its axis into boxes:
 *   - full-height pieces between openings
 *   - a sill (below) and a lintel (above) for every opening
 * Windows / glazed doors get a thin frame and a transparent pane, doors get a
 * thin panel swung open on a hinge.
 *
 * Joints: horizontal (east-west) walls are extended by half the thickness of
 * the wall they meet, vertical (north-south) walls are trimmed by it. This
 * closes every corner without overlapping coplanar faces (no z-fighting).
 */
import * as THREE from 'three';
import { COLORS, mat, glassMaterial, addEdges } from './materials.js';

const EPS = 1e-6;

export function buildWalls(plan) {
  const group = new THREE.Group();
  group.name = 'walls';
  for (const wall of plan.walls) group.add(buildWall(wall, plan));
  return group;
}

/** Is a point on the outer edge of the house footprint? */
function onFootprintEdge([x, z], fp) {
  return (
    Math.abs(x - fp.x) < EPS || Math.abs(x - (fp.x + fp.w)) < EPS ||
    Math.abs(z - fp.z) < EPS || Math.abs(z - (fp.z + fp.d)) < EPS
  );
}

/** Signed length to add at a wall end (positive = extend, negative = trim). */
function endAdjust(wall, horizontal, point, plan) {
  const { exterior, interior } = plan.wallSettings;
  if (wall.type === 'exterior') return horizontal ? exterior / 2 : -exterior / 2;
  if (onFootprintEdge(point, plan.footprint)) return -exterior / 2;
  return horizontal ? interior / 2 : -interior / 2;
}

function buildWall(wall, plan) {
  const { height } = plan.wallSettings;
  const thickness = wall.type === 'exterior' ? plan.wallSettings.exterior : plan.wallSettings.interior;
  const [x1, z1] = wall.from;
  const [x2, z2] = wall.to;
  const horizontal = Math.abs(z1 - z2) < EPS; // runs along x
  const fixed = horizontal ? z1 : x1; // the constant coordinate
  const lo = horizontal ? Math.min(x1, x2) : Math.min(z1, z2);
  const hi = horizontal ? Math.max(x1, x2) : Math.max(z1, z2);
  const pt = (a) => (horizontal ? [a, fixed] : [fixed, a]);
  const start = lo - endAdjust(wall, horizontal, pt(lo), plan);
  const end = hi + endAdjust(wall, horizontal, pt(hi), plan);

  const group = new THREE.Group();
  group.name = wall.id;
  // Metadata used by the cutaway (wall lowering) and by picking.
  group.userData = { wallId: wall.id, floor: wall.floor || 'ground', horizontal, fixed, lo, hi, type: wall.type };

  const sideMat = mat(COLORS.wallSide, { roughness: 0.9 });
  const topMat = mat(COLORS.wallTop, { roughness: 0.7 });
  const sillMat = mat(COLORS.sill, { roughness: 0.6 });

  /** Adds one box spanning [a0,a1] along the wall and [y0,y1] vertically. */
  const addPiece = (a0, a1, y0, y1, isSill = false) => {
    const len = a1 - a0;
    const h = y1 - y0;
    if (len < EPS || h < EPS) return;
    const geo = horizontal
      ? new THREE.BoxGeometry(len, h, thickness)
      : new THREE.BoxGeometry(thickness, h, len);
    // BoxGeometry material order: +x, -x, +y (top), -y, +z, -z
    const top = isSill ? sillMat : topMat;
    const mesh = new THREE.Mesh(geo, [sideMat, sideMat, top, sideMat, sideMat, sideMat]);
    const mid = (a0 + a1) / 2;
    mesh.position.set(horizontal ? mid : fixed, y0 + h / 2, horizontal ? fixed : mid);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { isWall: true, kind: 'piece', y0, y1 };
    addEdges(mesh);
    group.add(mesh);
  };

  const openings = (wall.openings || [])
    .map((o) => ({ ...plan.openingDefaults[o.type], ...o }))
    .sort((a, b) => a.at - b.at);

  let cursor = start;
  for (const o of openings) {
    const a0 = o.at - o.width / 2;
    const a1 = o.at + o.width / 2;
    addPiece(cursor, a0, 0, height); // solid piece before the opening
    if (o.sill > 0) addPiece(a0, a1, 0, o.sill, true); // below a window
    addPiece(a0, a1, o.sill + o.height, height); // lintel above
    cursor = a1;

    const ctx = { horizontal, fixed, thickness, a0, a1, o };
    let extra = null;
    if (o.type === 'window' || o.type === 'glassDoor') extra = buildGlazing(ctx);
    if (o.type === 'door') extra = buildDoorPanel(ctx);
    if (extra) {
      extra.userData.kind = 'insert'; // hidden while the wall is lowered
      extra.traverse((c) => c.isMesh && (c.userData.isWall = true));
      group.add(extra);
    }
  }
  addPiece(cursor, end, 0, height);

  return group;
}

/** Converts (along-wall, y, across-wall) into a world-space position. */
function place(obj, { horizontal, fixed }, along, y, across = 0) {
  if (horizontal) obj.position.set(along, y, fixed + across);
  else obj.position.set(fixed + across, y, along);
}

/** Box sized in wall-local terms (length along wall, height, depth across). */
function wallBox(ctx, len, h, depth, material) {
  const geo = ctx.horizontal
    ? new THREE.BoxGeometry(len, h, depth)
    : new THREE.BoxGeometry(depth, h, len);
  return new THREE.Mesh(geo, material);
}

/** Frame + transparent pane (+ a middle mullion for wide glazing). */
function buildGlazing(ctx) {
  const { a0, a1, o, thickness } = ctx;
  const g = new THREE.Group();
  const frameMat = mat(COLORS.frame, { roughness: 0.6 });
  const f = 0.05; // frame bar size
  const depth = Math.min(thickness * 0.5, 0.1);
  const width = a1 - a0;
  const mid = (a0 + a1) / 2;
  const y0 = o.sill;
  const y1 = o.sill + o.height;

  // Frame bars sit just inside the opening so they never overlap the wall.
  const bars = [
    [mid, y1 - f / 2, width, f], // head
    [mid, y0 + f / 2, width, f], // sill / threshold
    [a0 + f / 2, (y0 + y1) / 2, f, o.height - 2 * f], // left jamb
    [a1 - f / 2, (y0 + y1) / 2, f, o.height - 2 * f], // right jamb
  ];
  if (width > 1.3) bars.push([mid, (y0 + y1) / 2, f * 0.8, o.height - 2 * f]); // mullion
  for (const [along, y, len, h] of bars) {
    const bar = wallBox(ctx, len, h, depth, frameMat);
    place(bar, ctx, along, y);
    bar.castShadow = true;
    g.add(bar);
  }

  const pane = wallBox(ctx, width - 2 * f, o.height - 2 * f, 0.02, glassMaterial);
  place(pane, ctx, mid, (y0 + y1) / 2);
  pane.renderOrder = 1; // draw after opaque geometry
  g.add(pane);
  return g;
}

/** A thin door leaf hinged at one jamb and opened (default 90°). */
function buildDoorPanel(ctx) {
  const { a0, a1, o, horizontal } = ctx;
  const width = a1 - a0 - 0.04;
  const leafT = 0.04;
  const color = o.style === 'front' ? COLORS.frontDoor : COLORS.door;
  const leafMat = mat(color, { roughness: 0.6 });

  // Hinge on the requested jamb; the leaf points to the other jamb when closed.
  const hingeAtStart = (o.hinge || 'start') === 'start';
  const dir = hingeAtStart ? 1 : -1;
  const hingeAlong = (hingeAtStart ? a0 : a1) + dir * 0.02;

  const pivot = new THREE.Group();
  place(pivot, ctx, hingeAlong, 0);

  const leaf = new THREE.Mesh(
    horizontal
      ? new THREE.BoxGeometry(width, o.height - 0.02, leafT)
      : new THREE.BoxGeometry(leafT, o.height - 0.02, width),
    leafMat,
  );
  const half = (dir * width) / 2;
  leaf.position.set(horizontal ? half : 0, (o.height - 0.02) / 2, horizontal ? 0 : half);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  pivot.add(leaf);

  // Pick the rotation sign that puts the open leaf on the `swing` side.
  // Rotating (x,z) by θ about Y gives x' = x cosθ + z sinθ, z' = -x sinθ + z cosθ.
  const angle = THREE.MathUtils.degToRad(o.openAngle ?? 90);
  const across = (theta) => {
    const vx = horizontal ? dir : 0;
    const vz = horizontal ? 0 : dir;
    return horizontal ? -vx * Math.sin(theta) + vz * Math.cos(theta) : vx * Math.cos(theta) + vz * Math.sin(theta);
  };
  const swing = o.swing ?? 1;
  pivot.rotation.y = Math.sign(across(angle)) === Math.sign(swing) ? angle : -angle;
  return pivot;
}
