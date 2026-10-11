/**
 * furniture.js — deliberately simple box / cylinder furniture.
 *
 * Every builder returns a THREE.Group whose origin is the piece's footprint
 * centre on the floor, with its "front" facing +z. The caller positions and
 * rotates the group (see rooms.js). Keep these low-poly: the goal is to make
 * rooms recognisable at a glance, not to model real products.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mat, glassMaterial, lampMaterial, COLORS } from './materials.js';
import { M } from '../theme.js';

const FLOOR_Y = 0.01; // top of the room floor planes

// Palette for furniture (kept local; these never get highlighted).
// Restrained "architectural model" palette: soft whites, warm greys, pale
// oak and a single muted sage accent. No dark or saturated materials.
const C = {
  fabric: M.fabric,
  fabricDark: M.fabricDark,
  cushion: M.cushion,
  woodDark: M.woodDark,
  woodMid: M.woodMid,
  woodLight: M.woodLight,
  white: M.white,
  cabinet: M.cabinet,
  worktop: M.worktop,
  steel: M.steel,
  black: M.black,
  linen: M.linen,
  throw: M.throw,
  leaf: M.leaf,
  leafDark: M.leafDark,
  trunk: M.woodDark,
  pot: M.pot,
  lampGlow: '#ffe2b0',
};

/** Box with its BOTTOM at y (relative to floor) and centre at (x, z). */
const boxCache = new Map();
/** Softly rounded box geometry (cached per size) for the model-like look. */
function softBox(w, h, d) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  if (!boxCache.has(key)) {
    const r = Math.min(0.035, Math.min(w, h, d) * 0.3);
    boxCache.set(key, r < 0.004 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r));
  }
  return boxCache.get(key);
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(softBox(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  return m;
}

/** Vertical cylinder with its BOTTOM at y. */
function cyl(rTop, rBottom, h, material, x = 0, y = 0, z = 0, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material);
  m.position.set(x, y + h / 2, z);
  return m;
}

function group(...children) {
  const g = new THREE.Group();
  children.flat().forEach((c) => g.add(c));
  return g;
}

// ─── Builders ───────────────────────────────────────────────────────────────

const builders = {
  sofa({ w = 2.2, d = 0.9, color = C.fabric }) {
    const body = mat(color);
    const cushion = mat(C.cushion);
    const arm = 0.18;
    const parts = [
      box(w, 0.4, d, body, 0, 0, 0), // base
      box(w, 0.45, 0.2, body, 0, 0.4, -d / 2 + 0.1), // backrest
      box(arm, 0.22, d, body, -w / 2 + arm / 2, 0.4, 0), // arms
      box(arm, 0.22, d, body, w / 2 - arm / 2, 0.4, 0),
    ];
    // two seat cushions
    const cw = (w - 2 * arm) / 2 - 0.02;
    for (const s of [-1, 1]) parts.push(box(cw, 0.1, d - 0.26, cushion, (s * (cw + 0.02)) / 2, 0.4, 0.08));
    return group(parts);
  },

  armchair({ color = C.fabricDark }) {
    return builders.sofa({ w: 0.85, d: 0.8, color });
  },

  coffeeTable({ r = 0.45 }) {
    const wood = mat(C.woodDark, { roughness: 0.5 });
    return group(cyl(r, r, 0.05, wood, 0, 0.35), cyl(0.12, 0.18, 0.35, wood));
  },

  rug({ w = 2, d = 1.5, color = '#8d8272' }) {
    const m = box(w, 0.012, d, mat(color, { roughness: 1 }), 0, 0.002, 0);
    m.userData.noShadow = true; // flat on the floor, only receives shadows
    return group(m);
  },

  floorLamp() {
    return group(
      cyl(0.15, 0.15, 0.03, mat(C.black)),
      cyl(0.015, 0.015, 1.4, mat(C.black)),
      cyl(0.16, 0.2, 0.28, lampMaterial, 0, 1.35),
    );
  },

  bed({ w = 1.6, l = 2.1 }) {
    const frame = mat(C.woodMid, { roughness: 0.6 });
    const linen = mat(C.linen);
    const parts = [
      box(w + 0.08, 0.3, l, frame, 0, 0, 0), // frame
      box(w, 0.22, l - 0.1, linen, 0, 0.3, 0.02), // mattress
      box(w + 0.04, 0.06, l * 0.55, mat(C.throw), 0, 0.5, l * 0.2), // duvet / throw
      box(w + 0.16, 1.0, 0.08, frame, 0, 0, -l / 2 - 0.02), // headboard
    ];
    for (const s of [-1, 1]) parts.push(box(w / 2 - 0.12, 0.12, 0.35, mat(C.white), (s * w) / 4, 0.52, -l / 2 + 0.3));
    return group(parts);
  },

  nightstand() {
    return group(
      box(0.45, 0.5, 0.4, mat(C.woodMid, { roughness: 0.6 })),
      cyl(0.05, 0.07, 0.25, mat(C.black), 0, 0.5),
      cyl(0.1, 0.13, 0.16, lampMaterial, 0, 0.72),
    );
  },

  wardrobe({ w = 1.8, d = 0.6, h = 2.1 }) {
    const parts = [box(w, h, d, mat(C.woodLight, { roughness: 0.6 }))];
    // door split line + handles on the front face
    parts.push(box(0.01, h - 0.1, 0.01, mat(C.woodDark), 0, 0.05, d / 2 + 0.005));
    for (const s of [-1, 1]) parts.push(box(0.02, 0.3, 0.03, mat(C.steel, { metalness: 0, roughness: 0.3 }), s * 0.06, 0.9, d / 2 + 0.015));
    return group(parts);
  },

  counter({ w = 2, d = 0.62, h = 0.9, sink, hob }) {
    const parts = [
      box(w, h - 0.04, d - 0.02, mat(C.cabinet), 0, 0, -0.01), // cabinets
      box(w, 0.04, d, mat(C.worktop, { roughness: 0.4 }), 0, h - 0.04, 0), // worktop
    ];
    if (sink !== undefined) parts.push(box(0.55, 0.01, 0.4, mat(C.steel, { metalness: 0, roughness: 0.3 }), sink, h, 0));
    if (hob !== undefined) parts.push(box(0.6, 0.01, 0.5, mat(C.black, { roughness: 0.2 }), hob, h, 0));
    return group(parts);
  },

  island({ w = 1.8, d = 0.9, h = 0.92 }) {
    return group(
      box(w - 0.1, h - 0.04, d - 0.3, mat(C.woodMid, { roughness: 0.6 }), 0, 0, -0.1),
      box(w, 0.04, d, mat(C.white, { roughness: 0.3 }), 0, h - 0.04, 0), // overhanging top
    );
  },

  stool() {
    return group(
      cyl(0.17, 0.17, 0.05, mat(C.woodDark), 0, 0.65),
      cyl(0.025, 0.025, 0.65, mat(C.black)),
      cyl(0.16, 0.16, 0.02, mat(C.black)),
    );
  },

  fridge() {
    return group(
      box(0.7, 1.95, 0.66, mat(C.steel, { metalness: 0, roughness: 0.35 })),
      box(0.02, 0.5, 0.03, mat(C.black), -0.28, 1.1, 0.345),
    );
  },

  chair({ color = C.woodDark }) {
    const m = mat(color, { roughness: 0.6 });
    const parts = [box(0.44, 0.04, 0.44, m, 0, 0.44, 0), box(0.44, 0.42, 0.04, m, 0, 0.48, -0.2)];
    for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) parts.push(box(0.035, 0.44, 0.035, m, x, 0, z));
    return group(parts);
  },

  /** Table with chairs arranged around it (on the long sides + the ends). */
  diningTable({ w = 1.8, d = 0.9, chairs = 6 }) {
    const top = mat(C.woodLight, { roughness: 0.5 });
    const parts = [box(w, 0.04, d, top, 0, 0.72, 0)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.06, 0.72, 0.06, mat(C.woodDark), sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08)));

    const alongX = w >= d; // long axis
    const long = alongX ? w : d;
    const short = alongX ? d : w;
    const ends = chairs >= 6 ? 2 : 0;
    const perSide = Math.floor((chairs - ends) / 2);
    const seats = [];
    for (let i = 0; i < perSide; i++) {
      const t = (i + 0.5) / perSide - 0.5;
      for (const s of [-1, 1]) seats.push([t * long * 0.9, s * (short / 2 + 0.3)]);
    }
    if (ends) for (const s of [-1, 1]) seats.push([s * (long / 2 + 0.3), 0]);
    for (const [a, b] of seats) {
      const [x, z] = alongX ? [a, b] : [b, a];
      const c = builders.chair({});
      c.position.set(x, 0, z);
      c.rotation.y = Math.atan2(-x, -z); // face the table centre
      parts.push(c);
    }
    return group(parts);
  },

  sideboard({ w = 1.4, d = 0.4, h = 0.8 }) {
    return group(box(w, h, d, mat(C.woodDark, { roughness: 0.5 })));
  },

  console({ w = 1.1, d = 0.35, h = 0.85 }) {
    return group(
      box(w, 0.04, d, mat(C.woodDark, { roughness: 0.5 }), 0, h - 0.04, 0),
      box(w - 0.1, h - 0.04, 0.04, mat(C.woodDark), 0, 0, -d / 2 + 0.03),
      cyl(0.06, 0.08, 0.3, mat(C.white), w / 3, h), // vase
    );
  },

  bench({ w = 1, d = 0.4 }) {
    return group(box(w, 0.45, d, mat(C.woodLight, { roughness: 0.6 })), box(w - 0.1, 0.06, d - 0.06, mat(C.fabricDark), 0, 0.45, 0));
  },

  toilet() {
    const white = mat(C.white, { roughness: 0.3 });
    const bowl = cyl(0.19, 0.16, 0.4, white, 0, 0, 0.05);
    bowl.scale.z = 1.3;
    return group(box(0.4, 0.4, 0.18, white, 0, 0.35, -0.22), bowl, box(0.38, 0.03, 0.5, white, 0, 0.4, 0.02));
  },

  vanity({ w = 0.9, d = 0.5 }) {
    const white = mat(C.white, { roughness: 0.3 });
    return group(
      box(w, 0.75, d, mat(C.woodMid, { roughness: 0.6 })),
      box(w, 0.04, d, white, 0, 0.75, 0),
      cyl(0.16, 0.13, 0.1, white, 0, 0.79, 0.02),
      cyl(0.015, 0.015, 0.2, mat(C.steel, { metalness: 0, roughness: 0.2 }), 0, 0.79, -d / 2 + 0.07),
    );
  },

  bathtub({ w = 1.7, d = 0.75, h = 0.55 }) {
    const white = mat(C.white, { roughness: 0.25 });
    const t = 0.08;
    return group(
      box(w, 0.1, d, white), // base
      box(w, h - 0.1, t, white, 0, 0.1, -d / 2 + t / 2),
      box(w, h - 0.1, t, white, 0, 0.1, d / 2 - t / 2),
      box(t, h - 0.1, d - 2 * t, white, -w / 2 + t / 2, 0.1, 0),
      box(t, h - 0.1, d - 2 * t, white, w / 2 - t / 2, 0.1, 0),
      box(w - 2 * t, 0.2, d - 2 * t, mat('#bcd8e2', { roughness: 0.1 }), 0, 0.1, 0), // water
    );
  },

  shower({ w = 0.9, d = 0.9 }) {
    const white = mat(C.white, { roughness: 0.3 });
    const front = box(w, 1.95, 0.02, glassMaterial, 0, 0.05, d / 2 - 0.01);
    const side = box(0.02, 1.95, d, glassMaterial, -w / 2 + 0.01, 0.05, 0);
    return group(box(w, 0.05, d, white), front, side, cyl(0.1, 0.1, 0.02, mat(C.steel, { metalness: 0 }), 0.15, 2.0, -0.15));
  },

  washer() {
    const door = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 24), mat(C.black, { roughness: 0.2 }));
    door.rotation.x = Math.PI / 2;
    door.position.set(0, 0.45, 0.31);
    return group(box(0.6, 0.85, 0.6, mat(C.white, { roughness: 0.4 })), door);
  },

  plant({ size = 0.8 }) {
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 * size, 2), mat(C.leaf, { roughness: 0.9 }));
    leaves.position.y = 0.35 * size + 0.24 * size;
    leaves.scale.y = 1.3;
    return group(cyl(0.14 * size, 0.1 * size, 0.35 * size, mat(C.pot)), leaves);
  },

  tree({ size = 1 }) {
    const crownMat = mat(C.leafDark, { roughness: 0.9 });
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 * size, 1), crownMat);
    crown.position.y = 2.2 * size + 0.6 * size;
    const crown2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 * size, 1), mat(C.leaf, { roughness: 0.9 }));
    crown2.position.set(0.4 * size, 3.3 * size, 0.2 * size);
    // Canopies are hidden in floor-plan mode so the garden reads clearly.
    crown.userData.canopy = crown2.userData.canopy = true;
    return group(cyl(0.1 * size, 0.14 * size, 2.3 * size, mat(C.trunk)), crown, crown2);
  },

  shrub({ size = 0.6 }) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1), mat(C.leaf, { roughness: 0.9 }));
    s.position.y = size * 0.7;
    s.scale.y = 0.75;
    return group(s);
  },

  hedge({ w = 3, d = 0.6, h = 0.9 }) {
    return group(box(w, h, d, mat(C.leafDark, { roughness: 1 })));
  },

  /**
   * Straight stair made of solid stepped blocks, rising towards local -z.
   * A handrail runs along the open (-x) side.
   */
  stairs({ w = 0.9, run = 2.7, rise = 2.6, steps = 12 }) {
    const side = mat(COLORS.wallSide, { roughness: 0.9 });
    const tread = mat(C.woodLight, { roughness: 0.6 });
    const going = run / steps;
    const riser = rise / steps;
    const parts = [];
    for (let i = 0; i < steps; i++) {
      const h = (i + 1) * riser;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, going), [side, side, tread, side, side, side]);
      m.position.set(0, h / 2, run / 2 - (i + 0.5) * going);
      parts.push(m);
    }
    // Handrail along the slope + two newel posts.
    const metal = mat(C.black, { roughness: 0.4, metalness: 0 });
    const len = Math.hypot(run, rise);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), mat(C.woodDark, { roughness: 0.5 }));
    rail.rotation.x = Math.atan2(rise, run);
    rail.position.set(-w / 2 + 0.03, 0.9 + rise / 2, 0);
    parts.push(rail);
    parts.push(box(0.05, 0.9, 0.05, metal, -w / 2 + 0.03, 0, run / 2 - 0.03));
    // Thin balusters under the rail.
    for (let i = 1; i < steps; i += 2) {
      const h = (i + 1) * riser;
      parts.push(box(0.02, 0.88, 0.02, metal, -w / 2 + 0.03, h, run / 2 - (i + 0.5) * going));
    }
    return group(parts);
  },

  /** Glass balustrade with a timber handrail, running along local x. */
  railing({ w = 2.0, h = 1.0 }) {
    const wood = mat(C.woodDark, { roughness: 0.5 });
    const glass = box(w - 0.08, h - 0.12, 0.02, glassMaterial, 0, 0.06, 0);
    glass.userData.noShadow = true;
    return group(
      box(w, 0.05, 0.06, wood, 0, h - 0.05, 0),
      box(0.05, h, 0.05, wood, -w / 2 + 0.025, 0, 0),
      box(0.05, h, 0.05, wood, w / 2 - 0.025, 0, 0),
      glass,
    );
  },

  outdoorSet() {
    const metal = mat(C.black, { roughness: 0.6 });
    const parts = [cyl(0.5, 0.5, 0.04, mat(C.woodLight, { roughness: 0.6 }), 0, 0.72), cyl(0.04, 0.04, 0.72, metal)];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const c = builders.chair({ color: C.fabricDark });
      c.position.set(Math.sin(a) * 0.85, 0, Math.cos(a) * 0.85);
      c.rotation.y = a + Math.PI; // face the table
      parts.push(c);
    }
    return group(parts);
  },
};

/**
 * Builds one furniture item from plan data.
 * @param {object} item  {type, x, z, rot?, ...builder options}
 * @returns {THREE.Group|null}
 */
export function buildFurniture(item) {
  const builder = builders[item.type];
  if (!builder) {
    console.warn(`Unknown furniture type "${item.type}"`);
    return null;
  }
  const g = builder(item);
  g.name = item.type;
  g.position.y = FLOOR_Y;
  g.rotation.y = THREE.MathUtils.degToRad(item.rot || 0);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !o.userData.noShadow && o.material !== glassMaterial;
      o.receiveShadow = true;
    }
  });
  return g;
}
