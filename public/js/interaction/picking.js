/**
 * picking.js — click-to-select rooms via raycasting.
 *
 * A pointer interaction only counts as a "click" if the pointer moved less
 * than CLICK_TOLERANCE px between down and up and no second finger joined,
 * so orbit drags and pinch-zooms never change the selection.
 */
import * as THREE from 'three';

const CLICK_TOLERANCE = 5; // px

/** True if the object and all its ancestors are visible. */
function isVisible(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {THREE.Camera} opts.camera
 * @param {THREE.Object3D[]} opts.targets  objects to raycast (rooms + walls)
 * @param {(roomId: string|null) => void} opts.onPick
 * @param {(roomId: string|null) => void} [opts.onHover]  mouse only, one raycast per frame
 * @param {(point: THREE.Vector3, object: THREE.Object3D) => string|null} [opts.resolveWallHit]
 *        maps a hit on a wall (which has no roomId) to a room, or null
 */
export function setupPicking({ canvas, camera, targets, onPick, onHover = () => {}, resolveWallHit = () => null }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const active = new Set(); // pointer ids currently down
  let press = null; // { x, y, id } of a potential click

  /** Returns the room id under a client-space point, or null. */
  function roomAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    // Nearest visible hit wins; walls occlude what is behind them.
    const hit = raycaster.intersectObjects(targets, true).find((h) => isVisible(h.object));
    if (!hit) return null;
    if (hit.object.userData.roomId) return hit.object.userData.roomId;
    if (hit.object.userData.isWall) return resolveWallHit(hit.point, hit.object);
    return null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    active.add(e.pointerId);
    if (e.pointerType === 'mouse') onHover(null); // a drag is not a hover (and shows the grabbing cursor)
    press = active.size === 1 && e.button === 0 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  });

  canvas.addEventListener('pointerup', (e) => {
    active.delete(e.pointerId);
    if (!press || press.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    press = null;
    if (moved < CLICK_TOLERANCE) onPick(roomAt(e.clientX, e.clientY));
  });

  canvas.addEventListener('pointerleave', () => onHover(null));
  canvas.addEventListener('pointercancel', (e) => {
    active.delete(e.pointerId);
    press = null;
  });

  // Hover feedback (mouse only), throttled to one raycast per frame.
  let hoverQueued = false;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons || hoverQueued) return;
    hoverQueued = true;
    requestAnimationFrame(() => {
      hoverQueued = false;
      onHover(roomAt(e.clientX, e.clientY)); // the viewer sets the pointer cursor for rooms
    });
  });

  return { roomAt };
}
