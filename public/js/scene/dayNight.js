/**
 * dayNight.js — smooth Day / Night lighting transition.
 *
 * Interpolates background/fog colour, hemisphere + sun colour/intensity and
 * tone-mapping exposure between two presets. At night a small pool of warm,
 * NON-shadow-casting point lights is placed in the rooms of the visible floor,
 * window glass glows and lamp shades get brighter. The point lights always
 * exist (intensity 0 by day) so toggling never triggers a shader recompile.
 */
import * as THREE from 'three';
import { glassMaterial, lampMaterial } from './materials.js';
import { M } from '../theme.js';

const PRESETS = {
  day: {
    background: '#eeebe6',
    hemiSky: M.hemiSky,
    hemiGround: M.hemiGround,
    hemi: M.hemi,
    sunColor: M.sunColor,
    sun: M.sun,
    exposure: 1.0,
    glassGlow: 0,
    lampGlow: 0.5,
    roomLight: 0,
  },
  night: {
    background: '#141a24',
    hemiSky: '#5d6a88',
    hemiGround: '#2a2830',
    hemi: 0.8,
    sunColor: '#b4c3f0', // moonlight
    sun: 0.35,
    exposure: 1.0,
    glassGlow: 0.9,
    lampGlow: 3.0,
    roomLight: 5.0,
  },
};

const POOL_SIZE = 8;
const DURATION = 1.6; // seconds

export class DayNight {
  constructor({ scene, renderer, lights }) {
    this.scene = scene;
    this.renderer = renderer;
    this.hemi = lights.hemi;
    this.sun = lights.sun;
    this.t = 0; // 0 = day, 1 = night
    this.goal = 0;
    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const light = new THREE.PointLight('#ffd9a8', 0, 7.5, 1.5);
      light.castShadow = false;
      light.position.set(0, -50, 0); // parked until placed
      // NB: lights are never toggled via .visible: changing the number of
      // active lights would force every material to recompile.
      scene.add(light);
      this.pool.push(light);
    }
    this._a = new THREE.Color();
    this._b = new THREE.Color();
    this.#apply();
  }

  get mode() {
    return this.goal ? 'night' : 'day';
  }

  /** @param {'day'|'night'} mode */
  set(mode, { animate = true } = {}) {
    this.goal = mode === 'night' ? 1 : 0;
    if (!animate) {
      this.t = this.goal;
      this.#apply();
    }
  }

  /**
   * Places the warm room lights (world-space positions, one per room).
   * Extra positions beyond the pool size are ignored.
   * @param {THREE.Vector3[]} positions
   */
  placeRoomLights(positions) {
    this.pool.forEach((light, i) => {
      const p = positions[i];
      if (p) light.position.copy(p);
      else light.position.set(0, -50, 0); // park unused lights out of sight
    });
  }

  /** @returns {boolean} true while the transition runs (a new frame is needed) */
  update(dt) {
    if (this.t === this.goal) return false;
    const step = dt / DURATION;
    this.t = this.goal > this.t ? Math.min(this.goal, this.t + step) : Math.max(this.goal, this.t - step);
    this.#apply();
    return true;
  }

  #apply() {
    const k = THREE.MathUtils.smoothstep(this.t, 0, 1);
    const D = PRESETS.day;
    const N = PRESETS.night;
    const lerp = (a, b) => a + (b - a) * k;
    const mix = (target, a, b) => target.copy(this._a.set(a)).lerp(this._b.set(b), k);

    if (this.scene.background?.isColor) mix(this.scene.background, D.background, N.background);
    this.onProgress?.(k);
    mix(this.hemi.color, D.hemiSky, N.hemiSky);
    mix(this.hemi.groundColor, D.hemiGround, N.hemiGround);
    this.hemi.intensity = lerp(D.hemi, N.hemi);
    mix(this.sun.color, D.sunColor, N.sunColor);
    this.sun.intensity = lerp(D.sun, N.sun);
    this.renderer.toneMappingExposure = lerp(D.exposure, N.exposure);
    glassMaterial.emissiveIntensity = lerp(D.glassGlow, N.glassGlow);
    lampMaterial.emissiveIntensity = lerp(D.lampGlow, N.lampGlow);
    for (const light of this.pool) light.intensity = lerp(D.roomLight, N.roomLight);
  }
}
