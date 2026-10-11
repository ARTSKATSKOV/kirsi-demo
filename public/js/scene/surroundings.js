/**
 * surroundings.js — non-interactive context, styled like a presentation
 * model on a table: the page gradient is the backdrop, a transparent
 * shadow-catcher plane receives the sun shadow, a soft radial "contact
 * shadow" grounds the model, and the floor slab reads as a clean plinth.
 */
import * as THREE from 'three';
import { COLORS, mat, addEdges } from './materials.js';
import { M } from '../theme.js';

const SLAB_T = 0.3;

/** Radial gradient texture (dark centre → transparent edge). */
function contactTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, `rgba(${M.shadowRgb},0.55)`);
  g.addColorStop(0.55, `rgba(${M.shadowRgb},0.22)`);
  g.addColorStop(1, `rgba(${M.shadowRgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSurroundings(plan) {
  const g = new THREE.Group();
  g.name = 'surroundings';
  const ext = plan.wallSettings.exterior / 2;

  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of plan.rooms) {
    x0 = Math.min(x0, r.rect.x); z0 = Math.min(z0, r.rect.z);
    x1 = Math.max(x1, r.rect.x + r.rect.w); z1 = Math.max(z1, r.rect.z + r.rect.d);
  }
  x0 -= ext; z0 -= ext; x1 += ext; z1 += 0.05;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;

  // Shadow catcher: invisible except where the sun shadow falls.
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ color: M.catcher, opacity: M.catcherOpacity }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.set(cx, -SLAB_T - 0.01, cz);
  catcher.receiveShadow = true;
  catcher.raycast = () => {};
  g.add(catcher);

  // Soft contact shadow hugging the plinth (ambient-occlusion feel).
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.35, d * 1.45),
    new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false, toneMapped: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(cx, -SLAB_T - 0.005, cz + 0.2);
  contact.raycast = () => {};
  g.add(contact);

  // Plinth / floor slab with crisp edges.
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, SLAB_T, d), mat(COLORS.slab, { roughness: 0.95 }));
  slab.position.set(cx, -SLAB_T / 2, cz);
  slab.receiveShadow = true;
  slab.castShadow = true;
  addEdges(slab);
  g.add(slab);
  return g;
}
