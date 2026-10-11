/**
 * roomCard.js — room detail card (right-hand panel on desktop, bottom sheet
 * on mobile; the layout switch is pure CSS). Replaces the step-1 label.
 */
import { fmt1 } from './format.js';

export class RoomCard {
  /**
   * @param {HTMLElement} el   the <aside> card element (see index.html)
   * @param {{ onClose: () => void, floorName?: string }} opts
   */
  constructor(el, { onClose, floorName = '', unitArea = 0 }) {
    this.unitArea = unitArea;
    this.el = el;
    this.fields = {
      eyebrow: el.querySelector('[data-eyebrow]'),
      name: el.querySelector('[data-name]'),
      size: el.querySelector('[data-size]'),
      area: el.querySelector('[data-area]'),
      sqft: el.querySelector('[data-sqft]'),
      description: el.querySelector('[data-description]'),
    };
    this.floorName = floorName;
    el.querySelector('[data-close]').addEventListener('click', () => onClose());
  }

  get isOpen() {
    return this.el.classList.contains('is-open');
  }

  /** @param {{name, rect:{w,d}, description?, outdoor?}} room */
  /** @param {string} [eyebrow] small line above the title (floor name + area) */
  show(room, eyebrow) {
    const { w, d } = room.rect;
    const area = w * d;
    const f = this.fields;
    f.eyebrow.textContent = eyebrow ?? (room.outdoor ? 'Outdoor' : this.floorName);
    f.name.textContent = room.name;
    f.size.textContent = `${fmt1(w)} m × ${fmt1(d)} m`;
    f.area.textContent = `${fmt1(area)} m²`;
    f.sqft.textContent = room.outdoor ? 'outside the interior area' : `${Math.round((area / this.unitArea) * 100)} % of ${fmt1(this.unitArea)} m²`;
    f.description.textContent = room.description || '';
    this.el.classList.add('is-open');
    this.el.setAttribute('aria-hidden', 'false');
    this.el.querySelector('[data-close]').tabIndex = 0;
  }

  hide() {
    this.el.classList.remove('is-open');
    this.el.setAttribute('aria-hidden', 'true');
    this.el.querySelector('[data-close]').tabIndex = -1;
  }
}
