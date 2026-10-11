import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { safeRectFromInsets, viewDirection, computeFraming } from '../../public/js/scene/framing.js';

test('safeRectFromInsets: no insets = full NDC square', () => {
  const r = safeRectFromInsets({ top: 0, right: 0, bottom: 0, left: 0 }, 1000, 800);
  assert.deepEqual([r.x0, r.x1, r.y0, r.y1].map((v) => Math.round(v * 1000) / 1000), [-1, 1, -1, 1]);
});

test('viewDirection is a unit vector', () => {
  const v = viewDirection(24, 42);
  assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9);
});

test('computeFraming: the box fits in front of the camera', () => {
  const cam = new THREE.PerspectiveCamera(35, 1.6, 0.1, 250);
  const box = new THREE.Box3(new THREE.Vector3(-5, 0, -4), new THREE.Vector3(5, 2.7, 4));
  const safe = safeRectFromInsets({ top: 0, right: 0, bottom: 0, left: 0 }, 1600, 1000);
  const v = computeFraming(cam, box, { azimuth: 24, polar: 42, fill: 0.9, safe, planeY: 0, fov: 35 });
  assert.ok(v.position.distanceTo(v.target) > 5);
});
