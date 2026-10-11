/**
 * cameraRig.js — smooth, interruptible camera flights on top of OrbitControls.
 *
 * While a flight is running, OrbitControls is paused and we drive the camera
 * position + orbit target ourselves. Any user input on the canvas (pointer
 * down, wheel, touch) cancels the flight immediately and hands control back.
 */
import * as THREE from 'three';

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} controls
   */
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.flight = null;
    this.onCancel = null; // optional callback when the user interrupts

    // Capture phase so we run before OrbitControls' own listeners and it can
    // take over the very same gesture.
    const el = controls.domElement;
    const interrupt = () => this.cancel(true);
    el.addEventListener('pointerdown', interrupt, { capture: true });
    el.addEventListener('wheel', interrupt, { capture: true, passive: true });
  }

  get isFlying() {
    return this.flight !== null;
  }

  /**
   * Animate to a new camera position / orbit target.
   * @param {{position: THREE.Vector3, target: THREE.Vector3, fov?: number}} view
   * @param {number} [duration] seconds
   * @returns {Promise<boolean>} resolves true when finished, false if cancelled
   */
  flyTo(view, duration = 1.0) {
    this.cancel(false);
    this.#clearInertia();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return new Promise((resolve) => {
      this.flight = {
        fromPos: this.camera.position.clone(),
        fromTarget: this.controls.target.clone(),
        toPos: view.position.clone(),
        toTarget: view.target.clone(),
        fromFov: this.camera.fov,
        toFov: view.fov ?? this.camera.fov,
        start: performance.now(),
        duration: reduceMotion ? 0.001 : duration * 1000,
        resolve,
      };
      this.controls.enabled = false;
    });
  }

  /** Jump without animation (used on resize). */
  jumpTo(view) {
    this.cancel(false);
    this.#clearInertia();
    this.camera.position.copy(view.position);
    this.controls.target.copy(view.target);
    if (view.fov && view.fov !== this.camera.fov) {
      this.camera.fov = view.fov;
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
  }

  /**
   * Drop any leftover damping momentum from a previous drag, otherwise it is
   * applied after the flight and nudges the camera off the planned view.
   * (OrbitControls has no public API for this; fields exist since r16x.)
   */
  #clearInertia() {
    const c = this.controls;
    c._sphericalDelta?.set(0, 0, 0);
    c._panOffset?.set(0, 0, 0);
    if ('_scale' in c) c._scale = 1;
  }

  cancel(byUser = false) {
    if (!this.flight) return;
    const { resolve } = this.flight;
    this.flight = null;
    this.controls.enabled = true;
    this.controls.update();
    resolve(false);
    if (byUser) this.onCancel?.();
  }

  /** Call once per frame. Returns true while a flight is in progress. */
  update(now = performance.now()) {
    const f = this.flight;
    if (!f) return false;
    const t = Math.min(1, (now - f.start) / f.duration);
    const k = easeInOutCubic(t);
    this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
    this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
    if (f.fromFov !== f.toFov) {
      this.camera.fov = THREE.MathUtils.lerp(f.fromFov, f.toFov, k);
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this.controls.target);
    if (t >= 1) {
      this.flight = null;
      this.controls.enabled = true;
      this.controls.update();
      f.resolve(true);
    }
    return true;
  }
}
