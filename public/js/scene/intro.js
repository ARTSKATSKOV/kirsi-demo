/**
 * intro.js — first-visit intro settings (coach mark + auto-rotation) and the
 * swing curve used by main.js. Pure functions, unit-tested in tools/unit.
 */
/**
 * Intro auto-rotation: a slow swing around the overview angle (not a full
 * turn: the overview composition, listing and dock stay balanced, and the
 * back of the flat is never shown). First towards the balcony-front view,
 * then a little past the default angle, then back — peak ~2°/s, eased at
 * both ends of each swing. Relative to the framed overview azimuth.
 */
export const INTRO = {
  delay: 0.9, // s after the first frames (the loader is still fading out)
  rampIn: 1.6, // s to ease in from rest
  speed: 2.1, // °/s at the centre of a swing
  swing: [-20, 10], // ° (negative = towards the front / balcony view)
  coachMs: 6500, // coach mark auto-hides after this
};
export const HINT_KEY = 'demo-hint-seen';

/** Swing offset (°) after `t` s: two half-sines with matching speed at 0°. */
export function introSwing(t) {
  const [a, b] = INTRO.swing.map(Math.abs);
  const ta = (Math.PI * a) / INTRO.speed; // duration of each half-swing
  const tb = (Math.PI * b) / INTRO.speed;
  const tau = t % (ta + tb);
  return tau < ta ? Math.sign(INTRO.swing[0]) * a * Math.sin((Math.PI * tau) / ta)
    : Math.sign(INTRO.swing[1]) * b * Math.sin((Math.PI * (tau - ta)) / tb);
}
