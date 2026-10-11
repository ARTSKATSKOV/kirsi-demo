/**
 * framing.js — pure camera-framing maths (no side effects on the real camera).
 *
 * computeFraming() finds a camera position + orbit target that shows a box
 * from a given viewing angle, fitted into a "safe" screen rectangle (the part
 * of the viewport not covered by UI panels).
 */
import * as THREE from 'three';

const DEG = THREE.MathUtils.DEG2RAD;

/** Unit vector from the target towards the camera. */
export function viewDirection(azimuthDeg, polarDeg) {
  const az = azimuthDeg * DEG;
  const po = polarDeg * DEG;
  return new THREE.Vector3(Math.sin(po) * Math.sin(az), Math.cos(po), Math.sin(po) * Math.cos(az));
}

/**
 * Converts pixel insets (UI panels) into a safe rectangle in NDC (-1..1).
 * @param {{top?:number,right?:number,bottom?:number,left?:number}} insets
 */
export function safeRectFromInsets(insets, width, height) {
  const { top = 0, right = 0, bottom = 0, left = 0 } = insets;
  return {
    x0: (left / width) * 2 - 1,
    x1: 1 - (right / width) * 2,
    y0: (bottom / height) * 2 - 1,
    y1: 1 - (top / height) * 2,
  };
}

const _cam = new THREE.PerspectiveCamera();
const _ray = new THREE.Raycaster();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _p = new THREE.Vector3();

/**
 * @param {THREE.PerspectiveCamera} camera  used only for fov / aspect
 * @param {THREE.Box3} box                  world-space box to show
 * @param {object} opts
 * @param {number} opts.azimuth  degrees around Y, 0 = looking from +z (the street)
 * @param {number} opts.polar    degrees from straight above
 * @param {number} [opts.fill]   fraction of the safe rect the box should fill
 * @param {{x0,x1,y0,y1}} [opts.safe]  safe rect in NDC (default: full screen)
 * @param {number} [opts.planeY]  height of the orbit-target plane (floor level)
 * @param {number} [opts.fov]     vertical fov to frame for (default: camera.fov)
 * @returns {{ position: THREE.Vector3, target: THREE.Vector3, fov: number }}
 */
export function computeFraming(camera, box, { azimuth, polar, fill = 0.88, safe, planeY = 0, fov } = {}) {
  const s = safe || { x0: -1, x1: 1, y0: -1, y1: 1 };
  _ground.constant = -planeY; // plane y = planeY
  _cam.fov = fov ?? camera.fov;
  _cam.aspect = camera.aspect;
  _cam.near = camera.near;
  _cam.far = camera.far;
  _cam.updateProjectionMatrix();

  const dir = viewDirection(azimuth, polar);
  const corners = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));

  const target = box.getCenter(new THREE.Vector3()).setY(planeY);
  let dist = box.getSize(new THREE.Vector3()).length() * 1.5;
  const halfW = (s.x1 - s.x0) / 2;
  const halfH = (s.y1 - s.y0) / 2;

  const place = () => {
    _cam.position.copy(target).addScaledVector(dir, dist);
    _cam.lookAt(target);
    _cam.updateMatrixWorld();
  };

  // 1) Centre the box on screen and fit its projected size (a few iterations
  //    are enough because perspective makes this only mildly non-linear).
  for (let i = 0; i < 5; i++) {
    place();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      _p.copy(c).project(_cam);
      minX = Math.min(minX, _p.x); maxX = Math.max(maxX, _p.x);
      minY = Math.min(minY, _p.y); maxY = Math.max(maxY, _p.y);
    }
    _ray.setFromCamera(new THREE.Vector2((minX + maxX) / 2, (minY + maxY) / 2), _cam);
    _ray.ray.intersectPlane(_ground, target);
    const scale = Math.max((maxX - minX) / 2 / (halfW * fill), (maxY - minY) / 2 / (halfH * fill));
    dist *= scale;
  }

  // 2) Shift camera + target together so the box centre lands in the middle
  //    of the safe rect instead of the middle of the screen.
  place();
  const cx = (s.x0 + s.x1) / 2;
  const cy = (s.y0 + s.y1) / 2;
  if (Math.abs(cx) > 1e-3 || Math.abs(cy) > 1e-3) {
    _ray.setFromCamera(new THREE.Vector2(-cx, -cy), _cam);
    const shifted = new THREE.Vector3();
    if (_ray.ray.intersectPlane(_ground, shifted)) target.copy(shifted);
  }

  return { position: target.clone().addScaledVector(dir, dist), target: target.clone(), fov: _cam.fov };
}

/**
 * Minimum size (m) of the box a selected room is framed with, per view mode.
 * A 1.8 × 3.3 m bathroom would otherwise fill the screen and lose all context;
 * the floor plan keeps a little more of the apartment around the room.
 */
export const MIN_FRAME = { '3d': 4.5, plan: 5.5 };

/**
 * Grows a room rectangle to at least `min` × `min` metres around its centre
 * (each side independently; larger rooms are returned unchanged).
 * @param {{x:number,z:number,w:number,d:number}} rect
 * @param {number} min
 */
export function minFrameRect(rect, min = 0) {
  const w = Math.max(rect.w, min);
  const d = Math.max(rect.d, min);
  return { x: rect.x + rect.w / 2 - w / 2, z: rect.z + rect.d / 2 - d / 2, w, d };
}
