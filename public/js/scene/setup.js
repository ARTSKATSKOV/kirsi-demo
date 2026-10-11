/**
 * setup.js — renderer, scene, camera, lights, orbit controls and resize
 * handling. Nothing here knows about the floor plan itself.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { M } from '../theme.js';

const MAX_PIXEL_RATIO = 2;

export function createStage(container) {
  const isSmall = Math.min(window.innerWidth, window.innerHeight) < 600;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0); // CSS gradient shows through (see style.css)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // soft PCF is the default in r18x (PCFSoft was removed)
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = null; // transparent: the page gradient is the backdrop

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 250);

  // ── Lights: soft sky/ground fill + one warm sun with modest shadows ──
  const hemi = new THREE.HemisphereLight(M.hemiSky, M.hemiGround, M.hemi);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(M.sunColor, M.sun);
  sun.position.set(-9, 18, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isSmall ? 1024 : 2048, isSmall ? 1024 : 2048);
  const s = sun.shadow.camera;
  s.left = -13; s.right = 13; s.top = 13; s.bottom = -13; s.near = 1; s.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 6;
  sun.shadow.blurSamples = 12;
  scene.add(sun, sun.target);

  // ── Controls ──
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = THREE.MathUtils.degToRad(8);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(78); // never below the floor
  controls.minDistance = 5;
  controls.maxDistance = 70;
  controls.screenSpacePanning = false; // pan on the ground plane
  controls.zoomSpeed = 0.9;

  return { renderer, scene, camera, controls, lights: { hemi, sun } };
}

/** Keeps the renderer and camera in sync with the container size. */
export function watchResize(container, renderer, camera, onResize) {
  const apply = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    onResize?.(w, h);
  };
  new ResizeObserver(apply).observe(container);
  window.addEventListener('orientationchange', apply);
  apply();
}
