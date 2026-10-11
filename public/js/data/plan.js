/**
 * plan.js — hero apartment geometry: CONCEPTUAL layout for a 3-room flat (unit #16).
 *
 * ⚠ This is NOT the official floor plan. Only the totals are real:
 *   interior 73.0 m², balcony 36.2 m², 3 rooms (living + 2 bedrooms),
 *   floor 2 — illustrative sample data shipped with this demo.
 * The room split, walls, doors and furniture are invented for the demo.
 *
 * Coordinate system (meters, top-down):
 *   x → east, z → south (towards the balcony / the default camera), y → up.
 * The apartment spans x ∈ [0, 10], z ∈ [0, 7.3] (10.0 × 7.3 = 73.0 m²);
 * the balcony lies in front of it at z ∈ [7.3, 10.92] (10.0 × 3.62 = 36.2 m²).
 *
 * Rooms are axis-aligned rectangles measured wall-centreline to
 * wall-centreline, so the room areas add up exactly to the unit area.
 * Furniture positions are LOCAL to the room rectangle (0,0 = north-west
 * corner), `rot` in degrees around Y, 0° = the piece's front faces +z.
 */
import { M } from '../theme.js';

export const UNIT = {
  id: '16',
  floor: 2,
  rooms: 3,
  areaM2: 73.0,
  balconyM2: 36.2,
  priceEur: 213000,
  status: 'free',
};

/** Order of the room buttons. The 36 m² balcony is the unit's headline feature,
 *  so it comes right after the living room (visible on phones without scrolling). */
export const CHIP_ORDER = ['living', 'balcony', 'master', 'bed2', 'hall', 'bath', 'wc', 'wardrobe'];

/** One floor only: the apartment itself (it sits on floor 2 of the building). */
export const FLOORS = [{ id: 'ground', name: 'Floor 2', elevation: 0 }];

/** Camera angles (degrees). Azimuth 0 = looking from the balcony side (+z). */
export const OVERVIEW_VIEW = { azimuth: 24, polar: 42 };
export const OVERVIEW_VIEW_PORTRAIT = { azimuth: 10, polar: 34 };
export const DEFAULT_ROOM_VIEW = { azimuth: 18, polar: 36 };

/** Apartment footprint (exterior walls sit on its edges). */
export const FOOTPRINT = { x: 0, z: 0, w: 10, d: 7.3 };

export const WALL_SETTINGS = {
  height: 2.4, // dollhouse: no ceiling / roof
  exterior: 0.3,
  interior: 0.12,
};

export const OPENING_DEFAULTS = {
  door: { width: 0.85, height: 2.1, sill: 0 },
  passage: { width: 1.2, height: 2.2, sill: 0 },
  window: { width: 1.4, height: 1.4, sill: 0.8 },
  glassDoor: { width: 2.0, height: 2.2, sill: 0 },
};

/**
 * Walls. `openings[].at` = absolute coordinate of the opening centre along
 * the wall axis. Door `hinge` 'start' | 'end'; `swing` ±1 = side of the wall
 * the open panel sits on (+z / +x side).
 */
export const WALLS = [
  // ── Exterior shell ────────────────────────────────────────────────
  {
    id: 'ext-north', type: 'exterior', from: [0, 0], to: [10, 0],
    openings: [{ type: 'door', at: 7.1, width: 1.0, hinge: 'start', swing: 1 }], // entrance from the stair hall
  },
  {
    id: 'ext-east', type: 'exterior', from: [10, 0], to: [10, 7.3],
    openings: [{ type: 'window', at: 5.6, width: 1.4, sill: 1.0, height: 1.2 }], // kitchen
  },
  {
    id: 'ext-south', type: 'exterior', from: [0, 7.3], to: [10, 7.3],
    openings: [
      { type: 'glassDoor', at: 1.4, width: 1.4 }, // bedroom 2 → balcony
      { type: 'glassDoor', at: 5.0, width: 2.6 }, // living → balcony (sliding)
      { type: 'window', at: 8.4, width: 1.8 }, // dining
    ],
  },
  {
    id: 'ext-west', type: 'exterior', from: [0, 0], to: [0, 7.3],
    openings: [
      { type: 'window', at: 1.7, width: 1.6 }, // master bedroom
      { type: 'window', at: 5.4, width: 1.3 }, // bedroom 2
    ],
  },

  // ── Interior partitions ───────────────────────────────────────────
  {
    id: 'int-row-3.3', type: 'interior', from: [0, 3.3], to: [10, 3.3],
    openings: [
      { type: 'door', at: 3.4, width: 0.8, hinge: 'end', swing: -1 }, // master ↔ living
      { type: 'passage', at: 7.1, width: 1.8 }, // hall ↔ living (open)
    ],
  },
  { id: 'int-bed2', type: 'interior', from: [2.8, 3.3], to: [2.8, 7.3],
    openings: [{ type: 'door', at: 3.95, width: 0.8, hinge: 'start', swing: -1 }] },
  { id: 'int-master-bath', type: 'interior', from: [4.0, 0], to: [4.0, 3.3], openings: [] },
  { id: 'int-bath-hall', type: 'interior', from: [5.8, 0], to: [5.8, 3.3],
    openings: [{ type: 'door', at: 2.35, width: 0.8, hinge: 'end', swing: -1 }] },
  { id: 'int-hall-east', type: 'interior', from: [8.4, 0], to: [8.4, 3.3],
    openings: [
      { type: 'door', at: 0.8, width: 0.7, hinge: 'start', swing: 1 }, // WC
      { type: 'door', at: 2.45, width: 0.8, hinge: 'end', swing: 1 }, // wardrobe
    ] },
  { id: 'int-wc-wardrobe', type: 'interior', from: [8.4, 1.6], to: [10, 1.6], openings: [] },
];

/**
 * Rooms. `finish.type`: wood | tile | carpet | stone | grass.
 * Areas (w × d): 28.8 + 13.2 + 11.2 + 8.58 + 5.94 + 2.72 + 2.56 = 73.0 m².
 */
export const ROOMS = [
  {
    id: 'living', kind: 'living', name: 'Kitchen & Living', short: 'Kitchen & Living', mobileShort: 'Kitchen',
    rect: { x: 2.8, z: 3.3, w: 7.2, d: 4.0 },
    finish: { type: 'wood', color: M.floorWood, tile: 1.6 },
    description: 'Open-plan kitchen, dining and living room with a wide sliding door onto the balcony.',
    furniture: [
      { type: 'rug', x: 1.5, z: 2.3, w: 2.1, d: 2.4, color: M.rug },
      { type: 'sofa', x: 0.58, z: 2.3, w: 2.2, d: 0.9, rot: 90 },
      { type: 'coffeeTable', x: 1.65, z: 2.3, r: 0.4 },
      { type: 'floorLamp', x: 0.35, z: 3.6 },
      { type: 'diningTable', x: 4.6, z: 2.2, w: 1.6, d: 0.9, chairs: 4 },
      { type: 'counter', x: 6.74, z: 1.6, w: 2.8, rot: -90, sink: 0.4, hob: -0.8 },
      { type: 'fridge', x: 6.75, z: 3.45, rot: -90 },
      { type: 'plant', x: 3.3, z: 3.6, size: 0.8 },
    ],
  },
  {
    id: 'master', kind: 'bedroom', name: 'Bedroom 1 (main)', short: 'Bedroom 1', mobileShort: 'Bed 1',
    rect: { x: 0, z: 0, w: 4.0, d: 3.3 },
    finish: { type: 'wood', color: M.floorWood, tile: 1.6 },
    description: 'Main bedroom with space for a double bed, a full-width wardrobe and a west-facing window.',
    furniture: [
      { type: 'rug', x: 2.6, z: 1.65, w: 1.6, d: 2.1, color: M.rugBed },
      { type: 'bed', x: 2.88, z: 1.6, w: 1.6, l: 2.0, rot: -90 },
      { type: 'nightstand', x: 3.65, z: 0.42 },
      { type: 'nightstand', x: 3.65, z: 2.78 },
      { type: 'wardrobe', x: 1.1, z: 0.46, w: 1.8, d: 0.6 },
      { type: 'plant', x: 0.45, z: 2.85, size: 0.7 },
    ],
  },
  {
    id: 'bed2', kind: 'bedroom', name: 'Bedroom 2', short: 'Bedroom 2', mobileShort: 'Bed 2',
    rect: { x: 0, z: 3.3, w: 2.8, d: 4.0 },
    finish: { type: 'wood', color: M.floorWood, tile: 1.6 },
    description: 'Second bedroom — child’s room or home office — with its own door to the balcony.',
    furniture: [
      { type: 'bed', x: 0.78, z: 1.75, w: 1.2, l: 2.0 },
      { type: 'wardrobe', x: 1.95, z: 0.36, w: 1.2, d: 0.55 },
      { type: 'sideboard', x: 2.47, z: 2.7, w: 1.1, d: 0.5, h: 0.75, rot: -90 },
      { type: 'chair', x: 1.95, z: 2.7, rot: 90 },
    ],
  },
  {
    id: 'hall', kind: 'hall', name: 'Entrance hall', short: 'Hall',
    rect: { x: 5.8, z: 0, w: 2.6, d: 3.3 },
    finish: { type: 'tile', color: M.floorTile, grout: M.grout, tile: 1.0 },
    description: 'Entrance from the stairwell, opening straight into the living area. Doors to the bathroom, WC and wardrobe.',
    furniture: [
      { type: 'rug', x: 1.3, z: 0.5, w: 1.0, d: 0.6, color: M.doormat },
      { type: 'console', x: 0.25, z: 1.0, w: 1.0, d: 0.35, rot: 90 },
      { type: 'bench', x: 2.3, z: 1.65, w: 0.8, d: 0.38, rot: -90 },
    ],
  },
  {
    id: 'bath', kind: 'bathroom', name: 'Bathroom', short: 'Bath',
    rect: { x: 4.0, z: 0, w: 1.8, d: 3.3 },
    finish: { type: 'tile', color: M.floorTile, grout: M.grout, tile: 0.6 },
    description: 'Bathroom with walk-in shower, vanity and space for a washing machine.',
    furniture: [
      { type: 'shower', x: 1.2, z: 0.62 },
      { type: 'toilet', x: 0.36, z: 1.55, rot: 90 },
      { type: 'vanity', x: 0.32, z: 2.65, w: 0.8, d: 0.5, rot: 90 },
      { type: 'washer', x: 1.45, z: 1.45, rot: -90 },
    ],
  },
  {
    id: 'wardrobe', kind: 'storage', name: 'Walk-in wardrobe', short: 'Wardrobe',
    rect: { x: 8.4, z: 1.6, w: 1.6, d: 1.7 },
    finish: { type: 'wood', color: M.floorWood, tile: 1.6 },
    description: 'Walk-in wardrobe / storage off the hall.',
    furniture: [
      { type: 'wardrobe', x: 1.15, z: 0.85, w: 1.5, d: 0.5, rot: -90 },
    ],
  },
  {
    id: 'wc', kind: 'wc', name: 'WC / utility', short: 'WC',
    rect: { x: 8.4, z: 0, w: 1.6, d: 1.6 },
    finish: { type: 'tile', color: M.floorTile, grout: M.grout, tile: 0.6 },
    description: 'Separate guest WC with a small utility corner.',
    furniture: [
      { type: 'toilet', x: 1.1, z: 0.45 },
      { type: 'vanity', x: 1.2, z: 1.2, w: 0.45, d: 0.35, rot: -90 },
    ],
  },
  {
    id: 'balcony', kind: 'balcony', name: 'Balcony / terrace', short: 'Balcony', outdoor: true,
    view: { azimuth: 12, polar: 48 },
    rect: { x: 0, z: 7.3, w: 10.0, d: 3.62 },
    finish: { type: 'wood', color: M.deck, tile: 1.2 },
    description: '36.2 m² balcony along the whole south side — outside the 73.0 m² interior area.',
    balustrade: { sides: ['west', 'south', 'east'], height: 1.1 },
    furniture: [
      { type: 'outdoorSet', x: 5.2, z: 1.8 },
      { type: 'armchair', x: 1.3, z: 1.8, rot: 60, color: M.accentFabric },
      { type: 'armchair', x: 2.4, z: 2.5, rot: -20, color: M.accentFabric },
      { type: 'plant', x: 0.45, z: 3.1, size: 0.9 },
      { type: 'plant', x: 9.5, z: 3.1, size: 1.0 },
      { type: 'plant', x: 9.5, z: 0.5, size: 0.7 },
    ],
  },
];

/** Interior floor area (m²), excluding outdoor spaces. */
export function totalInteriorArea(rooms = ROOMS) {
  return rooms.filter((r) => !r.outdoor).reduce((sum, r) => sum + r.rect.w * r.rect.d, 0);
}

/** Floor id of a room or wall (single floor in this demo). */
export const floorOf = (item) => item.floor || 'ground';

export function propertyStats(rooms = ROOMS) {
  const interior = totalInteriorArea(rooms);
  return {
    floorAreas: { ground: interior },
    bedrooms: rooms.filter((r) => r.kind === 'bedroom').length,
    areaM2: interior,
    outdoorM2: rooms.filter((r) => r.outdoor).reduce((s, r) => s + r.rect.w * r.rect.d, 0),
  };
}
