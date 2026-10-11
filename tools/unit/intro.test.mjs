import test from 'node:test';
import assert from 'node:assert/strict';
import { INTRO, introSwing } from '../../public/js/scene/intro.js';

const DT = 1 / 120;

test('intro swing: starts at the overview angle and stays within the swing range', () => {
  assert.ok(Math.abs(introSwing(0)) < 1e-12);
  const [lo, hi] = INTRO.swing;
  for (let t = 0; t < 200; t += DT) {
    const v = introSwing(t);
    assert.ok(v >= lo - 1e-9 && v <= hi + 1e-9, `offset ${v} at ${t.toFixed(2)} s`);
  }
});

test('intro swing: first moves towards the front view, reaches both ends', () => {
  assert.ok(introSwing(1) < 0);
  let min = 0;
  let max = 0;
  for (let t = 0; t < 120; t += DT) {
    min = Math.min(min, introSwing(t));
    max = Math.max(max, introSwing(t));
  }
  assert.ok(Math.abs(min - INTRO.swing[0]) < 0.01 && Math.abs(max - INTRO.swing[1]) < 0.01, `${min} … ${max}`);
});

test('intro swing: slow (≤ research limit of 5°/s, ~2°/s peak) and smooth (no speed jumps)', () => {
  let prevSpeed = null;
  for (let t = DT; t < 150; t += DT) {
    const speed = (introSwing(t) - introSwing(t - DT)) / DT;
    assert.ok(Math.abs(speed) <= INTRO.speed + 1e-6 && INTRO.speed <= 5, `${speed}°/s at ${t.toFixed(2)} s`);
    if (prevSpeed !== null) assert.ok(Math.abs(speed - prevSpeed) < 0.05, `speed jump ${prevSpeed} → ${speed} at ${t.toFixed(2)} s`);
    prevSpeed = speed;
  }
});
