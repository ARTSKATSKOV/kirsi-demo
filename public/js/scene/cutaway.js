/**
 * cutaway.js — lowers the walls that would block the view into the selected
 * room (like a dollhouse with the front walls cut down to knee height).
 *
 * Only walls lying on the selected room's own boundary AND facing the camera
 * are lowered. Wall pieces are rescaled vertically; windows / doors inside a
 * lowered wall are hidden. Changes are animated in update().
 */
import * as THREE from 'three';

const LOW_HEIGHT = 0.45; // m, knee-wall height while lowered
const SPEED = 1 / 0.45; // full transition in ~0.45 s
const FACING_THRESHOLD = 0.35; // cos of max angle between edge normal and camera
const EPS = 1e-3;

export class WallCutaway {
  /** @param {THREE.Group[]} wallGroups  one group per wall (all floors) */
  constructor(wallGroups) {
    this.walls = wallGroups.map((g) => ({ group: g, t: 0, goal: 0 }));
  }

  /**
   * @param {{x,z,w,d}|null} rect   room rectangle (plan coords) or null to restore all
   * @param {THREE.Vector3} [viewDir] direction from target towards the camera
   * @param {string} [floorId] only walls on this floor are considered
   */
  focus(rect, viewDir, floorId = 'ground') {
    const dx = viewDir ? viewDir.x : 0;
    const dz = viewDir ? viewDir.z : 0;
    const len = Math.hypot(dx, dz) || 1;
    for (const w of this.walls) {
      const m = w.group.userData;
      w.goal = rect && m.floor === floorId && this.#blocks(m, rect, dx / len, dz / len) ? 1 : 0;
    }
  }

  /** Does this wall sit on a room edge whose outward normal faces the camera? */
  #blocks(m, rect, dx, dz) {
    const edges = m.horizontal
      ? [
          { at: rect.z, n: [0, -1], lo: rect.x, hi: rect.x + rect.w }, // north edge
          { at: rect.z + rect.d, n: [0, 1], lo: rect.x, hi: rect.x + rect.w }, // south edge
        ]
      : [
          { at: rect.x, n: [-1, 0], lo: rect.z, hi: rect.z + rect.d }, // west edge
          { at: rect.x + rect.w, n: [1, 0], lo: rect.z, hi: rect.z + rect.d }, // east edge
        ];
    return edges.some(
      (e) =>
        Math.abs(m.fixed - e.at) < EPS &&
        Math.min(m.hi, e.hi) - Math.max(m.lo, e.lo) > 0.1 && // overlaps the edge
        e.n[0] * dx + e.n[1] * dz > FACING_THRESHOLD,
    );
  }

  /**
   * Advance animations; call every frame with the frame delta in seconds.
   * @returns {boolean} true if any wall changed (a new frame is needed)
   */
  update(dt) {
    let changed = false;
    for (const w of this.walls) {
      if (w.t === w.goal) continue;
      w.t = w.goal > w.t ? Math.min(w.goal, w.t + dt * SPEED) : Math.max(w.goal, w.t - dt * SPEED);
      this.#apply(w.group, THREE.MathUtils.smoothstep(w.t, 0, 1));
      changed = true;
    }
    return changed;
  }

  /** Immediately finish all transitions (e.g. for screenshots). */
  finish() {
    for (const w of this.walls) {
      w.t = w.goal;
      this.#apply(w.group, w.t);
    }
  }

  #apply(group, k) {
    this.dirty = true; // geometry changed: shadows need a refresh (see main.js)
    for (const child of group.children) {
      if (child.userData.kind === 'insert') {
        child.visible = k < 0.02;
        continue;
      }
      const { y0, y1 } = child.userData;
      if (y0 === undefined) continue;
      const top = y1 > LOW_HEIGHT ? THREE.MathUtils.lerp(y1, LOW_HEIGHT, k) : y1;
      const h = top - y0;
      child.visible = h > EPS;
      if (!child.visible) continue;
      child.scale.y = h / (y1 - y0);
      child.position.y = y0 + h / 2;
    }
  }
}
