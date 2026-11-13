import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  buildOutpostHeightField,
  COLLIDE_STEP_HEIGHT,
  isOutpostBlocked,
  sampleOutpostTop,
} from './outpostCollision.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// The rover asset is a single skinned mesh, so a plain Object3D.clone() would
// leave every copy sharing one skeleton. SkeletonUtils rebuilds the bone rig.
import { clone as cloneSkinnedRig } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadDownscaledTexture } from '../../utils/textureUtils';

// ─── Player camera ───────────────────────────────────────────────────────────
// One camera for the whole game. The same look, eye height and gait are used on
// the lunar surface and inside every outpost component, so stepping through an
// airlock never changes how the player sees or moves. Everything that measures
// the view from the player's eyes reads this object — change `height` here (or
// call engine.setPlayerCameraHeight()) and the surface, the airlock, the
// greenhouse, workshop, habitats and the command center all follow.
// Scale: an eye height of 3.2 units is roughly 1.7 m, so one unit ≈ half a metre.
export const PLAYER_CAMERA = {
  height: 4.2, // eye height above whatever the player stands on
  minHeight: 0.5, // guard rails for setPlayerCameraHeight()
  maxHeight: 40,
  walkSpeed: 2, // slow, deliberate ~1 m/s lunar shuffle
  sprintSpeed: 10, // shift run, about lunar-rover pace
  acceleration: 8, // suit + regolith inertia: ease into the target speed
  deceleration: 6, // and glide to a stop instead of snapping
  gravity: 3.1, // ~1.6 m/s^2 — the Moon's surface gravity
  jumpSpeed: 3.6, // apex ~2 units (~1 m), ~2.3 s of air
  pitchLimit: 1.45, // radians of look up/down travel
};

// Final world-space height for remote crew avatars; adjust this to resize them.
export const CREW_AVATAR_HEIGHT = 0.05;
// Correct the model's forward axis so its face follows the first-person view.
export const CREW_AVATAR_FORWARD_OFFSET = Math.PI;

// Module-level caches: raw asset buffers loaded once to prevent memory leaks and repeated downloads
const ASSET_CACHE = {
  skyTexture: null,
  earthTextures: null,
  apollo12Geo: null,
  apollo16Geo: null,
  gltfs: new Map(), // path -> gltf.scene clone source
};

// sci-fi_lab.glb uses KHR_draco_mesh_compression. Keep these decoder assets in
// public/draco so their URLs are stable in both Vite development and production.
const sharedDracoLoader = new DRACOLoader();
sharedDracoLoader.setDecoderPath('/draco/');
const sharedGltfLoader = new GLTFLoader().setDRACOLoader(sharedDracoLoader);
const sharedStlLoader = new STLLoader();
let crewAstronautAssetPromise = null;

function loadCrewAstronautAsset() {
  if (!crewAstronautAssetPromise) {
    crewAstronautAssetPromise = new Promise((resolve, reject) => {
      sharedGltfLoader.load(encodeURI('/lunar/Walking astronaut.glb'), (gltf) => {
        registerCachedScene(gltf.scene);
        resolve(gltf);
      }, undefined, reject);
    });
  }
  return crewAstronautAssetPromise;
}

const OUTPOST_COMPONENT_NAMES = {
  '000': 'TUNNEL JUNCTION',
  '001': 'CYLINDER HABITAT',
  '002': 'INFLATABLE HABITAT',
  '003': 'OBSERVATION CUPOLA',
  '004': 'REGOLITH SHIELDED HABITAT',
  '005': 'AIRLOCK',
  '006': 'CONNECTING TUNNEL',
  '007': 'TUNNEL JUNCTION',
  '008': 'GREENHOUSE',
  '009': 'MEDICAL MODULE',
  '010': 'WORKSHOP',
  '011': 'SOLAR ARRAY',
  '012': 'SOLAR TRACKER ARRAY',
  '013': 'SOLAR TOWER',
  '014': 'RADIATOR BANK',
  '015': 'BATTERY CONTAINER',
  '016': 'NUCLEAR POWER UNIT',
  '017': 'COMMUNICATIONS MAST',
  '018': 'REGOLITH EXCAVATOR',
  '019': 'OPEN ROVER',
  '020': 'PRESSURIZED ROVER',
  '021': 'EVA SUIT',
  '022': 'EQUIPMENT SLED',
  '023': 'SURVEY MARKERS',
  '025': 'REGOLITH PLANT'
};
const NON_ENTERABLE_COMPONENT_IDS = new Set([
  '000', '005', '006', '007', '011', '012', '013', '014', '015', '016',
  '017', '018', '019', '020', '021', '022', '023',
]);

function loadCachedGLTF(path, onLoad, onProgress, onError) {
  if (ASSET_CACHE.gltfs.has(path)) {
    onLoad(ASSET_CACHE.gltfs.get(path).clone(true));
    return;
  }
  sharedGltfLoader.load(
    path,
    gltf => {
      registerCachedScene(gltf.scene);
      ASSET_CACHE.gltfs.set(path, gltf.scene);
      onLoad(gltf.scene.clone(true));
    },
    onProgress,
    onError
  );
}

// GPU resources owned by the persistent GLTF cache must survive engine
// destroy() — disposing them would force expensive re-uploads next session.
const cachedGeometries = new WeakSet();
const cachedMaterials = new WeakSet();
const cachedTextureImages = new WeakSet();

function registerCachedScene(sceneRoot) {
  sceneRoot.traverse(object => {
    if (object.geometry) cachedGeometries.add(object.geometry);
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        cachedMaterials.add(material);
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'specularMap']) {
          if (material[key]?.image) cachedTextureImages.add(material[key].image);
        }
      }
    }
  });
}

function scheduleIdle(task) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 20000 });
  } else {
    window.setTimeout(task, 2500);
  }
}

export function createLunarEngine(canvas, callbacks = {}) {
  const {
    onLoading = () => { },
    onModeChange = () => { },
    onRoverReady = () => { },
    onRoverCameraChange = () => { },
    onEarthToggleChange = () => { },
    onPromptChange = () => { },
    onInsidePanelChange = () => { },
    onTaskAction = () => { },
    onTaskTimerClick = () => { },
    onConsoleEdit = () => { },
    onSceneReady = () => { },
    onInitialCameraSettled = () => { },
  } = callbacks;

  let isDestroyed = false;
  let animId = null;
  let sceneReadyReported = false;
  let initialCameraSettledReported = false;
  let skyAssetReady = Boolean(ASSET_CACHE.skyTexture);
  let earthAssetsReady = Boolean(ASSET_CACHE.earthTextures);

  // Scene setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080d14);

  const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 14000);
  camera.position.set(170, 220, 360);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = true;
  controls.minDistance = 35;
  controls.maxDistance = 900;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(180, 0, 0);
  controls.update();

  // The establishing shot should only be replaced by the outpost framing if
  // the player hasn't taken over the camera while the base was loading.
  let freeCameraAdjusted = false;
  controls.addEventListener('start', () => { freeCameraAdjusted = true; });

  let earthMesh = null;
  let closeupEarthMesh = null;
  let earthViewActive = false;
  let savedEarthMaxPolarAngle = controls.maxPolarAngle;
  let savedEarthFov = camera.fov;
  let savedEarthScale = 1;
  const savedEarthViewPosition = new THREE.Vector3();
  const savedEarthViewTarget = new THREE.Vector3();

  const keys = new Set();
  // Physical-key aliases: keyboard layout switches (including the Shift combos
  // that flip layouts) can make event.key differ between a press and its
  // release, which used to leave movement keys stuck "held" and the camera
  // gliding after the player stopped. event.code always names the same
  // physical key, so presses and releases stay paired in any layout.
  const KEY_CODE_ALIASES = {
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
    ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright',
    ShiftLeft: 'shift', ShiftRight: 'shift',
  };
  const releaseAllKeys = () => keys.clear();
  const firstPersonStart = new THREE.Vector3();
  // Ground level under firstPersonStart, kept apart from the eye height so the
  // spawn point follows PLAYER_CAMERA.height when it changes at runtime.
  let firstPersonStartGroundY = 0;
  const firstPersonLookAt = new THREE.Vector3();
  const savedFreePosition = new THREE.Vector3();
  const savedFreeTarget = new THREE.Vector3();
  const firstPersonDirection = new THREE.Vector3();
  const firstPersonForward = new THREE.Vector3();
  const firstPersonRight = new THREE.Vector3();
  // Horizontal walking momentum, so the walker accelerates and glides on the
  // low-gravity surface instead of snapping between speeds.
  const firstPersonVelocity = new THREE.Vector3();

  let outpostRoot = null;
  const crewMarkers = new Map();
  let crewAstronautGltf = null;
  loadCrewAstronautAsset().then((gltf) => {
    crewAstronautGltf = gltf;
    for (const marker of crewMarkers.values()) attachCrewAstronaut(marker);
  }).catch((error) => console.error('Could not load multiplayer astronaut model', error));
  // Rover fleet. Each entry owns its own chassis transform, wheel bones and
  // drive state so two rovers can park and roll independently.
  const rovers = [];
  let activeRover = null; // chassis currently bound to the camera
  let roverCameraActive = false;
  let roverRemoteControl = false; // true while driving from a command center monitor
  let roverCameraWasPointerLocked = false;
  let roverCameraDragging = false;
  let roverCameraPointerX = 0;
  let roverCameraPointerY = 0;
  let roverCameraOrbitYaw = 0;
  let roverCameraOrbitPitch = 0.28;
  let roverCameraDistance = 12;
  const roverCameraSavedPosition = new THREE.Vector3();
  const roverCameraSavedQuaternion = new THREE.Quaternion();
  const roverCameraSavedTarget = new THREE.Vector3();
  const roverCameraDesiredPosition = new THREE.Vector3();
  const roverCameraLookAt = new THREE.Vector3();
  const roverCameraForward = new THREE.Vector3();
  // Everything the command center interior needs back when a remote link ends.
  let remoteControlReturn = null;
  // The command center already ships a pair of console monitors: one downlink
  // screen per rover, focused with the crosshair to take control.
  const roverMonitors = [];
  let focusedRoverId = null;
  let roverMonitorPromptDismissed = false;
  const monitorFocusOffset = new THREE.Vector3();
  const monitorFocusDirection = new THREE.Vector3();
  const monitorFocusNearest = new THREE.Vector3();
  let outpostHeightField = null; // walker collision rasterized from the outpost meshes
  let commandCenterRoot = null;
  let commandCenterModelRoot = null;
  let commandCenterExteriorShell = null;
  let commandCenterInteriorActive = false;
  // Add-on structures register their interaction target here so the shared
  // outpost rebuild always puts them back after re-indexing.
  let commandCenterTarget = null;
  // Emissive materials on the plant, pulsed when a maintenance cycle runs so the
  // machine visibly acknowledges the action.
  const regolithPlantLights = [];
  let regolithPlantFlash = 0;
  let regolithPlantTarget = null;
  let jumpVelocity = 0; // vertical speed while the walker is airborne
  let airborne = false;
  let mapComponents = [];
  let mapBounds = null;
  const eventVisualizations = new Map();
  let currentEventAnimations = null;
  let eventCinematic = null;
  const queuedEventPresentations = [];
  const EVENT_TARGET_PREFIXES = {
    fire_lab: ['010'],
    solar_storm: ['011', '012', '013'],
    power_failure: ['011', '012'],
    water_leak: ['001'],
    lunar_night: ['011', '012', '013'],
    water_ice_exploration: ['018'],
    oxygen_plant_failure: ['025'],
  };
  const EVENT_CAMERA_DIRECTIONS = {
    fire_lab: new THREE.Vector3(0.82, 0.5, 1),
    solar_storm: new THREE.Vector3(1, 0.55, 0.72),
    power_failure: new THREE.Vector3(-0.95, 0.55, 0.8),
    water_leak: new THREE.Vector3(0.78, 0.42, -1),
    lunar_night: new THREE.Vector3(-0.8, 0.7, 1),
    water_ice_exploration: new THREE.Vector3(0.9, 0.48, -0.9),
  };
  let airlockTriggerCenter = null;
  let airlockTriggerRadius = 0;
  let airlockInterior = null;
  let airlockInteriorBounds = null;
  let airlockTaskMarkerObject = null;
  let airlockCenter = new THREE.Vector3();
  let airlockInteriorLight = null;
  let greenhouseInterior = null;
  let greenhouseInteriorBounds = null;
  let greenhouseTaskMarkerObject = null;
  let greenhouseCenter = new THREE.Vector3();
  let greenhouseInteriorLight = null;
  let componentTargets = [];
  let activeComponentTarget = null;
  let dismissedComponentId = null;
  // Set once this day's plant maintenance has been run, so the prompt stops
  // offering a cycle that is already done.
  let regolithPlantMaintained = false;
  let componentInteriorKit = null;
  let workshopInteriorModel = null;
  let activeModuleInterior = null;
  let activeModuleInteriorBounds = null;
  let activeModuleInteriorLight = null;
  let activeModuleGeometries = [];
  let activeModuleMaterials = [];
  let moduleReturnMode = 'exterior';
  let activeTaskTargets = [];
  let taskGuideBeacon = null;
  let taskConsoleGroup = null;
  let taskConsoleInner = null;
  // One dedicated button + label per daily task bound to the entered component.
  let taskConsoleUnits = [];
  let taskConsoleLayout = null;
  let taskConsoleUnitSignature = null;
  let taskConsoleArrow = null;
  const TASK_CONSOLE_ARROW_Y = 2.6;
  let taskConsoleArrowBaseY = TASK_CONSOLE_ARROW_Y;
  let taskConsoleComponentId = null;
  let taskConsoleKind = null;
  let taskConsoleActive = false;
  const taskRaycaster = new THREE.Raycaster();
  const taskScreenCenter = new THREE.Vector2(0, 0);
  // In-game console editor: drag to reposition, wheel to resize. Placements
  // are stored per component, so every daily task's button keeps its own
  // position instead of sharing one with other rooms of the same console kind.
  const CONSOLE_STORE_KEY = 'lunar-task-console:v1';
  let consoleOverrides = {};
  try {
    consoleOverrides = JSON.parse(localStorage.getItem(CONSOLE_STORE_KEY) || '{}') || {};
  } catch {
    consoleOverrides = {};
  }
  // Migrate v1 entries, which were shared per console kind: the wall placement
  // belonged to the Workshop (010) and the pedestal placement to the Cylinder
  // Habitat (001). Every other component now starts from its default console
  // position — e.g. the Battery Container no longer mirrors the Workshop.
  if (consoleOverrides.wall && !consoleOverrides['wall:010']) {
    consoleOverrides['wall:010'] = consoleOverrides.wall;
  }
  if (consoleOverrides.pedestal && !consoleOverrides['pedestal:001']) {
    consoleOverrides['pedestal:001'] = consoleOverrides.pedestal;
  }
  if (consoleOverrides.wall || consoleOverrides.pedestal) {
    delete consoleOverrides.wall;
    delete consoleOverrides.pedestal;
    saveConsoleOverrides();
  }
  let consoleEditMode = false;
  let consoleDragging = false;
  const consoleDragPlane = new THREE.Plane();
  const consoleGrabOffset = new THREE.Vector3();
  const consolePointerNdc = new THREE.Vector2();
  function saveConsoleOverrides() {
    try {
      localStorage.setItem(CONSOLE_STORE_KEY, JSON.stringify(consoleOverrides));
    } catch {
      /* storage unavailable - customization lasts for this session only */
    }
  }
  function consolePlacementKey(kind, componentId) {
    return `${kind}:${componentId ?? 'default'}`;
  }
  function getConsolePlacement(kind, componentId, fallbackPos, fallbackSize) {
    const saved = consoleOverrides[consolePlacementKey(kind, componentId)];
    if (saved && Array.isArray(saved.pos) && saved.pos.length === 3) {
      return {
        pos: new THREE.Vector3(saved.pos[0], saved.pos[1], saved.pos[2]),
        size: typeof saved.size === 'number' ? saved.size : fallbackSize,
      };
    }
    return { pos: fallbackPos, size: fallbackSize };
  }
  function pushConsoleInfo() {
    if (!taskConsoleGroup || !taskConsoleKind) {
      onConsoleEdit({ editing: consoleEditMode, kind: null, x: 0, y: 0, z: 0, size: 1 });
      return;
    }
    taskConsoleGroup.updateWorldMatrix(true, false);
    const world = new THREE.Vector3().setFromMatrixPosition(taskConsoleGroup.matrixWorld);
    onConsoleEdit({
      editing: consoleEditMode,
      kind: taskConsoleKind,
      x: Math.round(world.x * 100) / 100,
      y: Math.round(world.y * 100) / 100,
      z: Math.round(world.z * 100) / 100,
      size: Math.round((taskConsoleInner?.scale.x ?? 1) * 100) / 100,
    });
  }
  let moduleInteriorLoading = false;
  let workshopInteriorLoading = false;
  let kitWaiters = [];
  let workshopWaiters = [];
  let greenhouseReturnMode = 'airlock';
  let airlockReturnPosition = null;
  let airlockReturnYaw = 0;
  let airlockReturnPitch = 0;
  let airlockLongAxis = 'x';
  let airlockEndPromptDismissed = false;
  let greenhouseLoading = false;
  let greenhouseLongAxis = 'x';
  let greenhouseDoorPromptDismissed = false;
  let outsideBackground = null;
  let outsideCameraPosition = null;
  let outsideCameraYaw = 0;
  let outsideCameraPitch = 0;
  let airlockEntryExteriorPosition = null;
  let airlockEntryExteriorYaw = 0;
  let airlockEntryExteriorPitch = 0;
  let airlockPromptDismissed = false;
  let airlockLoading = false;
  let heightGrid = null;
  // Scanned-terrain bounds; everything outside of this rect is procedural mare.
  const outerRect = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  let outerCraters = [];
  let outerTerrainGroup = null;

  // Track dynamic sprite textures and materials for leak-free disposal
  const labelTextures = [];
  const labelMaterials = [];

  const clock = new THREE.Clock();
  let cameraMode = 'free'; // 'free' | 'first-person' | 'interior'
  let previousCameraMode = cameraMode;
  let firstPersonYaw = 0;
  let firstPersonPitch = 0;
  let dayStartCameraTransition = null;
  let initialCameraApproach = null;
  let outpostOverview = null;

  // Prompts state tracked for callback updates with zero GC stringify
  let currentPromptType = null;
  let currentPromptId = null;
  let currentPromptTitle = null;

  function isSamePrompt(type, data) {
    if (currentPromptType !== type) return false;
    if (!data && !currentPromptTitle) return true;
    if (!data || !currentPromptTitle) return false;
    return currentPromptId === (data.id || null) && currentPromptTitle === data.title;
  }

  function setPrompt(type, data = null) {
    if (!isSamePrompt(type, data)) {
      currentPromptType = type;
      currentPromptId = data?.id || null;
      currentPromptTitle = data?.title || null;
      onPromptChange(type, data);
      // Keep pointer lock while proximity prompts are visible so the player
      // stays in moving/looking state and the cursor stays hidden.
      // Entering is done via Enter/E, dismissing happens by walking away or N.
    }
  }

  function ensurePointerLocked() {
    // Best-effort: keep the player in moving/looking state when entering
    // interiors. If lock was lost (e.g. Esc), try to re-acquire it.
    if (document.pointerLockElement !== canvas) {
      try {
        const request = canvas.requestPointerLock?.();
        if (request?.catch) request.catch(() => {});
      } catch {
        /* pointer lock unavailable - mouse look resumes on next click */
      }
    }
  }

  // Lights
  const hemisphereLight = new THREE.HemisphereLight(0xc7d9ed, 0x34302b, 1.05);
  scene.add(hemisphereLight);
  const sun = new THREE.DirectionalLight(0xffe7c3, 3.15);
  sun.position.set(-90, 125, 70);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x829dc3, 0.6);
  fill.position.set(80, 40, -100);
  scene.add(fill);

  function clearEventVisualization() {
    for (const [occurrenceId, visualization] of eventVisualizations) {
      scene.remove(visualization.group);
      visualization.group.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => {
            material.map?.dispose();
            material.dispose();
          });
        }
      });
      eventVisualizations.delete(occurrenceId);
    }
  }

  function removeEventVisualization(occurrenceId) {
    const visualization = eventVisualizations.get(occurrenceId);
    if (!visualization) return;
    scene.remove(visualization.group);
    visualization.group.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => {
          material.map?.dispose();
          material.dispose();
        });
      }
    });
    eventVisualizations.delete(occurrenceId);
  }

  function findEventTarget(eventId) {
    if (!outpostRoot) return null;
    const prefixes = EVENT_TARGET_PREFIXES[eventId];
    if (!prefixes) return null;

    const matchedObjects = [];
    outpostRoot.traverse(object => {
      if (prefixes.some(prefix => object.name.startsWith(`${prefix}-`))) {
        matchedObjects.push(object);
      }
    });
    if (matchedObjects.length === 0) return null;

    const bounds = new THREE.Box3();
    matchedObjects.forEach(object => bounds.expandByObject(object));
    return { bounds, objects: matchedObjects };
  }

  function createWorldExposureSnapshot() {
    return {
      cameraPosition: camera.position.clone(),
      cameraQuaternion: camera.quaternion.clone(),
      target: controls.target.clone(),
      controlsEnabled: controls.enabled,
      cameraMode,
      background: scene.background,
      backgroundIntensity: scene.backgroundIntensity,
      terrainVisibility: moonTerrainMeshes.map(terrain => terrain.visible),
      horizonVisibility: horizon.visible,
      outpostVisibility: outpostRoot?.visible ?? true,
      commandCenterParent: commandCenterRoot?.parent ?? null,
      commandCenterVisibility: commandCenterRoot?.visible ?? true,
      commandCenterExteriorVisibility: commandCenterExteriorShell?.visible ?? true,
      airlockVisibility: airlockInterior?.visible ?? false,
      greenhouseVisibility: greenhouseInterior?.visible ?? false,
      moduleVisibility: activeModuleInterior?.visible ?? false,
      closeupEarthVisibility: closeupEarthMesh?.visible ?? false,
      earthViewActive,
    };
  }

  function exposeOutpostForEvent() {
    moonTerrainMeshes.forEach(terrain => { terrain.visible = true; });
    horizon.visible = true;
    if (commandCenterRoot && commandCenterInteriorActive && outpostRoot) {
      if (commandCenterExteriorShell) commandCenterExteriorShell.visible = true;
      outpostRoot.attach(commandCenterRoot);
      commandCenterRoot.visible = true;
    }
    if (outpostRoot) outpostRoot.visible = true;
    if (airlockInterior) airlockInterior.visible = false;
    if (greenhouseInterior) greenhouseInterior.visible = false;
    if (activeModuleInterior && !commandCenterInteriorActive) activeModuleInterior.visible = false;
    if (closeupEarthMesh) closeupEarthMesh.visible = false;
    if (outsideBackground) scene.background = outsideBackground;
    controls.enabled = false;
    keys.clear();
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  }

  function restoreWorldExposure(snapshot) {
    moonTerrainMeshes.forEach((terrain, index) => {
      terrain.visible = snapshot.terrainVisibility[index] ?? true;
    });
    horizon.visible = snapshot.horizonVisibility;
    if (commandCenterRoot && snapshot.commandCenterParent
      && commandCenterRoot.parent !== snapshot.commandCenterParent) {
      snapshot.commandCenterParent.attach(commandCenterRoot);
    }
    if (commandCenterRoot) commandCenterRoot.visible = snapshot.commandCenterVisibility;
    if (commandCenterExteriorShell) {
      commandCenterExteriorShell.visible = snapshot.commandCenterExteriorVisibility;
    }
    if (outpostRoot) outpostRoot.visible = snapshot.outpostVisibility;
    if (airlockInterior) airlockInterior.visible = snapshot.airlockVisibility;
    if (greenhouseInterior) greenhouseInterior.visible = snapshot.greenhouseVisibility;
    if (activeModuleInterior) activeModuleInterior.visible = snapshot.moduleVisibility;
    if (closeupEarthMesh) closeupEarthMesh.visible = snapshot.closeupEarthVisibility;
    scene.background = snapshot.background;
    scene.backgroundIntensity = snapshot.backgroundIntensity;
    cameraMode = snapshot.cameraMode;
    camera.position.copy(snapshot.cameraPosition);
    camera.quaternion.copy(snapshot.cameraQuaternion);
    controls.target.copy(snapshot.target);
    controls.enabled = snapshot.controlsEnabled;
    earthViewActive = snapshot.earthViewActive;
    if (controls.enabled) controls.update();
    onModeChange(cameraMode);
  }

  function startEventReturn(onReturned) {
    if (!eventCinematic) {
      onReturned?.();
      return;
    }
    if (eventCinematic.stage === 'return') return;

    eventCinematic.stage = 'return';
    eventCinematic.elapsed = 0;
    eventCinematic.returnFromPosition = camera.position.clone();
    eventCinematic.returnFromQuaternion = camera.quaternion.clone();
    eventCinematic.onReturned = onReturned;
  }

  function beginEventPresentation(eventId, occurrenceId, onPresented) {
    if (isDestroyed || eventCinematic?.occurrenceId === occurrenceId) return;
    if (eventCinematic) {
      if (!queuedEventPresentations.some((entry) => entry.occurrenceId === occurrenceId)) {
        queuedEventPresentations.push({ eventId, occurrenceId, onPresented });
      }
      return;
    }
    if (!outpostRoot) {
      if (!queuedEventPresentations.some((entry) => entry.occurrenceId === occurrenceId)) {
        queuedEventPresentations.push({ eventId, occurrenceId, onPresented });
      }
      return;
    }

    const eventTarget = findEventTarget(eventId);
    if (!eventTarget) {
      console.error(
        `[Lunar event] No outpost model component matched target mapping for "${eventId}".`,
        EVENT_TARGET_PREFIXES[eventId],
      );
      onPresented?.();
      startNextEventPresentation();
      return;
    }

    const snapshot = createWorldExposureSnapshot();
    exposeOutpostForEvent();

    const target = eventTarget.bounds.getCenter(new THREE.Vector3());
    const targetSize = eventTarget.bounds.getSize(new THREE.Vector3());
    const outpostBounds = new THREE.Box3().setFromObject(outpostRoot);
    const outpostSize = outpostBounds.getSize(new THREE.Vector3());
    const minimumDistance = Math.max(controls.minDistance * 0.95, 24);
    const targetDistance = Math.max(
      targetSize.length() * 2.15,
      Math.max(outpostSize.x, outpostSize.z) * 0.045,
      minimumDistance,
    );
    const viewDirection = (EVENT_CAMERA_DIRECTIONS[eventId] || new THREE.Vector3(1, 0.55, 1))
      .clone()
      .normalize();
    const destination = target.clone().addScaledVector(viewDirection, targetDistance);
    const looker = new THREE.PerspectiveCamera();
    looker.position.copy(destination);
    looker.lookAt(target);

    eventCinematic = {
      eventId,
      occurrenceId,
      stage: 'approach',
      elapsed: 0,
      snapshot,
      startPosition: camera.position.clone(),
      startQuaternion: camera.quaternion.clone(),
      destination,
      destinationQuaternion: looker.quaternion.clone(),
      target,
      onPresented,
      onReturned: null,
      returnFromPosition: null,
      returnFromQuaternion: null,
    };
  }

  function startNextEventPresentation() {
    if (isDestroyed || eventCinematic || !outpostRoot || queuedEventPresentations.length === 0) return;
    const next = queuedEventPresentations.shift();
    beginEventPresentation(next.eventId, next.occurrenceId, next.onPresented);
  }

  function addAnimatedParticles(parent, {
    count,
    color,
    size,
    offset,
    rise,
    speed,
    opacity = 1,
    falling = false,
  }) {
    const positions = new Float32Array(count * 3);
    const startHeights = new Float32Array(count);
    const velocities = new Float32Array(count);
    const spread = Math.max(size * 0.45, 1);

    for (let index = 0; index < count; index += 1) {
      const particle = index * 3;
      const y = falling ? rise * (0.45 + Math.random() * 0.55) : Math.random() * rise;
      positions[particle] = (Math.random() - 0.5) * spread;
      positions[particle + 1] = y;
      positions[particle + 2] = (Math.random() - 0.5) * spread;
      startHeights[index] = y;
      velocities[index] = speed * (0.65 + Math.random() * 0.7) * (falling ? -1 : 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color,
      size,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
      blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(geometry, material);
    particles.position.set(offset.x, offset.y, offset.z);
    parent.add(particles);

    currentEventAnimations.push((elapsed, delta) => {
      const attribute = geometry.getAttribute('position');
      const values = attribute.array;
      for (let index = 0; index < count; index += 1) {
        const particle = index * 3;
        values[particle + 1] += velocities[index] * delta;
        if ((!falling && values[particle + 1] > rise) || (falling && values[particle + 1] < 0)) {
          values[particle + 1] = falling ? rise * (0.8 + Math.random() * 0.2) : startHeights[index] * 0.15;
          values[particle] = (Math.random() - 0.5) * spread;
          values[particle + 2] = (Math.random() - 0.5) * spread;
        }
      }
      attribute.needsUpdate = true;
    });
  }

  function buildEventVisualization(eventId, occurrenceId) {
    if (!eventId || !occurrenceId || !outpostRoot) return;

    const mappedTarget = findEventTarget(eventId);
    const bounds = mappedTarget?.bounds || new THREE.Box3().setFromObject(outpostRoot);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const outpostSize = new THREE.Box3().setFromObject(outpostRoot).getSize(new THREE.Vector3());
    const width = Math.max(size.x, size.z, outpostSize.x * 0.04, 1);
    const height = Math.max(size.y, outpostSize.y * 0.04, 1);
    const group = new THREE.Group();
    group.position.copy(center);
    group.updateMatrixWorld(true);
    scene.add(group);
    const animations = [];
    currentEventAnimations = animations;
    const cameraDirection = (EVENT_CAMERA_DIRECTIONS[eventId]
      || new THREE.Vector3(1, 0.55, 1)).clone().normalize();

    if (eventId === 'fire_lab') {
      const fireOffset = new THREE.Vector3(
        cameraDirection.x * size.x * 0.34,
        height * 0.22,
        cameraDirection.z * size.z * 0.34,
      );
      addAnimatedParticles(group, {
        count: 55,
        color: 0xff582e,
        size: Math.max(0.8, height * 0.055),
        offset: fireOffset,
        rise: height * 1.3,
        speed: height * 0.42,
        opacity: 0.9,
      });
      addAnimatedParticles(group, {
        count: 42,
        color: 0x777b80,
        size: Math.max(1.2, height * 0.085),
        offset: fireOffset.clone().add(new THREE.Vector3(0, height * 0.3, 0)),
        rise: height * 2.2,
        speed: height * 0.24,
        opacity: 0.42,
      });
      const fireLight = new THREE.PointLight(0xff4d1f, 85, width * 0.75);
      fireLight.position.copy(fireOffset);
      group.add(fireLight);
      currentEventAnimations.push((time) => {
        fireLight.intensity = 62 + Math.sin(time * 18) * 20 + Math.random() * 12;
      });
    } else if (eventId === 'lunar_night') {
      const floodlight = new THREE.PointLight(0x9bdcff, 45, width * 1.8);
      floodlight.position.set(0, height * 0.38, 0);
      group.add(floodlight);
      const transitionBeacon = new THREE.PointLight(0xff9f52, 25, width * 0.9);
      transitionBeacon.position.set(cameraDirection.x * size.x * 0.35, -height * 0.1, cameraDirection.z * size.z * 0.35);
      group.add(transitionBeacon);
    } else if (eventId === 'solar_storm') {
      const skyShell = new THREE.Mesh(
        new THREE.SphereGeometry(width * 18, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.48),
        new THREE.MeshBasicMaterial({
          color: 0x49ffc9,
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.11,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      skyShell.position.y = height * 0.5;
      group.add(skyShell);
      for (const panel of mappedTarget?.objects || []) {
        const panelBounds = new THREE.Box3().setFromObject(panel);
        const panelPosition = group.worldToLocal(panelBounds.getCenter(new THREE.Vector3()));
        const panelSize = panelBounds.getSize(new THREE.Vector3());
        addAnimatedParticles(group, {
          count: 24,
          color: 0x61ffd0,
          size: Math.max(0.8, panelSize.y * 0.18),
          offset: panelPosition.add(new THREE.Vector3(0, panelSize.y * 0.55, 0)),
          rise: Math.max(panelSize.y * 2.2, height * 0.7),
          speed: Math.max(panelSize.y * 0.32, height * 0.06),
          opacity: 0.62,
        });
      }

      for (let index = 0; index < 3; index += 1) {
        const aurora = new THREE.Mesh(
          new THREE.TorusGeometry(width * (0.52 + index * 0.12), Math.max(0.5, height * 0.035), 8, 96),
          new THREE.MeshBasicMaterial({
            color: index === 1 ? 0x69aaff : 0x63ffd1,
            transparent: true,
            opacity: 0.34,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        aurora.rotation.x = Math.PI / 2.15;
        aurora.rotation.z = -0.14 + index * 0.11;
        aurora.position.y = height * (0.8 + index * 0.12);
        group.add(aurora);
        currentEventAnimations.push((time) => {
          aurora.rotation.z += Math.sin(time * 0.5 + index) * 0.0008;
          aurora.material.opacity = 0.2 + (Math.sin(time * 1.4 + index) + 1) * 0.11;
        });
      }
    } else if (eventId === 'water_ice_exploration') {
      const scanRing = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(1, width * 0.28), Math.max(0.25, height * 0.04), 8, 64),
        new THREE.MeshBasicMaterial({
          color: 0x70eaff,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      scanRing.rotation.x = Math.PI / 2;
      scanRing.position.y = -height * 0.35;
      group.add(scanRing);
      const scanLight = new THREE.PointLight(0x56dfff, 38, width * 1.6);
      scanLight.position.set(0, height * 0.2, 0);
      group.add(scanLight);
      addAnimatedParticles(group, {
        count: 34,
        color: 0x9aeeff,
        size: Math.max(0.7, height * 0.055),
        offset: new THREE.Vector3(0, -height * 0.2, 0),
        rise: Math.max(height * 0.9, 3),
        speed: Math.max(height * 0.2, 0.8),
        opacity: 0.7,
      });
      currentEventAnimations.push((time) => {
        scanRing.rotation.z = time * 0.32;
        scanRing.material.opacity = 0.38 + (Math.sin(time * 2.2) + 1) * 0.25;
        scanLight.intensity = 24 + (Math.sin(time * 3.5) + 1) * 16;
      });
    } else if (eventId === 'power_failure' || eventId === 'water_leak' || eventId === 'oxygen_plant_failure') {
      const location = new THREE.Vector3(
        cameraDirection.x * size.x * 0.36,
        eventId === 'water_leak' ? -height * 0.25 : height * 0.08,
        cameraDirection.z * size.z * 0.36,
      );
      const beacon = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(1, height * 0.11), Math.max(2, height * 0.5), 12),
        new THREE.MeshBasicMaterial({
          color: eventId === 'water_leak' ? 0x54ccff : 0xff493f,
          transparent: true,
          opacity: 0.78,
        }),
      );
      beacon.position.copy(location).add(new THREE.Vector3(0, height * 0.22, 0));
      group.add(beacon);
      const warningLight = new THREE.PointLight(
        eventId === 'water_leak' ? 0x36bfff : 0xff3228,
        55,
        width * 0.55,
      );
      warningLight.position.copy(beacon.position);
      group.add(warningLight);
      currentEventAnimations.push((time) => {
        const pulse = 0.45 + (Math.sin(time * 6) + 1) * 0.48;
        warningLight.intensity = 20 + pulse * 48;
        beacon.material.opacity = 0.28 + pulse * 0.62;
      });

      if (eventId === 'water_leak') {
        addAnimatedParticles(group, {
          count: 20,
          color: 0x66d9ff,
          size: Math.max(0.7, height * 0.04),
          offset: location.clone().add(new THREE.Vector3(0, height * 0.12, 0)),
          rise: Math.max(height * 0.5, 2),
          speed: height * 0.8,
          falling: true,
        });
      }
      if (eventId === 'oxygen_plant_failure') {
        // Regolith dust venting out of the jammed digester.
        addAnimatedParticles(group, {
          count: 34,
          color: 0xb8a894,
          size: Math.max(0.9, height * 0.05),
          offset: location.clone().add(new THREE.Vector3(0, height * 0.28, 0)),
          rise: Math.max(height * 0.9, 3),
          speed: height * 0.5,
          falling: true,
        });
      }
    }
    eventVisualizations.set(occurrenceId, { eventId, group, animations });
    currentEventAnimations = null;
  }

  function updateEventLighting() {
    const activeEventIds = [...eventVisualizations.values()].map(({ eventId }) => eventId);
    if (activeEventIds.includes('lunar_night')) {
      hemisphereLight.intensity = 0.2;
      sun.intensity = 0.24;
      fill.intensity = 0.16;
    } else if (activeEventIds.includes('power_failure')) {
      hemisphereLight.intensity = 0.46;
      sun.intensity = 1.25;
      fill.intensity = 0.18;
    } else {
      hemisphereLight.intensity = 1.05;
      sun.intensity = 3.15;
      fill.intensity = 0.6;
    }
  }

  function setEventEffects(events) {
    const desiredEvents = new Map(events.map(({ occurrenceId, eventId }) => [occurrenceId, eventId]));
    for (let index = queuedEventPresentations.length - 1; index >= 0; index -= 1) {
      if (!desiredEvents.has(queuedEventPresentations[index].occurrenceId)) {
        queuedEventPresentations.splice(index, 1);
      }
    }
    let changed = false;
    for (const occurrenceId of eventVisualizations.keys()) {
      if (!desiredEvents.has(occurrenceId)) {
        removeEventVisualization(occurrenceId);
        changed = true;
      }
    }
    for (const [occurrenceId, eventId] of desiredEvents) {
      const existing = eventVisualizations.get(occurrenceId);
      if (existing?.eventId === eventId) continue;
      if (existing) removeEventVisualization(occurrenceId);
      buildEventVisualization(eventId, occurrenceId);
      changed = true;
    }
    if (changed) updateEventLighting();
  }

  function presentEvent(eventId, occurrenceId, onPresented) {
    if (eventCinematic?.occurrenceId === occurrenceId
      || queuedEventPresentations.some((entry) => entry.occurrenceId === occurrenceId)) return;
    beginEventPresentation(eventId, occurrenceId, onPresented);
  }

  function returnFromEvent(occurrenceId, onReturned) {
    if (eventCinematic && eventCinematic.occurrenceId !== occurrenceId) {
      onReturned?.();
      return;
    }
    startEventReturn(onReturned);
  }

  function clearEventPresentations(occurrenceIds) {
    const ids = new Set(occurrenceIds.filter(Boolean));
    if (ids.size === 0) return;
    for (let index = queuedEventPresentations.length - 1; index >= 0; index -= 1) {
      if (ids.has(queuedEventPresentations[index].occurrenceId)) {
        queuedEventPresentations.splice(index, 1);
      }
    }
    if (eventCinematic && ids.has(eventCinematic.occurrenceId)) {
      const cinematic = eventCinematic;
      eventCinematic = null;
      restoreWorldExposure(cinematic.snapshot);
      startNextEventPresentation();
    }
  }

  function returnToOutpostOverview() {
    if (isDestroyed || !outpostRoot || !heightGrid || !outpostOverview) return;

    if (roverCameraActive) stopRoverControl({ silent: true });
    releaseAllKeys();
    firstPersonVelocity.set(0, 0, 0);
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();

    if (activeModuleInterior) {
      if (commandCenterInteriorActive) {
        if (commandCenterExteriorShell) commandCenterExteriorShell.visible = true;
        if (outpostRoot && commandCenterRoot) outpostRoot.attach(commandCenterRoot);
        commandCenterInteriorActive = false;
        commandCenterRoot.visible = true;
      } else {
        scene.remove(activeModuleInterior);
        disposeModuleInterior(activeModuleInterior);
      }
      scene.remove(activeModuleInteriorLight);
      unmountTaskConsole();
      activeModuleInterior = null;
      activeModuleInteriorBounds = null;
      activeModuleInteriorLight = null;
    }
    if (airlockInterior) scene.remove(airlockInterior);
    if (greenhouseInterior) scene.remove(greenhouseInterior);
    scene.remove(airlockInteriorLight);
    scene.remove(greenhouseInteriorLight);
    if (greenhouseInterior) greenhouseInterior.visible = false;
    if (airlockInterior) airlockInterior.visible = false;
    if (closeupEarthMesh) closeupEarthMesh.visible = false;

    moonTerrainMeshes.forEach(terrain => { terrain.visible = true; });
    horizon.visible = true;
    outpostRoot.visible = true;
    scene.background = outsideBackground ?? scene.background;
    controls.enabled = false;
    earthViewActive = false;
    cameraMode = 'free';
    freeCameraAdjusted = false;
    camera.fov = 56;
    camera.updateProjectionMatrix();
    onModeChange(cameraMode);
    onInsidePanelChange({ visible: false, label: '', buttonText: '' });
    setPrompt(null);
    consoleEditMode = false;
    consoleDragging = false;
    if (canvas) canvas.style.cursor = '';

    const standPosition = playerStandPosition();
    const looker = new THREE.PerspectiveCamera();
    looker.position.copy(standPosition);
    looker.lookAt(firstPersonLookAt);
    dayStartCameraTransition = {
      elapsed: 0,
      duration: 2.8,
      startPosition: camera.position.clone(),
      startQuaternion: camera.quaternion.clone(),
      destination: standPosition,
      destinationQuaternion: looker.quaternion.clone(),
      focus: outpostOverview.focus.clone(),
      enableControlsOnFinish: true,
    };
  }

  // Where the player stands when dropped back onto the surface, resolved against
  // the current camera height so a runtime height change re-seats the view.
  function playerStandPosition() {
    return new THREE.Vector3(
      firstPersonStart.x,
      firstPersonStartGroundY + playerCameraHeight,
      firstPersonStart.z,
    );
  }

  // Milky Way Skybox: cached, mipmap-free, downscaled to 4K at decode time
  // (the 8K source would cost ~45MB VRAM and a long first-upload stall).
  if (ASSET_CACHE.skyTexture) {
    scene.background = ASSET_CACHE.skyTexture;
    scene.backgroundIntensity = 0.8;
  } else {
    loadDownscaledTexture('/lunar/textures/8k_stars_milky_way.jpg', { maxWidth: 4096, maxHeight: 2048 })
      .then(texture => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        ASSET_CACHE.skyTexture = texture;
        if (!isDestroyed) {
          scene.background = texture;
          scene.backgroundIntensity = 0.8;
          skyAssetReady = true;
        }
      })
      .catch(() => { skyAssetReady = true; console.warn('Could not load Milky Way texture.'); });
  }

  // Open-world scale: the two scanned landing sites are stretched by this
  // multiplier, and the procedural mare around them reaches thousands of
  // units further, so the moon reads as an endless open world.
  const WORLD_SCALE = 8;

  // Earth — anchored to the player rather than the map so it keeps its place
  // on the horizon (and can never be reached) no matter how far you roam.
  // Close-up "view Earth" staging: player-relative base + approach direction.
  const EARTH_CLOSEUP_DISTANCE = 1500;
  const EARTH_CLOSEUP_RADIUS = 1420;
  const EARTH_ELEVATION_DEGREES = 72;
  const EARTH_AZIMUTH_DEGREES = 300;
  const earthAnchor = new THREE.Vector3(630, -100, 0); // offset from the player
  const earthDirection = new THREE.Vector3(
    Math.sin(THREE.MathUtils.degToRad(EARTH_AZIMUTH_DEGREES)) * Math.cos(THREE.MathUtils.degToRad(EARTH_ELEVATION_DEGREES)),
    Math.sin(THREE.MathUtils.degToRad(EARTH_ELEVATION_DEGREES)),
    Math.cos(THREE.MathUtils.degToRad(EARTH_AZIMUTH_DEGREES)) * Math.cos(THREE.MathUtils.degToRad(EARTH_ELEVATION_DEGREES))
  ).normalize();

  // Sky Earth: far enough to behave like a true celestial body (zero parallax
  // as you roam) while keeping its size and height on the horizon.
  const EARTH_SKY_DISTANCE = 6000;
  const EARTH_SKY_RADIUS = 950;
  const EARTH_SKY_ELEVATION_DEGREES = 1.35;
  const EARTH_SKY_BEARING_DEGREES = 1.8; // a hair north of due east
  const earthSkyOffset = new THREE.Vector3(
    Math.cos(THREE.MathUtils.degToRad(EARTH_SKY_ELEVATION_DEGREES)) * Math.cos(THREE.MathUtils.degToRad(EARTH_SKY_BEARING_DEGREES)),
    Math.sin(THREE.MathUtils.degToRad(EARTH_SKY_ELEVATION_DEGREES)),
    Math.cos(THREE.MathUtils.degToRad(EARTH_SKY_ELEVATION_DEGREES)) * Math.sin(THREE.MathUtils.degToRad(EARTH_SKY_BEARING_DEGREES))
  ).multiplyScalar(EARTH_SKY_DISTANCE);

  const earthTexturePaths = [
    { path: '/Textures/8k_earth_daymap.jpg', colorSpace: THREE.SRGBColorSpace, budget: 4096 },
    { path: '/Textures/8k_earth_nightmap.jpg', colorSpace: THREE.SRGBColorSpace, budget: 4096 },
    { path: '/Textures/8k_earth_clouds.jpg', colorSpace: THREE.SRGBColorSpace, budget: 2048 },
    { path: '/Textures/8k_earth_specular.jpeg', colorSpace: THREE.NoColorSpace, budget: 2048 },
  ];
  const setupEarth = ([dayMap, nightMap, cloudMap, specularMap]) => {
    if (isDestroyed) return;
    // Full 8K maps would allocate ~134MB of VRAM each; the budgeted decode
    // keeps the visible quality at a fraction of the memory and upload cost.
    const maxAnisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    for (const texture of [dayMap, nightMap, cloudMap, specularMap]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.anisotropy = maxAnisotropy;
      texture.needsUpdate = true;
    }

    const earthSurface = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshPhongMaterial({
        map: dayMap,
        emissiveMap: nightMap,
        emissive: new THREE.Color(0xffc777),
        emissiveIntensity: 0.85,
        specularMap,
        specular: new THREE.Color(0x454545),
        shininess: 18,
        // DoubleSide keeps the close-up Earth dome rendering from inside too.
        side: THREE.DoubleSide,
      })
    );
    const earthClouds = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshPhongMaterial({
        map: cloudMap,
        alphaMap: cloudMap,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        specular: new THREE.Color(0x111111),
        shininess: 8,
        side: THREE.DoubleSide,
      })
    );
    earthClouds.scale.setScalar(1.003);
    earthClouds.renderOrder = 1;
    earthMesh = new THREE.Group();
    earthMesh.add(earthSurface, earthClouds);
    earthMesh.scale.setScalar(EARTH_SKY_RADIUS);
    earthMesh.position.copy(earthSkyOffset);
    earthMesh.name = 'Earth';
    scene.add(earthMesh);
  };

  if (ASSET_CACHE.earthTextures) {
    setupEarth(ASSET_CACHE.earthTextures);
  } else {
    Promise.all(earthTexturePaths.map(entry => loadDownscaledTexture(entry.path, {
      maxWidth: entry.budget,
      maxHeight: Math.round(entry.budget / 2),
      colorSpace: entry.colorSpace,
    }))).then(textures => {
      ASSET_CACHE.earthTextures = textures;
      setupEarth(textures);
      earthAssetsReady = true;
    }).catch(error => { earthAssetsReady = true; console.warn('Could not load Earth textures.', error); });
  }

  // Terrain scans: Apollo 12 & Apollo 16
  // Each landing-site scan spans TERRAIN_SPAN units (~1520 units combined),
  // and the procedural mare keeps going far past them in every direction.
  const TERRAIN_SPAN = 190 * WORLD_SCALE;
  const APOLLO_12_POSITION_X = 0;
  const APOLLO_12_POSITION_Y = -2.75 * WORLD_SCALE;
  const APOLLO_12_SCALE = 1;
  const LUNAR_OUTPOST_WIDTH = 72;
  const LUNAR_OUTPOST_POSITION_X = 0;
  const LUNAR_OUTPOST_POSITION_Y = 2.9;
  const LUNAR_OUTPOST_POSITION_Z = 0;
  const COMMAND_CENTER_WIDTH = 18;
  const COMMAND_CENTER_GAP = 4;
  // The regolith kit is modelled in metres; one game unit is about half a metre.
  const REGOLITH_PLANT_SCALE = 1.88;
  const REGOLITH_PLANT_GAP = 6;
  // Clearance of the grade plane above the highest ground under the footprint.
  // Small on purpose: the tank's footing ring sits 0.36 units below grade, so it
  // stays buried while the machine itself rests on the surface.
  const REGOLITH_PLANT_LIFT = 0.12;
  const OUTPOST_SITE_MARGIN = 6;
  const OUTPOST_GROUND_EPSILON = 0.05;
  const ROVER_TARGET_WIDTH = 3; // Change this value to resize the playable rover.
  const ROVER_MAX_STEP_HEIGHT = COLLIDE_STEP_HEIGHT + 0.45;
  // Rover driving model. It shares the walker's physics instincts: the chassis
  // rides the sampled ground, leans with the slope, settles with a little
  // suspension travel and falls under lunar gravity when a crest drops away.
  const ROVER_GRAVITY = PLAYER_CAMERA.gravity; // same Moon gravity as the walker
  const ROVER_RIDE_RATE_UP = 18; // how quickly the chassis climbs a rise
  const ROVER_RIDE_RATE_DOWN = 6; // how gently it settles into a dip
  const ROVER_TILT_RATE = 5; // how fast the body leans onto the slope
  const ROVER_AIR_DROP = 0.45; // a drop taller than this becomes a fall
  const ROVER_MAX_TILT = 1.35; // clamp the sampled slope (~54 degrees)
  const ROVER_MAX_AIR_SPEED = 24; // terminal fall speed keeps it stable
  // Parked side by side in front of the outpost, nose pointing away from it.
  const ROVER_SLOTS = [
    { id: 1, label: 'ROVER 01', offsetX: -10, offsetZ: 0, tint: 0x59e3ff },
    { id: 2, label: 'ROVER 02', offsetX: 10, offsetZ: -3, tint: 0xffb84d },
  ];
  // Aim tolerance for the command center downlink monitors: the two screens
  // sit ~0.5 units apart, so focus is measured off the aim ray, not a huge cone.
  const MONITOR_FOCUS_DISTANCE = 22;
  const MONITOR_FOCUS_MIN_TOLERANCE = 0.8;
  const MONITOR_FOCUS_TOLERANCE_RATIO = 0.2;
  // Two different live screens live in the command center:
  //  • the two small console monitors each show their own rover on the surface,
  //  • the large wall display (material "large_monitor_mat") shows the outpost.
  const ROVER_FEED_WIDTH = 256;
  const ROVER_FEED_FOV = 42;
  const ROVER_FEED_REFRESH = 0.5; // re-captured only when that rover has moved
  const ROVER_FEED_MOVE_EPSILON = 0.15;
  const roverFeedOffset = new THREE.Vector3(7, 4.5, 7); // world-space view angle
  const OUTPOST_FEED_WIDTH = 320;
  const OUTPOST_FEED_FOV = 38;
  const OUTPOST_FEED_REFRESH = 0.25; // seconds between live redraws
  // Live viewpoint of the wall display, driven by the in-game scaler:
  //   azimuthDeg   — which side of the base the camera looks from
  //   elevationDeg — how high it sits (the downward tilt of the picture)
  //   fov          — lens angle; lower is a flatter, more zoomed-in shot
  const outpostFeedView = { azimuthDeg: 19, elevationDeg: 24, fov: OUTPOST_FEED_FOV };
  // Recomputed from outpostFeedView on every capture.
  const outpostFeedDirection = new THREE.Vector3(0.30, 0.40, 0.87).normalize();
  // How much of the vertical fit to honour. Below 1 the base's depth runs a
  // little past the top and bottom of a wide panel, so the horizon reads as a
  // vista instead of the base shrinking to a stamp in the middle.
  const OUTPOST_FEED_VERTICAL_FIT = 0.82;
  const outpostFeedCenter = new THREE.Vector3();
  const outpostFeedSize = new THREE.Vector3();
  // The big wall display is the authored "large monitor" panel. The static
  // screen strip below it is only a fallback if that panel ever goes missing.
  const OUTPOST_SCREEN_MATERIALS = ['large_monitor_mat', 'CommandCenter_MonitorScreenStatic'];
  let outpostFeed = null; // { target, camera, plane }
  let outpostFeedTimer = 0;
  let roverFeedTimer = 0;
  // Every overlay plane that samples a render target. All of them are hidden
  // while any capture runs, so a screen never samples the target it is drawn into.
  const feedPlanes = [];
  // The live eye height. Seeded from PLAYER_CAMERA and adjustable at runtime;
  // every camera measurement below reads this, never a scattered constant.
  let playerCameraHeight = PLAYER_CAMERA.height;
  // The two scans overlap slightly so the seam between them disappears.
  const SEAM_OVERLAP = 4 * WORLD_SCALE;
  // Default free-camera framing distance, sized to the outpost (not the map).
  const OUTPOST_VIEW_DISTANCE = LUNAR_OUTPOST_WIDTH * 0.9;

  // Endless mare: a procedural cratered plain rings the scans so the moon has
  // no ending. A fine skirt blends the scanned borders into the plain, a
  // coarse field carries craters far out, then everything fades into the far
  // backdrop plane well beyond the reach of the walker.
  const PLAIN_LEVEL = -1.2 * WORLD_SCALE;
  const OUTER_BLEND_DISTANCE = 480; // scan border -> open mare transition
  const OUTER_SKIRT_SPACING = 8; // fine mesh over the transition band
  const OUTER_FIELD_DEPTH = 3200; // crater field reach around the scans
  const OUTER_FIELD_SPACING = 22; // coarse mesh grid for the big field
  const OUTER_FIELD_TAPER_START = OUTER_FIELD_DEPTH - 900;
  const OUTER_FIELD_TAPER_END = OUTER_FIELD_DEPTH - 100;
  const OUTER_WALK_LIMIT = 8000; // very distant soft limit for the walker
  const OUTER_CRATER_COUNT = 26;
  const HORIZON_PLANE_SIZE = 30000;

  // Task console tuning: position + size for both console variants.
  // Wall console appears in workshop / sci-fi interiors, pedestal in the rest.
  const TASK_CONSOLE_CONFIG = {
    wall: {
      inset: 0.12, // distance in front of the right wall
      height: 1.6, // button height above the room floor
      zOffset: 0, // shift along the wall (+/-)
      size: 1, // overall size multiplier
    },
    pedestal: {
      x: 1.15, // world x beside the entrance
      z: 1.2, // world z beside the entrance
      size: 1, // overall size multiplier
    },
  };
  const AIRLOCK_PROMPT_DISTANCE = 26;
  const AIRLOCK_INTERIOR_WIDTH = 25;
  const TOMATO_PLANT_Y_SCALE = 2;

  const terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0x77736d,
    roughness: 1,
    metalness: 0,
    flatShading: false,
    side: THREE.DoubleSide
  });

  const models = [
    { name: 'Apollo 12', path: '/lunar/MOON/Apollo%2012%20-%20Landing%20Site.stl', cacheKey: 'apollo12Geo' },
    { name: 'Apollo 16', path: '/lunar/MOON/Apollo%2016%20-%20Landing%20Site.stl', cacheKey: 'apollo16Geo' }
  ];
  const terrainScans = [];
  const moonTerrainMeshes = [];
  let loaded = 0;

  // Scratch vectors for the rover ride model — reused every frame, never allocated.
  const roverTerrainNormal = new THREE.Vector3();
  const roverNose = new THREE.Vector3();
  const roverBinormal = new THREE.Vector3();
  const roverTargetQuaternion = new THREE.Quaternion();
  const roverBasisMatrix = new THREE.Matrix4();

  function createRoverRig(root, slot) {
    const rover = {
      id: slot.id,
      label: slot.label,
      tint: slot.tint,
      root,
      // Drive state — every rover keeps its own so a parked one never rolls.
      speed: 0,
      heading: 0,
      steering: 0,
      wheelAngle: 0,
      groundOffset: 0,
      halfLength: 4,
      halfWidth: 2,
      // Ride state: the chassis leans onto the slope and falls under gravity
      // when a crest drops away, exactly like the walker leaving the ground.
      chassisQuaternion: new THREE.Quaternion(),
      verticalVelocity: 0,
      airborne: false,
      climb: 0,
      // Wheel animation rig, rebuilt per clone so both chassis roll separately.
      spinBones: [],
      frontSpinBones: [],
      steeringBones: [],
      boneRest: new Map(),
      spinAxis: new THREE.Vector3(0, 0, 1),
      steerAxis: new THREE.Vector3(0, 1, 0),
      boneDelta: new THREE.Quaternion(),
      steeringDelta: new THREE.Quaternion(),
    };

    const spinNames = ['RF', 'RM', 'RB', 'LF', 'LM', 'LB']
      .map(position => `chassis${position}_wheelAxle_SpinZ`);
    for (const name of spinNames) {
      const bone = root.getObjectByName(name);
      if (!bone) continue;
      rover.spinBones.push(bone);
      if (name.includes('chassisRF_') || name.includes('chassisLF_')) {
        rover.frontSpinBones.push(bone);
      }
      rover.boneRest.set(bone, bone.quaternion.clone());
    }

    for (const name of ['chassisRF_wheelAxle_turnY', 'chassisLF_wheelAxle_turnY']) {
      const bone = root.getObjectByName(name);
      if (!bone) continue;
      rover.steeringBones.push(bone);
      rover.boneRest.set(bone, bone.quaternion.clone());
    }

    if (rover.spinBones.length !== 6 || rover.steeringBones.length !== 2) {
      console.warn(
        '[Rover] Some wheel control bones were not found.',
        { rover: rover.label, spin: rover.spinBones.length, steering: rover.steeringBones.length },
      );
    }
    return rover;
  }

  function mountRovers(outpostBounds) {
    if (rovers.length || isDestroyed) return;

    sharedGltfLoader.load(
      '/lunar/rover/rover.glb',
      gltf => {
        if (isDestroyed) return;
        const template = gltf.scene;
        registerCachedScene(template);
        template.updateMatrixWorld(true);

        // Measure once on the pristine asset, then fit every copy identically.
        const sourceSize = new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3());
        const fitScale = ROVER_TARGET_WIDTH / Math.max(sourceSize.x, sourceSize.z, 0.001);
        const fleetCenterX = (outpostBounds.min.x + outpostBounds.max.x) / 2;
        const fleetBaseZ = outpostBounds.min.z - 12;

        for (const slot of ROVER_SLOTS) {
          // cloneSkinnedRig keeps the template untouched and re-binds the new
          // chassis to its own bones, so wheels never animate in lock-step.
          const root = cloneSkinnedRig(template);
          root.name = `Playable Moon Rover ${slot.id}`;
          root.scale.multiplyScalar(fitScale);
          root.updateMatrixWorld(true);

          const rover = createRoverRig(root, slot);
          const bounds = new THREE.Box3().setFromObject(root);
          const size = bounds.getSize(new THREE.Vector3());
          const center = bounds.getCenter(new THREE.Vector3());
          // Keep the entire rover footprint above the sampled terrain, rather
          // than positioning only its center over the ground.
          rover.halfLength = Math.max(size.x * 0.46, 0.5);
          rover.halfWidth = Math.max(size.z * 0.46, 0.5);

          const targetX = fleetCenterX + slot.offsetX;
          const targetZ = fleetBaseZ + slot.offsetZ;
          const roverX = targetX - center.x;
          const roverZ = targetZ - center.z;
          rover.heading = 0;
          const groundY = roverSupportHeightAt(roverX, roverZ, rover);
          root.position.set(
            roverX,
            groundY - bounds.min.y + OUTPOST_GROUND_EPSILON,
            roverZ,
          );
          rover.groundOffset = root.position.y - groundY;

          root.traverse(object => {
            if (object.isMesh) {
              object.castShadow = true;
              object.receiveShadow = true;
            }
          });
          scene.add(root);
          root.updateMatrixWorld(true);
          // Start the chassis already settled at its parked attitude, so the
          // first frame does not snap it onto the slope.
          rover.chassisQuaternion.copy(root.quaternion);
          rovers.push(rover);
        }

        console.info('[Rover] Fleet ready. Arrow Up drives; Left/Right steer.', {
          rovers: rovers.map(rover => ({
            label: rover.label,
            spinBones: rover.spinBones.length,
            steeringBones: rover.steeringBones.length,
          })),
        });
        refreshRoverMonitors();
        refreshLiveScreens();
        onRoverReady(true);
      },
      undefined,
      error => console.error('Unable to load /lunar/rover/rover.glb', error),
    );
  }

  function mountCommandCenter(outpost, model) {
    if (isDestroyed) return;

    if (!model) {
      console.warn('Command center model could not be loaded.');
      return;
    }

    model.updateMatrixWorld(true);
    const sourceBounds = new THREE.Box3().setFromObject(model);
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    const scale = COMMAND_CENTER_WIDTH / Math.max(sourceSize.x, 1);
    model.scale.multiplyScalar(scale);
    model.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });

    const commandCenter = new THREE.Group();
    commandCenter.name = 'Command Center';
    commandCenter.add(model);
    commandCenterRoot = commandCenter;
    commandCenterModelRoot = model;
    commandCenterExteriorShell = model.getObjectByName('CommandCenter_Exterior_SM');
    // The full model has its entrance and stairs on +Z; face them away from
    // the outpost while keeping the authored shell, interior, and stairs aligned.
    commandCenter.rotation.y = Math.PI / 2;
    commandCenter.updateMatrixWorld(true);
    const orientedModelBounds = new THREE.Box3().setFromObject(model);
    const orientedModelCenter = orientedModelBounds.getCenter(new THREE.Vector3());
    const outpostBounds = new THREE.Box3().setFromObject(outpost);
    const outpostCenter = outpostBounds.getCenter(new THREE.Vector3());
    const targetX = outpostBounds.max.x + COMMAND_CENTER_GAP
      + orientedModelBounds.getSize(new THREE.Vector3()).x / 2;
    const targetZ = outpostCenter.z;
    const groundY = sampleGroundHeight(targetX, targetZ) ?? PLAIN_LEVEL;
    commandCenter.position.set(
      targetX - orientedModelCenter.x,
      groundY - orientedModelBounds.min.y + OUTPOST_GROUND_EPSILON,
      targetZ - orientedModelCenter.z,
    );

    scene.add(commandCenter);
    commandCenter.updateMatrixWorld(true);
    outpost.attach(commandCenter);
    outpost.updateMatrixWorld(true);
    const entrance = model.getObjectByName('commandCenter_Exterior_stairs_SM') || model;
    const entranceBounds = new THREE.Box3().setFromObject(entrance);
    if (!entranceBounds.isEmpty()) {
      const entranceSize = entranceBounds.getSize(new THREE.Vector3());
      commandCenterTarget = {
        id: '024',
        name: 'Command Center',
        roomType: 'commandCenter',
        center: entranceBounds.getCenter(new THREE.Vector3()),
        bounds: {
          minX: entranceBounds.min.x,
          maxX: entranceBounds.max.x,
          minZ: entranceBounds.min.z,
          maxZ: entranceBounds.max.z,
        },
        radius: Math.max(8, Math.max(entranceSize.x, entranceSize.z) * 1.5),
      };
    }
    rebuildOutpostSpatial(outpost);
    buildRoverMonitors();
  }

  // Collision, interaction targets and the map all describe "the outpost", and
  // the outpost keeps growing as add-on structures stream in. Every mount calls
  // this once so all three stay in step instead of each one patching its own copy.
  function rebuildOutpostSpatial(outpost) {
    outpostHeightField = buildOutpostHeightField(outpost);
    componentTargets = buildComponentTargets(outpost);
    if (commandCenterTarget) componentTargets.push(commandCenterTarget);
    if (regolithPlantTarget) componentTargets.push(regolithPlantTarget);
    mapComponents = buildMapComponents(outpost);
    addCommandCenterMapComponent();
    refreshMapBounds();
  }

  // The command center is not named like the numbered outpost parts, so it gets
  // its own map entry. Both the full map and the live minimap read this list.
  function addCommandCenterMapComponent() {
    if (!commandCenterRoot) return;
    const footprint = commandCenterExteriorShell
      ? new THREE.Box3().setFromObject(commandCenterExteriorShell)
      : new THREE.Box3().setFromObject(commandCenterRoot);
    if (footprint.isEmpty()) return;
    mapComponents = mapComponents.filter(component => component.id !== '024');
    mapComponents.push({
      id: '024',
      name: 'Command Center',
      category: 'structure',
      minX: footprint.min.x,
      maxX: footprint.max.x,
      minZ: footprint.min.z,
      maxZ: footprint.max.z,
      x: (footprint.min.x + footprint.max.x) / 2,
      z: (footprint.min.z + footprint.max.z) / 2,
    });
    refreshMapBounds();
  }

  function refreshMapBounds() {
    if (!mapComponents.length) {
      mapBounds = null;
      return;
    }
    mapBounds = {
      minX: Math.min(...mapComponents.map(component => component.minX)),
      maxX: Math.max(...mapComponents.map(component => component.maxX)),
      minZ: Math.min(...mapComponents.map(component => component.minZ)),
      maxZ: Math.max(...mapComponents.map(component => component.maxZ)),
    };
  }

  // The command center GLB ships a two-screen console: the top and bottom
  // downlink monitors. Each one is bound to one rover so the player can walk up,
  // focus a screen, and drive that specific chassis from inside the base.
  function findCommandCenterMonitors(root) {
    // The asset names both screens "CommandCenterMonitor" and its frame/screen
    // meshes "CommandCenterMonitor_1/_2". GLTFLoader force-uniquifies every node
    // name, so the second screen ends up as "CommandCenterMonitor_1" as well.
    // Match by prefix, then keep only the outermost match of each assembly so
    // the meshes inside a monitor are not mistaken for extra monitors.
    const matches = [];
    root.traverse(object => {
      if (object.name?.startsWith('CommandCenterMonitor')) matches.push(object);
    });
    return matches.filter((object) => {
      let parent = object.parent;
      while (parent) {
        if (matches.includes(parent)) return false;
        parent = parent.parent;
      }
      return true;
    });
  }

  function buildRoverMonitors() {
    roverMonitors.length = 0;
    focusedRoverId = null;
    if (!commandCenterRoot || !commandCenterModelRoot) return;

    const screens = findCommandCenterMonitors(commandCenterModelRoot);
    if (screens.length < ROVER_SLOTS.length) {
      console.warn(
        '[Rover monitor] Expected one screen per rover.',
        { found: screens.length, names: screens.map(screen => screen.name) },
      );
    }
    if (!screens.length) {
      console.warn('[Rover monitor] No CommandCenterMonitor nodes found.');
      return;
    }

    commandCenterRoot.updateMatrixWorld(true);
    const placements = screens.map((object) => {
      const bounds = new THREE.Box3().setFromObject(object);
      return { object, bounds, center: bounds.getCenter(new THREE.Vector3()) };
    });
    // Highest screen gets ROVER 01 so the pair reads top-down like a console.
    placements.sort((a, b) => b.center.y - a.center.y);

    // The room's centre decides which way a screen should face, so the picture
    // can never end up painted on the back of the panel.
    const roomCenter = commandCenterExteriorShell
      ? new THREE.Box3().setFromObject(commandCenterExteriorShell).getCenter(new THREE.Vector3())
      : null;

    placements.slice(0, ROVER_SLOTS.length).forEach((placement, index) => {
      const slot = ROVER_SLOTS[index];
      const tint = new THREE.Color(slot.tint);
      // Glow only the inset screen surface (the smallest mesh of the monitor
      // group), and clone its material so the tint never leaks elsewhere.
      const meshes = [];
      placement.object.traverse(child => {
        if (!child.isMesh || !child.material) return;
        const bounds = new THREE.Box3().setFromObject(child);
        const size = bounds.getSize(new THREE.Vector3());
        meshes.push({ child, volume: size.x * size.y * size.z });
      });
      meshes.sort((a, b) => a.volume - b.volume);

      const screenMaterials = [];
      const screenMesh = meshes.length ? meshes[0].child : null;
      for (const { child } of meshes.slice(0, 1)) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const cloned = materials.map(material => {
          const copy = material.clone();
          screenMaterials.push({
            material: copy,
            color: copy.emissive ? copy.emissive.clone() : null,
            intensity: copy.emissiveIntensity ?? 1,
          });
          return copy;
        });
        child.material = Array.isArray(child.material) ? cloned : cloned[0];
      }

      roverMonitors.push({
        roverId: slot.id,
        label: slot.label,
        object: placement.object,
        center: placement.center,
        bounds: placement.bounds,
        tint,
        screenMaterials,
        feed: screenMesh ? createRoverFeed(screenMesh, placement.object, roomCenter) : null,
      });
    });

    console.info('[Rover monitor] Downlink screens bound.', {
      monitors: roverMonitors.map(monitor => monitor.label),
    });
    refreshRoverMonitors();
    buildOutpostDisplay(roomCenter);
    refreshLiveScreens();
  }

  // ── Live screens ──────────────────────────────────────────────────────────
  // A capture is only possible when the surface is actually drawable, and the
  // monitor sits inside a sealed module where the surface is hidden. So every
  // capture briefly re-exposes the world, renders, then restores the interior
  // state it replaced — the room looks untouched one frame later.
  function captureSurfaceView(camera, target) {
    const restore = {
      terrain: moonTerrainMeshes.map(terrain => terrain.visible),
      horizon: horizon.visible,
      outpost: outpostRoot?.visible ?? false,
      commandCenter: commandCenterRoot?.visible ?? false,
      shell: commandCenterExteriorShell?.visible ?? false,
      background: scene.background,
    };
    moonTerrainMeshes.forEach(terrain => { terrain.visible = true; });
    horizon.visible = true;
    if (outpostRoot) outpostRoot.visible = true;
    if (commandCenterRoot) commandCenterRoot.visible = true;
    if (commandCenterExteriorShell) commandCenterExteriorShell.visible = true;
    scene.background = ASSET_CACHE.skyTexture ?? scene.background;

    // No screen may sample the target it is being drawn into.
    for (const plane of feedPlanes) plane.visible = false;

    const previousTarget = renderer.getRenderTarget();
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      for (const plane of feedPlanes) plane.visible = true;
      moonTerrainMeshes.forEach((terrain, index) => {
        terrain.visible = restore.terrain[index] ?? true;
      });
      horizon.visible = restore.horizon;
      if (outpostRoot) outpostRoot.visible = restore.outpost;
      if (commandCenterRoot) commandCenterRoot.visible = restore.commandCenter;
      if (commandCenterExteriorShell) commandCenterExteriorShell.visible = restore.shell;
      scene.background = restore.background;
    }
  }

  // A screen modelled as a slab, or a wall panel tilted downward for viewing,
  // has its real surface at an angle the bounding box completely hides — the
  // command center's big display is a single quad pitched ~35 degrees. So measure
  // the geometry itself: cluster triangles by normal, take the largest face, and
  // return its exact plane, basis and size. Fitting to that face is what makes a
  // picture land flat on the glass and cover all of it.
  function fitPlaneToLargestFace(mesh, roomCenter) {
    const geometry = mesh.geometry;
    const position = geometry?.attributes?.position;
    if (!position) return null;
    const index = geometry.index;
    const triangleCount = Math.floor((index ? index.count : position.count) / 3);
    if (!triangleCount) return null;

    const matrix = mesh.matrixWorld;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const vertex = (target, i) => target.fromBufferAttribute(position, i).applyMatrix4(matrix);

    const clusters = [];
    for (let t = 0; t < triangleCount; t += 1) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      vertex(a, i0);
      vertex(b, i1);
      vertex(c, i2);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      normal.crossVectors(ab, ac);
      const area = normal.length() * 0.5;
      if (area < 1e-9) continue;
      normal.normalize();
      let cluster = null;
      for (const candidate of clusters) {
        const magnitude = candidate.sum.length();
        if (magnitude > 0 && candidate.sum.dot(normal) > 0.99 * magnitude) {
          cluster = candidate;
          break;
        }
      }
      if (!cluster) {
        cluster = { sum: new THREE.Vector3(), area: 0, points: [] };
        clusters.push(cluster);
      }
      cluster.sum.addScaledVector(normal, area);
      cluster.area += area;
      cluster.points.push(a.clone(), b.clone(), c.clone());
    }
    if (!clusters.length) return null;

    let face = clusters[0];
    for (const candidate of clusters) if (candidate.area > face.area) face = candidate;

    const facing = face.sum.clone().normalize();
    const centroid = new THREE.Vector3();
    for (const point of face.points) centroid.add(point);
    centroid.divideScalar(face.points.length);
    if (roomCenter && facing.dot(roomCenter.clone().sub(centroid)) < 0) facing.negate();

    // Orthonormal basis: right across the glass, up the glass, out of it.
    const reference = Math.abs(facing.y) > 0.95
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(reference, facing).normalize();
    const up = new THREE.Vector3().crossVectors(facing, right).normalize();

    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    let depth = 0;
    for (const point of face.points) {
      const u = point.dot(right);
      const v = point.dot(up);
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
      depth += point.dot(facing);
    }
    depth /= face.points.length;

    const center = new THREE.Vector3()
      .addScaledVector(right, (uMin + uMax) / 2)
      .addScaledVector(up, (vMin + vMax) / 2)
      .addScaledVector(facing, depth);

    return {
      normal: facing,
      right,
      up,
      center,
      width: Math.max(uMax - uMin, 0.02),
      height: Math.max(vMax - vMin, 0.02),
    };
  }

  // Lay a panel over the display's real face, just clear of it. The size and the
  // angle both come from that face, so the picture covers the whole screen.
  function createFeedPlane(screenMesh, bodyObject, roomCenter, texture, face) {
    if (!face) return null;
    const normal = face.normal;
    const bodyBounds = bodyObject === screenMesh
      ? new THREE.Box3().setFromObject(screenMesh)
      : new THREE.Box3().setFromObject(bodyObject);
    const bodySize = bodyBounds.getSize(new THREE.Vector3());
    const bodyCenter = bodyBounds.getCenter(new THREE.Vector3());
    const bodyExtent = Math.abs(normal.x) * bodySize.x * 0.5
      + Math.abs(normal.y) * bodySize.y * 0.5
      + Math.abs(normal.z) * bodySize.z * 0.5;
    // How far the glass sits inside its housing along the facing direction. A
    // flat face has no housing of its own, so a hair of clearance is enough.
    const flatFace = bodyObject === screenMesh;
    const faceDepth = flatFace ? 0 : Math.max(face.center.clone().sub(bodyCenter).dot(normal), 0);
    const clearance = flatFace ? 0.012 : Math.max(0.012, bodyExtent - faceDepth + 0.012);

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: texture,
        toneMapped: false,
        color: 0xffffff,
        side: THREE.DoubleSide,
      }),
    );
    plane.name = 'Live screen';
    plane.position.copy(face.center).addScaledVector(normal, clearance);
    plane.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(face.right, face.up, normal),
    );
    plane.scale.set(face.width, face.height, 1);
    plane.updateMatrixWorld(true);
    plane.renderOrder = 2;

    // attach() keeps the world placement while making the plane a child of the
    // command center, so it hides and restores together with the interior.
    commandCenterRoot.attach(plane);
    feedPlanes.push(plane);
    return { plane, panelWidth: face.width, panelHeight: face.height };
  }

  function feedRenderTarget(panelAspect, baseWidth) {
    let width = baseWidth;
    let height = Math.max(48, Math.round(width / Math.max(panelAspect, 0.2)));
    if (height > 512) {
      height = 512;
      width = Math.round(height * Math.max(panelAspect, 0.2));
    }
    return new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });
  }

  // ── Small console monitors: the rover itself, where it is parked ──────────
  function createRoverFeed(screenMesh, monitorGroup, roomCenter) {
    const face = fitPlaneToLargestFace(screenMesh, roomCenter);
    if (!face) return null;
    // The capture matches the glass aspect exactly, so the picture fills it
    // without stretching or letterboxing.
    const target = feedRenderTarget(face.width / face.height, ROVER_FEED_WIDTH);
    const camera = new THREE.PerspectiveCamera(
      ROVER_FEED_FOV,
      face.width / face.height,
      0.5,
      900,
    );
    const created = createFeedPlane(screenMesh, monitorGroup, roomCenter, target.texture, face);
    if (!created) return null;
    return { plane: created.plane, camera, target, pose: null };
  }

  function renderRoverFeed(feed, rover) {
    const position = rover.root.position;
    feed.camera.position.copy(position).add(roverFeedOffset);
    feed.camera.lookAt(position.x, position.y + 1, position.z);
    captureSurfaceView(feed.camera, feed.target);
    feed.pose = { x: position.x, z: position.z, heading: rover.heading };
  }

  function roverHasMoved(feed, rover) {
    if (!feed.pose) return true;
    const position = rover.root.position;
    return Math.abs(feed.pose.x - position.x) > ROVER_FEED_MOVE_EPSILON
      || Math.abs(feed.pose.z - position.z) > ROVER_FEED_MOVE_EPSILON
      || Math.abs(feed.pose.heading - rover.heading) > 0.05;
  }

  function refreshRoverFeeds(roverFilter = null, force = false) {
    if (isDestroyed || !roverMonitors.length) return false;
    let rendered = false;
    for (const monitor of roverMonitors) {
      if (!monitor.feed) continue;
      if (roverFilter !== null && monitor.roverId !== roverFilter) continue;
      const rover = roverById(monitor.roverId);
      if (!rover) continue;
      if (!force && !roverHasMoved(monitor.feed, rover)) continue;
      renderRoverFeed(monitor.feed, rover);
      rendered = true;
    }
    return rendered;
  }

  // ── Large wall display: the whole outpost, live ───────────────────────────
  function buildOutpostDisplay(roomCenter) {
    if (outpostFeed || !commandCenterModelRoot) return;
    const screens = [];
    commandCenterModelRoot.traverse(child => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const name = materials.find(material => material?.name)?.name;
      if (OUTPOST_SCREEN_MATERIALS.includes(name)) screens.push({ mesh: child, name });
    });
    if (!screens.length) {
      console.warn('[Outpost display] No large screen mesh found.', {
        materials: OUTPOST_SCREEN_MATERIALS,
      });
      return;
    }
    // Prefer the authored screen material over the fallback panel, then take the
    // largest match in case the artist reused it.
    screens.sort((a, b) => {
      const rank = OUTPOST_SCREEN_MATERIALS.indexOf(a.name)
        - OUTPOST_SCREEN_MATERIALS.indexOf(b.name);
      if (rank !== 0) return rank;
      return new THREE.Box3().setFromObject(b.mesh).getSize(new THREE.Vector3()).length()
        - new THREE.Box3().setFromObject(a.mesh).getSize(new THREE.Vector3()).length();
    });
    const screenMesh = screens[0].mesh;
    const face = fitPlaneToLargestFace(screenMesh, roomCenter);
    if (!face) {
      console.warn('[Outpost display] Could not fit a plane to the screen face.');
      return;
    }
    // Capture at the glass' own aspect so the picture covers the whole screen.
    const target = feedRenderTarget(face.width / face.height, OUTPOST_FEED_WIDTH);
    const created = createFeedPlane(screenMesh, screenMesh, roomCenter, target.texture, face);
    if (!created) return;
    outpostFeed = {
      plane: created.plane,
      target,
      camera: new THREE.PerspectiveCamera(
        OUTPOST_FEED_FOV,
        face.width / face.height,
        1,
        30000,
      ),
    };
    console.info('[Outpost display] Large screen bound.', {
      mesh: screenMesh.name,
      material: screens[0].name,
      size: [Math.round(face.width * 100) / 100, Math.round(face.height * 100) / 100],
      pitchDeg: Math.round(Math.asin(-face.normal.y) * 180 / Math.PI),
    });
  }

  function outpostFeedBounds() {
    if (!outpostRoot) return null;
    const bounds = new THREE.Box3().setFromObject(outpostRoot);
    // Inside the command center its root is reparented to the scene, so the
    // outpost box alone would leave the building out of shot.
    if (commandCenterRoot) bounds.union(new THREE.Box3().setFromObject(commandCenterRoot));
    return bounds.isEmpty() ? null : bounds;
  }

  function refreshOutpostFeed() {
    if (isDestroyed || !outpostFeed || !outpostRoot) return false;
    const bounds = outpostFeedBounds();
    if (!bounds) return false;

    // Comms masts and solar towers dominate the raw bounding box (94 x 72 x 72),
    // so aiming at its centre would put the camera 36 units above the ground and
    // shove the whole base to the far distance. Frame the base instead: the full
    // footprint plus a modest band of height above the deck.
    const size = bounds.getSize(outpostFeedSize);
    const heightBand = Math.min(size.y, Math.max(size.x, size.z) * 0.35);
    const center = bounds.getCenter(outpostFeedCenter);
    center.y = bounds.min.y + heightBand * 0.5;
    const groundY = bounds.min.y;
    const topY = bounds.min.y + heightBand;

    const camera = outpostFeed.camera;
    // Turn the scaler's azimuth/elevation into the camera direction for this
    // capture, and apply the lens angle before the fit is solved.
    const azimuth = THREE.MathUtils.degToRad(outpostFeedView.azimuthDeg);
    const elevation = THREE.MathUtils.degToRad(outpostFeedView.elevationDeg);
    const cosElevation = Math.cos(elevation);
    outpostFeedDirection.set(
      Math.sin(azimuth) * cosElevation,
      Math.sin(elevation),
      Math.cos(azimuth) * cosElevation,
    ).normalize();
    camera.fov = outpostFeedView.fov;
    const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
    const tanHorizontal = tanVertical * camera.aspect;

    // Solve the distance that fits every corner of the base rather than guessing
    // from a bounding radius: on a wide panel the vertical field of view alone
    // would leave the base as a speck.
    camera.position.copy(center).addScaledVector(outpostFeedDirection, 1);
    camera.lookAt(center.x, center.y, center.z);
    camera.updateMatrixWorld(true);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const back = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);

    const corner = new THREE.Vector3();
    let fitWidth = 0;
    let fitHeight = 0;
    for (let i = 0; i < 8; i += 1) {
      corner.set(
        (i & 1) ? bounds.max.x : bounds.min.x,
        (i & 2) ? topY : groundY,
        (i & 4) ? bounds.max.z : bounds.min.z,
      ).sub(center);
      const alongView = corner.dot(back);
      fitWidth = Math.max(fitWidth, alongView + Math.abs(corner.dot(right)) / tanHorizontal);
      fitHeight = Math.max(fitHeight, alongView + Math.abs(corner.dot(up)) / tanVertical);
    }
    // Fill the panel's width and let the depth run slightly past the top and
    // bottom edges — a wide display should read as a vista, not a stamp.
    const distance = Math.max(fitWidth, fitHeight * OUTPOST_FEED_VERTICAL_FIT, 8) * 1.02;

    camera.position.copy(center).addScaledVector(outpostFeedDirection, distance);
    camera.near = Math.max(distance * 0.05, 0.5);
    camera.far = 30000;
    camera.updateProjectionMatrix();
    camera.lookAt(center.x, center.y, center.z);

    captureSurfaceView(camera, outpostFeed.target);
    return true;
  }

  // Both screen families refresh together: the wall display is a live view, the
  // rover screens only re-capture the chassis that actually moved since the last
  // frame they were drawn.
  function refreshLiveScreens() {
    refreshRoverFeeds();
    refreshOutpostFeed();
  }

  // In-game scaler for the wall display. Values are stored here and applied on
  // the next capture — the live timer inside the command center picks them up
  // within a quarter second, which keeps a dragged slider from queueing a whole
  // scene render on every input event.
  function getOutpostFeedView() {
    return { ...outpostFeedView };
  }

  function setOutpostFeedView(next = {}) {
    if (Number.isFinite(next.azimuthDeg)) {
      outpostFeedView.azimuthDeg = ((next.azimuthDeg % 360) + 360) % 360;
    }
    if (Number.isFinite(next.elevationDeg)) {
      outpostFeedView.elevationDeg = THREE.MathUtils.clamp(next.elevationDeg, 2, 88);
    }
    if (Number.isFinite(next.fov)) {
      outpostFeedView.fov = THREE.MathUtils.clamp(next.fov, 15, 90);
    }
    return getOutpostFeedView();
  }

  function resetOutpostFeedView() {
    outpostFeedView.azimuthDeg = 19;
    outpostFeedView.elevationDeg = 24;
    outpostFeedView.fov = OUTPOST_FEED_FOV;
    return getOutpostFeedView();
  }

  // The picture now covers the whole glass, so the focus cue rides on its
  // brightness: dim while idle, brighter when aimed at, brightest while linked.
  function refreshRoverMonitors() {
    for (const monitor of roverMonitors) {
      const linked = roverCameraActive && activeRover?.id === monitor.roverId;
      const focused = focusedRoverId === monitor.roverId;
      for (const entry of monitor.screenMaterials) {
        const material = entry.material;
        if (!material.emissive) continue;
        if (entry.color) material.emissive.copy(entry.color);
        material.emissive.lerp(monitor.tint, linked ? 0.9 : focused ? 0.55 : 0.2);
        material.emissiveIntensity = entry.intensity * (linked ? 2.4 : focused ? 1.6 : 1);
      }
      if (monitor.feed?.plane) {
        monitor.feed.plane.material.color.setScalar(linked ? 1 : focused ? 0.94 : 0.85);
      }
    }
  }

  function loadCommandCenter(outpost) {
    loadCachedGLTF(
      '/lunar/Command_Center/Command%20center%20full.glb',
      model => mountCommandCenter(outpost, model),
      undefined,
      error => console.warn('Command center model could not be loaded.', error),
    );
  }

  // Highest ground under a rectangular footprint, so a long structure rests on
  // the highest point it spans instead of sinking on one side. Null when the
  // footprint falls outside the scanned terrain.
  function groundHeightUnderFootprint(centerX, centerZ, sizeX, sizeZ) {
    const halfX = Math.max(sizeX, 1) / 2;
    const halfZ = Math.max(sizeZ, 1) / 2;
    let highest = -Infinity;
    for (let i = 0; i <= 3; i += 1) {
      for (let j = 0; j <= 3; j += 1) {
        const x = centerX - halfX + (sizeX * i) / 3;
        const z = centerZ - halfZ + (sizeZ * j) / 3;
        const height = sampleGroundHeight(x, z);
        if (height !== null && Number.isFinite(height)) highest = Math.max(highest, height);
      }
    }
    return Number.isFinite(highest) ? highest : null;
  }

  // The regolith plant: the oxygen side of the ISRU loop. It sits opposite the
  // command center so the two wings frame the outpost, and it is registered as a
  // component target so proximity prompts, daily tasks, events and the map all
  // find it the same way they find a numbered outpost module.
  function mountRegolithPlant(outpost, model) {
    if (isDestroyed || !model) return;
    // The kit is authored at true scale in metres; one game unit is ~0.53 m.
    const scale = REGOLITH_PLANT_SCALE;
    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);
    model.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });

    const plant = new THREE.Group();
    // The 0NN- name is what the map, the event targeting and the collision
    // rasterizer key off, so the plant behaves like any other outpost part.
    plant.name = '025-regolith-plant';
    plant.add(model);
    plant.updateMatrixWorld(true);

    const plantBounds = new THREE.Box3().setFromObject(plant);
    const plantSize = plantBounds.getSize(new THREE.Vector3());
    const outpostBounds = new THREE.Box3().setFromObject(outpost);
    const outpostCenter = outpostBounds.getCenter(new THREE.Vector3());
    // Mirror the command center: stand off the far side of the outpost.
    const targetX = outpostBounds.min.x - REGOLITH_PLANT_GAP - plantSize.x / 2;
    const targetZ = outpostCenter.z + plantSize.z * 0.15;
    // The installation is long and the mare is uneven, so a single centre sample
    // lets the uphill half sink into the ground. Take the highest point under the
    // whole footprint and stand the grade plane on that.
    //
    // The merged kit is built around a grade plane at y = 0, with the O2 tank's
    // footing ring deliberately below it, so the model seats on grade rather than
    // on its lowest vertex — otherwise that buried ring is lifted back out and
    // the tank reads as hovering.
    const groundY = (groundHeightUnderFootprint(targetX, targetZ, plantSize.x, plantSize.z)
      ?? sampleGroundHeight(targetX, targetZ)
      ?? PLAIN_LEVEL) + REGOLITH_PLANT_LIFT;
    plant.position.set(
      targetX - (plantBounds.min.x + plantBounds.max.x) / 2,
      groundY,
      targetZ - (plantBounds.min.z + plantBounds.max.z) / 2,
    );

    scene.add(plant);
    plant.updateMatrixWorld(true);
    outpost.attach(plant);
    outpost.updateMatrixWorld(true);

    // Remember the emissive materials (terminal screen, socket lights) so a
    // maintenance cycle can pulse them.
    regolithPlantLights.length = 0;
    plant.traverse(object => {
      if (!object.isMesh || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material.emissive) continue;
        if (regolithPlantLights.some(entry => entry.material === material)) continue;
        regolithPlantLights.push({ material, base: material.emissiveIntensity ?? 1 });
      }
    });

    const placedBounds = new THREE.Box3().setFromObject(plant);
    const placedSize = placedBounds.getSize(new THREE.Vector3());
    regolithPlantTarget = {
      id: '025',
      name: 'Regolith Plant',
      roomType: 'regolithPlant',
      center: placedBounds.getCenter(new THREE.Vector3()),
      bounds: {
        minX: placedBounds.min.x,
        maxX: placedBounds.max.x,
        minZ: placedBounds.min.z,
        maxZ: placedBounds.max.z,
      },
      // Generous reach: the installation is long, so the prompt should trigger
      // from anywhere along its working face.
      radius: Math.max(10, Math.max(placedSize.x, placedSize.z) * 0.75),
    };

    rebuildOutpostSpatial(outpost);
    console.info('[Regolith plant] Installed.', {
      scale,
      size: [Math.round(placedSize.x * 10) / 10, Math.round(placedSize.z * 10) / 10],
    });
  }

  function loadRegolithPlant(outpost) {
    loadCachedGLTF(
      '/lunar/regolith/regolith_plant.glb',
      model => mountRegolithPlant(outpost, model),
      undefined,
      error => console.warn('Regolith plant model could not be loaded.', error),
    );
  }

  function onTerrainGeometryReady(entry, geometry) {
    if (isDestroyed) return;
    const box = geometry.boundingBox || new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
    const size = box.getSize(new THREE.Vector3());

    const terrain = new THREE.Mesh(geometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2;
    const horizontalSpan = Math.max(size.x, size.y) || 1;
    const horizontalScale = TERRAIN_SPAN / horizontalSpan;
    const nominalHeight = size.z * (TERRAIN_SPAN / Math.max(size.x, size.y, size.z));
    terrain.scale.set(horizontalScale, horizontalScale, horizontalScale);
    terrain.position.set(0, 0, 0);
    terrain.castShadow = false;
    terrain.receiveShadow = true;
    terrain.userData.siteName = entry.name;
    scene.add(terrain);
    moonTerrainMeshes.push(terrain);
    terrainScans.push({ name: entry.name, terrain, size, horizontalScale, nominalHeight });
    loaded++;

    if (loaded === models.length) {
      terrainScans.sort((a, b) => a.name.localeCompare(b.name));
      const apollo12 = terrainScans[0];
      const apollo16 = terrainScans[1];
      const sharedRelief = apollo16.nominalHeight;

      for (const scan of terrainScans) {
        scan.terrain.scale.set(scan.horizontalScale, scan.horizontalScale, sharedRelief / scan.size.z);
        const bounds = new THREE.Box3().setFromObject(scan.terrain);
        scan.terrain.position.y -= bounds.min.y;
        scan.width = bounds.max.x - bounds.min.x;
      }

      apollo12.terrain.scale.multiplyScalar(APOLLO_12_SCALE);
      apollo12.width *= APOLLO_12_SCALE;
      apollo12.terrain.position.x = APOLLO_12_POSITION_X;
      apollo12.terrain.position.y += APOLLO_12_POSITION_Y;
      apollo16.terrain.position.x = (apollo12.width + apollo16.width) / 2 - SEAM_OVERLAP;
      const sceneWidth = apollo12.width + apollo16.width;
      // Aerial establishing shot over the Apollo 16 valley (where the outpost
      // site is chosen); the outpost gets framed precisely once it lands.
      const outpostFocusX = apollo16.terrain.position.x;
      controls.target.set(outpostFocusX, sharedRelief * 0.18, 0);
      camera.position.set(
        outpostFocusX + OUTPOST_VIEW_DISTANCE * 0.5,
        sharedRelief + OUTPOST_VIEW_DISTANCE * 0.65,
        OUTPOST_VIEW_DISTANCE * 0.9
      );
      controls.minDistance = LUNAR_OUTPOST_WIDTH * 0.75;
      controls.maxDistance = sceneWidth * 4;
      controls.update();
      buildHeightGrid();
      buildOuterTerrain();

      onLoading({ active: true, text: 'DEPLOYING LUNAR OUTPOST', progress: 75 });
      loadCachedGLTF(
        '/lunar/model.glb',
        outpost => {
          if (isDestroyed) return;
          outpost.updateMatrixWorld(true);

          const originalBounds = new THREE.Box3().setFromObject(outpost);
          const originalSize = originalBounds.getSize(new THREE.Vector3());
          const scale = LUNAR_OUTPOST_WIDTH / Math.max(originalSize.x, originalSize.z, 1);
          outpost.scale.multiplyScalar(scale);
          outpost.updateMatrixWorld(true);

          const bounds = new THREE.Box3().setFromObject(outpost);
          const flatSite = findFlattestOutpostSite(apollo16.terrain.position.x, 0);
          const targetX = flatSite ? flatSite.x : apollo16.terrain.position.x;
          const targetZ = flatSite ? flatSite.z : 0;
          outpost.position.x += targetX - (bounds.min.x + bounds.max.x) / 2;
          outpost.position.z += targetZ - (bounds.min.z + bounds.max.z) / 2;
          outpost.updateMatrixWorld(true);

          // Rest the outpost on the highest ground under its footprint so all
          // components touch flat terrain instead of floating or sinking.
          let surfaceY = flatSite && isFinite(flatSite.maxH) ? flatSite.maxH : null;
          if (surfaceY === null) {
            const raycaster = new THREE.Raycaster(
              new THREE.Vector3(targetX, sharedRelief + sceneWidth, targetZ),
              new THREE.Vector3(0, -1, 0),
              0,
              sceneWidth * 3
            );
            raycaster.firstHitOnly = true;
            const terrainHits = raycaster.intersectObjects([apollo12.terrain, apollo16.terrain], false);
            surfaceY = terrainHits.length ? terrainHits[0].point.y : 0;
          }
          const scaledBounds = new THREE.Box3().setFromObject(outpost);
          outpost.position.y += surfaceY - scaledBounds.min.y + OUTPOST_GROUND_EPSILON;
          outpost.position.x += LUNAR_OUTPOST_POSITION_X;
          outpost.position.z += LUNAR_OUTPOST_POSITION_Z;
          outpost.updateMatrixWorld(true);

          const outpostBounds = new THREE.Box3().setFromObject(outpost);
          const outpostCenter = outpostBounds.getCenter(new THREE.Vector3());
          const outpostSize = outpostBounds.getSize(new THREE.Vector3());
          const viewOffset = Math.max(outpostSize.x, outpostSize.z) * 0.78;
          firstPersonStart.set(
            outpostCenter.x + viewOffset * 0.7,
            surfaceY + playerCameraHeight,
            outpostCenter.z + viewOffset * 0.7
          );
          firstPersonStartGroundY = surfaceY;
          firstPersonLookAt.set(outpostCenter.x, outpostBounds.min.y + outpostSize.y * 0.45, outpostCenter.z);

          // Keep a close, elevated overview ready for the initial arrival and
          // every day-start transition. This frames the complete base while
          // making its structures large enough to inspect.
          const overviewFocus = new THREE.Vector3(
            outpostCenter.x,
            outpostBounds.min.y + outpostSize.y * 0.4,
            outpostCenter.z,
          );
          outpostOverview = {
            focus: overviewFocus,
            destination: new THREE.Vector3(
              outpostCenter.x + OUTPOST_VIEW_DISTANCE * 0.55,
              surfaceY + OUTPOST_VIEW_DISTANCE * 0.75,
              outpostCenter.z + OUTPOST_VIEW_DISTANCE * 0.95,
            ),
          };
          if (cameraMode === 'free' && !earthViewActive && !freeCameraAdjusted) {
            initialCameraApproach = {
              focus: overviewFocus.clone(),
              destination: outpostOverview.destination.clone(),
            };
          }

          outpost.traverse(object => {
            if (object.isMesh) {
              object.castShadow = true;
              object.receiveShadow = true;
            }
          });
          scene.add(outpost);
          outpost.updateMatrixWorld(true);
          outpostRoot = outpost;
          mountRovers(outpostBounds);
          loadCommandCenter(outpost);
          loadRegolithPlant(outpost);
          buildEventVisualization();

          addOutpostPartLabels(outpost);
          componentTargets = buildComponentTargets(outpost);
          mapComponents = buildMapComponents(outpost);
          // Rasterize the component surfaces into walker collision: their
          // walls stop the walker, while ramps and low decks stay climbable.
          outpostHeightField = buildOutpostHeightField(outpost);
          refreshMapBounds();
          startNextEventPresentation();

          const airlockEntrance = outpost.getObjectByName('005-airlock-with-dust-lock-vestibule');
          const entranceBounds = new THREE.Box3().setFromObject(airlockEntrance || outpost);
          airlockTriggerCenter = entranceBounds.getCenter(new THREE.Vector3());
          airlockTriggerRadius = AIRLOCK_PROMPT_DISTANCE;

          onLoading({ active: false, text: 'SURFACE RECON READY', progress: 100 });

          // Warm up GL programs and pull the interior models in while the GPU
          // and network are idle, so entering the airlock/modules never hitches.
          precompileShaders();
          scheduleIdle(() => {
            if (isDestroyed) return;
            loadCachedGLTF('/lunar/airlock.glb', () => { }, undefined, () => { });
            loadCachedGLTF('/lunar/greenhouse.glb', () => { }, undefined, () => { });
            loadCachedGLTF('/lunar/tomato_plant.glb', () => { }, undefined, () => { });
            loadCachedGLTF('/lunar/outpost_interior_kit.glb', () => { }, undefined, () => { });
            loadCachedGLTF('/lunar/sci-fi_lab.glb', () => { }, undefined, () => { });
          });
        },
        event => {
          if (event.total) {
            onLoading({
              active: true,
              text: `DEPLOYING LUNAR OUTPOST · ${Math.round((event.loaded / event.total) * 100)}%`,
              progress: 75 + Math.round((event.loaded / event.total) * 25)
            });
          }
        },
        error => {
          console.error('Unable to load /lunar/model.glb', error);
          onLoading({ active: false, text: 'READY (OUTPOST MISSING)', progress: 100 });
        }
      );
    }
  }

  for (const entry of models) {
    if (ASSET_CACHE[entry.cacheKey]) {
      onTerrainGeometryReady(entry, ASSET_CACHE[entry.cacheKey]);
    } else {
      onLoading({ active: true, text: `MAPPING ${entry.name.toUpperCase()} LANDING SITE`, progress: 10 + loaded * 25 });
      sharedStlLoader.load(
        entry.path,
        geometry => {
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          const center = box.getCenter(new THREE.Vector3());
          geometry.translate(-center.x, -center.y, -center.z);
          ASSET_CACHE[entry.cacheKey] = geometry;
          onTerrainGeometryReady(entry, geometry);
        },
        event => {
          if (event.total) {
            onLoading({
              active: true,
              text: `LOADING ${entry.name.toUpperCase()} · ${Math.round((event.loaded / event.total) * 100)}%`,
              progress: Math.round((event.loaded / event.total) * 50)
            });
          }
        },
        error => {
          console.error(`Unable to load ${entry.name}`, error);
          onLoading({ active: false, text: `ERROR LOADING ${entry.name}`, progress: 100 });
        }
      );
    }
  }

  // Horizon Plane (larger than the camera's far plane, so the ground always
  // meets the sky at the horizon line — the world shows no visible edge)
  const horizonGeo = new THREE.PlaneGeometry(HORIZON_PLANE_SIZE, HORIZON_PLANE_SIZE);
  const horizonMat = new THREE.MeshStandardMaterial({ color: 0x4b4947, roughness: 1 });
  const horizon = new THREE.Mesh(horizonGeo, horizonMat);
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.y = PLAIN_LEVEL - 0.15;
  scene.add(horizon);

  // Static scenery never moves again after placement: stop recomposing its
  // matrices every frame (saves per-frame CPU across hundreds of outpost nodes).
  function precompileShaders() {
    // Compiles scene programs in a background worker so the first frame after
    // a large model appears doesn't stall on shader compilation.
    renderer.compileAsync?.(scene, camera);
  }

  function addOutpostPartLabels(outpost) {
    const partGroups = [];
    const addedLabels = new Set();
    outpost.traverse(object => {
      const match = object.name.match(/^(\d{3})-[^/]+$/);
      const label = match ? OUTPOST_COMPONENT_NAMES[match[1]] : null;
      if (label && !addedLabels.has(label)) {
        addedLabels.add(label);
        partGroups.push({ object, label });
      }
    });

    const parentScale = outpost.getWorldScale(new THREE.Vector3()).x || 1;
    for (const { object, label } of partGroups) {
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) continue;
      const worldPosition = new THREE.Vector3(
        (bounds.min.x + bounds.max.x) * 0.5,
        bounds.max.y + 2.2,
        (bounds.min.z + bounds.max.z) * 0.5
      );
      const canvasTex = document.createElement('canvas');
      canvasTex.width = 512;
      canvasTex.height = 96;
      const context = canvasTex.getContext('2d');
      context.fillStyle = 'rgba(7, 13, 20, 0.88)';
      context.strokeStyle = 'rgba(200, 237, 139, 0.9)';
      context.lineWidth = 3;
      context.beginPath();
      context.roundRect(3, 3, 506, 90, 12);
      context.fill();
      context.stroke();
      context.fillStyle = '#d8f4a8';
      context.font = 'bold 27px monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(label, 256, 49, 474);

      const texture = new THREE.CanvasTexture(canvasTex);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      labelTextures.push(texture);

      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        toneMapped: false
      });
      labelMaterials.push(mat);

      const sprite = new THREE.Sprite(mat);
      const worldWidth = Math.max(3.5, Math.min(7, label.length * 0.28));
      sprite.scale.set(worldWidth / parentScale, worldWidth * (96 / 512) / parentScale, 1);
      sprite.position.copy(outpost.worldToLocal(worldPosition));
      sprite.name = `Label: ${label}`;
      outpost.add(sprite);
    }
  }

  function buildMapComponents(outpost) {
    const boundsById = new Map();
    outpost.traverse(object => {
      const match = object.name.match(/^(\d{3})-[^/]+$/);
      const id = match?.[1];
      if (!id || !OUTPOST_COMPONENT_NAMES[id]) return;

      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) return;
      const existingBounds = boundsById.get(id);
      if (existingBounds) existingBounds.union(bounds);
      else boundsById.set(id, bounds.clone());
    });

    return [...boundsById.entries()].map(([id, bounds]) => {
      const center = bounds.getCenter(new THREE.Vector3());
      return {
        id,
        name: OUTPOST_COMPONENT_NAMES[id],
        category: Number(id) <= 10
          ? (id === '006' ? 'corridor' : 'room')
          : 'equipment',
        minX: bounds.min.x,
        maxX: bounds.max.x,
        minZ: bounds.min.z,
        maxZ: bounds.max.z,
        x: center.x,
        z: center.z,
      };
    });
  }

  function buildComponentTargets(outpost) {
    const definitions = {
      '000': ['Tunnel Junction', 'corridor'],
      '001': ['Cylinder Habitat', 'crew'],
      '002': ['Inflatable Habitat', 'crew'],
      '003': ['Observation Cupola', 'observation'],
      '004': ['Regolith Shielded Habitat', 'crew'],
      '005': ['Airlock', 'airlock'],
      '006': ['Connecting Tunnel', 'corridor'],
      '007': ['Tunnel Junction', 'corridor'],
      '008': ['Greenhouse', 'greenhouse'],
      '009': ['Medical Module', 'medical'],
      '010': ['Workshop', 'engineering'],
      '011': ['Solar Array', 'engineering'],
      '012': ['Solar Tracker Array', 'engineering'],
      '013': ['Solar Tower', 'engineering'],
      '014': ['Radiator Bank', 'engineering'],
      '015': ['Battery Container', 'engineering'],
      '016': ['Nuclear Power Unit', 'engineering'],
      '017': ['Communications Mast', 'engineering'],
      '018': ['Regolith Excavator', 'engineering'],
      '019': ['Open Rover', 'crew'],
      '020': ['Pressurized Rover', 'crew'],
      '021': ['EVA Suit', 'crew'],
      '022': ['Equipment Sled', 'storage'],
      '023': ['Survey Markers', 'engineering']
    };
    const targets = [];
    outpost.traverse(object => {
      const match = object.name.match(/^(\d{3})-[^/]+$/);
      if (!match || !definitions[match[1]]) return;
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) return;
      const size = bounds.getSize(new THREE.Vector3());
      const [name, roomType] = definitions[match[1]];
      targets.push({
        id: match[1],
        name,
        roomType,
        center: bounds.getCenter(new THREE.Vector3()),
        bounds: {
          minX: bounds.min.x,
          maxX: bounds.max.x,
          minZ: bounds.min.z,
          maxZ: bounds.max.z
        },
        radius: Math.max(7, Math.min(18, Math.max(size.x, size.z) * 0.55))
      });
    });
    return targets;
  }

  function ensureComponentInteriorKit(onReady) {
    if (componentInteriorKit) { onReady(componentInteriorKit); return; }
    kitWaiters.push(onReady);
    if (moduleInteriorLoading) return;
    moduleInteriorLoading = true;
    loadCachedGLTF(
      '/lunar/outpost_interior_kit.glb',
      kit => {
        moduleInteriorLoading = false;
        componentInteriorKit = kit;
        const waiters = kitWaiters;
        kitWaiters = [];
        waiters.forEach(cb => { try { cb(componentInteriorKit); } catch (err) { console.error(err); } });
      },
      undefined,
      error => {
        console.error('Unable to load modular outpost interior kit', error);
        moduleInteriorLoading = false;
        kitWaiters = [];
      }
    );
  }

  function ensureWorkshopInterior(onReady) {
    if (workshopInteriorModel) { onReady(workshopInteriorModel); return; }
    workshopWaiters.push(onReady);
    if (workshopInteriorLoading) return;
    workshopInteriorLoading = true;
    loadCachedGLTF(
      '/lunar/sci-fi_lab.glb',
      model => {
        workshopInteriorLoading = false;
        workshopInteriorModel = model;
        const waiters = workshopWaiters;
        workshopWaiters = [];
        waiters.forEach(cb => { try { cb(workshopInteriorModel); } catch (err) { console.error(err); } });
      },
      undefined,
      error => {
        console.error('Unable to load workshop interior model', error);
        workshopInteriorLoading = false;
        workshopWaiters = [];
      }
    );
  }

  function disposeModuleInterior(room) {
    if (!room) return;
    for (const g of activeModuleGeometries) g.dispose();
    for (const m of activeModuleMaterials) m.dispose();
    activeModuleGeometries = [];
    activeModuleMaterials = [];
  }

  function createWorkshopInterior(model) {
    const room = model.clone(true);
    room.name = 'Workshop Interior';
    room.updateMatrixWorld(true);
    const originalBounds = new THREE.Box3().setFromObject(room);
    const originalSize = originalBounds.getSize(new THREE.Vector3());
    const scale = 8 / Math.max(originalSize.x, originalSize.z, 0.01);
    room.scale.multiplyScalar(scale);
    room.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(room);
    const center = bounds.getCenter(new THREE.Vector3());
    room.position.set(-center.x, -bounds.min.y, -center.z);
    room.updateMatrixWorld(true);
    room.traverse(node => {
      if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; }
    });
    return room;
  }

  function createModuleInterior(roomType, workshopModel) {
    disposeModuleInterior(activeModuleInterior);
    if (roomType === 'engineering' && workshopModel) {
      return createWorkshopInterior(workshopModel);
    }
    const room = new THREE.Group();
    room.name = `${roomType} Module Interior`;
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x8c969d, roughness: 0.86, side: THREE.DoubleSide });
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x343d45, roughness: 0.92, metalness: 0.25 });
    activeModuleMaterials.push(wallMaterial, floorMaterial);

    function box(width, height, depth, x, y, z, mat = wallMaterial) {
      const geo = new THREE.BoxGeometry(width, height, depth);
      activeModuleGeometries.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      room.add(mesh);
      return mesh;
    }

    box(8, 0.18, 8, 0, -0.09, 0, floorMaterial);
    box(0.18, 3.4, 8, -4, 1.7, 0);
    box(0.18, 3.4, 8, 4, 1.7, 0);
    box(8, 3.4, 0.18, 0, 1.7, -4);
    box(3.1, 3.4, 0.18, -2.45, 1.7, 4);
    box(3.1, 3.4, 0.18, 2.45, 1.7, 4);
    box(1.8, 0.4, 0.18, 0, 3.2, 4);

    const furniture = {
      crew: [
        ['053-bunk-unit', -2.2, -2.8, 2.1], ['054-bunk-unit', 2.2, -2.8, 2.1],
        ['055-locker-bank', 3.1, 0, 2.1], ['056-mess-table', 0, 0.2, 1.1], ['057-galley-unit', -3.1, 0.5, 1.8]
      ],
      observation: [
        ['030-helm-console', 0, -2.9, 1.8], ['033-captain-chair', 0, -1.4, 1.4],
        ['038-holo-table', 2.5, 1.2, 1.2], ['034-console-station', -2.5, 1.2, 1.5]
      ],
      medical: [
        ['060-medbay-bed', 1.5, -1.7, 2.1], ['061-medical-cabinet', -2.8, -1.4, 1.9],
        ['062-console-station', 2.7, 1.7, 1.5], ['063-crew-seat', 1.4, 1.6, 1]
      ],
      engineering: [
        ['049-engineering-console', 0, -2.8, 1.7], ['045-turbine-unit', -2.7, -1, 2],
        ['044-coolant-tank', 2.7, -1.2, 2], ['046-server-rack', -2.8, 1.8, 2.1], ['039-reactor-core', 2.5, 1.7, 2.4]
      ],
      corridor: [
        ['029-wall-console', -2.6, -1.8, 1.5], ['050-maintenance-hatch', 2.6, -1.8, 1.6],
        ['052-conduit-straight', 0, -2.8, 2.5]
      ],
      storage: [
        ['067-cargo-container', -2.2, -2.2, 2], ['068-cargo-container', 2.2, -2.2, 2],
        ['069-storage-crate', -2.3, 0.7, 1.1], ['072-crate-tall', 2.2, 1, 1.8], ['073-supply-drum', 0, 1.5, 1.2]
      ]
    };

    const props = furniture[roomType] || furniture.engineering;
    for (const [partName, x, z, targetHeight] of props) {
      const source = componentInteriorKit.getObjectByName(partName);
      if (!source) continue;
      const prop = source.clone(true);
      prop.updateMatrixWorld(true);
      const origBounds = new THREE.Box3().setFromObject(prop);
      const origSize = origBounds.getSize(new THREE.Vector3());
      prop.scale.multiplyScalar(targetHeight / Math.max(origSize.y, origSize.x, 0.01));
      prop.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(prop);
      const c = b.getCenter(new THREE.Vector3());
      prop.position.add(new THREE.Vector3(x - c.x, -b.min.y, z - c.z));
      prop.traverse(node => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; } });
      room.add(prop);
    }
    room.updateMatrixWorld(true);
    return room;
  }

  function setTaskTargets(targets) {
    activeTaskTargets = Array.isArray(targets)
      ? targets.map(target => ({
          componentId: target.componentId,
          taskId: target.taskId ?? null,
          label: target.label || '',
          status: target.status || 'available',
          isActive: target.isActive === true,
        }))
      : [];
    // A fresh in-progress (or overdue) plant task re-arms the maintenance prompt.
    const plantTask = activeTaskTargets.find(
      entry => entry.componentId === '025'
        && (entry.status === 'inProgress' || entry.status === 'overdue'),
    );
    if (plantTask) regolithPlantMaintained = false;
    console.log(
      '[TaskConsole] active targets:',
      activeTaskTargets
        .map(entry => `${entry.componentId}:${entry.taskId ?? '-'}:${entry.status}`)
        .join(', ') || '(none)'
    );
    refreshTaskConsole();
  }

  function drawTaskConsoleUnitLabel(unit) {
    if (!unit.canvas || !unit.texture) return;
    const context = unit.canvas.getContext('2d');
    const palette = {
      inProgress: { border: 'rgba(57, 255, 136, 0.95)', text: '#c9ffd9' },
      completed: { border: 'rgba(148, 220, 158, 0.55)', text: '#9cdfa4' },
      standby: { border: 'rgba(120, 150, 155, 0.6)', text: '#8fa3a8' },
    }[unit.status] ?? { border: 'rgba(120, 150, 155, 0.6)', text: '#8fa3a8' };
    context.clearRect(0, 0, unit.canvas.width, unit.canvas.height);
    context.fillStyle = 'rgba(6, 14, 18, 0.88)';
    context.strokeStyle = palette.border;
    context.lineWidth = 6;
    context.beginPath();
    context.roundRect(4, 4, unit.canvas.width - 8, unit.canvas.height - 8, 18);
    context.fill();
    context.stroke();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = palette.text;
    context.font = 'bold 28px monospace';
    const text = unit.status === 'completed'
      ? `✓ ${unit.label || 'DONE'}`
      : (unit.label || 'STANDBY');
    context.fillText(text.toUpperCase().slice(0, 25), unit.canvas.width / 2, unit.canvas.height / 2 + 2, unit.canvas.width - 40);
    unit.texture.needsUpdate = true;
  }

  function applyTaskConsoleUnitStyle(unit) {
    const styles = {
      standby: { emissive: 0x1e9e5c, intensity: 0.7 },
      inProgress: { emissive: 0x2bff88, intensity: 1.6 },
      completed: { emissive: 0x3a4a44, intensity: 0.35 },
    }[unit.status] ?? { emissive: 0x1e9e5c, intensity: 0.7 };
    unit.button.material.emissive.set(styles.emissive);
    unit.button.material.emissiveIntensity = styles.intensity;
    // The world-space red guide beacon replaces the old green task marker.
    unit.button.visible = false;
    // Only activated tasks get units here. The label sits above the button;
    // completed units never appear because they are removed on completion.
    unit.labelSprite.visible = false;
    drawTaskConsoleUnitLabel(unit);
  }

  function createTaskConsoleUnit(spec, index) {
    const isWall = taskConsoleKind === 'wall';
    const unit = {
      taskId: spec.taskId ?? null,
      label: spec.label || '',
      status: spec.status || 'available',
      canvas: document.createElement('canvas'),
      texture: null,
      button: null,
      labelSprite: null,
    };
    unit.canvas.width = 512;
    unit.canvas.height = 112;
    unit.texture = new THREE.CanvasTexture(unit.canvas);
    unit.texture.colorSpace = THREE.SRGBColorSpace;

    unit.button = new THREE.Mesh(
      isWall
        ? new THREE.CylinderGeometry(0.15, 0.17, 0.12, 28)
        : new THREE.CylinderGeometry(0.16, 0.19, 0.1, 24),
      new THREE.MeshStandardMaterial({
        color: 0x0d2b1a, emissive: 0x1e9e5c, emissiveIntensity: 0.7,
        roughness: 0.3, metalness: 0.1
      })
    );
    if (isWall) unit.button.rotation.z = Math.PI / 2;
    else unit.button.rotation.x = 0.45;
    unit.button.userData.taskConsoleTaskId = unit.taskId;

    unit.labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: unit.texture, transparent: true, depthWrite: false
    }));
    unit.labelSprite.scale.set(1.7, 0.37, 1);
    unit.labelSprite.name = `Label: Task Console ${index + 1}`;
    unit.labelSprite.userData.taskConsoleTaskId = unit.taskId;
    return unit;
  }

  function disposeTaskConsoleUnits() {
    for (const unit of taskConsoleUnits) {
      taskConsoleInner?.remove(unit.button, unit.labelSprite);
      unit.button.geometry.dispose();
      unit.button.material.dispose();
      unit.labelSprite.material.dispose();
      unit.texture.dispose();
    }
    taskConsoleUnits = [];
    taskConsoleUnitSignature = null;
  }

  function createTaskConsoleArrow() {
    const arrow = new THREE.Group();
    arrow.name = 'Task Console Arrow';
    const arrowMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a2b12, emissive: 0xc8ff4d, emissiveIntensity: 1.8,
      roughness: 0.4, metalness: 0.1
    });
    const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 20), arrowMaterial);
    arrowHead.rotation.x = Math.PI;
    arrowHead.position.y = -0.12;
    const arrowTail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 12), arrowMaterial);
    arrowTail.position.y = 0.18;
    arrow.add(arrowHead, arrowTail);
    return arrow;
  }

  // Build one dedicated button + label for each activated task bound to the
  // entered component. Data-driven: tasks added to DAILY_CHALLENGES later get
  // their button here automatically once activated from the Daily Tasks list.
  // Available or completed tasks add no interior UI at all.
  function rebuildTaskConsoleUnits() {
    disposeTaskConsoleUnits();
    if (!taskConsoleInner || !taskConsoleLayout) return;

    const targets = activeTaskTargets.filter(
      entry => entry.componentId === taskConsoleComponentId
        && (entry.status === 'inProgress' || entry.status === 'overdue'),
    );
    const specs = targets.map(target => ({
      taskId: target.taskId ?? null,
      label: target.label || '',
      status: target.status || 'inProgress',
    }));
    const count = specs.length;

    specs.forEach((spec, index) => {
      const unit = createTaskConsoleUnit(spec, index);
      unit.button.position.copy(taskConsoleLayout.button(index, count));
      unit.labelSprite.position.copy(taskConsoleLayout.label(index, count));
      taskConsoleInner.add(unit.button, unit.labelSprite);
      taskConsoleUnits.push(unit);
      applyTaskConsoleUnitStyle(unit);
    });

    if (taskConsoleArrow) {
      taskConsoleArrow.position.copy(taskConsoleLayout.arrow(count));
      taskConsoleArrowBaseY = taskConsoleArrow.position.y;
    }
    taskConsoleUnitSignature = specs.map(spec => spec.taskId ?? 'standby').join('|');
  }

  function refreshTaskConsole() {
    if (!taskConsoleGroup || !taskConsoleInner) {
      taskConsoleActive = false;
      return;
    }
    const targets = activeTaskTargets.filter(
      entry => entry.componentId === taskConsoleComponentId
        && (entry.status === 'inProgress' || entry.status === 'overdue'),
    );
    const signature = targets.map(target => target.taskId ?? 'standby').join('|');
    if (signature !== taskConsoleUnitSignature) {
      rebuildTaskConsoleUnits();
    } else {
      for (const unit of taskConsoleUnits) {
        const target = targets.find(entry => (entry.taskId ?? null) === unit.taskId);
        unit.status = target?.status || 'standby';
        unit.label = target?.label || '';
        applyTaskConsoleUnitStyle(unit);
      }
    }
    // The task console only appears for tasks activated from the Daily Tasks
    // list; available tasks add no interior UI.
    taskConsoleActive = taskConsoleUnits.some(
      unit => unit.status === 'inProgress' || unit.status === 'overdue',
    );
    if (taskConsoleArrow) taskConsoleArrow.visible = false;
  }

  function unmountTaskConsole() {
    disposeTaskConsoleUnits();
    if (taskConsoleGroup?.parent) taskConsoleGroup.parent.remove(taskConsoleGroup);
    taskConsoleGroup?.traverse(object => {
      object.geometry?.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
    taskConsoleGroup = null;
    taskConsoleInner = null;
    taskConsoleArrow = null;
    taskConsoleLayout = null;
    taskConsoleArrowBaseY = TASK_CONSOLE_ARROW_Y;
    taskConsoleComponentId = null;
    taskConsoleKind = null;
    taskConsoleActive = false;
  }

  // Mount the task buttons centered on the room's right wall (world +x face).
  // Returns true when wall-mounted, false to use the pedestal fallback.
  function mountWallConsole() {
    if (!activeModuleInteriorBounds) return false;
    activeModuleInterior.updateMatrixWorld(true);
    const cfg = TASK_CONSOLE_CONFIG.wall;
    const toLocal = (world) => activeModuleInterior.worldToLocal(world.clone());
    const bounds = activeModuleInteriorBounds;
    const anchor = new THREE.Vector3(
      bounds.max.x - cfg.inset,
      Math.min(bounds.min.y + cfg.height, bounds.max.y - 0.6),
      (bounds.min.z + bounds.max.z) / 2 + cfg.zOffset
    );
    if (!(anchor.y > bounds.min.y + 0.3)) return false;
    const placement = getConsolePlacement('wall', taskConsoleComponentId, anchor, cfg.size);
    taskConsoleKind = 'wall';

    const group = new THREE.Group();
    group.name = 'Task Console';
    const inner = new THREE.Group();
    inner.name = 'Task Console Inner';
    inner.scale.setScalar(placement.size);
    group.add(inner);
    const anchorLocal = toLocal(anchor);
    group.position.copy(toLocal(placement.pos));
    const rel = (world) => toLocal(world).sub(anchorLocal);

    // Stack one unit per task vertically, centered on the anchor height.
    const spacing = 1.15;
    const lift = 0.78;
    const offsetY = (index, count) => (index - (count - 1) / 2) * spacing;
    taskConsoleLayout = {
      button: (index, count) => rel(anchor.clone().add(new THREE.Vector3(-0.1, offsetY(index, count), 0))),
      label: (index, count) => rel(anchor.clone().add(new THREE.Vector3(-0.05, offsetY(index, count) + lift, 0))),
      arrow: (count) => rel(anchor.clone().add(new THREE.Vector3(-0.05, offsetY(count - 1, count) + lift + 0.72, 0))),
    };

    taskConsoleArrow = createTaskConsoleArrow();
    inner.add(taskConsoleArrow);

    activeModuleInterior.add(group);
    taskConsoleGroup = group;
    taskConsoleInner = inner;
    pushConsoleInfo();
    refreshTaskConsole();
    return true;
  }

  // Physical task console inside module interiors: one dedicated button per
  // daily task bound to the component. Walk up and click a button to run it.
  function mountTaskConsole(componentId, isWorkshop) {
    unmountTaskConsole();
    if (!activeModuleInterior) return;
    taskConsoleComponentId = componentId;
    if (isWorkshop && mountWallConsole()) {
      const worldPos = new THREE.Vector3();
      taskConsoleGroup.getWorldPosition(worldPos);
      console.log(
        `[TaskConsole] on right wall component=${componentId} ` +
        `pos=(${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`
      );
      return;
    }
    taskConsoleKind = 'pedestal';
    const group = new THREE.Group();
    group.name = 'Task Console';
    const inner = new THREE.Group();
    inner.name = 'Task Console Inner';
    group.add(inner);
    const spot = new THREE.Vector3(TASK_CONSOLE_CONFIG.pedestal.x, 0, TASK_CONSOLE_CONFIG.pedestal.z);
    const placement = getConsolePlacement('pedestal', taskConsoleComponentId, spot, TASK_CONSOLE_CONFIG.pedestal.size);
    inner.scale.setScalar(placement.size);

    // Stack one unit per task vertically on the floating panel.
    const baseY = 1.1;
    const spacing = 1.15;
    const lift = 0.85;
    taskConsoleLayout = {
      button: (index) => new THREE.Vector3(0, baseY + index * spacing, 0.2),
      label: (index) => new THREE.Vector3(0, baseY + index * spacing + lift, 0.08),
      arrow: (count) => new THREE.Vector3(0, baseY + (count - 1) * spacing + lift + 0.72, 0),
    };

    taskConsoleArrow = createTaskConsoleArrow();
    inner.add(taskConsoleArrow);
    // Place beside the entrance in world space: room groups (e.g. the loaded
    // workshop) can carry their own centering offset, so local placement would
    // land behind walls. The entrance spawn is always (0, *, 2.55) facing -z.
    activeModuleInterior.updateMatrixWorld(true);
    group.position.copy(activeModuleInterior.worldToLocal(placement.pos.clone()));
    group.rotation.y = Math.atan2(0 - placement.pos.x, 2.55 - placement.pos.z);
    activeModuleInterior.add(group);
    taskConsoleGroup = group;
    taskConsoleInner = inner;
    pushConsoleInfo();
    refreshTaskConsole();
    const worldPos = new THREE.Vector3();
    group.getWorldPosition(worldPos);
    console.log(
      `[TaskConsole] mounted component=${componentId} children=${activeModuleInterior.children.length} ` +
      `pos=(${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`
    );
  }

  function enterModuleInterior(target, workshopModel) {
    if (activeModuleInterior) return;
    if (moduleReturnMode !== 'airlock') {
      outsideCameraPosition = camera.position.clone();
      outsideCameraYaw = firstPersonYaw;
      outsideCameraPitch = firstPersonPitch;
      outsideBackground = scene.background;
    }
    moonTerrainMeshes.forEach(terrain => { terrain.visible = false; });
    horizon.visible = false;
    if (outpostRoot) outpostRoot.visible = false;
    scene.background = new THREE.Color(0x10151b);
    activeModuleInterior = createModuleInterior(target.roomType, workshopModel);
    scene.add(activeModuleInterior);
    activeModuleInteriorBounds = new THREE.Box3().setFromObject(activeModuleInterior);
    console.log(
      `[Interior] entering ${target.name} id=${target.id} roomType=${target.roomType}`
    );
    try {
      mountTaskConsole(target.id, target.roomType === 'engineering');
    } catch (error) {
      console.error('[TaskConsole] mount failed, entry continues without console.', error);
    }
    camera.position.set(0, playerCameraHeight, 2.55);
    camera.rotation.order = 'YXZ';
    camera.lookAt(0, playerCameraHeight, -1.5);
    firstPersonYaw = camera.rotation.y;
    firstPersonPitch = camera.rotation.x;
    activeModuleInteriorLight = new THREE.PointLight(0xe4edff, 14, 24);
    activeModuleInteriorLight.position.set(0, 2.8, 0);
    scene.add(activeModuleInteriorLight);
    cameraMode = 'interior';
    onModeChange(cameraMode);
    controls.enabled = false;
    ensurePointerLocked();
    setPrompt(null);
    onInsidePanelChange({
      visible: true,
      label: `INSIDE ${target.name.toUpperCase()} · E TO EXIT`,
      buttonText: 'EXIT MODULE',
      componentId: target.id
    });
  }

  function exitModuleInterior() {
    if (!activeModuleInterior) return;
    if (commandCenterInteriorActive) {
      if (commandCenterExteriorShell) commandCenterExteriorShell.visible = true;
      if (outpostRoot && commandCenterRoot) outpostRoot.attach(commandCenterRoot);
      commandCenterInteriorActive = false;
    } else {
      scene.remove(activeModuleInterior);
      disposeModuleInterior(activeModuleInterior);
    }
    scene.remove(activeModuleInteriorLight);
    unmountTaskConsole();
    consoleEditMode = false;
    consoleDragging = false;
    if (canvas) canvas.style.cursor = '';
    activeModuleInterior = null;
    activeModuleInteriorBounds = null;
    activeModuleInteriorLight = null;
    if (moduleReturnMode === 'airlock') {
      if (airlockInterior) airlockInterior.visible = true;
      if (airlockInteriorLight) scene.add(airlockInteriorLight);
      camera.position.copy(airlockReturnPosition);
      firstPersonYaw = airlockReturnYaw;
      firstPersonPitch = airlockReturnPitch;
      camera.rotation.order = 'YXZ';
      camera.rotation.set(firstPersonPitch, firstPersonYaw, 0);
      cameraMode = 'interior';
      onModeChange(cameraMode);
      onInsidePanelChange({ visible: true, label: 'INSIDE AIRLOCK · E TO EXIT', buttonText: 'EXIT AIRLOCK', componentId: '005' });
      airlockEndPromptDismissed = true;
    } else {
      moonTerrainMeshes.forEach(terrain => { terrain.visible = true; });
      horizon.visible = true;
      if (outpostRoot) outpostRoot.visible = true;
      scene.background = outsideBackground;
      camera.position.copy(outsideCameraPosition);
      firstPersonYaw = outsideCameraYaw;
      firstPersonPitch = outsideCameraPitch;
      camera.rotation.order = 'YXZ';
      camera.rotation.set(firstPersonPitch, firstPersonYaw, 0);
      cameraMode = 'first-person';
      onModeChange(cameraMode);
      onInsidePanelChange({ visible: false, label: '', buttonText: '' });
      dismissedComponentId = activeComponentTarget?.id ?? null;
      activeComponentTarget = null;
    }
    controls.enabled = false;
  }

  function getNearbyEnterableComponentTarget() {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const target of componentTargets) {
      if (NON_ENTERABLE_COMPONENT_IDS.has(target.id) || target.roomType === 'regolithPlant') continue;
      const distance = Math.hypot(camera.position.x - target.center.x, camera.position.z - target.center.z);
      if (distance <= target.radius && distance < nearestDistance) {
        nearest = target;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function enterNearbyComponent() {
    if (cameraMode !== 'first-person') return false;
    const target = getNearbyEnterableComponentTarget();
    if (!target) return false;
    activeComponentTarget = target;
    if (NON_ENTERABLE_COMPONENT_IDS.has(target.id)) return;
    moduleReturnMode = 'exterior';
    if (target.roomType === 'commandCenter') {
      enterCommandCenterInterior(target);
      return true;
    }
    if (target.roomType === 'greenhouse') {
      enterGreenhouseFromExterior();
      return true;
    }
    if (target.roomType === 'engineering') {
      ensureWorkshopInterior(model => enterModuleInterior(target, model));
    } else {
      ensureComponentInteriorKit(() => enterModuleInterior(target));
    }
    return true;
  }

  function enterCommandCenterInterior(target) {
    if (!commandCenterRoot || !commandCenterModelRoot || activeModuleInterior) return;
    // Capture the downlink images while the surface is still on screen — once
    // the shell closes in, the last known rover positions are what the console
    // shows until the player links up again.
    refreshLiveScreens();
    outsideCameraPosition = camera.position.clone();
    outsideCameraYaw = firstPersonYaw;
    outsideCameraPitch = firstPersonPitch;
    outsideBackground = scene.background;

    // Keep the full GLB in the scene while hiding only its opaque exterior
    // shell, so the authored interior equipment remains visible around the player.
    scene.attach(commandCenterRoot);
    commandCenterRoot.visible = true;
    if (outpostRoot) outpostRoot.visible = false;
    moonTerrainMeshes.forEach(terrain => { terrain.visible = false; });
    horizon.visible = false;
    if (commandCenterExteriorShell) commandCenterExteriorShell.visible = false;
    scene.background = new THREE.Color(0x10151b);

    activeModuleInterior = commandCenterRoot;
    commandCenterInteriorActive = true;
    const interiorNode = commandCenterModelRoot.getObjectByName('CC_Module') || commandCenterModelRoot;
    commandCenterRoot.updateMatrixWorld(true);
    // CC_Module's box starts well above the room floor, so clamping to it would
    // pin the eye ~1.5 units too high and read as a floating free camera. The
    // exterior shell is the actual room: its min.y is the deck the player stands
    // on, and its plan is the walkable footprint the player camera expects.
    const shellBounds = commandCenterExteriorShell
      ? new THREE.Box3().setFromObject(commandCenterExteriorShell)
      : null;
    activeModuleInteriorBounds = shellBounds && !shellBounds.isEmpty()
      ? shellBounds
      : new THREE.Box3().setFromObject(interiorNode);

    // Stand on the deck at the same eye height the player camera uses outside.
    const interiorSpawn = commandCenterRoot.localToWorld(new THREE.Vector3(0, 0, 1.8));
    interiorSpawn.y = activeModuleInteriorBounds.min.y + playerCameraHeight;
    camera.position.copy(interiorSpawn);
    camera.rotation.order = 'YXZ';
    // Walk in facing the rover downlink console when the model exposes it, so
    // the monitors are immediately in view instead of behind the player.
    const monitorAim = roverMonitors.length
      ? roverMonitors
        .reduce((sum, monitor) => sum.add(monitor.center), new THREE.Vector3())
        .divideScalar(roverMonitors.length)
      : null;
    if (monitorAim) camera.lookAt(monitorAim);
    else camera.rotation.set(0, Math.PI / 2, 0);
    firstPersonYaw = camera.rotation.y;
    firstPersonPitch = camera.rotation.x;
    activeModuleInteriorLight = new THREE.PointLight(0xe4edff, 16, 26);
    activeModuleInteriorLight.position.copy(interiorSpawn).add(new THREE.Vector3(-1, 1, 0));
    scene.add(activeModuleInteriorLight);
    cameraMode = 'interior';
    onModeChange(cameraMode);
    controls.enabled = false;
    ensurePointerLocked();
    setPrompt(null);
    onInsidePanelChange({
      visible: true,
      label: 'INSIDE COMMAND CENTER · E TO EXIT',
      buttonText: 'EXIT COMMAND CENTER',
      componentId: target.id,
    });
  }

  function prepareAirlockInterior(gltfScene) {
    const interior = gltfScene;
    interior.updateMatrixWorld(true);
    const originalBounds = new THREE.Box3().setFromObject(interior);
    const originalSize = originalBounds.getSize(new THREE.Vector3());
    const targetWidth = AIRLOCK_INTERIOR_WIDTH;
    interior.scale.multiplyScalar(targetWidth / Math.max(originalSize.x, originalSize.z, 1));
    interior.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(interior);
    const center = bounds.getCenter(new THREE.Vector3());
    interior.position.x -= center.x;
    interior.position.y -= bounds.min.y;
    interior.position.z -= center.z;
    interior.updateMatrixWorld(true);
    interior.traverse(object => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.side = THREE.DoubleSide;
        material.needsUpdate = true;
      }
    });
    airlockInterior = interior;
    airlockInteriorBounds = new THREE.Box3().setFromObject(interior);
    airlockTaskMarkerObject = null;
    interior.traverse((object) => {
      if (!airlockTaskMarkerObject && /door|hatch|seal/i.test(object.name ?? '') && object.isMesh) {
        airlockTaskMarkerObject = object;
      }
    });
    airlockCenter = airlockInteriorBounds.getCenter(new THREE.Vector3());
  }

  function enterAirlockInterior() {
    outsideCameraPosition = camera.position.clone();
    outsideCameraYaw = firstPersonYaw;
    outsideCameraPitch = firstPersonPitch;
    airlockEntryExteriorPosition = camera.position.clone();
    airlockEntryExteriorYaw = firstPersonYaw;
    airlockEntryExteriorPitch = firstPersonPitch;
    outsideBackground = scene.background;
    moonTerrainMeshes.forEach(terrain => { terrain.visible = false; });
    horizon.visible = false;
    if (outpostRoot) outpostRoot.visible = false;
    scene.background = new THREE.Color(0x10151b);
    scene.add(airlockInterior);

    const roomSize = airlockInteriorBounds.getSize(new THREE.Vector3());
    const cameraY = Math.min(
      airlockInteriorBounds.min.y + playerCameraHeight,
      airlockInteriorBounds.max.y - 0.3
    );
    const entryInset = Math.max(0.8, Math.max(roomSize.x, roomSize.z) * 0.12);
    const lookTarget = airlockCenter.clone();
    airlockLongAxis = roomSize.x >= roomSize.z ? 'x' : 'z';
    if (roomSize.x >= roomSize.z) {
      camera.position.set(airlockInteriorBounds.min.x + entryInset, cameraY, airlockCenter.z);
      lookTarget.x = camera.position.x + roomSize.x * 0.3;
    } else {
      camera.position.set(airlockCenter.x, cameraY, airlockInteriorBounds.min.z + entryInset);
      lookTarget.z = camera.position.z + roomSize.z * 0.3;
    }
    lookTarget.y = cameraY;
    camera.rotation.order = 'YXZ';
    camera.lookAt(lookTarget);
    firstPersonYaw = camera.rotation.y;
    firstPersonPitch = camera.rotation.x;

    airlockInteriorLight = new THREE.PointLight(0xffe4bf, 10, Math.max(roomSize.x, roomSize.y, roomSize.z) * 2.5);
    airlockInteriorLight.position.set(camera.position.x, camera.position.y + roomSize.y * 0.08, camera.position.z);
    scene.add(airlockInteriorLight);
    cameraMode = 'interior';
    onModeChange(cameraMode);
    controls.enabled = false;
    ensurePointerLocked();
    setPrompt(null);
    airlockEndPromptDismissed = false;
    onInsidePanelChange({
      visible: true,
      label: 'INSIDE AIRLOCK · E TO EXIT',
      buttonText: 'EXIT AIRLOCK',
      componentId: '005'
    });
  }

  function enterAirlock() {
    if (cameraMode !== 'first-person' || airlockLoading || NON_ENTERABLE_COMPONENT_IDS.has('005')) return;
    if (airlockInterior) {
      enterAirlockInterior();
      return;
    }
    airlockLoading = true;
    loadCachedGLTF(
      '/lunar/airlock.glb',
      gltfScene => {
        airlockLoading = false;
        prepareAirlockInterior(gltfScene);
        enterAirlockInterior();
      },
      undefined,
      error => {
        console.error('Unable to load /lunar/airlock.glb', error);
        airlockLoading = false;
      }
    );
  }

  function exitAirlock() {
    if (cameraMode !== 'interior') return;
    scene.remove(airlockInterior);
    if (greenhouseInterior) {
      scene.remove(greenhouseInterior);
      greenhouseInterior.visible = false;
    }
    scene.remove(airlockInteriorLight);
    scene.remove(greenhouseInteriorLight);
    airlockInteriorLight = null;
    greenhouseInteriorLight = null;
    moonTerrainMeshes.forEach(terrain => { terrain.visible = true; });
    horizon.visible = true;
    if (outpostRoot) outpostRoot.visible = true;
    scene.background = outsideBackground;
    camera.position.copy(airlockEntryExteriorPosition ?? outsideCameraPosition);
    firstPersonYaw = airlockEntryExteriorPosition ? airlockEntryExteriorYaw : outsideCameraYaw;
    firstPersonPitch = airlockEntryExteriorPosition ? airlockEntryExteriorPitch : outsideCameraPitch;
    camera.rotation.order = 'YXZ';
    camera.rotation.set(firstPersonPitch, firstPersonYaw, 0);
    cameraMode = 'first-person';
    onModeChange(cameraMode);
    controls.enabled = false;
    airlockPromptDismissed = false;
    onInsidePanelChange({ visible: false, label: '', buttonText: '' });
    setPrompt(null);
  }

  function prepareGreenhouse(gltfScene) {
    const interior = gltfScene;
    interior.updateMatrixWorld(true);
    const originalBounds = new THREE.Box3().setFromObject(interior);
    const originalSize = originalBounds.getSize(new THREE.Vector3());
    interior.scale.multiplyScalar(AIRLOCK_INTERIOR_WIDTH / Math.max(originalSize.x, originalSize.z, 1));
    interior.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(interior);
    const center = bounds.getCenter(new THREE.Vector3());
    interior.position.set(-center.x, -bounds.min.y, -center.z);
    interior.updateMatrixWorld(true);
    interior.traverse(object => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => { material.side = THREE.DoubleSide; material.needsUpdate = true; });
    });
    greenhouseInterior = interior;
    greenhouseInteriorBounds = new THREE.Box3().setFromObject(interior);
    greenhouseCenter = greenhouseInteriorBounds.getCenter(new THREE.Vector3());
    const greenhouseSize = greenhouseInteriorBounds.getSize(new THREE.Vector3());
    greenhouseLongAxis = greenhouseSize.x >= greenhouseSize.z ? 'x' : 'z';
  }

  function populateGreenhouseWithTomatoes(tomatoScene) {
    const source = tomatoScene;
    source.updateMatrixWorld(true);
    const sourceBounds = new THREE.Box3().setFromObject(source);
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    const targetPlantHeight = 2 * TOMATO_PLANT_Y_SCALE;
    const greenhouseScale = greenhouseInterior.scale.x || 1;
    const plantScale = targetPlantHeight / (greenhouseScale * Math.max(sourceSize.y, 0.001));
    const spacing = 2.5;
    const margin = 1.25;
    const minX = greenhouseInteriorBounds.min.x + margin;
    const maxX = greenhouseInteriorBounds.max.x - margin;
    const minZ = greenhouseInteriorBounds.min.z + margin;
    const maxZ = greenhouseInteriorBounds.max.z - margin;
    const columns = Math.max(1, Math.floor((maxX - minX) / spacing) + 1);
    const rows = Math.max(1, Math.floor((maxZ - minZ) / spacing) + 1);
    const tomatoes = new THREE.Group();
    tomatoes.name = 'Greenhouse Tomato Plants';
    greenhouseTaskMarkerObject = tomatoes;
    greenhouseInterior.updateMatrixWorld(true);
    const floorLocalY = greenhouseInterior.worldToLocal(new THREE.Vector3(0, greenhouseInteriorBounds.min.y, 0)).y;
    const columnGapIndex = Math.floor((columns - 1) / 2);
    const rowGapIndex = Math.floor((rows - 1) / 2);
    const taskMarkerWorldPosition = new THREE.Vector3(
      columns > 1
        ? minX + (columnGapIndex + 0.5) * (maxX - minX) / (columns - 1)
        : greenhouseInteriorBounds.min.x + 0.9,
      greenhouseInteriorBounds.min.y,
      rows > 1
        ? minZ + (rowGapIndex + 0.5) * (maxZ - minZ) / (rows - 1)
        : greenhouseInteriorBounds.min.z + 0.9,
    );
    tomatoes.userData.taskMarkerLocalPosition = greenhouseInterior.worldToLocal(taskMarkerWorldPosition);

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const plant = source.clone(true);
        plant.scale.multiplyScalar(plantScale);
        plant.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(plant);
        const center = bounds.getCenter(new THREE.Vector3());
        const wrapper = new THREE.Group();
        wrapper.add(plant);
        const worldPosition = new THREE.Vector3(
          columns === 1 ? (minX + maxX) * 0.5 : minX + column * (maxX - minX) / (columns - 1),
          greenhouseInteriorBounds.min.y,
          rows === 1 ? (minZ + maxZ) * 0.5 : minZ + row * (maxZ - minZ) / (rows - 1)
        );
        const localPosition = greenhouseInterior.worldToLocal(worldPosition);
        wrapper.position.set(
          localPosition.x,
          floorLocalY - bounds.min.y,
          localPosition.z
        );
        plant.position.x -= center.x;
        plant.position.z -= center.z;
        tomatoes.add(wrapper);
      }
    }
    greenhouseInterior.add(tomatoes);
  }

  function placeInsideGreenhouse() {
    airlockReturnPosition = camera.position.clone();
    airlockReturnYaw = firstPersonYaw;
    airlockReturnPitch = firstPersonPitch;
    if (airlockInterior) airlockInterior.visible = false;
    greenhouseInterior.visible = true;
    scene.add(greenhouseInterior);
    if (airlockInteriorLight) scene.remove(airlockInteriorLight);
    const size = greenhouseInteriorBounds.getSize(new THREE.Vector3());
    const y = Math.min(
      greenhouseInteriorBounds.min.y + playerCameraHeight,
      greenhouseInteriorBounds.max.y - 0.3
    );
    const inset = Math.max(0.8, Math.max(size.x, size.z) * 0.12);
    const target = greenhouseCenter.clone();
    if (size.x >= size.z) {
      camera.position.set(greenhouseInteriorBounds.min.x + inset, y, greenhouseCenter.z);
      target.x = camera.position.x + size.x * 0.3;
    } else {
      camera.position.set(greenhouseCenter.x, y, greenhouseInteriorBounds.min.z + inset);
      target.z = camera.position.z + size.z * 0.3;
    }
    target.y = y;
    camera.lookAt(target);
    firstPersonYaw = camera.rotation.y;
    firstPersonPitch = camera.rotation.x;
    cameraMode = 'interior';
    onModeChange(cameraMode);
    controls.enabled = false;
    ensurePointerLocked();
    greenhouseInteriorLight = new THREE.PointLight(0xe4ffd1, 12, Math.max(size.x, size.y, size.z) * 3);
    greenhouseInteriorLight.position.set(camera.position.x, y + size.y * 0.08, camera.position.z);
    scene.add(greenhouseInteriorLight);
    onInsidePanelChange({
      visible: true,
      label: greenhouseReturnMode === 'exterior'
        ? 'INSIDE GREENHOUSE · E TO RETURN OUTSIDE'
        : 'INSIDE GREENHOUSE · E TO RETURN',
      buttonText: greenhouseReturnMode === 'exterior'
        ? 'RETURN OUTSIDE'
        : 'RETURN TO AIRLOCK',
      componentId: '008'
    });
    setPrompt(null);
    greenhouseDoorPromptDismissed = false;
  }

  function enterGreenhouse() {
    if (greenhouseLoading) return;
    if (greenhouseInterior) { placeInsideGreenhouse(); return; }
    greenhouseLoading = true;
    loadCachedGLTF(
      '/lunar/greenhouse.glb',
      ghScene => {
        prepareGreenhouse(ghScene);
        loadCachedGLTF(
          '/lunar/tomato_plant.glb',
          tomatoScene => {
            populateGreenhouseWithTomatoes(tomatoScene);
            greenhouseLoading = false;
            placeInsideGreenhouse();
          },
          undefined,
          error => {
            console.error('Unable to load /lunar/tomato_plant.glb', error);
            greenhouseLoading = false;
            placeInsideGreenhouse();
          }
        );
      },
      undefined,
      error => {
        console.error('Unable to load /lunar/greenhouse.glb', error);
        greenhouseLoading = false;
        if (greenhouseReturnMode === 'exterior') restoreExteriorAfterGreenhouseFailure();
      }
    );
  }

  function enterWorkshopFromAirlock() {
    if (workshopInteriorLoading) return;
    setPrompt(null);
    airlockEndPromptDismissed = true;
    airlockReturnPosition = camera.position.clone();
    airlockReturnYaw = firstPersonYaw;
    airlockReturnPitch = firstPersonPitch;
    moduleReturnMode = 'airlock';
    if (airlockInterior) airlockInterior.visible = false;
    if (airlockInteriorLight) scene.remove(airlockInteriorLight);
    ensureWorkshopInterior(model => enterModuleInterior({ id: '010', name: 'Workshop', roomType: 'engineering' }, model));
  }

  function restoreExteriorAfterGreenhouseFailure() {
    moonTerrainMeshes.forEach(terrain => { terrain.visible = true; });
    horizon.visible = true;
    if (outpostRoot) outpostRoot.visible = true;
    scene.background = outsideBackground;
    camera.position.copy(outsideCameraPosition);
    firstPersonYaw = outsideCameraYaw;
    firstPersonPitch = outsideCameraPitch;
    camera.rotation.order = 'YXZ';
    camera.rotation.set(firstPersonPitch, firstPersonYaw, 0);
    cameraMode = 'first-person';
    onModeChange(cameraMode);
    controls.enabled = false;
    dismissedComponentId = '008';
    activeComponentTarget = null;
    setPrompt(null);
  }

  function returnToAirlock() {
    if (!greenhouseInterior?.visible) return;
    greenhouseInterior.visible = false;
    scene.remove(greenhouseInteriorLight);
    if (greenhouseReturnMode === 'exterior') {
      moonTerrainMeshes.forEach(terrain => { terrain.visible = true; });
      horizon.visible = true;
      if (outpostRoot) outpostRoot.visible = true;
      scene.background = outsideBackground;
      camera.position.copy(outsideCameraPosition);
      firstPersonYaw = outsideCameraYaw;
      firstPersonPitch = outsideCameraPitch;
      camera.rotation.order = 'YXZ';
      camera.rotation.set(firstPersonPitch, firstPersonYaw, 0);
      cameraMode = 'first-person';
      onModeChange(cameraMode);
      onInsidePanelChange({ visible: false, label: '', buttonText: '' });
      dismissedComponentId = '008';
      activeComponentTarget = null;
    } else {
      if (airlockInterior) airlockInterior.visible = true;
      if (airlockInteriorLight) scene.add(airlockInteriorLight);
      if (airlockReturnPosition) camera.position.copy(airlockReturnPosition);
      firstPersonYaw = airlockReturnYaw;
      firstPersonPitch = airlockReturnPitch;
      camera.rotation.set(firstPersonPitch, firstPersonYaw, 0);
      onInsidePanelChange({
        visible: true,
        label: 'INSIDE AIRLOCK · E TO EXIT',
        buttonText: 'EXIT AIRLOCK'
      });
      airlockEndPromptDismissed = true;
    }
  }

  function enterGreenhouseFromExterior() {
    greenhouseReturnMode = 'exterior';
    setPrompt(null);
    cameraMode = 'interior';
    onModeChange(cameraMode);
    controls.enabled = false;
    ensurePointerLocked();
    outsideCameraPosition = camera.position.clone();
    outsideCameraYaw = firstPersonYaw;
    outsideCameraPitch = firstPersonPitch;
    outsideBackground = scene.background;
    moonTerrainMeshes.forEach(terrain => { terrain.visible = false; });
    horizon.visible = false;
    if (outpostRoot) outpostRoot.visible = false;
    scene.background = new THREE.Color(0x10151b);
    enterGreenhouse();
  }

  // Camera & Mode Controls
  function roverById(roverId) {
    return rovers.find(rover => rover.id === roverId) ?? null;
  }

  function nearestRoverTo(position) {
    let best = rovers[0] ?? null;
    let bestDistance = Infinity;
    for (const rover of rovers) {
      const distance = rover.root.position.distanceTo(position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = rover;
      }
    }
    return best;
  }

  // Remote links are started from a command center monitor; the interior is
  // hidden for the duration while the real moon and outpost come back on the
  // feed, then everything is restored exactly as it was on disconnect.
  // Camera dive used when the player links a rover from a command center screen:
  // the view pushes in on that monitor, then carries through the glass and lands
  // on the rover's chase camera instead of cutting straight to it.
  let roverLinkTransition = null;

  // Where the camera should stop to be looking square at a monitor's picture,
  // close enough that the glass fills the whole viewport. That is what lets the
  // swap be invisible: at the far end of the push-in, the screen covers the view
  // and shows this rover, so the cut to the live world lands on the same image.
  function roverMonitorPose(monitor, outPosition, outQuaternion) {
    const plane = monitor?.feed?.plane;
    if (!plane) return false;
    plane.updateMatrixWorld(true);
    const center = new THREE.Vector3().setFromMatrixPosition(plane.matrixWorld);
    const facing = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(plane.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    // Distance at which the picture exactly covers the frame, measured at the
    // feed's own lens angle so the reveal matches what the screen was showing.
    const scale = plane.getWorldScale(new THREE.Vector3());
    const tanVertical = Math.tan(THREE.MathUtils.degToRad(ROVER_FEED_FOV) * 0.5);
    const tanHorizontal = tanVertical * camera.aspect;
    const distance = Math.max(
      Math.min(
        scale.x / (2 * Math.max(tanHorizontal, 0.02)),
        scale.y / (2 * Math.max(tanVertical, 0.02)),
      ),
      0.05,
    );
    outPosition.copy(center).addScaledVector(facing, distance);
    const looker = new THREE.PerspectiveCamera();
    looker.position.copy(outPosition);
    looker.lookAt(center);
    outQuaternion.copy(looker.quaternion);
    return true;
  }

  function startRoverLinkTransition(rover, monitor) {
    const toPosition = new THREE.Vector3();
    const toQuaternion = new THREE.Quaternion();
    if (!roverMonitorPose(monitor, toPosition, toQuaternion)) return false;
    roverLinkTransition = {
      stage: 'monitor',
      elapsed: 0,
      duration: 0.8,
      rover,
      monitor,
      baseFov: camera.fov,
      fromPosition: camera.position.clone(),
      fromQuaternion: camera.quaternion.clone(),
      toPosition,
      toQuaternion,
      fromFov: camera.fov,
      toFov: ROVER_FEED_FOV,
    };
    return true;
  }

  // The moon comes back on screen once the camera is pressed against the glass,
  // so the swap is hidden behind the screen filling the whole view.
  function exposeWorldForRoverLink() {
    moonTerrainMeshes.forEach(terrain => { terrain.visible = true; });
    horizon.visible = true;
    if (outpostRoot) outpostRoot.visible = true;
    if (commandCenterRoot) commandCenterRoot.visible = false;
    scene.background = remoteControlReturn?.feedBackground ?? scene.background;
  }

  function animateRoverLinkTransition(dt) {
    const transition = roverLinkTransition;
    if (!transition) return;
    transition.elapsed += dt;
    const progress = Math.min(transition.elapsed / transition.duration, 1);
    const eased = progress * progress * (3 - 2 * progress);
    camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased);
    camera.quaternion.slerpQuaternions(
      transition.fromQuaternion,
      transition.toQuaternion,
      eased,
    );
    if (transition.fromFov !== transition.toFov) {
      camera.fov = THREE.MathUtils.lerp(transition.fromFov, transition.toFov, eased);
      camera.updateProjectionMatrix();
    }
    if (progress < 1) return;

    if (transition.stage === 'monitor') {
      // The glass now covers the view. Take the camera onto the rover at exactly
      // the pose and lens the screen was showing, so nothing visibly cuts.
      exposeWorldForRoverLink();
      const feedCamera = transition.monitor?.feed?.camera;
      if (feedCamera) {
        camera.position.copy(feedCamera.position);
        camera.quaternion.copy(feedCamera.quaternion);
      }
      camera.fov = ROVER_FEED_FOV;
      camera.updateProjectionMatrix();

      // Second half of the same move: swing round to the driving angle while the
      // lens widens back out, so it reads as one continuous camera move.
      const toPosition = camera.position.clone();
      const toQuaternion = camera.quaternion.clone();
      updateRoverCamera(0);
      transition.toPosition.copy(camera.position);
      transition.toQuaternion.copy(camera.quaternion);
      camera.position.copy(toPosition);
      camera.quaternion.copy(toQuaternion);

      transition.stage = 'rover';
      transition.elapsed = 0;
      transition.duration = 1.5;
      transition.fromPosition.copy(toPosition);
      transition.fromQuaternion.copy(toQuaternion);
      transition.fromFov = ROVER_FEED_FOV;
      transition.toFov = transition.baseFov;
      return;
    }

    // Landed: hand the view straight over to the chase camera, which is already
    // sitting exactly where the dive ended, so there is no jump.
    camera.fov = transition.baseFov;
    camera.updateProjectionMatrix();
    roverLinkTransition = null;
    updateRoverCamera(0);
  }

  function beginRoverControl(roverId, options = {}) {
    const remote = Boolean(options.remote);
    if (!rovers.length || eventCinematic || dayStartCameraTransition) return false;
    if (roverCameraActive) stopRoverControl({ silent: true });
    if (!remote && cameraMode === 'interior') return false;

    const rover = roverId != null ? roverById(roverId) : nearestRoverTo(camera.position);
    if (!rover) return false;

    releaseAllKeys();
    firstPersonVelocity.set(0, 0, 0);
    airborne = false;
    jumpVelocity = 0;
    roverCameraSavedPosition.copy(camera.position);
    roverCameraSavedQuaternion.copy(camera.quaternion);
    roverCameraSavedTarget.copy(controls.target);
    roverCameraWasPointerLocked = document.pointerLockElement === canvas;
    if (roverCameraWasPointerLocked) document.exitPointerLock?.();

    if (remote) {
      remoteControlReturn = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        yaw: firstPersonYaw,
        moving: firstPersonVelocity.length() > 0.2,
        pitch: firstPersonPitch,
        // Two different skies: the interior colour to hand back on disconnect,
        // and the real lunar sky to show while the downlink is live.
        background: scene.background,
        feedBackground: outsideBackground ?? scene.background,
        terrainVisibility: moonTerrainMeshes.map(terrain => terrain.visible),
        horizonVisibility: horizon.visible,
        outpostVisibility: outpostRoot?.visible ?? true,
        commandCenterVisibility: commandCenterRoot?.visible ?? true,
        shellVisibility: commandCenterExteriorShell?.visible ?? true,
      };
      // The moon only comes back once the dive reaches the glass, so the monitor
      // is still the real room while the camera pushes in on it.
      onInsidePanelChange({ visible: false, label: '', buttonText: '' });
    }

    controls.enabled = false;
    roverCameraOrbitYaw = 0;
    roverCameraOrbitPitch = 0.28;
    roverCameraDistance = 12;
    if (canvas) canvas.style.cursor = 'grab';
    setPrompt(null);
    focusedRoverId = null;
    roverMonitorPromptDismissed = false;
    rover.speed = 0;
    rover.steering = 0;
    activeRover = rover;
    roverCameraActive = true;
    roverRemoteControl = remote;
    // A remote link dives through the screen the player just focused; anything
    // else (or a monitor that is not on screen) still cuts straight over.
    const monitor = remote
      ? roverMonitors.find(entry => entry.roverId === rover.id)
      : null;
    if (remote) refreshRoverFeeds(rover.id, true);
    if (!startRoverLinkTransition(rover, monitor)) {
      if (remote) exposeWorldForRoverLink();
      updateRoverCamera(0);
    }
    refreshRoverMonitors();
    onRoverCameraChange(true, { roverId: rover.id, roverLabel: rover.label, remote });
    return true;
  }

  function stopRoverControl(options = {}) {
    if (!roverCameraActive) return;
    // Final capture while the rover is still lit by the open surface: this is
    // the picture the console keeps after the player lets go of the controls.
    refreshLiveScreens();
    const silent = Boolean(options.silent);
    const previousRover = activeRover;
    const wasRemote = roverRemoteControl;
    const restore = remoteControlReturn;
    remoteControlReturn = null;

    roverCameraActive = false;
    roverRemoteControl = false;
    roverCameraDragging = false;
    // Cancel a dive still in flight, restoring the lens angle it was animating.
    if (roverLinkTransition) {
      camera.fov = roverLinkTransition.baseFov;
      camera.updateProjectionMatrix();
      roverLinkTransition = null;
    }
    activeRover = null;
    if (previousRover) {
      previousRover.speed = 0;
      previousRover.steering = 0;
    }
    if (canvas) canvas.style.cursor = '';
    releaseAllKeys();
    firstPersonVelocity.set(0, 0, 0);
    focusedRoverId = null;
    roverMonitorPromptDismissed = false;
    refreshRoverMonitors();
    onRoverCameraChange(false, {
      roverId: previousRover?.id ?? null,
      roverLabel: previousRover?.label ?? '',
      remote: wasRemote,
    });

    if (wasRemote && restore) {
      moonTerrainMeshes.forEach((terrain, index) => {
        terrain.visible = restore.terrainVisibility[index] ?? false;
      });
      horizon.visible = restore.horizonVisibility;
      if (outpostRoot) outpostRoot.visible = restore.outpostVisibility;
      if (commandCenterRoot) commandCenterRoot.visible = restore.commandCenterVisibility;
      if (commandCenterExteriorShell) commandCenterExteriorShell.visible = restore.shellVisibility;
      scene.background = restore.background;
      camera.position.copy(restore.position);
      camera.quaternion.copy(restore.quaternion);
      firstPersonYaw = restore.yaw;
      firstPersonPitch = restore.pitch;
      camera.rotation.order = 'YXZ';
      camera.rotation.set(firstPersonPitch, firstPersonYaw, 0);
      cameraMode = 'interior';
      controls.enabled = false;
      onModeChange(cameraMode);
      onInsidePanelChange({
        visible: true,
        label: 'INSIDE COMMAND CENTER · E TO EXIT',
        buttonText: 'EXIT COMMAND CENTER',
        componentId: '024',
      });
      if (!silent) ensurePointerLocked();
      return;
    }

    if (silent) return;

    camera.position.copy(roverCameraSavedPosition);
    camera.quaternion.copy(roverCameraSavedQuaternion);
    controls.target.copy(roverCameraSavedTarget);
    controls.enabled = cameraMode === 'free';
    if (controls.enabled) controls.update();
    if (cameraMode === 'first-person' && roverCameraWasPointerLocked) {
      canvas.requestPointerLock?.();
    }
  }

  function toggleRoverCamera() {
    if (roverCameraActive) {
      stopRoverControl();
      return;
    }
    if (eventCinematic || dayStartCameraTransition || cameraMode === 'interior') return;
    beginRoverControl(null, { remote: false });
  }

  // Called by the proximity prompt: link the focused command center monitor.
  function controlFocusedRover() {
    if (focusedRoverId == null) return false;
    return beginRoverControl(focusedRoverId, { remote: commandCenterInteriorActive });
  }

  // Called from the HUD / prompt button with an explicit rover id.
  function controlRover(roverId) {
    return beginRoverControl(roverId, { remote: commandCenterInteriorActive });
  }

  function toggleCameraMode() {
    if (eventCinematic || roverCameraActive) return;
    if (cameraMode === 'free' && (!outpostRoot || !heightGrid)) return;
    if (cameraMode === 'free') {
      savedFreePosition.copy(camera.position);
      savedFreeTarget.copy(controls.target);
      cameraMode = 'first-person';
      controls.enabled = false;
      camera.position.copy(playerStandPosition());
      camera.rotation.order = 'YXZ';
      camera.lookAt(firstPersonLookAt);
      firstPersonYaw = camera.rotation.y;
      firstPersonPitch = camera.rotation.x;
      onModeChange('first-person');
      canvas.requestPointerLock?.();
    } else if (cameraMode === 'first-person') {
      cameraMode = 'free';
      controls.enabled = true;
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      camera.position.copy(savedFreePosition);
      controls.target.copy(savedFreeTarget);
      controls.update();
      onModeChange('free');
    }
  }

  function toggleEarthView() {
    if (eventCinematic || roverCameraActive) return;
    if (!earthMesh || cameraMode !== 'free') return;
    if (earthViewActive) {
      camera.position.copy(savedEarthViewPosition);
      controls.target.copy(savedEarthViewTarget);
      controls.maxPolarAngle = savedEarthMaxPolarAngle;
      camera.fov = savedEarthFov;
      camera.updateProjectionMatrix();
      earthMesh.scale.setScalar(savedEarthScale);
      earthMesh.visible = true;
      if (closeupEarthMesh) scene.remove(closeupEarthMesh);
      closeupEarthMesh = null;
      controls.update();
      earthViewActive = false;
      onEarthToggleChange(false);
      return;
    }
    savedEarthViewPosition.copy(camera.position);
    savedEarthViewTarget.copy(controls.target);
    savedEarthMaxPolarAngle = controls.maxPolarAngle;
    savedEarthFov = camera.fov;
    savedEarthScale = earthMesh.scale.x;

    camera.position.copy(playerStandPosition());
    camera.fov = 120;
    camera.updateProjectionMatrix();
    controls.maxPolarAngle = Math.PI * 0.95;
    const closeupElevation = THREE.MathUtils.degToRad(38);
    const earthHorizontal = new THREE.Vector3(earthDirection.x, 0, earthDirection.z).normalize();
    const closeupDirection = earthHorizontal.clone().multiplyScalar(Math.cos(closeupElevation));
    closeupDirection.y = Math.sin(closeupElevation);
    earthMesh.visible = false;
    closeupEarthMesh = earthMesh.clone();
    closeupEarthMesh.visible = true;
    closeupEarthMesh.position.copy(camera.position).add(earthAnchor).addScaledVector(closeupDirection, EARTH_CLOSEUP_DISTANCE);
    closeupEarthMesh.scale.setScalar(EARTH_CLOSEUP_RADIUS);
    scene.add(closeupEarthMesh);

    const viewElevation = THREE.MathUtils.degToRad(15);
    const viewDirection = earthHorizontal.multiplyScalar(Math.cos(viewElevation));
    viewDirection.y = Math.sin(viewElevation);
    controls.target.copy(camera.position).addScaledVector(viewDirection, 850);
    controls.update();
    earthViewActive = true;
    onEarthToggleChange(true);
  }

  // Listeners
  function setConsoleEditMode(enabled) {
    consoleEditMode = Boolean(enabled);
    if (!consoleEditMode) consoleDragging = false;
    if (canvas) canvas.style.cursor = consoleEditMode ? 'move' : '';
    if (consoleEditMode && taskConsoleGroup) {
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      pushConsoleInfo();
    } else {
      saveConsoleOverrides();
      pushConsoleInfo();
    }
  }

  function resetConsolePlacement() {
    if (!taskConsoleKind) return;
    delete consoleOverrides[consolePlacementKey(taskConsoleKind, taskConsoleComponentId)];
    saveConsoleOverrides();
    const componentId = taskConsoleComponentId;
    const isWorkshop = taskConsoleKind === 'wall';
    mountTaskConsole(componentId, isWorkshop);
    refreshTaskConsole();
  }

  function storeConsolePlacement() {
    if (!taskConsoleGroup || !taskConsoleKind || !taskConsoleInner) return;
    taskConsoleGroup.updateWorldMatrix(true, false);
    const world = new THREE.Vector3().setFromMatrixPosition(taskConsoleGroup.matrixWorld);
    consoleOverrides[consolePlacementKey(taskConsoleKind, taskConsoleComponentId)] = {
      pos: [Math.round(world.x * 100) / 100, Math.round(world.y * 100) / 100, Math.round(world.z * 100) / 100],
      size: Math.round(taskConsoleInner.scale.x * 100) / 100,
    };
    saveConsoleOverrides();
  }

  function consolePointerNdcFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    consolePointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    return consolePointerNdc;
  }

  function handleConsolePointerDown(event) {
    if (roverCameraActive && event.button === 0) {
      event.preventDefault();
      roverCameraDragging = true;
      roverCameraPointerX = event.clientX;
      roverCameraPointerY = event.clientY;
      try { canvas.setPointerCapture?.(event.pointerId); } catch (error) { /* noop */ }
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (!consoleEditMode || !taskConsoleGroup || event.button !== 0) return;
    taskRaycaster.setFromCamera(consolePointerNdcFromEvent(event), camera);
    const hits = taskRaycaster.intersectObjects(taskConsoleGroup.children, true);
    if (!hits.length) return;
    event.preventDefault();
    try { canvas.setPointerCapture?.(event.pointerId); } catch { /* noop */ }
    const viewDir = new THREE.Vector3();
    camera.getWorldDirection(viewDir);
    consoleDragPlane.setFromNormalAndCoplanarPoint(viewDir, hits[0].point);
    taskConsoleGroup.updateWorldMatrix(true, false);
    const groupWorld = new THREE.Vector3().setFromMatrixPosition(taskConsoleGroup.matrixWorld);
    consoleGrabOffset.copy(groupWorld).sub(hits[0].point);
    consoleDragging = true;
    if (canvas) canvas.style.cursor = 'grabbing';
  }

  function handleConsolePointerMove(event) {
    if (roverCameraActive && roverCameraDragging) {
      const deltaX = event.clientX - roverCameraPointerX;
      const deltaY = event.clientY - roverCameraPointerY;
      roverCameraPointerX = event.clientX;
      roverCameraPointerY = event.clientY;
      roverCameraOrbitYaw -= deltaX * 0.006;
      roverCameraOrbitPitch = THREE.MathUtils.clamp(
        roverCameraOrbitPitch - deltaY * 0.004,
        0.04,
        1.05,
      );
      event.preventDefault();
      return;
    }
    if (!consoleEditMode || !consoleDragging || !taskConsoleGroup) return;
    event.preventDefault();
    taskRaycaster.setFromCamera(consolePointerNdcFromEvent(event), camera);
    const target = new THREE.Vector3();
    if (!taskRaycaster.ray.intersectPlane(consoleDragPlane, target)) return;
    target.add(consoleGrabOffset);
    if (activeModuleInteriorBounds) {
      const bounds = activeModuleInteriorBounds;
      const inset = 0.2;
      target.x = THREE.MathUtils.clamp(target.x, bounds.min.x + inset, bounds.max.x - inset);
      target.z = THREE.MathUtils.clamp(target.z, bounds.min.z + inset, bounds.max.z - inset);
      if (taskConsoleKind === 'pedestal') {
        taskConsoleGroup.updateWorldMatrix(true, false);
        target.y = new THREE.Vector3().setFromMatrixPosition(taskConsoleGroup.matrixWorld).y;
      } else {
        target.y = THREE.MathUtils.clamp(target.y, bounds.min.y + 0.2, bounds.max.y - 0.3);
      }
    }
    activeModuleInterior.updateMatrixWorld(true);
    taskConsoleGroup.position.copy(activeModuleInterior.worldToLocal(target.clone()));
    pushConsoleInfo();
  }

  function handleConsolePointerUp() {
    if (roverCameraDragging) {
      roverCameraDragging = false;
      if (canvas) canvas.style.cursor = roverCameraActive ? 'grab' : '';
    }
    if (!consoleDragging) return;
    consoleDragging = false;
    if (canvas) canvas.style.cursor = consoleEditMode ? 'move' : '';
    storeConsolePlacement();
    pushConsoleInfo();
  }

  function handleConsoleWheel(event) {
    if (roverCameraActive) {
      event.preventDefault();
      roverCameraDistance = THREE.MathUtils.clamp(
        roverCameraDistance * (event.deltaY < 0 ? 0.9 : 1 / 0.9),
        5,
        28,
      );
      return;
    }
    if (!consoleEditMode || !taskConsoleInner || !taskConsoleGroup) return;
    event.preventDefault();
    const next = THREE.MathUtils.clamp(
      taskConsoleInner.scale.x * (event.deltaY < 0 ? 1.1 : 1 / 1.1),
      0.3, 3
    );
    taskConsoleInner.scale.setScalar(next);
    storeConsolePlacement();
    pushConsoleInfo();
  }

  function handleCanvasClick() {
    if (eventCinematic || roverCameraActive) return;
    if (consoleEditMode) return;
    if (['first-person', 'interior'].includes(cameraMode) && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
      return;
    }
    // Click a task console button while inside a module interior. Each button
    // runs one specific daily task bound to the component, but only after the
    // task was activated from the Daily Tasks list.
    if (cameraMode === 'interior' && document.pointerLockElement === canvas && taskConsoleGroup) {
      taskRaycaster.setFromCamera(taskScreenCenter, camera);
      const hits = taskRaycaster.intersectObjects(taskConsoleGroup.children, true);
      if (hits.length > 0 && hits[0].distance < 8) {
        let node = hits[0].object;
        while (node && node.userData.taskConsoleTaskId === undefined) node = node.parent;
        const taskId = node?.userData?.taskConsoleTaskId ?? null;
        const unit = taskConsoleUnits.find(entry => entry.taskId === taskId);
        console.log(
          '[TaskConsole] clicked, component:', taskConsoleComponentId,
          'task:', taskId, 'status:', unit?.status ?? 'unknown'
        );
        if (taskId && unit && (unit.status === 'inProgress' || unit.status === 'overdue')) {
          if (node?.isSprite) onTaskTimerClick(taskId);
          else onTaskAction(taskConsoleComponentId, taskId);
        }
      }
    }
  }

  function handleMouseMove(event) {
    if (eventCinematic || !['first-person', 'interior'].includes(cameraMode) || document.pointerLockElement !== canvas) return;
    firstPersonYaw -= event.movementX * 0.0022;
    firstPersonPitch = THREE.MathUtils.clamp(
      firstPersonPitch - event.movementY * 0.0018,
      -PLAYER_CAMERA.pitchLimit,
      PLAYER_CAMERA.pitchLimit,
    );
  }

  function updateRoverCamera(dt) {
    if (!activeRover) return;
    const chassis = activeRover.root;
    // This rover model's nose points along local +X. Use its world-space
    // forward vector so the chase camera stays centered behind the chassis.
    roverCameraForward.set(1, 0, 0).applyQuaternion(chassis.quaternion).normalize();
    roverCameraDesiredPosition.set(-Math.cos(roverCameraOrbitYaw), 0, Math.sin(roverCameraOrbitYaw))
      .applyQuaternion(chassis.quaternion)
      .multiplyScalar(roverCameraDistance * Math.cos(roverCameraOrbitPitch));
    roverCameraDesiredPosition.add(chassis.position);
    roverCameraDesiredPosition.y += roverCameraDistance * Math.sin(roverCameraOrbitPitch) + 0.5;
    // The chassis now leans with the slope, which carries the chase offset with
    // it — keep the camera above the ground instead of letting it dip into a rise.
    roverCameraDesiredPosition.y = Math.max(
      roverCameraDesiredPosition.y,
      supportHeightAt(roverCameraDesiredPosition.x, roverCameraDesiredPosition.z) + 1.2,
    );
    const followBlend = dt > 0 ? 1 - Math.exp(-6 * dt) : 1;
    camera.position.lerp(roverCameraDesiredPosition, followBlend);

    roverCameraLookAt.copy(chassis.position)
      .addScaledVector(roverCameraForward, 2.5);
    roverCameraLookAt.y += 1.4;
    camera.lookAt(roverCameraLookAt);
    controls.target.copy(roverCameraLookAt);
  }

  function stepRover(rover, dt, driving, steerInput, throttleInput) {
    // Gradient sampled last frame: climbing costs speed, descending gains it, so
    // the drivetrain feels like it is pulling against the surface.
    const slopeFactor = THREE.MathUtils.clamp(1 - rover.climb * 0.9, 0.35, 1.5);
    const targetSpeed = driving
      ? (throttleInput > 0 ? 8 : throttleInput < 0 ? -3 : 0) * slopeFactor
      : 0;
    rover.speed = THREE.MathUtils.damp(rover.speed, targetSpeed, driving && throttleInput ? 2.8 : 4.5, dt);
    rover.steering = THREE.MathUtils.damp(rover.steering, driving ? steerInput * 0.3 : 0, 9, dt);

    const chassis = rover.root;
    // This extracted rover faces local +X. Arrow Up drives along its nose; side
    // keys steer, turning the chassis while it is moving.
    if (Math.abs(rover.speed) > 0.01) {
      rover.heading += rover.steering * 0.55 * Math.sign(rover.speed) * dt;
    }

    const forwardX = Math.cos(rover.heading);
    const forwardZ = -Math.sin(rover.heading);
    const sideX = Math.sin(rover.heading);
    const sideZ = Math.cos(rover.heading);
    const travel = rover.speed * dt;

    // Horizontal move with the walker's axis slide: a wall stops the axis that
    // hits it and lets the rover scrape along the face instead of dead-stopping.
    if (Math.abs(travel) > 1e-5) {
      const nextX = chassis.position.x + forwardX * travel;
      const nextZ = chassis.position.z + forwardZ * travel;
      const feetY = chassis.position.y - rover.groundOffset;
      if (!isRoverBlockedAt(nextX, nextZ, rover, feetY)) {
        chassis.position.x = nextX;
        chassis.position.z = nextZ;
      } else if (!isRoverBlockedAt(nextX, chassis.position.z, rover, feetY)) {
        chassis.position.x = nextX;
        rover.speed *= 0.55;
      } else if (!isRoverBlockedAt(chassis.position.x, nextZ, rover, feetY)) {
        chassis.position.z = nextZ;
        rover.speed *= 0.55;
      } else {
        rover.speed = 0;
      }
    }

    // Sample the ground under each corner plus the belly, so the body can sit on
    // the plane through the wheels and lean onto the local slope.
    const x = chassis.position.x;
    const z = chassis.position.z;
    const alongX = forwardX * rover.halfLength;
    const alongZ = forwardZ * rover.halfLength;
    const acrossX = sideX * rover.halfWidth;
    const acrossZ = sideZ * rover.halfWidth;
    // "+side" is the chassis' right and "-side" its left — getting these the
    // wrong way round rolls the body away from the slope instead of onto it.
    const frontRight = roverGroundAt(x + alongX + acrossX, z + alongZ + acrossZ);
    const frontLeft = roverGroundAt(x + alongX - acrossX, z + alongZ - acrossZ);
    const rearRight = roverGroundAt(x - alongX + acrossX, z - alongZ + acrossZ);
    const rearLeft = roverGroundAt(x - alongX - acrossX, z - alongZ - acrossZ);
    const belly = roverGroundAt(x, z);

    const front = (frontLeft + frontRight) * 0.5;
    const rear = (rearLeft + rearRight) * 0.5;
    const left = (frontLeft + rearLeft) * 0.5;
    const right = (frontRight + rearRight) * 0.5;
    // Ride on the plane through the four wheels — the belly sample only lifts the
    // body if a rock sits underneath it. Using the highest corner would perch the
    // rover on one wheel and lift the downhill side off the ground.
    const rideHeight = Math.max((front + rear) * 0.5, belly);
    const targetY = rideHeight + rover.groundOffset;

    // Surface normal from the two slopes: forward measured nose-first and the
    // side one toward the chassis' right, so a dip on the left drops the left
    // side and a rise ahead pitches the nose up.
    const climbForward = THREE.MathUtils.clamp(
      (front - rear) / Math.max(rover.halfLength * 2, 1e-3),
      -ROVER_MAX_TILT,
      ROVER_MAX_TILT,
    );
    const climbSide = THREE.MathUtils.clamp(
      (right - left) / Math.max(rover.halfWidth * 2, 1e-3),
      -ROVER_MAX_TILT,
      ROVER_MAX_TILT,
    );
    rover.climb = climbForward;

    // In the air there is no slope to read, so the chassis keeps the attitude it
    // left the ground with instead of snapping to the terrain underneath.
    if (!rover.airborne) {
      roverTerrainNormal.set(
        -climbForward * forwardX - climbSide * sideX,
        1,
        -climbForward * forwardZ - climbSide * sideZ,
      ).normalize();

      // Basis for the leaned chassis: nose projected onto the slope, slope up, and
      // the binormal across it. Reproduces the plain heading rotation when level.
      roverNose.set(forwardX, 0, forwardZ);
      roverNose.addScaledVector(roverTerrainNormal, -roverNose.dot(roverTerrainNormal));
      if (roverNose.lengthSq() < 1e-6) roverNose.set(forwardX, 0, forwardZ);
      roverNose.normalize();
      roverBinormal.crossVectors(roverNose, roverTerrainNormal).normalize();
      roverBasisMatrix.makeBasis(roverNose, roverTerrainNormal, roverBinormal);
      roverTargetQuaternion.setFromRotationMatrix(roverBasisMatrix);
      rover.chassisQuaternion.slerp(roverTargetQuaternion, 1 - Math.exp(-ROVER_TILT_RATE * dt));
    }
    chassis.quaternion.copy(rover.chassisQuaternion);

    // Vertical: ride the ground with a little suspension travel, and fall under
    // lunar gravity whenever a crest drops away beneath the wheels.
    if (!rover.airborne && targetY < chassis.position.y - ROVER_AIR_DROP) {
      rover.airborne = true;
      rover.verticalVelocity = 0;
    }
    if (rover.airborne) {
      rover.verticalVelocity = Math.max(
        rover.verticalVelocity - ROVER_GRAVITY * dt,
        -ROVER_MAX_AIR_SPEED,
      );
      const fallen = chassis.position.y + rover.verticalVelocity * dt;
      if (fallen <= targetY) {
        chassis.position.y = targetY;
        rover.airborne = false;
        rover.verticalVelocity = 0;
      } else {
        chassis.position.y = fallen;
      }
    } else {
      const rate = targetY > chassis.position.y ? ROVER_RIDE_RATE_UP : ROVER_RIDE_RATE_DOWN;
      chassis.position.y += (targetY - chassis.position.y) * Math.min(1, rate * dt);
    }

    // The exported wheel joints use the opposite local axle sign from the
    // rover's +X travel direction, so negate speed to make tire roll match it.
    rover.wheelAngle -= rover.speed * 0.9 * dt;
    rover.boneDelta.setFromAxisAngle(rover.spinAxis, rover.wheelAngle);
    rover.steeringDelta.setFromAxisAngle(rover.steerAxis, rover.steering);
    for (const bone of rover.spinBones) {
      bone.quaternion.copy(rover.boneRest.get(bone));
      if (rover.frontSpinBones.includes(bone)) {
        // The turnY bones animate the suspension links. Steer the actual front
        // tire joints too, then keep their rolling motion on the axle axis.
        bone.quaternion.multiply(rover.steeringDelta);
      }
      bone.quaternion.multiply(rover.boneDelta);
    }

    for (const bone of rover.steeringBones) {
      bone.quaternion.copy(rover.boneRest.get(bone)).multiply(rover.steeringDelta);
    }
  }

  function updateRoverDrive(dt) {
    if (!rovers.length) return;

    const canDrive = roverCameraActive
      && !roverLinkTransition
      && !eventCinematic
      && !dayStartCameraTransition
      && (roverRemoteControl || cameraMode === 'free' || cameraMode === 'first-person');
    const steerInput = canDrive
      ? (keys.has('arrowleft') || keys.has('a') ? 1 : 0) - (keys.has('arrowright') || keys.has('d') ? 1 : 0)
      : 0;
    const throttleInput = canDrive
      ? (keys.has('arrowup') || keys.has('w') ? 1 : 0) - (keys.has('arrowdown') || keys.has('s') ? 1 : 0)
      : 0;

    for (const rover of rovers) {
      stepRover(rover, dt, canDrive && rover === activeRover, steerInput, throttleInput);
    }
  }

  function handleKeyDown(event) {
    const target = event.target;
    const typing = target && (
      target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA'
      || target.isContentEditable
    );
    if (typing) return;
    if (eventCinematic) {
      event.preventDefault();
      return;
    }
    const rawKey = event.key || '';
    const key = rawKey.toLowerCase();
    const code = event.code || '';
    if (roverCameraActive) {
      // V always disconnects. From a command center monitor, Escape and E also
      // drop the remote link and hand the player back to the interior.
      const disconnects = key === 'v'
        || (roverRemoteControl && (key === 'escape' || key === 'e'));
      if (disconnects && !event.repeat) {
        event.preventDefault();
        stopRoverControl();
        return;
      }
      const driveKey = code.startsWith('Arrow') || ['w', 'a', 's', 'd'].includes(key);
      if (driveKey) {
        event.preventDefault();
        keys.add(key);
        const alias = KEY_CODE_ALIASES[code];
        if (alias) keys.add(alias);
      }
      return;
    }
    if (key === 'v' && !event.repeat && !typing) {
      event.preventDefault();
      toggleRoverCamera();
      return;
    }
    const isEnter = key === 'enter' || code === 'Enter' || code === 'NumpadEnter';
    const isJump = key === ' ' || code === 'Space';
    const isConfirm = key === 'e' || isEnter;
    if (isConfirm && cameraMode === 'interior') {
      event.preventDefault();
      if (currentPromptType === 'roverMonitor') controlFocusedRover();
      else if (currentPromptType === 'component') enterNearbyComponent();
      else if (currentPromptType === 'greenhouseDoor') returnToAirlock();
      else if (activeModuleInterior?.visible) exitModuleInterior();
      else if (greenhouseInterior?.visible) returnToAirlock();
      else exitAirlock();
      return;
    }
    if (isConfirm && cameraMode === 'first-person' && currentPromptType === 'component') {
      event.preventDefault();
      enterNearbyComponent();
      return;
    }
    if (isConfirm && cameraMode === 'first-person' && currentPromptType === 'regolithPlant') {
      event.preventDefault();
      runRegolithMaintenance();
      return;
    }
    if ((key === 'escape' || key === 'n') && currentPromptType === 'regolithPlant') {
      event.preventDefault();
      setPrompt(null);
      return;
    }
    if (cameraMode === 'interior' && currentPromptType === 'airlockEnd') {
      if (key === 'arrowleft' || key === 'a') {
        event.preventDefault();
        greenhouseReturnMode = 'airlock';
        enterGreenhouse();
        return;
      }
      if (key === 'arrowright' || key === 'd') {
        event.preventDefault();
        enterWorkshopFromAirlock();
        return;
      }
      if (key === 'escape') {
        event.preventDefault();
        setPrompt(null);
        airlockEndPromptDismissed = true;
        return;
      }
    }
    if (cameraMode === 'interior' && currentPromptType === 'greenhouseDoor' && key === 'escape') {
      event.preventDefault();
      setPrompt(null);
      greenhouseDoorPromptDismissed = true;
      return;
    }
    if (isConfirm && cameraMode === 'first-person' && currentPromptType === 'airlock') {
      event.preventDefault();
      enterAirlock();
      return;
    }
    if ((key === 'escape' || key === 'n') && currentPromptType === 'airlock') {
      event.preventDefault();
      setPrompt(null);
      airlockPromptDismissed = true;
      return;
    }
    if ((key === 'escape' || key === 'n') && currentPromptType === 'roverMonitor') {
      event.preventDefault();
      setPrompt(null);
      roverMonitorPromptDismissed = true;
      return;
    }
    if ((key === 'escape' || key === 'n') && currentPromptType === 'component') {
      event.preventDefault();
      setPrompt(null);
      dismissedComponentId = activeComponentTarget?.id ?? null;
      return;
    }
    if (isJump && ['first-person', 'interior'].includes(cameraMode)) {
      event.preventDefault();
      // A fresh press launches the hop; holding the key does not re-launch
      // on landing, so jumps stay deliberate. Interiors use the same launch and
      // the room ceiling caps the arc.
      if (!event.repeat && !airborne) {
        airborne = true;
        jumpVelocity = PLAYER_CAMERA.jumpSpeed;
      }
      return;
    }
    if (['first-person', 'interior'].includes(cameraMode) && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'enter'].includes(key)) {
      event.preventDefault();
    }
    if (key !== 'enter') {
      keys.add(key);
      const alias = KEY_CODE_ALIASES[code];
      if (alias) keys.add(alias);
    }
  }

  function handleKeyUp(event) {
    // Always pair the release: keys are cleared when a cinematic starts, but
    // a stray release must never be able to leave a key stuck afterwards.
    keys.delete((event.key || '').toLowerCase());
    const alias = KEY_CODE_ALIASES[event.code];
    if (alias) keys.delete(alias);
  }

  function handleVisibilityChange() {
    if (document.hidden) releaseAllKeys();
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('pointerdown', handleConsolePointerDown);
  canvas.addEventListener('pointermove', handleConsolePointerMove);
  canvas.addEventListener('pointerup', handleConsolePointerUp);
  canvas.addEventListener('pointercancel', handleConsolePointerUp);
  canvas.addEventListener('wheel', handleConsoleWheel, { passive: false });
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  // Releases that happen while the window is unfocused (alt-tab, OS popups,
  // clicking outside) are never delivered, so drop every held key the moment
  // focus leaves — the camera stops immediately instead of gliding on.
  window.addEventListener('blur', releaseAllKeys);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('resize', handleResize);

  // Prompt checks (zero per-frame Vector3 allocations)
  function getNearestComponentPromptTarget() {
    let nearest = null;
    let nearestSurfaceDistance = Infinity;
    let nearestCenterDistance = Infinity;
    for (let i = 0; i < componentTargets.length; i++) {
      const target = componentTargets[i];
      if (NON_ENTERABLE_COMPONENT_IDS.has(target.id)) continue;
      const dx = camera.position.x - target.center.x;
      const dz = camera.position.z - target.center.z;
      const centerDistance = Math.hypot(dx, dz);
      if (centerDistance > target.radius) continue;
      const outsideX = Math.max(target.bounds.minX - camera.position.x, 0, camera.position.x - target.bounds.maxX);
      const outsideZ = Math.max(target.bounds.minZ - camera.position.z, 0, camera.position.z - target.bounds.maxZ);
      const surfaceDistance = Math.hypot(outsideX, outsideZ);
      if (surfaceDistance < nearestSurfaceDistance
        || (surfaceDistance === nearestSurfaceDistance && centerDistance < nearestCenterDistance)) {
        nearest = target;
        nearestSurfaceDistance = surfaceDistance;
        nearestCenterDistance = centerDistance;
      }
    }
    return nearest
      ? { target: nearest, surfaceDistance: nearestSurfaceDistance, centerDistance: nearestCenterDistance }
      : null;
  }

  function updateAirlockPrompt() {
    if (cameraMode !== 'first-person' || !airlockTriggerCenter || NON_ENTERABLE_COMPONENT_IDS.has('005')) {
      if (currentPromptType === 'airlock') setPrompt(null);
      return;
    }
    const dx = camera.position.x - airlockTriggerCenter.x;
    const dz = camera.position.z - airlockTriggerCenter.z;
    const distance = Math.hypot(dx, dz);
    const nearestComponent = getNearestComponentPromptTarget();
    if (nearestComponent && nearestComponent.centerDistance + 1 < distance) {
      if (currentPromptType === 'airlock') setPrompt(null);
      return;
    }
    if (distance > airlockTriggerRadius) {
      if (currentPromptType === 'airlock') setPrompt(null);
      airlockPromptDismissed = false;
    } else if (airlockPromptDismissed) {
      if (currentPromptType === 'airlock') setPrompt(null);
    } else {
      setPrompt('airlock', {
        id: 'airlock-entry',
        title: 'Enter the airlock?',
        message: 'You are at the habitat entrance.'
      });
    }
  }

  function updateAirlockEndPrompt() {
    if (cameraMode !== 'interior' || !airlockInterior || greenhouseInterior?.visible || activeModuleInterior?.visible) {
      if (currentPromptType === 'airlockEnd') setPrompt(null);
      return;
    }
    const end = airlockLongAxis === 'x' ? airlockInteriorBounds.max.x : airlockInteriorBounds.max.z;
    const along = airlockLongAxis === 'x' ? camera.position.x : camera.position.z;
    const cross = airlockLongAxis === 'x'
      ? Math.abs(camera.position.z - airlockCenter.z)
      : Math.abs(camera.position.x - airlockCenter.x);
    const crossSize = airlockLongAxis === 'x'
      ? airlockInteriorBounds.max.z - airlockInteriorBounds.min.z
      : airlockInteriorBounds.max.x - airlockInteriorBounds.min.x;
    const reachedEnd = along >= end - Math.max(2, crossSize * 0.16) && cross <= crossSize * 0.55;
    if (!reachedEnd) {
      if (along < end - Math.max(3, crossSize * 0.25)) airlockEndPromptDismissed = false;
      if (currentPromptType === 'airlockEnd') setPrompt(null);
    } else if (!airlockEndPromptDismissed) {
      setPrompt('airlockEnd', {
        id: 'airlock-end',
        title: 'Choose a direction',
        message: 'Left leads to the greenhouse. Right leads to the workshop.'
      });
    }
  }

  function updateGreenhouseDoorPrompt() {
    if (cameraMode !== 'interior' || !greenhouseInterior?.visible || !greenhouseInteriorBounds) {
      if (currentPromptType === 'greenhouseDoor') setPrompt(null);
      return;
    }
    const end = greenhouseLongAxis === 'x' ? greenhouseInteriorBounds.max.x : greenhouseInteriorBounds.max.z;
    const along = greenhouseLongAxis === 'x' ? camera.position.x : camera.position.z;
    const cross = greenhouseLongAxis === 'x'
      ? Math.abs(camera.position.z - greenhouseCenter.z)
      : Math.abs(camera.position.x - greenhouseCenter.x);
    const crossSize = greenhouseLongAxis === 'x'
      ? greenhouseInteriorBounds.max.z - greenhouseInteriorBounds.min.z
      : greenhouseInteriorBounds.max.x - greenhouseInteriorBounds.min.x;
    const doorRange = Math.max(2.5, crossSize * 0.2);
    const atDoor = along >= end - doorRange && cross <= crossSize * 0.55;
    if (!atDoor) {
      if (along < end - doorRange * 1.5) greenhouseDoorPromptDismissed = false;
      if (currentPromptType === 'greenhouseDoor') setPrompt(null);
    } else if (!greenhouseDoorPromptDismissed) {
      setPrompt('greenhouseDoor', {
        id: 'greenhouse-door',
        title: 'Return to the airlock?',
        message: 'You are at the greenhouse door. Leave the crop bay and go back to the airlock?'
      });
    }
  }

  // The plant has no interior to step into, so instead of an "enter" prompt it
  // offers its maintenance cycle — the action the day's task is waiting on.
  function updateRegolithPlantPrompt() {
    if (cameraMode !== 'first-person' || !regolithPlantTarget) {
      if (currentPromptType === 'regolithPlant') setPrompt(null);
      return;
    }
    const target = regolithPlantTarget;
    const distance = Math.hypot(
      camera.position.x - target.center.x,
      camera.position.z - target.center.z,
    );
    if (distance > target.radius || regolithPlantMaintained) {
      if (currentPromptType === 'regolithPlant') setPrompt(null);
      return;
    }
    setPrompt('regolithPlant', {
      id: 'regolith-plant',
      title: 'Run a regolith maintenance cycle?',
      message: 'The digester is baking oxygen out of the regolith. A maintenance cycle keeps the yield up.',
    });
  }

  // Called from the prompt (Enter) and from the HUD button. The React layer owns
  // the task bookkeeping, so this just reports which component asked.
  function runRegolithMaintenance() {
    if (!regolithPlantTarget || cameraMode !== 'first-person') return false;
    const distance = Math.hypot(
      camera.position.x - regolithPlantTarget.center.x,
      camera.position.z - regolithPlantTarget.center.z,
    );
    if (distance > regolithPlantTarget.radius * 1.25) return false;
    // A completed cycle is acknowledged so the prompt stops nagging until the
    // next task arrives.
    regolithPlantMaintained = true;
    regolithPlantFlash = 1.6;
    setPrompt(null);
    onTaskAction('025', null);
    return true;
  }

  function updateComponentPrompt() {
    if (cameraMode !== 'first-person' || !componentTargets.length || currentPromptType === 'airlock') {
      if (currentPromptType === 'component' || currentPromptType === 'regolithPlant') setPrompt(null);
      return;
    }
    const nearest = getNearbyEnterableComponentTarget();
    if (!nearest) {
      if (currentPromptType === 'component' || currentPromptType === 'regolithPlant') setPrompt(null);
      activeComponentTarget = null;
      dismissedComponentId = null;
      return;
    }
    if (nearest.id === dismissedComponentId) {
      if (currentPromptType === 'component' || currentPromptType === 'regolithPlant') setPrompt(null);
      activeComponentTarget = nearest;
      return;
    }
    activeComponentTarget = nearest;
    setPrompt('component', {
      id: nearest.id,
      title: `Enter the ${nearest.name}?`,
      message: `You are near the ${nearest.name.toLowerCase()}. Enter to explore its interior.`
    });
  }

  // Focus a command center downlink monitor by aiming at it. The two screens
  // are stacked closely, so the scorer uses the off-axis distance from the aim
  // ray: whichever screen the crosshair is actually on wins, without jitter.
  function updateRoverMonitorPrompt() {
    if (roverCameraActive || !commandCenterInteriorActive || cameraMode !== 'interior' || !roverMonitors.length) {
      if (currentPromptType === 'roverMonitor') setPrompt(null);
      if (focusedRoverId !== null) {
        focusedRoverId = null;
        refreshRoverMonitors();
      }
      return;
    }

    camera.getWorldDirection(monitorFocusDirection);
    let best = null;
    let bestScore = Infinity;
    for (const monitor of roverMonitors) {
      monitorFocusOffset.copy(monitor.center).sub(camera.position);
      const distance = monitorFocusOffset.length();
      if (distance < 0.05 || distance > MONITOR_FOCUS_DISTANCE) continue;
      const alignment = monitorFocusOffset.divideScalar(distance).dot(monitorFocusDirection);
      if (alignment <= 0.05) continue;
      // Closest point on the aim ray to this screen's centre.
      monitorFocusNearest.copy(monitorFocusDirection)
        .multiplyScalar(distance * alignment)
        .add(camera.position);
      const offAxis = monitorFocusNearest.distanceTo(monitor.center);
      const tolerance = Math.max(
        MONITOR_FOCUS_MIN_TOLERANCE,
        distance * MONITOR_FOCUS_TOLERANCE_RATIO,
      );
      if (offAxis > tolerance) continue;
      if (offAxis < bestScore) {
        bestScore = offAxis;
        best = monitor;
      }
    }

    if (!best) {
      if (currentPromptType === 'roverMonitor') setPrompt(null);
      if (focusedRoverId !== null) {
        focusedRoverId = null;
        refreshRoverMonitors();
      }
      roverMonitorPromptDismissed = false;
      return;
    }

    if (focusedRoverId !== best.roverId) {
      focusedRoverId = best.roverId;
      refreshRoverMonitors();
    }
    if (roverMonitorPromptDismissed) {
      if (currentPromptType === 'roverMonitor') setPrompt(null);
      return;
    }

    setPrompt('roverMonitor', {
      id: `cc-monitor-${best.roverId}`,
      roverId: best.roverId,
      roverLabel: best.label,
      title: `Link to ${best.label}?`,
      message: `You are facing the ${best.label.toLowerCase()} downlink monitor. Link in to drive it from here.`
    });
  }

  // Find the flattest outpost-sized patch of terrain near the anchor point so the
  // whole model can rest on level ground with every component touching it.
  function findFlattestOutpostSite(anchorX, anchorZ) {
    if (!heightGrid) return null;
    const half = LUNAR_OUTPOST_WIDTH / 2 + OUTPOST_SITE_MARGIN;
    const { minX, minZ, cols, rows, CELL } = heightGrid;
    const maxGridX = minX + (cols - 1) * CELL;
    const maxGridZ = minZ + (rows - 1) * CELL;
    const step = 2;
    // The world is large now: search a window around the anchor instead of
    // the whole grid so placement stays fast and near the Apollo 16 site.
    const searchRadius = TERRAIN_SPAN * 0.4;
    const startX = Math.max(minX + half, anchorX - searchRadius);
    const endX = Math.min(maxGridX - half, anchorX + searchRadius);
    const startZ = Math.max(minZ + half, anchorZ - searchRadius);
    const endZ = Math.min(maxGridZ - half, anchorZ + searchRadius);
    let best = null;
    for (let cx = startX; cx <= endX; cx += step) {
      for (let cz = startZ; cz <= endZ; cz += step) {
        let minH = Infinity;
        let maxH = -Infinity;
        let worse = false;
        for (let sx = cx - half; sx <= cx + half && !worse; sx += step) {
          for (let sz = cz - half; sz <= cz + half; sz += step) {
            const h = sampleGroundHeight(sx, sz);
            if (h === null || !isFinite(h)) { worse = true; break; }
            if (h < minH) minH = h;
            if (h > maxH) maxH = h;
            // Score can only grow from here; prune windows that can't win.
            if (best && (maxH - minH) > best.score) { worse = true; break; }
          }
        }
        if (worse) continue;
        const range = maxH - minH;
        const dist = Math.hypot(cx - anchorX, cz - anchorZ);
        const score = range + dist * 0.002;
        if (!best || score < best.score) best = { x: cx, z: cz, minH, maxH, score };
      }
    }
    return best;
  }

  function buildHeightGrid() {
    const CELL = 1;
    const box = new THREE.Box3();
    for (const mesh of moonTerrainMeshes) {
      mesh.updateMatrixWorld(true);
      box.union(new THREE.Box3().setFromObject(mesh));
    }
    const cols = Math.ceil((box.max.x - box.min.x) / CELL) + 1;
    const rows = Math.ceil((box.max.z - box.min.z) / CELL) + 1;
    const data = new Float32Array(cols * rows).fill(-Infinity);
    const v = new THREE.Vector3();

    for (const mesh of moonTerrainMeshes) {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const cx = Math.floor((v.x - box.min.x) / CELL);
        const cz = Math.floor((v.z - box.min.z) / CELL);
        if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) continue;
        const idx = cz * cols + cx;
        if (v.y > data[idx]) data[idx] = v.y;
      }
    }

    // Fill small gaps from neighbours (a few dilation passes)
    for (let pass = 0; pass < 4; pass++) {
      const copy = data.slice();
      for (let z = 1; z < rows - 1; z++) {
        for (let x = 1; x < cols - 1; x++) {
          const i = z * cols + x;
          if (copy[i] !== -Infinity) continue;
          let sum = 0, n = 0;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const h = copy[(z + dz) * cols + (x + dx)];
              if (h !== -Infinity) { sum += h; n++; }
            }
          }
          if (n) data[i] = sum / n;
        }
      }
    }
    heightGrid = { data, cols, rows, minX: box.min.x, minZ: box.min.z, CELL };
    outerRect.minX = box.min.x;
    outerRect.maxX = box.max.x;
    outerRect.minZ = box.min.z;
    outerRect.maxZ = box.max.z;
  }

  function sampleGroundHeight(x, z) {
    if (!heightGrid) return null;
    const { data, cols, rows, minX, minZ, CELL } = heightGrid;
    const fx = (x - minX) / CELL;
    const fz = (z - minZ) / CELL;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    if (x0 < 0 || z0 < 0 || x0 >= cols - 1 || z0 >= rows - 1) return null;
    const tx = fx - x0, tz = fz - z0;
    const h00 = data[z0 * cols + x0], h10 = data[z0 * cols + x0 + 1];
    const h01 = data[(z0 + 1) * cols + x0], h11 = data[(z0 + 1) * cols + x0 + 1];
    if (!isFinite(h00) || !isFinite(h10) || !isFinite(h01) || !isFinite(h11)) return null;
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  // ——— Endless mare ———
  // Outside the two scanned landing sites the ground continues as a much
  // larger procedural plain dotted with craters, so walking never runs out
  // of moon: the detail fades, the world doesn't end.
  function rectDistanceOutside(x, z) {
    const dx = Math.max(outerRect.minX - x, 0, x - outerRect.maxX);
    const dz = Math.max(outerRect.minZ - z, 0, z - outerRect.maxZ);
    return Math.hypot(dx, dz);
  }

  function buildOuterCraters() {
    // Deterministic pseudo-random crater field ringing the landing sites.
    let seed = 987654321;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const spanX = outerRect.maxX - outerRect.minX;
    const spanZ = outerRect.maxZ - outerRect.minZ;
    const margin = OUTER_FIELD_DEPTH - 200;
    const craters = [];
    let guard = 0;
    while (craters.length < OUTER_CRATER_COUNT && guard++ < 4000) {
      const x = outerRect.minX - margin + rand() * (spanX + margin * 2);
      const z = outerRect.minZ - margin + rand() * (spanZ + margin * 2);
      if (rectDistanceOutside(x, z) < OUTER_BLEND_DISTANCE + 120) continue;
      craters.push({
        x,
        z,
        radius: 90 + rand() * 310,
        depth: 1.2 + rand() * 4.3,
        rim: 0.5 + rand() * 1.7,
      });
    }
    return craters;
  }

  function craterReliefAt(x, z) {
    let relief = 0;
    for (const crater of outerCraters) {
      const t = Math.hypot(x - crater.x, z - crater.z) / crater.radius;
      if (t > 2.4) continue;
      if (t < 1) {
        relief += crater.depth * (t * t - 1); // saucer floor
        continue;
      }
      const rim = crater.rim * Math.exp(-((t - 1) * (t - 1)) / 0.045);
      const ejecta = crater.rim * 0.5 * Math.exp(-(t - 1) / 0.9);
      relief += rim + ejecta;
    }
    return relief;
  }

  function plainHeight(x, z) {
    const d = rectDistanceOutside(x, z);
    // Fade the relief out near the mesh rim so it melts into the backdrop
    // plane without a seam.
    const taper = 1 - THREE.MathUtils.smoothstep(d, OUTER_FIELD_TAPER_START, OUTER_FIELD_TAPER_END);
    const undulation =
      Math.sin(x * 0.0043 + 1.7) * Math.cos(z * 0.0037 - 0.6) * 1.6
      + Math.sin(x * 0.0151 - z * 0.0113) * 0.3;
    return PLAIN_LEVEL + taper * (undulation + craterReliefAt(x, z));
  }

  function sampleOuterHeight(x, z) {
    // Blends the scanned border down into the open mare so walking past the
    // edge of the detailed terrain keeps the feet on the rendered ground.
    const d = rectDistanceOutside(x, z);
    const blend = THREE.MathUtils.smoothstep(d, 0, OUTER_BLEND_DISTANCE);
    let borderHeight = PLAIN_LEVEL;
    if (heightGrid) {
      const { cols, rows, minX, minZ, CELL } = heightGrid;
      const borderX = THREE.MathUtils.clamp(x, minX + CELL, minX + (cols - 1) * CELL - CELL);
      const borderZ = THREE.MathUtils.clamp(z, minZ + CELL, minZ + (rows - 1) * CELL - CELL);
      const sampled = sampleGroundHeight(borderX, borderZ);
      if (sampled !== null) borderHeight = sampled;
    }
    return borderHeight * (1 - blend) + plainHeight(x, z) * blend;
  }

  function buildOuterTerrain() {
    if (outerTerrainGroup) {
      scene.remove(outerTerrainGroup);
      outerTerrainGroup.traverse(object => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
      outerTerrainGroup = null;
    }
    outerCraters = buildOuterCraters();

    const scanTone = new THREE.Color(0xb7b3ab);
    const mareTone = new THREE.Color(0x4b4947);
    const tone = new THREE.Color();

    // Rectangular ring meshes: the fine skirt stitches the scanned borders
    // into the plain, the coarse field carries the craters further out.
    const buildRing = (depth, spacing, skipExpand, skipMode, useVertexColors) => {
      const minX = outerRect.minX - depth;
      const maxX = outerRect.maxX + depth;
      const minZ = outerRect.minZ - depth;
      const maxZ = outerRect.maxZ + depth;
      const cols = Math.ceil((maxX - minX) / spacing) + 1;
      const rows = Math.ceil((maxZ - minZ) / spacing) + 1;
      const stepX = (maxX - minX) / (cols - 1);
      const stepZ = (maxZ - minZ) / (rows - 1);
      const innerMinX = outerRect.minX - skipExpand;
      const innerMaxX = outerRect.maxX + skipExpand;
      const innerMinZ = outerRect.minZ - skipExpand;
      const innerMaxZ = outerRect.maxZ + skipExpand;

      const positions = new Float32Array(cols * rows * 3);
      const colors = useVertexColors ? new Float32Array(cols * rows * 3) : null;
      let p = 0;
      for (let row = 0; row < rows; row++) {
        const z = minZ + row * stepZ;
        for (let col = 0; col < cols; col++) {
          const x = minX + col * stepX;
          const d = rectDistanceOutside(x, z);
          positions[p] = x;
          // Tuck the rim that runs under the scans just below their surface
          // so the two meshes never fight over the same pixels.
          positions[p + 1] = sampleOuterHeight(x, z) - (d <= 0 ? 0.2 : 0);
          positions[p + 2] = z;
          if (colors) {
            tone.copy(scanTone).lerp(mareTone, THREE.MathUtils.smoothstep(d, 0, OUTER_BLEND_DISTANCE));
            colors[p] = tone.r;
            colors[p + 1] = tone.g;
            colors[p + 2] = tone.b;
          }
          p += 3;
        }
      }

      const indices = [];
      for (let row = 0; row < rows - 1; row++) {
        const za = minZ + row * stepZ;
        const zb = za + stepZ;
        for (let col = 0; col < cols - 1; col++) {
          const xa = minX + col * stepX;
          const xb = xa + stepX;
          const overlaps = xa < innerMaxX && xb > innerMinX && za < innerMaxZ && zb > innerMinZ;
          const inside = xa >= innerMinX && xb <= innerMaxX && za >= innerMinZ && zb <= innerMaxZ;
          if (skipMode === 'crossing' ? overlaps : inside) continue;
          const a = row * cols + col;
          const c = a + cols;
          indices.push(a, c, a + 1, a + 1, c, c + 1);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
      geometry.computeVertexNormals();
      const material = useVertexColors
        ? new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 1, metalness: 0 })
        : new THREE.MeshStandardMaterial({ color: 0x4b4947, roughness: 1, metalness: 0 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = useVertexColors ? 'OuterMareSkirt' : 'OuterMareField';
      mesh.receiveShadow = true;
      return mesh;
    };

    outerTerrainGroup = new THREE.Group();
    outerTerrainGroup.name = 'OuterMare';
    outerTerrainGroup.add(buildRing(OUTER_BLEND_DISTANCE, OUTER_SKIRT_SPACING, 0, 'inside', true));
    outerTerrainGroup.add(buildRing(OUTER_FIELD_DEPTH, OUTER_FIELD_SPACING, OUTER_BLEND_DISTANCE, 'crossing', false));
    scene.add(outerTerrainGroup);
  }

  // Height of whatever the walker stands on: terrain, or a walkable outpost
  // surface (apron, ramp, low deck).
  function supportHeightAt(x, z) {
    const h = sampleGroundHeight(x, z);
    const terrain = h === null ? sampleOuterHeight(x, z) : h;
    const outpostTop = sampleOutpostTop(outpostHeightField, x, z);
    return outpostTop === null ? terrain : Math.max(terrain, outpostTop);
  }

  // Height of the surface under one point of the rover: terrain, or a walkable
  // outpost surface (apron, ramp, low deck). Ramps and low obstacles can support
  // the wheels, but tall walls and roofs remain obstacles rather than lifting the
  // vehicle onto them.
  function roverGroundAt(x, z) {
    const terrain = sampleGroundHeight(x, z) ?? sampleOuterHeight(x, z);
    const deck = sampleOutpostTop(outpostHeightField, x, z);
    const height = deck !== null && deck >= terrain && deck - terrain <= ROVER_MAX_STEP_HEIGHT
      ? deck
      : terrain;
    return Number.isFinite(height) ? height : PLAIN_LEVEL;
  }

  function roverSupportHeightAt(x, z, rover) {
    const heading = rover.heading;
    const halfLength = rover.halfLength;
    const halfWidth = rover.halfWidth;
    const forwardX = Math.cos(heading);
    const forwardZ = -Math.sin(heading);
    const sideX = Math.sin(heading);
    const sideZ = Math.cos(heading);
    let highest = -Infinity;

    // Sample the whole footprint at sub-meter intervals. The terrain height
    // grid is one meter wide, so sparse corner-only samples could miss bumps
    // between the wheels and let the chassis clip through them.
    const lengthSteps = Math.max(2, Math.ceil((halfLength * 2) / 0.75));
    const widthSteps = Math.max(2, Math.ceil((halfWidth * 2) / 0.75));
    for (let i = 0; i <= lengthSteps; i++) {
      const along = (i / lengthSteps) * 2 - 1;
      for (let j = 0; j <= widthSteps; j++) {
        const across = (j / widthSteps) * 2 - 1;
        const sampleX = x + forwardX * halfLength * along + sideX * halfWidth * across;
        const sampleZ = z + forwardZ * halfLength * along + sideZ * halfWidth * across;
        highest = Math.max(highest, roverGroundAt(sampleX, sampleZ));
      }
    }

    return Number.isFinite(highest) ? highest : PLAIN_LEVEL;
  }

  function isRoverBlockedAt(x, z, rover, groundY) {
    if (!outpostHeightField) return false;
    const heading = rover.heading;
    const halfLength = rover.halfLength;
    const halfWidth = rover.halfWidth;
    const forwardX = Math.cos(heading);
    const forwardZ = -Math.sin(heading);
    const sideX = Math.sin(heading);
    const sideZ = Math.cos(heading);
    // Sweep the rover's oriented footprint in steps at least as fine as the
    // outpost collision grid, so its long chassis cannot pass through walls,
    // habitat modules, or supports between frames.
    const spacing = 0.38;
    const lengthSteps = Math.max(1, Math.ceil((halfLength * 2) / spacing));
    const widthSteps = Math.max(1, Math.ceil((halfWidth * 2) / spacing));
    for (let i = 0; i <= lengthSteps; i++) {
      const along = (i / lengthSteps) * 2 - 1;
      for (let j = 0; j <= widthSteps; j++) {
        const across = (j / widthSteps) * 2 - 1;
        const sampleX = x + forwardX * halfLength * along + sideX * halfWidth * across;
        const sampleZ = z + forwardZ * halfLength * along + sideZ * halfWidth * across;
        const obstacleTop = sampleOutpostTop(outpostHeightField, sampleX, sampleZ);
        if (obstacleTop !== null && obstacleTop - groundY > ROVER_MAX_STEP_HEIGHT) return true;
      }
    }
    return false;
  }

  function moveFirstPersonWithCollisions(stepX, stepZ) {
    if (!outpostHeightField) {
      camera.position.x += stepX;
      camera.position.z += stepZ;
      return;
    }
    // Collision is measured from the surface underfoot (not the smoothed
    // camera height) so climbing never fights the camera easing. Airborne,
    // the walker's real body height counts instead, so a hop can carry over
    // low obstacles instead of snagging on the ground far below.
    const feetY = airborne
      ? camera.position.y - playerCameraHeight
      : supportHeightAt(camera.position.x, camera.position.z);
    const startX = camera.position.x;
    const startZ = camera.position.z;
    // If the walker already overlaps a wall (e.g. right after exiting a
    // module), never trap them: let the step through so they can walk free.
    if (!isOutpostBlocked(outpostHeightField, startX, startZ, feetY)
      && isOutpostBlocked(outpostHeightField, startX + stepX, startZ + stepZ, feetY)) {
      // A component stands in the way: slide along its face, axis by axis.
      if (!isOutpostBlocked(outpostHeightField, startX + stepX, startZ, feetY)) {
        camera.position.x = startX + stepX;
      }
      if (!isOutpostBlocked(outpostHeightField, camera.position.x, startZ + stepZ, feetY)) {
        camera.position.z = startZ + stepZ;
      }
      return;
    }
    camera.position.x = startX + stepX;
    camera.position.z = startZ + stepZ;
  }

  function keepCameraAboveSurface(dt) {
    if (!heightGrid) return;
    // The walkable world runs far past the scans; only a very distant soft
    // limit ends the trek, long after all terrain detail has faded out.
    camera.position.x = THREE.MathUtils.clamp(
      camera.position.x,
      outerRect.minX - OUTER_WALK_LIMIT,
      outerRect.maxX + OUTER_WALK_LIMIT
    );
    camera.position.z = THREE.MathUtils.clamp(
      camera.position.z,
      outerRect.minZ - OUTER_WALK_LIMIT,
      outerRect.maxZ + OUTER_WALK_LIMIT
    );
    const targetY = supportHeightAt(camera.position.x, camera.position.z) + playerCameraHeight;
    if (airborne) {
      // Ballistic hop: gravity pulls the walker back down, and whatever
      // surface (terrain, ramp or ledge top) catches up first is the landing.
      jumpVelocity -= PLAYER_CAMERA.gravity * dt;
      camera.position.y += jumpVelocity * dt;
      if (camera.position.y <= targetY) {
        camera.position.y = targetY;
        airborne = false;
        jumpVelocity = 0;
      }
      return;
    }
    // Smooth the ride across pads and uneven terrain instead of teleporting
    // the camera: quick uphill, gentle downhill.
    const rate = targetY > camera.position.y ? 20 : 9;
    camera.position.y += (targetY - camera.position.y) * Math.min(1, Math.max(dt, 0) * rate);
  }

  function keepCameraInsideVerticalBounds(bounds) {
    if (!bounds) return;
    const floor = bounds.min.y + playerCameraHeight;
    const ceiling = bounds.max.y - 0.2;
    camera.position.y = floor <= ceiling
      ? THREE.MathUtils.clamp(camera.position.y, floor, ceiling)
      : (bounds.min.y + bounds.max.y) / 2;
  }

  // ── The player camera ──────────────────────────────────────────────────────
  // One controller for the whole game. Looking, walking and standing all go
  // through here whether the player is on the regolith or inside a component;
  // the only thing the space changes is the "support": what the deck is, what
  // stops horizontal movement, and whether there is a sky to fall out of.
  function currentPlayerSpace() {
    if (cameraMode !== 'interior') return { kind: 'surface', bounds: null, clampPlan: false };
    // Command center / habitats / workshop / greenhouse: a boxed room.
    if (greenhouseInterior?.visible && greenhouseInteriorBounds) {
      return { kind: 'interior', bounds: greenhouseInteriorBounds, clampPlan: true };
    }
    if (activeModuleInterior?.visible && activeModuleInteriorBounds) {
      return { kind: 'interior', bounds: activeModuleInteriorBounds, clampPlan: true };
    }
    // The airlock is a corridor with its own walls; only its deck is enforced.
    if (airlockInterior && airlockInteriorBounds) {
      return { kind: 'interior', bounds: airlockInteriorBounds, clampPlan: false };
    }
    return { kind: 'interior', bounds: null, clampPlan: false };
  }

  function updatePlayerCamera(dt) {
    const space = currentPlayerSpace();

    // Look: one yaw/pitch pair drives every player view.
    camera.rotation.order = 'YXZ';
    camera.rotation.set(firstPersonPitch, firstPersonYaw, 0);

    const forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0)
      - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const side = (keys.has('d') || keys.has('arrowright') ? 1 : 0)
      - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    camera.getWorldDirection(firstPersonForward).normalize();
    firstPersonRight.set(Math.cos(firstPersonYaw), 0, Math.sin(firstPersonYaw));
    firstPersonDirection.copy(firstPersonForward).multiplyScalar(forward).addScaledVector(firstPersonRight, side);
    const wantsMove = firstPersonDirection.lengthSq() > 0;
    if (wantsMove) firstPersonDirection.normalize();

    // Gait: identical acceleration and glide in every space. Shift runs, which
    // matters on the surface and keeps the feel consistent indoors.
    const moveSpeed = keys.has('shift') ? PLAYER_CAMERA.sprintSpeed : PLAYER_CAMERA.walkSpeed;
    const desiredX = wantsMove ? firstPersonDirection.x * moveSpeed : 0;
    const desiredZ = wantsMove ? firstPersonDirection.z * moveSpeed : 0;
    const rateStep = (wantsMove ? PLAYER_CAMERA.acceleration : PLAYER_CAMERA.deceleration) * dt;
    firstPersonVelocity.x = THREE.MathUtils.clamp(
      desiredX,
      firstPersonVelocity.x - rateStep,
      firstPersonVelocity.x + rateStep,
    );
    firstPersonVelocity.z = THREE.MathUtils.clamp(
      desiredZ,
      firstPersonVelocity.z - rateStep,
      firstPersonVelocity.z + rateStep,
    );

    const stepX = firstPersonVelocity.x * dt;
    const stepZ = firstPersonVelocity.z * dt;
    if (stepX !== 0 || stepZ !== 0) {
      if (space.kind === 'surface') {
        // The height field rasterized from the outpost stops the walker.
        moveFirstPersonWithCollisions(stepX, stepZ);
      } else {
        // Authored interiors have no walkable height field, so the same gait
        // slides inside the room box instead.
        camera.position.x += stepX;
        camera.position.z += stepZ;
      }
    }

    if (space.kind === 'surface') {
      keepCameraAboveSurface(dt);
      return;
    }

    if (space.clampPlan && space.bounds) {
      const wallInset = 0.8;
      camera.position.x = THREE.MathUtils.clamp(
        camera.position.x,
        space.bounds.min.x + wallInset,
        space.bounds.max.x - wallInset,
      );
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z,
        space.bounds.min.z + wallInset,
        space.bounds.max.z - wallInset,
      );
    }
    settleInteriorCameraHeight(space.bounds, dt);
  }

  // Hopping works indoors too: same launch, same lunar gravity, and the room
  // ceiling catches the apex instead of the player leaving the module.
  function settleInteriorCameraHeight(bounds, dt) {
    if (!bounds) return;
    const floor = bounds.min.y + playerCameraHeight;
    if (airborne) {
      jumpVelocity -= PLAYER_CAMERA.gravity * dt;
      camera.position.y += jumpVelocity * dt;
      if (camera.position.y <= floor) {
        camera.position.y = floor;
        airborne = false;
        jumpVelocity = 0;
      }
    }
    keepCameraInsideVerticalBounds(bounds);
  }

  // Drop the eye exactly onto the current deck — used when the camera height is
  // changed at runtime or a space is entered, so the view never lerps from a
  // stale height.
  function reseatPlayerCamera() {
    const space = currentPlayerSpace();
    if (space.kind === 'surface') {
      airborne = false;
      jumpVelocity = 0;
      if (!heightGrid) return;
      camera.position.y = supportHeightAt(camera.position.x, camera.position.z) + playerCameraHeight;
      return;
    }
    airborne = false;
    jumpVelocity = 0;
    if (!space.bounds) return;
    const floor = space.bounds.min.y + playerCameraHeight;
    const ceiling = space.bounds.max.y - 0.2;
    camera.position.y = floor <= ceiling ? floor : (space.bounds.min.y + space.bounds.max.y) / 2;
  }

  // The single knob for how high the player's eyes are. Every space reads it.
  function setPlayerCameraHeight(height) {
    const next = Number(height);
    if (!Number.isFinite(next)) return playerCameraHeight;
    playerCameraHeight = THREE.MathUtils.clamp(next, PLAYER_CAMERA.minHeight, PLAYER_CAMERA.maxHeight);
    // Only re-seat a live player camera — never yank the free camera, a rover
    // chase view, or a running cinematic.
    const playerCameraLive = (cameraMode === 'first-person' || cameraMode === 'interior')
      && !roverCameraActive
      && !eventCinematic
      && !dayStartCameraTransition;
    if (playerCameraLive) reseatPlayerCamera();
    return playerCameraHeight;
  }

  function getPlayerCameraHeight() {
    return playerCameraHeight;
  }

  function animateEventCamera(delta) {
    const cinematic = eventCinematic;
    if (!cinematic) return;

    if (cinematic.stage === 'approach') {
      cinematic.elapsed += delta;
      const progress = Math.min(cinematic.elapsed / 1.8, 1);
      const eased = progress * progress * (3 - 2 * progress);
      camera.position.lerpVectors(cinematic.startPosition, cinematic.destination, eased);
      camera.quaternion.slerpQuaternions(
        cinematic.startQuaternion,
        cinematic.destinationQuaternion,
        eased,
      );

      if (progress >= 1) {
        camera.position.copy(cinematic.destination);
        camera.quaternion.copy(cinematic.destinationQuaternion);
        cinematic.stage = 'hold';
        cinematic.elapsed = 0;
      }
      return;
    }

    if (cinematic.stage === 'hold') {
      cinematic.elapsed += delta;
      if (cinematic.elapsed >= 3.8) {
        cinematic.stage = 'return';
        cinematic.elapsed = 0;
        cinematic.returnFromPosition = camera.position.clone();
        cinematic.returnFromQuaternion = camera.quaternion.clone();
        cinematic.onReturned = cinematic.onPresented;
        cinematic.onPresented = null;
      }
      return;
    }

    cinematic.elapsed += delta;
    const progress = Math.min(cinematic.elapsed / 1.8, 1);
    const eased = progress * progress * (3 - 2 * progress);
    camera.position.lerpVectors(
      cinematic.returnFromPosition,
      cinematic.snapshot.cameraPosition,
      eased,
    );
    camera.quaternion.slerpQuaternions(
      cinematic.returnFromQuaternion,
      cinematic.snapshot.cameraQuaternion,
      eased,
    );

    if (progress >= 1) {
      camera.position.copy(cinematic.snapshot.cameraPosition);
      camera.quaternion.copy(cinematic.snapshot.cameraQuaternion);
      restoreWorldExposure(cinematic.snapshot);
      eventCinematic = null;
      cinematic.onReturned?.();
      startNextEventPresentation();
    }
  }

  // Animation loop with throttled prompt evaluation (10 Hz vs 120 Hz)
  let promptCheckTimer = 0;

  function animate() {
    if (isDestroyed) return;
    animId = requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.05);
    for (const marker of crewMarkers.values()) {
      marker.group.position.lerp(marker.target, 1 - Math.exp(-dt * 14));
      marker.mixer?.update(dt);
    }
    updateRoverDrive(dt);

    // The screens are only on screen while the player stands in the command
    // center, so that is the only time they are worth updating. Each redraw is a
    // whole extra scene render, hence the throttles: the big wall display runs as
    // a live view, while a rover screen only re-captures when that rover moved.
    if (commandCenterInteriorActive && !roverCameraActive) {
      outpostFeedTimer += dt;
      if (outpostFeedTimer >= OUTPOST_FEED_REFRESH) {
        outpostFeedTimer = 0;
        refreshOutpostFeed();
      }
      roverFeedTimer += dt;
      if (roverFeedTimer >= ROVER_FEED_REFRESH) {
        roverFeedTimer = 0;
        refreshRoverFeeds();
      }
    } else {
      outpostFeedTimer = 0;
      roverFeedTimer = 0;
    }

    if (cameraMode !== previousCameraMode) {
      // Every mode switch teleports the camera, so never carry gait momentum or
      // a half-finished hop across one: stepping through an airlock must not
      // fire the walker off or leave it falling.
      previousCameraMode = cameraMode;
      firstPersonVelocity.set(0, 0, 0);
      airborne = false;
      jumpVelocity = 0;
    }

    promptCheckTimer += dt;
    if (regolithPlantFlash > 0) {
      // Short decaying pulse on the plant's lights after a maintenance cycle.
      regolithPlantFlash = Math.max(0, regolithPlantFlash - dt);
      const pulse = 1 + Math.sin(regolithPlantFlash * 14) * 0.7 * (regolithPlantFlash / 1.6);
      for (const light of regolithPlantLights) {
        light.material.emissiveIntensity = light.base * pulse;
      }
    }
    if (!eventCinematic && !dayStartCameraTransition && !roverCameraActive && promptCheckTimer >= 0.1) {
      promptCheckTimer = 0;
      if (cameraMode === 'first-person') {
        updateAirlockPrompt();
        updateComponentPrompt();
        updateRegolithPlantPrompt();
      } else if (cameraMode === 'interior') {
        updateAirlockEndPrompt();
        updateGreenhouseDoorPrompt();
        updateRoverMonitorPrompt();
      }
    }

    if (eventCinematic) {
      animateEventCamera(dt);
    } else if (dayStartCameraTransition) {
      const transition = dayStartCameraTransition;
      transition.elapsed += dt;
      const progress = Math.min(transition.elapsed / (transition.duration ?? 2.6), 1);
      const eased = progress * progress * (3 - 2 * progress);
      camera.position.lerpVectors(transition.startPosition, transition.destination, eased);
      camera.quaternion.slerpQuaternions(
        transition.startQuaternion,
        transition.destinationQuaternion,
        eased,
      );
      if (progress >= 1) {
        camera.position.copy(transition.destination);
        camera.quaternion.copy(transition.destinationQuaternion);
        dayStartCameraTransition = null;
        if (transition.enableControlsOnFinish) {
          controls.enabled = true;
          controls.target.copy(transition.focus);
          controls.update();
        }
        if (!initialCameraSettledReported) {
          initialCameraSettledReported = true;
          onInitialCameraSettled();
        }
      }
    } else if (roverLinkTransition) {
      // Push in on the monitor, then carry through it onto the rover.
      animateRoverLinkTransition(dt);
    } else if (roverCameraActive) {
      updateRoverCamera(dt);
    } else if (cameraMode === 'free') {
      controls.update();
    } else {
      updatePlayerCamera(dt);
    }

    // Horizontal momentum belongs to the walking views only — both the surface
    // walk and the interior walk share one gait. Every other mode (free camera,
    // rover chase, event cinematics) resets it so the walker never glides off
    // after switching.
    if (!['first-person', 'interior'].includes(cameraMode) || eventCinematic || roverCameraActive) {
      firstPersonVelocity.set(0, 0, 0);
    }

    for (const visualization of eventVisualizations.values()) {
      for (const animateEvent of visualization.animations) {
        animateEvent(clock.elapsedTime, dt);
      }
    }

    const pulseNow = performance.now();
    for (const unit of taskConsoleUnits) {
      if (unit.status === 'inProgress' || unit.status === 'overdue') {
        unit.button.material.emissiveIntensity = 1.3 + Math.sin(pulseNow * 0.006) * 0.6;
      }
    }
    if (taskConsoleArrow && taskConsoleActive) {
      taskConsoleArrow.position.y = taskConsoleArrowBaseY + Math.sin(pulseNow * 0.004) * 0.12;
      taskConsoleArrow.rotation.y += dt * 1.5;
    }

    if (earthMesh) {
      // The Earth rides with the player, never with the map, so it stays
      // pinned to the horizon of the endless world. A slow axial spin keeps
      // the day/night terminator and city lights alive in the sky.
      earthMesh.position.copy(camera.position).add(earthSkyOffset);
      earthMesh.rotation.y += dt * 0.006;
    }

    renderer.render(scene, camera);
    if (!sceneReadyReported && outpostRoot && moonTerrainMeshes.length === 2 && skyAssetReady && earthAssetsReady) {
      sceneReadyReported = true;
      if (initialCameraApproach && !freeCameraAdjusted && cameraMode === 'free') {
        const approach = initialCameraApproach;
        const looker = new THREE.PerspectiveCamera();
        looker.position.copy(approach.destination);
        looker.lookAt(approach.focus);
        controls.enabled = false;
        dayStartCameraTransition = {
          elapsed: 0,
          duration: 4.4,
          startPosition: camera.position.clone(),
          startQuaternion: camera.quaternion.clone(),
          destination: approach.destination.clone(),
          destinationQuaternion: looker.quaternion.clone(),
          focus: approach.focus.clone(),
          enableControlsOnFinish: true,
        };
      }
      onSceneReady();
      if (!dayStartCameraTransition && !initialCameraSettledReported) {
        initialCameraSettledReported = true;
        onInitialCameraSettled();
      }
    }
  }

  function getCrewPosition() {
    if (cameraMode === 'interior') {
      return {
        x: camera.position.x,
        y: camera.position.y - playerCameraHeight,
        z: camera.position.z,
        yaw: firstPersonYaw,
        moving: firstPersonVelocity.length() > 0.2,
        location: 'interior',
        componentId: activeComponentTarget?.id ?? null,
      };
    }
    const position = cameraMode === 'first-person' ? camera.position : controls.target;
    const groundY = cameraMode === 'first-person'
      ? position.y - playerCameraHeight
      : sampleGroundHeight(position.x, position.z) ?? position.y;
    return {
      x: position.x,
      y: groundY,
      z: position.z,
      yaw: cameraMode === 'first-person' ? firstPersonYaw : camera.rotation.y,
      moving: ['first-person', 'interior'].includes(cameraMode) && firstPersonVelocity.length() > 0.2,
      location: 'exterior',
      componentId: null,
    };
  }

  function createCrewMarker(playerId, name) {
    const group = new THREE.Group();
    group.name = `Crew marker ${playerId}`;

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(CREW_AVATAR_HEIGHT * 0.34, CREW_AVATAR_HEIGHT * 0.026, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x66e5ff, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.12;
    halo.renderOrder = 990;
    group.add(halo);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 512;
    labelCanvas.height = 128;
    const context = labelCanvas.getContext('2d');
    context.fillStyle = 'rgba(5, 20, 32, 0.92)';
    context.beginPath();
    context.roundRect(8, 8, 496, 112, 30);
    context.fill();
    context.strokeStyle = '#62def7';
    context.lineWidth = 5;
    context.stroke();
    context.fillStyle = '#e9fbff';
    context.font = '700 48px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const label = name.length > 20 ? `${name.slice(0, 18)}…` : name;
    context.fillText(label, 256, 66, 455);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }));
    labelSprite.scale.set(4.4, 1.1, 1);
    labelSprite.position.y = CREW_AVATAR_HEIGHT + 0.65;
    labelSprite.renderOrder = 992;
    group.add(labelSprite);

    scene.add(group);
    return { group, labelTexture, target: new THREE.Vector3(), initialized: false, mixer: null, idleAction: null, walkAction: null, walking: false };
  }

  function attachCrewAstronaut(marker) {
    if (!crewAstronautGltf || marker.astronaut) return;
    const astronaut = cloneSkinnedRig(crewAstronautGltf.scene);
    const bounds = new THREE.Box3().setFromObject(astronaut);
    const height = Math.max(0.001, bounds.max.y - bounds.min.y);
    astronaut.scale.setScalar(CREW_AVATAR_HEIGHT / height);
    astronaut.position.y = -bounds.min.y * astronaut.scale.y;
    marker.group.add(astronaut);
    marker.astronaut = astronaut;
    marker.mixer = new THREE.AnimationMixer(astronaut);
    const idleClip = crewAstronautGltf.animations.find((clip) => /idle/i.test(clip.name)) ?? crewAstronautGltf.animations[0];
    const walkClip = crewAstronautGltf.animations.find((clip) => /moon_walk|walk/i.test(clip.name));
    marker.idleAction = idleClip ? marker.mixer.clipAction(idleClip) : null;
    marker.walkAction = walkClip ? marker.mixer.clipAction(walkClip) : null;
    marker.idleAction?.play();
    marker.walkAction?.setLoop(THREE.LoopRepeat, Infinity);
    if (marker.walking && marker.walkAction) {
      marker.walkAction.play();
      marker.idleAction?.crossFadeTo(marker.walkAction, 0.2, false);
    }
  }

  function setCrewMarkers(players = []) {
    const activeIds = new Set(players.map((player) => player.id));
    for (const [playerId, marker] of crewMarkers) {
      if (activeIds.has(playerId)) continue;
      scene.remove(marker.group);
      marker.group.traverse((object) => {
        if (object.geometry && !cachedGeometries.has(object.geometry)) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => { if (!cachedMaterials.has(material)) material.dispose(); });
        }
      });
      marker.labelTexture.dispose();
      crewMarkers.delete(playerId);
    }

    for (const player of players) {
      if (!player?.id || !player.position || ![player.position.x, player.position.y, player.position.z].every(Number.isFinite)) continue;
      let marker = crewMarkers.get(player.id);
      if (!marker || marker.name !== player.name) {
        if (marker) {
          scene.remove(marker.group);
          marker.group.traverse((object) => {
            if (object.geometry && !cachedGeometries.has(object.geometry)) object.geometry.dispose();
            if (object.material) {
              const materials = Array.isArray(object.material) ? object.material : [object.material];
              materials.forEach((material) => { if (!cachedMaterials.has(material)) material.dispose(); });
            }
          });
          marker.labelTexture.dispose();
        }
        marker = { ...createCrewMarker(player.id, player.name), name: player.name };
        crewMarkers.set(player.id, marker);
        attachCrewAstronaut(marker);
      }
      marker.target.set(player.position.x, player.position.y, player.position.z);
      marker.group.rotation.y = player.position.yaw + CREW_AVATAR_FORWARD_OFFSET;
      const walking = Boolean(player.position.moving);
      if (walking !== marker.walking) {
        const from = marker.walking ? marker.walkAction : marker.idleAction;
        const to = walking ? marker.walkAction : marker.idleAction;
        if (to) {
          to.reset().play();
          from?.crossFadeTo(to, 0.2, false);
        }
        marker.walking = walking;
      }
      if (!marker.initialized) {
        marker.group.position.copy(marker.target);
        marker.initialized = true;
      }
    }
  }

  function getMapSnapshot() {
    if (!outpostRoot || !mapComponents.length || !mapBounds) return null;
    let player = null;

    if (cameraMode === 'first-person') {
      player = {
        x: camera.position.x,
        z: camera.position.z,
        yaw: firstPersonYaw,
        location: 'exterior'
      };
    } else if (cameraMode === 'interior') {
      const logicalLocation = activeComponentTarget
        || (greenhouseInterior?.visible ? componentTargets.find(target => target.id === '008') : null)
        || mapComponents.find(component => component.id === '005');
      if (logicalLocation) {
        player = {
          x: logicalLocation.center.x,
          z: logicalLocation.center.z,
          yaw: firstPersonYaw,
          location: 'interior'
        };
      }
    }

    // The live fleet rides on top of the outpost bounds so both the full map and
    // the minimap always keep the rovers in frame, wherever they were driven.
    const fleet = rovers.map(rover => ({
      id: rover.id,
      label: rover.label,
      tint: `#${rover.tint.toString(16).padStart(6, '0')}`,
      x: rover.root.position.x,
      z: rover.root.position.z,
      heading: rover.heading,
    }));
    const bounds = { ...mapBounds };
    for (const rover of fleet) {
      if (rover.x < bounds.minX) bounds.minX = rover.x;
      if (rover.x > bounds.maxX) bounds.maxX = rover.x;
      if (rover.z < bounds.minZ) bounds.minZ = rover.z;
      if (rover.z > bounds.maxZ) bounds.maxZ = rover.z;
    }

    return {
      components: mapComponents,
      bounds,
      player,
      cameraMode,
      rovers: fleet,
    };
  }

  function ensureTaskGuideBeacon() {
    if (taskGuideBeacon) return taskGuideBeacon;
    taskGuideBeacon = new THREE.Group();
    taskGuideBeacon.name = 'Daily Task Guide Beacon';

    const beamGeometry = new THREE.CylinderGeometry(1.18, 1.18, 2.45, 32, 32, true);
    const beamPositions = beamGeometry.attributes.position;
    const beamRed = new THREE.Color(0x984242);
    const beamColors = new Float32Array(beamPositions.count * 4);
    for (let index = 0; index < beamPositions.count; index += 1) {
      const height = THREE.MathUtils.clamp((beamPositions.getY(index) + 1.225) / 2.45, 0, 1);
      const fade = 1 - height * height * (3 - 2 * height);
      const colorOffset = index * 4;
      beamColors[colorOffset] = beamRed.r;
      beamColors[colorOffset + 1] = beamRed.g;
      beamColors[colorOffset + 2] = beamRed.b;
      beamColors[colorOffset + 3] = fade;
    }
    beamGeometry.setAttribute('color', new THREE.BufferAttribute(beamColors, 4));

    const beam = new THREE.Mesh(
      beamGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      }),
    );
    beam.position.y = 1.225;
    beam.renderOrder = 1000;

    const floorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.42, 48),
      new THREE.MeshBasicMaterial({
        color: 0x984242,
        transparent: true,
        opacity: 0.23,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      }),
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.y = 0.025;
    floorGlow.renderOrder = 1001;

    const floorRing = new THREE.Mesh(
      new THREE.RingGeometry(1.18, 1.46, 48),
      new THREE.MeshBasicMaterial({
        color: 0x984242,
        transparent: true,
        opacity: 0.84,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      }),
    );
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = 0.04;
    floorRing.renderOrder = 1002;

    taskGuideBeacon.add(beam, floorGlow, floorRing);
    scene.add(taskGuideBeacon);
    taskGuideBeacon.visible = false;
    return taskGuideBeacon;
  }

  function hideTaskGuide() {
    if (taskGuideBeacon) taskGuideBeacon.visible = false;
  }

  // The guide is a world-space object, so it stays planted at the task spot
  // while the player turns and looks around.
  function getTaskMarkerTargets() {
    if (!['interior', 'first-person'].includes(cameraMode)) {
      hideTaskGuide();
      return [];
    }
    const activeTargets = activeTaskTargets
      .filter((entry) => entry.status === 'available' || entry.status === 'inProgress' || entry.status === 'overdue')
      .sort((first, second) => Number(second.isActive) - Number(first.isActive)
        || first.taskId.localeCompare(second.taskId));
    if (activeTargets.length === 0) {
      hideTaskGuide();
      return [];
    }
    const anchors = [];

    if (cameraMode === 'first-person') {
      for (const target of activeTargets) {
        if (!NON_ENTERABLE_COMPONENT_IDS.has(target.componentId)) continue;
        const component = componentTargets.find((entry) => entry.id === target.componentId);
        if (!component) continue;
        const point = {
          x: component.bounds.minX - 2.2,
          z: (component.bounds.minZ + component.bounds.maxZ) / 2,
        };
        const ground = sampleGroundHeight(point.x, point.z);
        if (ground === null || !Number.isFinite(ground)) continue;
        anchors.push({ target, worldPosition: new THREE.Vector3(point.x, ground + 0.04, point.z), isExterior: true });
      }
    }

    if (cameraMode === 'interior' && taskConsoleInner && taskConsoleComponentId) {
      for (const unit of taskConsoleUnits) {
        if (unit.status !== 'inProgress' && unit.status !== 'overdue') continue;
        const target = activeTargets.find((entry) => entry.taskId === unit.taskId);
        if (!target) continue;
        taskConsoleInner.updateWorldMatrix(true, false);
        const worldPosition = unit.button.getWorldPosition(new THREE.Vector3());
        if (activeModuleInteriorBounds) worldPosition.y = activeModuleInteriorBounds.min.y + 0.04;
        anchors.push({ target, worldPosition, isExterior: false });
      }
    }

    const specialComponentId = greenhouseInterior?.visible
      ? '008'
      : airlockInterior?.visible ? '005' : null;
    if (anchors.length === 0 && specialComponentId) {
      const specialTargets = activeTargets.filter((entry) => entry.componentId === specialComponentId);
      let worldPosition = null;
      if (specialComponentId === '008' && greenhouseTaskMarkerObject) {
        greenhouseInterior.updateMatrixWorld(true);
        worldPosition = greenhouseTaskMarkerObject.userData.taskMarkerLocalPosition
          ? greenhouseInterior.localToWorld(greenhouseTaskMarkerObject.userData.taskMarkerLocalPosition.clone())
          : new THREE.Box3().setFromObject(greenhouseTaskMarkerObject).getCenter(new THREE.Vector3());
        worldPosition.y = greenhouseInteriorBounds.min.y + 0.04;
      } else if (specialComponentId === '005' && airlockInteriorBounds) {
        if (airlockTaskMarkerObject) {
          airlockInterior.updateMatrixWorld(true);
          const objectBounds = new THREE.Box3().setFromObject(airlockTaskMarkerObject);
          worldPosition = objectBounds.getCenter(new THREE.Vector3());
          worldPosition.y = airlockInteriorBounds.min.y + 0.04;
        } else {
          worldPosition = airlockInteriorBounds.getCenter(new THREE.Vector3());
          worldPosition.y = airlockInteriorBounds.min.y + 0.04;
        }
      }
      if (worldPosition) specialTargets.forEach((target) => anchors.push({ target, worldPosition: worldPosition.clone(), isExterior: false }));
    }

    if (anchors.length === 0 && cameraMode === 'interior' && taskConsoleComponentId && activeModuleInteriorBounds) {
      const moduleTargets = activeTargets.filter((entry) => entry.componentId === taskConsoleComponentId);
      const worldPosition = activeModuleInteriorBounds.getCenter(new THREE.Vector3());
      worldPosition.y = activeModuleInteriorBounds.min.y + 0.04;
      moduleTargets.forEach((target) => anchors.push({ target, worldPosition: worldPosition.clone(), isExterior: false }));
    }

    if (anchors.length === 0) {
      hideTaskGuide();
      return [];
    }

    anchors.sort((first, second) => Number(second.target.isActive) - Number(first.target.isActive)
      || first.target.taskId.localeCompare(second.target.taskId));
    const anchor = anchors[0];

    const beacon = ensureTaskGuideBeacon();
    if (beacon.userData.taskId !== anchor.target.taskId) {
      beacon.userData.taskId = anchor.target.taskId;
      beacon.position.copy(anchor.worldPosition);
    }
    const markerScale = anchor.isExterior ? 1.32 : specialComponentId === '008' ? 0.58 : 0.82;
    beacon.scale.set(markerScale, 1, markerScale);
    beacon.visible = true;

    return [{
      taskId: anchor.target.taskId,
      label: anchor.target.label,
      distance: Math.hypot(camera.position.x - anchor.worldPosition.x, camera.position.z - anchor.worldPosition.z),
      nearby: Math.hypot(camera.position.x - anchor.worldPosition.x, camera.position.z - anchor.worldPosition.z) < 1.35,
    }];
  }

  animate();

  // Public API returned to React
  return {
    getMapSnapshot,
    getCrewPosition,
    setCrewMarkers,
    capturePhoto: () => {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
    getTaskMarkerTargets,
    hideTaskGuide,
    setEventEffects,
    setTaskTargets,
    setConsoleEditMode,
    resetConsolePlacement,
    presentEvent,
    returnFromEvent,
    clearEventPresentations,
    returnToOutpostOverview,
    toggleCameraMode,
    toggleRoverCamera,
    // The player camera is one camera everywhere. This is the knob for how high
    // the player's eyes sit above the deck they are standing on; the surface and
    // every interior read it live, and changing it re-seats the view at once.
    setPlayerCameraHeight,
    getPlayerCameraHeight,
    playerCamera: PLAYER_CAMERA,
    // Link straight into a specific chassis. Inside the command center this is
    // a remote downlink (the interior is swapped for the live surface view);
    // outside it is the normal chase camera.
    controlRover,
    controlFocusedRover,
    exitRoverControl: () => stopRoverControl(),
    getRoverFleet: () => rovers.map(rover => ({
      id: rover.id,
      label: rover.label,
      x: rover.root.position.x,
      z: rover.root.position.z,
    })),
    // Live viewpoint of the command center wall display.
    getOutpostFeedView,
    setOutpostFeedView,
    resetOutpostFeedView,
    toggleEarthView,
    enterAirlock,
    dismissAirlock: () => {
      setPrompt(null);
      airlockPromptDismissed = true;
    },
    exitAirlock: () => {
      if (activeModuleInterior?.visible) exitModuleInterior();
      else if (greenhouseInterior?.visible) returnToAirlock();
      else exitAirlock();
    },
    enterGreenhouse: () => {
      greenhouseReturnMode = 'airlock';
      enterGreenhouse();
    },
    enterWorkshop: enterWorkshopFromAirlock,
    stayAirlock: () => {
      setPrompt(null);
      airlockEndPromptDismissed = true;
    },
    leaveGreenhouse: returnToAirlock,
    stayGreenhouse: () => {
      setPrompt(null);
      greenhouseDoorPromptDismissed = true;
    },
    enterNearbyComponent,
    // Regolith plant: runs this day's maintenance cycle (the day-loop task).
    runRegolithMaintenance,
    dismissRegolithPlant: () => setPrompt(null),
    dismissComponent: () => {
      setPrompt(null);
      dismissedComponentId = activeComponentTarget?.id ?? null;
    },
    destroy: () => {
      isDestroyed = true;
      if (animId) cancelAnimationFrame(animId);
      canvas.removeEventListener('click', handleCanvasClick);
      canvas.removeEventListener('pointerdown', handleConsolePointerDown);
      canvas.removeEventListener('pointermove', handleConsolePointerMove);
      canvas.removeEventListener('pointerup', handleConsolePointerUp);
      canvas.removeEventListener('pointercancel', handleConsolePointerUp);
      canvas.removeEventListener('wheel', handleConsoleWheel);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseAllKeys);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock?.();
      }

      queuedEventPresentations.length = 0;
      eventCinematic = null;
      roverLinkTransition = null;
      outpostHeightField = null;
      clearEventVisualization();

      unmountTaskConsole();

      // Live screens own GPU textures outside the scene graph.
      outpostFeed?.target.dispose();
      outpostFeed = null;
      for (const monitor of roverMonitors) monitor.feed?.target.dispose();
      roverMonitors.length = 0;
      feedPlanes.length = 0;

      // Dispose label sprites
      for (let i = 0; i < labelTextures.length; i++) labelTextures[i].dispose();
      for (let i = 0; i < labelMaterials.length; i++) labelMaterials[i].dispose();
      labelTextures.length = 0;
      labelMaterials.length = 0;

      for (const marker of crewMarkers.values()) {
        marker.labelTexture.dispose();
        const labelSprite = marker.group.children.find((child) => child.isSprite);
        labelSprite?.material?.dispose();
      }
      crewMarkers.clear();

      // Dispose active procedural module
      if (activeModuleInterior) {
        disposeModuleInterior(activeModuleInterior);
        activeModuleInterior = null;
      }

      horizonGeo.dispose();
      horizonMat.dispose();

      // Deep recursive disposal of un-cached mesh geometries & materials
      scene.traverse(obj => {
        if (obj.isMesh) {
          if (
            obj.geometry
            && !cachedGeometries.has(obj.geometry)
            && obj.geometry !== ASSET_CACHE.apollo12Geo
            && obj.geometry !== ASSET_CACHE.apollo16Geo
          ) {
            obj.geometry.dispose();
          }
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (let i = 0; i < mats.length; i++) {
              const m = mats[i];
              if (cachedMaterials.has(m)) continue;
              const isCachedTexture = texture => texture === ASSET_CACHE.skyTexture
                || ASSET_CACHE.earthTextures?.includes(texture)
                || cachedTextureImages.has(texture.image);
              for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'specularMap']) {
                if (m[key] && !isCachedTexture(m[key])) m[key].dispose();
              }
              m.dispose();
            }
          }
        }
      });

      scene.clear();
      controls.dispose();
      renderer.dispose();
    }
  };
}
