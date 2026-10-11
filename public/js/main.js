/**
 * main.js — the 3D viewer, loaded by boot.js only when WebGL 2 is available
 * (boot.js shows a fallback if startViewer() throws). Wires plan data →
 * scene builders → interaction.
 *
 * Click a room (3D, chip, tag or schedule row) → camera flies to a per-room
 * viewpoint, blocking walls are lowered and the detail card opens. Reset
 * (button, card close, Escape, empty click) flies back to the overview.
 * All selection changes go through selectRoom() / resetView(), and the view
 * state (3D / floor plan, day / night) through setViewMode() and
 * setTimeOfDay(), so 3D scene, chips, tags, card and the toggle buttons
 * always stay in sync. Rendering is on demand (see requestRender()) and
 * paused while another section is shown.
 *
 * First visit: a coach mark ("Drag to explore · click a room") and a slow
 * auto-rotation of the overview show that the model is 3D. Both stop for
 * good on the first interaction (see the "Intro" block).
 */
import * as THREE from 'three';
import * as PLAN from './data/plan.js';
import { app } from './app.js';
import { createStage, watchResize } from './scene/setup.js';
import { computeFraming, safeRectFromInsets, viewDirection, minFrameRect, MIN_FRAME } from './scene/framing.js';
import { CameraRig } from './scene/cameraRig.js';
import { WallCutaway } from './scene/cutaway.js';
import { buildFloors, setActiveFloor } from './scene/floors.js';
import { applySelection, applyHover, updateRoomHighlight, setHighlightInstant } from './scene/rooms.js';
import { buildSurroundings } from './scene/surroundings.js';
import { DayNight } from './scene/dayNight.js';
import { setupPicking } from './interaction/picking.js';
import { RoomCard } from './ui/roomCard.js';
import { RoomChips } from './ui/chips.js';
import { RoomTags } from './ui/roomTags.js';
import { measureInsets, panelRects } from './ui/layout.js';
import { INTRO, HINT_KEY, introSwing } from './scene/intro.js';

const plan = {
  floors: PLAN.FLOORS,
  footprint: PLAN.FOOTPRINT,
  wallSettings: PLAN.WALL_SETTINGS,
  openingDefaults: PLAN.OPENING_DEFAULTS,
  walls: PLAN.WALLS,
  rooms: PLAN.ROOMS,
};

const FLY_DURATION = 1.2; // seconds
/** Camera settings per view mode. Floor plan = near top-down with a narrow
 *  FOV, which reads almost like an orthographic plan while keeping one camera. */
const VIEW_MODES = {
  '3d': { fov: 35, minPolar: 8, maxPolar: 78 },
  plan: { fov: 20, polar: 0.3, azimuth: 0, minPolar: 0, maxPolar: 0.5 },
};

/**
 * Builds the scene and starts the render loop. Throws (→ boot.js fallback)
 * if the WebGL renderer cannot be created. Resolves after the first frames.
 */
export function startViewer() {
  const container = document.getElementById('viewport');
  const { renderer, scene, camera, controls, lights } = createStage(container); // throws without WebGL

  let needsRender = true;
  /** Schedules one frame (the loop only renders when something changed). */
  const requestRender = () => (needsRender = true);

  // ── Build the property ────────────────────────────────────────────────
  // Everything lives under `property`, shifted so house + garden are centred
  // on the world origin (keeps orbiting and framing simple).
  const property = new THREE.Group();
  property.name = 'property';
  const { floors, rooms, wallGroups } = buildFloors(plan);
  property.add(buildSurroundings(plan));
  for (const f of floors.values()) property.add(f.group);
  scene.add(property);

  const elevationOf = (floorId) => floors.get(floorId)?.data.elevation ?? 0;

  const bounds = new THREE.Box3(); // plan coordinates (all rooms incl. garden)
  for (const r of plan.rooms) {
    bounds.expandByPoint(new THREE.Vector3(r.rect.x, 0, r.rect.z));
    bounds.expandByPoint(new THREE.Vector3(r.rect.x + r.rect.w, PLAN.WALL_SETTINGS.height, r.rect.z + r.rect.d));
  }
  const center = bounds.getCenter(new THREE.Vector3());
  property.position.set(-center.x, 0, -center.z);
  property.updateMatrixWorld(true);

  /** World-space box framed in the overview of a floor (house + garden). */
  function overviewBox(floorId) {
    const box = bounds.clone().translate(property.position);
    box.max.y = elevationOf(floorId) + PLAN.WALL_SETTINGS.height;
    return box;
  }

  // Keep panning within the property so it can't be lost off-screen; the
  // orbit target stays on the active floor's plane.
  const size = bounds.getSize(new THREE.Vector3());
  const panX = size.x / 2 + 3;
  const panZ = size.z / 2 + 3;
  let targetY = 0;
  controls.addEventListener('change', () => {
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -panX, panX);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -panZ, panZ);
    controls.target.y = targetY;
    requestRender();
  });

  const rig = new CameraRig(camera, controls);
  const cutaway = new WallCutaway(wallGroups);
  const dayNight = new DayNight({ scene, renderer, lights });
  dayNight.onProgress = (k) => { document.documentElement.style.setProperty('--night', String(k)); };

  const stats = PLAN.propertyStats();
  const unitLabel = `Unit ${PLAN.UNIT.id}`;

  // ── Framing helpers ───────────────────────────────────────────────────
  let viewW = 1;
  let viewH = 1;
  const isPortrait = () => viewH > viewW * 1.1;

  /**
   * Free screen area between the UI panels, as an NDC rect. Panels are
   * measured from the DOM (see ui/layout.js); a minimum margin is kept.
   */
  function freeArea() {
    const m = measureInsets(viewW, viewH);
    const min = 12;
    const insets = { top: Math.max(m.top, min), right: Math.max(m.right, min), bottom: Math.max(m.bottom, min), left: Math.max(m.left, min) };
    // Never let panels squeeze the model into a sliver (tiny / odd viewports).
    if (viewW - insets.left - insets.right < viewW * 0.3) insets.left = insets.right = viewW * 0.05;
    if (viewH - insets.top - insets.bottom < viewH * 0.3) insets.top = insets.bottom = viewH * 0.05;
    return safeRectFromInsets(insets, viewW, viewH);
  }

  function overviewFraming() {
    const planY = elevationOf(activeFloor);
    if (viewMode === 'plan') {
      const box = overviewBox(activeFloor);
      box.max.y = planY + 0.2; // frame the floor outline, not the wall tops
      return computeFraming(camera, box, { ...VIEW_MODES.plan, fill: 0.9, safe: freeArea(), planeY: planY });
    }
    const angles = isPortrait() ? PLAN.OVERVIEW_VIEW_PORTRAIT : PLAN.OVERVIEW_VIEW;
    return computeFraming(camera, overviewBox(activeFloor), {
      ...angles,
      fill: isPortrait() ? 0.97 : 0.94,
      safe: freeArea(),
      planeY: planY,
      fov: VIEW_MODES['3d'].fov,
    });
  }

  function roomAngles(room) {
    if (viewMode === 'plan') return { azimuth: VIEW_MODES.plan.azimuth, polar: VIEW_MODES.plan.polar };
    const v = { ...PLAN.DEFAULT_ROOM_VIEW, ...(room.view || {}) };
    if (isPortrait() && !room.view) v.azimuth *= 0.5; // less diagonal on tall screens
    return v;
  }

  function roomFraming(room) {
    // Small rooms (bath, WC, wardrobe) are framed as if they were at least
    // MIN_FRAME across, centred on the room, so the flight keeps enough of the
    // apartment around them to show where they are.
    const { x, z, w, d } = minFrameRect(room.rect, MIN_FRAME[viewMode]);
    const elev = elevationOf(PLAN.floorOf(room));
    const box = new THREE.Box3(new THREE.Vector3(x, elev, z), new THREE.Vector3(x + w, elev + 1.2, z + d)).translate(property.position);
    // The card is already open here, so freeArea() accounts for it.
    const safe = freeArea();
    // Aim for a room ~360 px across, within 50–75 % of the free area: small
    // screens fill more, large free areas keep more context around the room.
    const minFree = Math.min(((safe.x1 - safe.x0) / 2) * viewW, ((safe.y1 - safe.y0) / 2) * viewH);
    const fill = room.outdoor ? 0.95 : THREE.MathUtils.clamp(360 / minFree, 0.5, 0.75);
    return computeFraming(camera, box, { ...roomAngles(room), fill, safe, planeY: elev, fov: VIEW_MODES[viewMode].fov });
  }

  // ── State ─────────────────────────────────────────────────────────────
  let selectedId = null;
  let activeFloor = PLAN.FLOORS[0].id;
  let viewMode = '3d';
  let shadowsDirty = true; // shadow map needs a re-render (see render loop)
  let userMovedSinceFraming = false; // re-frame on resize only if the user didn't take over
  let lastOpener = null; // element that opened the room card (focus returns there)
  let blockersTimer = 0;

  const card = new RoomCard(document.getElementById('room-card'), {
    floorName: `${unitLabel} · Floor ${PLAN.UNIT.floor}`,
    unitArea: stats.areaM2,
    onClose: () => resetView(),
  });
  const resetButton = document.getElementById('reset-view');

  /** Chips = rooms of the active floor (in CHIP_ORDER) + outdoor spaces. */
  const chipRoomsFor = (floorId) =>
    PLAN.CHIP_ORDER.map((id) => rooms.get(id))
      .filter((e) => e && (e.floorId === floorId || e.data.outdoor))
      .map((e) => e.data);
  const chips = new RoomChips(document.querySelector('[data-chips]'), chipRoomsFor(activeFloor), (id) => selectRoom(id), (id) => setHover(id));

  const tagsEl = document.getElementById('room-tags');
  const tags = new RoomTags(
    tagsEl,
    plan.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      short: r.short,
      area: r.rect.w * r.rect.d,
      floorId: PLAN.floorOf(r),
      outdoor: !!r.outdoor,
      checkOcclusion: !!r.outdoor, // the garden can sit behind the house (first-floor view)
      anchor: property.localToWorld(
        new THREE.Vector3(
          r.rect.x + (r.tagAt ? r.tagAt.x : r.rect.w / 2),
          elevationOf(PLAN.floorOf(r)) + 0.1,
          r.rect.z + (r.tagAt ? r.tagAt.z : r.rect.d / 2),
        ),
      ),
    })),
    (id) => selectRoom(id),
    (id) => setHover(id),
  );

  // ── Linked hover ─────────────────────────────────────────────────────
  // One hover state for the model, the room schedule, the chips and the
  // room tags. Mouse only (every source ignores touch / pen), and it never
  // moves the camera: it only paints.
  let hoverId = null;
  function setHover(id) {
    const entry = id ? rooms.get(id) : null;
    // Rooms of another floor (seen through the stairwell) aren't hoverable.
    if (entry && entry.floorId !== activeFloor && !entry.data.outdoor) id = null;
    if (!entry) id = null;
    if (id === hoverId) return;
    hoverId = id;
    applyHover(rooms, id);
    chips.setHover(id);
    app.schedule.setHover?.(id);
    tags.setHover(id);
    renderer.domElement.style.cursor = id ? 'pointer' : '';
    requestRender();
  }

  // Occlusion test for outdoor tags: a ray from the camera to the anchor that
  // hits visible geometry of another room / a wall first means "hidden".
  const tagRay = new THREE.Raycaster();
  const floorGroups = [...floors.values()].map((f) => f.group);
  const isShown = (o) => {
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  tags.setOcclusionTest((item) => {
    const dir = item.anchor.clone().sub(camera.position);
    const dist = dir.length();
    tagRay.set(camera.position, dir.normalize());
    tagRay.far = dist - 0.05;
    return tagRay.intersectObjects(floorGroups, true).some((h) => isShown(h.object) && h.object.userData.roomId !== item.id);
  });

  /** Tree canopies (hidden in floor-plan mode). */
  const canopies = [];
  property.traverse((o) => o.userData.canopy && canopies.push(o));

  function cardEyebrow(room) {
    if (room.outdoor) return `Outdoor · ${unitLabel}`;
    return `${unitLabel} · Concept layout`;
  }

  // ── Toggle buttons (desktop + mobile share data-* attributes) ─────────
  function syncButtons(attr, value) {
    for (const b of document.querySelectorAll(`button[data-${attr}]`)) {
      b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
    }
  }
  // Only real toggle buttons count. View state is mirrored on <body> under
  // different names (data-active-view / data-active-time), so closest() can
  // never climb to <body> and treat any click as a toggle.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-floor],button[data-view],button[data-time]');
    if (!b) return;
    if (b.dataset.floor) setFloor(b.dataset.floor);
    else if (b.dataset.view) setViewMode(b.dataset.view);
    else if (b.dataset.time) setTimeOfDay(b.dataset.time);
  });

  /** Warm night lights: one per visible room (garden patio included). */
  function placeRoomLights() {
    const positions = [];
    for (const entry of rooms.values()) {
      const r = entry.data;
      if (entry.floorId !== activeFloor && !r.outdoor) continue;
      const y = r.outdoor ? 2.2 : elevationOf(entry.floorId) + 2.1;
      const c = r.outdoor && r.zones?.[0] ? r.zones[0].rect : r.rect;
      const rx = r.outdoor && r.zones?.[0] ? r.rect.x + c.x : c.x;
      const rz = r.outdoor && r.zones?.[0] ? r.rect.z + c.z : c.z;
      positions.push(property.localToWorld(new THREE.Vector3(rx + c.w / 2, y, rz + c.d / 2)));
    }
    dayNight.placeRoomLights(positions);
  }

  // ── Floor / view mode / time of day ───────────────────────────────────
  /**
   * Switches the visible floor. Ground = upper floor hidden; First = ground
   * floor reduced to a solid base below the (cut-away) first floor.
   */
  function setFloor(id, { animate = true, reframe = true, force = false } = {}) {
    if (!floors.has(id)) return Promise.resolve(false);
    const changed = id !== activeFloor;
    if (!changed && !force) return Promise.resolve(true); // no-op: keep camera, chips and focus
    activeFloor = id;
    targetY = elevationOf(id);
    setActiveFloor(floors, id);
    tags.setFilter((it) => it.floorId === id || it.outdoor);
    chips.setRooms(chipRoomsFor(id));
    chips.setActive(selectedId);
    syncButtons('floor', id);
    placeRoomLights();
    shadowsDirty = true;
    requestRender();
    if (!reframe) return Promise.resolve(true);
    const sel = rooms.get(selectedId);
    if (sel && (sel.floorId === id || sel.data.outdoor) && !changed) return Promise.resolve(true);
    return resetView({ animate });
  }

  /** 3D dollhouse ↔ top-down floor plan (rotation off, zoom/pan on). */
  function setViewMode(mode, { animate = true } = {}) {
    if (!VIEW_MODES[mode]) return Promise.resolve(false);
    if (mode === viewMode) return Promise.resolve(true); // no-op
    stopIntro();
    viewMode = mode;
    const m = VIEW_MODES[mode];
    controls.enableRotate = mode === '3d';
    controls.minPolarAngle = THREE.MathUtils.degToRad(m.minPolar);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(m.maxPolar);
    tags.setDetailed(mode === 'plan');
    for (const c of canopies) c.visible = mode === '3d';
    lights.sun.castShadow = mode === '3d'; // a clean, shadow-free drawing in plan mode
    shadowsDirty = true;
    syncButtons('view', mode);
    document.body.dataset.activeView = mode;
    requestRender();
    const entry = rooms.get(selectedId);
    if (entry) {
      selectedId = null; // force re-framing of the same room in the new mode
      return selectRoom(entry.data.id, { animate });
    }
    return resetView({ animate });
  }

  function setTimeOfDay(mode, { animate = true } = {}) {
    if (mode === dayNight.mode && document.body.dataset.activeTime === mode) return;
    dayNight.set(mode, { animate });
    syncButtons('time', mode);
    document.body.dataset.activeTime = mode;
    requestRender();
  }

  // ── Selection ─────────────────────────────────────────────────────────
  function selectRoom(id, { animate = true } = {}) {
    const entry = rooms.get(id);
    if (!entry) return resetView({ animate });
    if (id === selectedId && !userMovedSinceFraming) return Promise.resolve(true);
    stopIntro();

    // Auto-switch to the room's floor (outdoor rooms are visible from any floor).
    if (entry.floorId !== activeFloor && !entry.data.outdoor) setFloor(entry.floorId, { reframe: false });

    const opener = document.activeElement;
    if (opener instanceof HTMLElement && opener !== document.body && !card.el.contains(opener)) lastOpener = opener;
    selectedId = id;
    applySelection(rooms, id);
    card.show(entry.data, cardEyebrow(entry.data));
    chips.setActive(id);
    app.schedule.setActive(id);
    requestRender();
    tags.setFocus(id); // only the selected room's tag (name + area) stays up
    // The card is open now: keep the tag off it (again once its slide-in is done).
    tags.setBlockers(panelRects());
    clearTimeout(blockersTimer);
    blockersTimer = setTimeout(() => tags.setBlockers(panelRects()), 450);
    tags.setVisible(true);
    document.body.classList.add('has-selection');

    const angles = roomAngles(entry.data);
    if (viewMode === '3d') cutaway.focus(entry.data.rect, viewDirection(angles.azimuth, angles.polar), entry.floorId);
    else cutaway.focus(null); // walls are seen from above in plan mode
    userMovedSinceFraming = false;
    const view = roomFraming(entry.data);
    if (!animate) {
      rig.jumpTo(view);
      cutaway.finish();
      return Promise.resolve(true);
    }
    return rig.flyTo(view, FLY_DURATION);
  }

  function resetView({ animate = true } = {}) {
    const focusInCard = card.el.contains(document.activeElement);
    const wasSelected = selectedId;
    selectedId = null;
    applySelection(rooms, null);
    card.hide();
    chips.setActive(null);
    app.schedule.setActive(null);
    if (wasSelected) tags.setVisible(false); // all tags fade back in once the camera is home
    tags.setFocus(null);
    clearTimeout(blockersTimer);
    tags.setBlockers(panelRects());
    requestRender();
    // Keyboard users: closing the card must not drop focus to <body>.
    if (focusInCard || (wasSelected && document.activeElement === document.body)) {
      const back = lastOpener?.isConnected && lastOpener.offsetParent !== null ? lastOpener : chips.buttons.get(wasSelected) || resetButton;
      back?.focus({ preventScroll: true });
    }
    document.body.classList.remove('has-selection');
    cutaway.focus(null);
    userMovedSinceFraming = false;
    const view = overviewFraming();
    const showTags = (done) => {
      if (!selectedId) tags.setVisible(true); // also after a cancelled flight
      return done;
    };
    if (!animate) {
      rig.jumpTo(view);
      cutaway.finish();
      return Promise.resolve(showTags(true));
    }
    return rig.flyTo(view, FLY_DURATION).then(showTags);
  }

  resetButton.addEventListener('click', () => {
    stopIntro();
    resetView();
  });
  window.addEventListener('keydown', (e) => {
    // Only in the 3D section and only when something is selected (Escape
    // must not throw away a view the user rotated / zoomed to).
    if (e.key === 'Escape' && app.section === 'apartment' && selectedId) resetView();
  });
  controls.addEventListener('start', () => {
    userMovedSinceFraming = true;
    stopIntro(); // first drag / wheel / pinch ends the intro for good
  });

  // ── Intro: coach mark + slow auto-rotation until the first interaction ──
  const reduceMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  setHighlightInstant(reduceMotion); // highlight fades only with motion allowed
  const coachEl = document.getElementById('coach');
  const intro = { on: !reduceMotion, done: false, wait: INTRO.delay, elapsed: 0, t: 0, offset: 0 };
  let coachShown = false;
  let coachTimer = 0;
  const storage = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  function showCoach() {
    if (coachShown || intro.done || selectedId || !coachEl || app.section !== 'apartment') return;
    if (storage.get(HINT_KEY)) return; // shown once per browser
    coachShown = true;
    storage.set(HINT_KEY, '1');
    coachEl.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => coachEl.classList.add('is-visible')));
    coachTimer = setTimeout(hideCoach, INTRO.coachMs);
  }
  function hideCoach() {
    clearTimeout(coachTimer);
    if (!coachEl || coachEl.hidden) return;
    coachEl.classList.remove('is-visible');
    setTimeout(() => (coachEl.hidden = true), 320);
  }
  function stopIntro() {
    hideCoach();
    if (intro.done) return;
    intro.done = true;
    intro.on = false;
    if (controls.autoRotate) controls._sphericalDelta?.set(0, 0, 0); // hand over crisply, no auto-rotate coast (cf. CameraRig)
    controls.autoRotate = false;
  }
  /** Restart the swing from the (re)framed overview (e.g. after a resize). */
  function restartSwing() {
    intro.elapsed = intro.t = intro.offset = 0;
  }
  /**
   * Called once per frame before controls.update(). Drives OrbitControls'
   * own autoRotate so damping, polar limits and the pan clamp all still
   * apply; its 'change' events keep the on-demand renderer (and room tags)
   * updating while it turns. Returns the delta time to pass to update().
   */
  function stepIntro(dt) {
    if (!intro.on || rig.isFlying || viewMode !== '3d' || selectedId || dt <= 0) {
      controls.autoRotate = false;
      return null;
    }
    if (intro.wait > 0) {
      intro.wait -= dt;
      return null;
    }
    intro.elapsed += dt;
    const k = Math.min(1, intro.elapsed / INTRO.rampIn);
    intro.t += dt * k * k * (3 - 2 * k); // smoothstep ease-in
    const next = introSwing(intro.t);
    const delta = THREE.MathUtils.degToRad(next - intro.offset);
    intro.offset = next;
    // OrbitControls turns by -(2π/60 · speed · dt) per update (rotateLeft).
    controls.autoRotate = true;
    controls.autoRotateSpeed = -delta / ((2 * Math.PI / 60) * dt);
    return dt;
  }

  /**
   * Wall hits have no roomId: pick the room of the wall's floor whose
   * rectangle contains the hit point (walls straddle room edges, so allow a
   * small margin) and whose centre is closest. Null for walls with no room.
   */
  function resolveWallHit(worldPoint, object) {
    const floorId = object?.userData.floorId ?? activeFloor;
    if (floorId !== activeFloor) return null; // base walls of a lower floor
    const p = property.worldToLocal(worldPoint.clone());
    const margin = PLAN.WALL_SETTINGS.exterior / 2 + 0.01;
    let best = null;
    let bestDist = Infinity;
    for (const r of plan.rooms) {
      if (r.outdoor || PLAN.floorOf(r) !== floorId) continue;
      const { x, z, w, d } = r.rect;
      if (p.x < x - margin || p.x > x + w + margin || p.z < z - margin || p.z > z + d + margin) continue;
      const dist = Math.hypot(p.x - (x + w / 2), p.z - (z + d / 2));
      if (dist < bestDist) {
        bestDist = dist;
        best = r.id;
      }
    }
    return best;
  }

  setupPicking({
    canvas: renderer.domElement,
    camera,
    targets: [...floors.values()].map((f) => f.group),
    resolveWallHit,
    onHover: (id) => setHover(id),
    onPick: (id) => {
      // Lower-floor rooms seen through the stairwell aren't clickable.
      const entry = rooms.get(id);
      if (entry && entry.floorId !== activeFloor && !entry.data.outdoor) id = null;
      return id ? selectRoom(id) : selectedId && resetView(); // empty space = reset
    },
  });

  // ── Resize ────────────────────────────────────────────────────────────
  watchResize(container, renderer, camera, (w, h) => {
    viewW = w;
    viewH = h;
    tags.setBlockers(panelRects());
    requestRender();
    if (userMovedSinceFraming || rig.isFlying) return;
    const entry = rooms.get(selectedId);
    rig.jumpTo(entry ? roomFraming(entry.data) : overviewFraming());
    if (!entry) restartSwing();
  });

  setFloor(activeFloor, { reframe: false, force: true });
  document.body.dataset.activeView = viewMode;
  document.body.dataset.activeTime = dayNight.mode;

  // ── Render loop ───────────────────────────────────────────────────────
  // On demand: the loop ticks every animation frame but only renders when
  // needsRender is set (OrbitControls 'change', flights, cut-away and
  // day/night animations, selection / mode changes, hover, resize), and not
  // at all while Floors / Timeline is shown (the canvas is hidden then).
  // rAF itself stops in background tabs. The shadow map is only re-rendered
  // when geometry changed.
  renderer.shadowMap.autoUpdate = false;
  let frames = 0;
  let lastTime = performance.now();
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));
  renderer.setAnimationLoop((time) => {
    const dt = Math.min((time - lastTime) / 1000, 0.1); // seconds, clamped after tab switches
    lastTime = time;
    if (app.section !== 'apartment' && frames >= 3) return; // canvas hidden: skip
    if (rig.update()) needsRender = true;
    else controls.update(stepIntro(dt)); // emits 'change' (→ requestRender) while moving / damping / auto-rotating
    if (cutaway.update(dt)) needsRender = true;
    if (updateRoomHighlight(rooms, dt || 1 / 60)) needsRender = true; // hover / selection fades
    if (dayNight.update(dt)) needsRender = true;
    camera.updateMatrixWorld();
    tags.update(camera, viewW, viewH); // no-op unless the camera / layout changed
    if (shadowsDirty || cutaway.dirty) {
      renderer.shadowMap.needsUpdate = true;
      shadowsDirty = cutaway.dirty = false;
      needsRender = true;
    }
    if (needsRender || frames < 3) {
      needsRender = false;
      renderer.render(scene, camera);
      if (++frames === 3) {
        window.__ready = true; // used by the screenshot / e2e scripts
        window.dispatchEvent(new Event('viewer-ready'));
        resolveReady(true);
        revealTags();
        setTimeout(showCoach, 700); // after the loader has faded out
      }
    }
  });

  /**
   * Room tags start hidden (class is-booting in index.html) and fade in only
   * once the camera is framed and the web fonts are in, so they never appear
   * at a wrong spot or with a stale width while the loader fades out.
   */
  function revealTags() {
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    const timeout = new Promise((r) => setTimeout(r, 2500));
    Promise.race([fontsReady, timeout]).then(() => {
      tags.remeasure();
      requestRender();
      // two frames: the loop re-lays the tags out before they fade in
      requestAnimationFrame(() => requestAnimationFrame(() => tagsEl.classList.remove('is-booting')));
    });
  }
  document.fonts?.addEventListener?.('loadingdone', () => {
    tags.remeasure();
    requestRender();
  });

  app.viewer = {
    selectRoom: (id) => selectRoom(id),
    resetView: (opts) => resetView(opts),
    setHover: (id) => setHover(id),
    /** Called by boot.js on every section change. */
    onSection(id) {
      if (id !== 'apartment') return;
      requestRender();
      if (window.__ready) setTimeout(showCoach, 300); // deep link to #floors: show on the first visit to 3D
    },
  };

  // Debug hooks (console + automated screenshots / e2e), only with ?debug.
  // Each returns a promise that resolves when the camera flight has finished.
  if (app.debug) {
  window.__selectRoom = (id, opts) => (id ? selectRoom(id, opts) : resetView(opts));
  window.__resetView = resetView;
  window.__setFloor = setFloor;
  window.__setView = setViewMode;
  window.__setTime = setTimeOfDay;
  window.__floorplan = {
    scene, camera, controls, renderer, rooms, floors, plan, rig, cutaway, dayNight, requestRender,
    get intro() {
      return { on: intro.on, done: intro.done, offset: intro.offset, reduceMotion };
    },
    get state() {
      return { selectedId, activeFloor, viewMode, time: dayNight.mode, hoverId };
    },
  };
  }
  return ready;
}
