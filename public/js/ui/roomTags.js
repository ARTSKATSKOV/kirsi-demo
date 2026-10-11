/**
 * roomTags.js — small name pills floating over each room in the overview
 * (like the reference). HTML overlay, re-projected only when the camera or
 * viewport changed. Tags that would overlap an already placed tag (or a UI
 * panel) are hidden. Clicking a tag selects the room.
 */
import * as THREE from 'three';

export class RoomTags {
  /**
   * @param {HTMLElement} container
   * @param {Array<{id, name, short?, anchor: THREE.Vector3}>} items  world-space anchors
   * @param {(id: string) => void} onSelect
   * @param {(id: string|null) => void} [onHover]  mouse only (touch never hovers)
   */
  constructor(container, items, onSelect, onHover = () => {}) {
    this.container = container;
    this.items = items.map((it) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'room-tag';
      el.textContent = it.short || it.name;
      el.tabIndex = -1; // chips are the keyboard path; tags are a pointer shortcut
      el.addEventListener('click', () => onSelect(it.id));
      el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && onHover(it.id));
      el.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && onHover(null));
      container.appendChild(el);
      return { ...it, el, w: 0, h: 0, enabled: true };
    });
    this.visible = true;
    this.detailed = false;
    this.hoverId = null; // hovered room: tag shows its area and is placed first
    this.focusId = null; // selected room: only its tag (with area) stays up
    this._lastKey = '';
    this._v = new THREE.Vector3();
    this.blockers = []; // DOMRects the tags must avoid (panels)
    this.isOccluded = null; // optional (item) => boolean, see setOcclusionTest
  }

  /**
   * Optional test run (only on camera change) for items with `checkOcclusion`:
   * tags whose anchor is hidden behind geometry are not shown.
   * @param {(item) => boolean} fn
   */
  setOcclusionTest(fn) {
    this.isOccluded = fn;
    this._lastKey = '';
  }

  setVisible(v) {
    this.visible = v;
    this.container.classList.toggle('is-hidden', !v);
    if (v) this._lastKey = ''; // force a re-layout
  }

  /**
   * Only tags whose item passes `filter` are shown (e.g. the visible floor).
   * @param {(item) => boolean} filter
   */
  setFilter(filter) {
    for (const it of this.items) {
      it.enabled = filter(it);
      if (!it.enabled) it.el.classList.add('is-off');
    }
    this._lastKey = '';
  }

  /** Plan mode shows "name + area" labels on every tag; 3D mode just the name. */
  setDetailed(detailed) {
    this.detailed = detailed;
    this.#renderLabels();
  }

  /**
   * Linked hover (model / room list / chips): the hovered room's tag is
   * highlighted and shows its area. No camera involvement.
   * @param {string|null} id
   */
  setHover(id) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.#renderLabels();
  }

  /**
   * While a room is selected only its own tag stays up, with the area, so
   * the model and the room card say the same thing. Null = all tags again.
   * @param {string|null} id
   */
  setFocus(id) {
    if (id === this.focusId) return;
    this.focusId = id;
    this.#renderLabels();
  }

  /** Whether an item's tag is shown with its area (detailed). */
  isDetailed(it) {
    return this.detailed || it.id === this.hoverId || it.id === this.focusId;
  }

  #renderLabels() {
    for (const it of this.items) {
      const name = it.short || it.name;
      const detailed = this.isDetailed(it);
      const html = detailed ? `${name}<small>${it.area.toFixed(1)} m²</small>` : name;
      if (it.el.innerHTML !== html) {
        it.el.innerHTML = html;
        it.w = 0; // re-measure
      }
      it.el.classList.toggle('is-detailed', detailed);
      it.el.classList.toggle('is-hover', it.id === this.hoverId && it.id !== this.focusId);
      it.el.classList.toggle('is-selected', it.id === this.focusId);
    }
    this._lastKey = '';
  }

  /** Re-measure the labels (e.g. after the web fonts have loaded). */
  remeasure() {
    for (const it of this.items) it.w = 0;
    this._lastKey = '';
  }

  /** @param {DOMRect[]} rects */
  setBlockers(rects) {
    this.blockers = rects;
    this._lastKey = '';
  }

  update(camera, width, height) {
    if (!this.visible) return;
    const e = camera.matrixWorld.elements;
    const key = `${width}x${height}|${e.map((x) => x.toFixed(3)).join(',')}`;
    if (key === this._lastKey) return; // camera didn't move: nothing to do
    this._lastKey = key;

    const placed = [];
    // Selected / hovered tags claim their spot first, so an overlapping
    // neighbour is hidden rather than the one the user is looking at.
    const rank = (it) => (it.id === this.focusId ? 0 : it.id === this.hoverId ? 1 : 2);
    const order = this.focusId || this.hoverId ? [...this.items].sort((a, b) => rank(a) - rank(b)) : this.items;
    for (const it of order) {
      if (!it.enabled) continue;
      if (this.focusId && it.id !== this.focusId && it.id !== this.hoverId) {
        it.el.classList.add('is-off');
        continue;
      }
      if (!it.w) {
        it.w = it.el.offsetWidth;
        it.h = it.el.offsetHeight;
      }
      const v = this._v.copy(it.anchor).project(camera);
      const x = (v.x * 0.5 + 0.5) * width;
      const y = (-v.y * 0.5 + 0.5) * height;
      const box = { l: x - it.w / 2 - 4, r: x + it.w / 2 + 4, t: y - it.h / 2 - 3, b: y + it.h / 2 + 3 };
      const offscreen = v.z > 1 || box.l < 0 || box.r > width || box.t < 0 || box.b > height;
      const hits = (o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t;
      const blocked = this.blockers.some((b) => hits({ l: b.left, r: b.right, t: b.top, b: b.bottom }));
      const occluded = !offscreen && it.checkOcclusion && this.isOccluded?.(it);
      const show = !offscreen && !blocked && !occluded && !placed.some(hits);
      it.el.classList.toggle('is-off', !show);
      if (show) {
        placed.push(box);
        it.el.style.transform = `translate(${Math.round(x - it.w / 2)}px, ${Math.round(y - it.h / 2)}px)`;
      }
    }
  }
}
