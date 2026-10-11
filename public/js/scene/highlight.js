/**
 * highlight.js — pure maths of the room highlight (selection + hover), kept
 * free of Three.js / DOM so it can be unit-tested. Used by rooms.js.
 */
export const DIM = 0.84; // floor brightness of non-selected rooms while one is selected
export const SELECT_GLOW = 0.28;
export const HOVER_GLOW = 0.36; // warm fill on hover (model, room list and chips share one hover state)
export const SELECT_LINE = 0.85; // outline opacity
export const HOVER_LINE = 0.4;
/** Highlight fades (seconds): quick in, softer out. See updateRoomHighlight(). */
export const HIGHLIGHT_FADE = { in: 0.09, out: 0.2 };

/** Target look of one room for the current selection / hover. */
export function highlightTarget(id, selectedId, hoverId) {
  const selected = id === selectedId;
  const hovered = id === hoverId && !selected;
  return {
    bright: selectedId && !selected && !hovered ? DIM : 1,
    glow: selected ? SELECT_GLOW : hovered ? HOVER_GLOW : 0,
    line: selected ? SELECT_LINE : hovered ? HOVER_LINE : 0,
  };
}

/**
 * Moves `cur` towards `target` by at most dt / duration of the full range
 * (fade in when rising, fade out when falling). Pure; used per channel.
 */
export function stepToward(cur, target, dt, range, { fadeIn = HIGHLIGHT_FADE.in, fadeOut = HIGHLIGHT_FADE.out } = {}) {
  if (cur === target) return cur;
  const rising = target > cur;
  const step = (range * dt) / (rising ? fadeIn : fadeOut);
  return rising ? Math.min(target, cur + step) : Math.max(target, cur - step);
}

