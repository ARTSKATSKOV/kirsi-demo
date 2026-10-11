/**
 * chips.js — room chips (buttons) that select rooms. The active chip is kept
 * in sync by calling setActive() from the single selection function in
 * main.js, so 3D clicks, chips, tags and reset all stay consistent.
 */
export class RoomChips {
  /**
   * @param {HTMLElement} container
   * @param {Array<{id:string,name:string,short?:string,mobileShort?:string}>} rooms  in display order
   *        (`mobileShort` is shown instead of `short` on compact screens, via CSS)
   * @param {(id: string) => void} onSelect
   * @param {(id: string|null) => void} [onHover]  linked hover, mouse only (no sticky hover on touch)
   */
  constructor(container, rooms, onSelect, onHover = () => {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.hoverId = null;
    this.buttons = new Map();
    this.setRooms(rooms);
    container.addEventListener('scroll', () => this.#updateFades(), { passive: true });
    new ResizeObserver(() => this.#updateFades()).observe(container);
  }

  /** Replaces the chip set (e.g. when switching floors). */
  setRooms(rooms) {
    const onSelect = this.onSelect;
    const container = this.container;
    container.replaceChildren();
    this.buttons.clear();
    for (const room of rooms) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      const label = room.short || room.name;
      if (room.mobileShort && room.mobileShort !== label) {
        const full = document.createElement('span');
        full.className = 'chip__full';
        full.textContent = label;
        const short = document.createElement('span');
        short.className = 'chip__short';
        short.textContent = room.mobileShort;
        b.append(full, short);
      } else {
        b.textContent = label;
      }
      b.title = room.name;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => onSelect(room.id));
      b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && this.onHover(room.id));
      b.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && this.onHover(null));
      container.appendChild(b);
      this.buttons.set(room.id, b);
    }
    container.scrollLeft = 0;
    this.#updateFades();
    this.setHover(this.hoverId);
  }

  /** Linked hover: marks the chip of the room hovered anywhere (model, list, chip). */
  setHover(id) {
    this.hoverId = id;
    for (const [roomId, b] of this.buttons) b.classList.toggle('is-hover', roomId === id);
  }

  /** @param {string|null} id */
  setActive(id) {
    for (const [roomId, b] of this.buttons) {
      const active = roomId === id;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
      // Centre it, so it never sits under the edge fade of the scrolling row.
      if (active) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }

  /** Edge fades hint that the row scrolls (only when it actually overflows). */
  #updateFades() {
    const c = this.container;
    c.classList.toggle('fade-left', c.scrollLeft > 2);
    c.classList.toggle('fade-right', c.scrollLeft + c.clientWidth < c.scrollWidth - 2);
  }
}
