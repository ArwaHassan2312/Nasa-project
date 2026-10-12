import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DAILY_CHALLENGES } from '../../data/dailyChallenges';

// Module-level caches: raw asset buffers loaded once to prevent memory leaks and repeated downloads
const ASSET_CACHE = {
  skyTexture: null,
  earthTextures: null,
  apollo12Geo: null,
  apollo16Geo: null,
  gltfs: new Map(), // path -> gltf.scene clone source
};

const sharedGltfLoader = new GLTFLoader();
const sharedStlLoader = new STLLoader();
const sharedTexLoader = new THREE.TextureLoader();

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
  '023': 'SURVEY MARKERS'
};

function loadCachedGLTF(path, onLoad, onProgress, onError) {
  if (ASSET_CACHE.gltfs.has(path)) {
    onLoad(ASSET_CACHE.gltfs.get(path).clone(true));
    return;
  }
  sharedGltfLoader.load(
    path,
    gltf => {
      ASSET_CACHE.gltfs.set(path, gltf.scene);
      onLoad(gltf.scene.clone(true));
    },
    onProgress,
    onError
  );
}

export function createLunarEngine(canvas, callbacks = {}) {
  const {
    onLoading = () => { },
    onModeChange = () => { },
    onEarthToggleChange = () => { },
    onPromptChange = () => { },
    onInsidePanelChange = () => { },
  } = callbacks;

  let isDestroyed = false;
  let animId = null;

  // Scene setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080d14);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 14000);
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

  let earthMesh = null;
  let closeupEarthMesh = null;
  let earthViewActive = false;
  let savedEarthMaxPolarAngle = controls.maxPolarAngle;
  let savedEarthFov = camera.fov;
  let savedEarthScale = 1;
  const savedEarthViewPosition = new THREE.Vector3();
  const savedEarthViewTarget = new THREE.Vector3();

  const keys = new Set();
  const firstPersonStart = new THREE.Vector3();
  const firstPersonLookAt = new THREE.Vector3();
  const savedFreePosition = new THREE.Vector3();
  const savedFreeTarget = new THREE.Vector3();
  const firstPersonDirection = new THREE.Vector3();
  const firstPersonForward = new THREE.Vector3();
  const firstPersonRight = new THREE.Vector3();

  let outpostRoot = null;
  let mapComponents = [];
  let mapBounds = null;
  let currentEventEffect = null;
  let eventVisualGroup = null;
  let challengeMarkerGroup = null;
  let challengeReadinessFlags = [];
  const eventAnimations = [];
  let eventCinematic = null;
  let queuedEventPresentation = null;
  const EVENT_TARGET_PREFIXES = {
    fire_lab: ['010'],
    solar_storm: ['011', '012', '013'],
    power_failure: ['011', '012'],
    water_leak: ['001'],
    lunar_night: ['011', '012', '013'],
    water_ice_exploration: ['018'],
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
  let airlockCenter = new THREE.Vector3();
  let airlockInteriorLight = null;
  let greenhouseInterior = null;
  let greenhouseInteriorBounds = null;
  let greenhouseCenter = new THREE.Vector3();
  let greenhouseInteriorLight = null;
  let componentTargets = [];
  let activeComponentTarget = null;
  let dismissedComponentId = null;
  let componentInteriorKit = null;
  let workshopInteriorModel = null;
  let activeModuleInterior = null;
  let activeModuleInteriorBounds = null;
  let activeModuleInteriorLight = null;
  let activeModuleGeometries = [];
  let activeModuleMaterials = [];
  let moduleReturnMode = 'exterior';
  let moduleInteriorLoading = false;
  let workshopInteriorLoading = false;
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
  let airlockPromptDismissed = false;
  let airlockLoading = false;

  // Track dynamic sprite textures and materials for leak-free disposal
  const labelTextures = [];
  const labelMaterials = [];

  const clock = new THREE.Clock();
  let cameraMode = 'free'; // 'free' | 'first-person' | 'interior'
  let firstPersonYaw = 0;
  let firstPersonPitch = 0;

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
      if (type && document.pointerLockElement === canvas) {
        document.exitPointerLock?.();
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
    eventAnimations.length = 0;
    if (!eventVisualGroup) return;

    scene.remove(eventVisualGroup);
    eventVisualGroup.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
    eventVisualGroup = null;
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

  function setChallengeFlags(flags) {
    challengeReadinessFlags = [...flags];
    if (challengeMarkerGroup) {
      outpostRoot?.remove(challengeMarkerGroup);
      challengeMarkerGroup.traverse(object => {
        object.geometry?.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => material.dispose());
        }
      });
      challengeMarkerGroup = null;
    }
    if (!outpostRoot || flags.length === 0) return;

    const readyFlags = new Set(flags);
    const group = new THREE.Group();
    group.name = 'Daily challenge readiness markers';

    for (const challenge of DAILY_CHALLENGES) {
      if (!readyFlags.has(challenge.readinessFlag)) continue;
      let component = null;
      outpostRoot.traverse(object => {
        if (!component && object.name.startsWith(`${challenge.targetComponentId}-`)) {
          component = object;
        }
      });
      if (!component) {
        console.error(
          `[Daily challenge] No outpost component found for "${challenge.title}" target ${challenge.targetComponentId}.`,
        );
        continue;
      }

      const bounds = new THREE.Box3().setFromObject(component);
      if (bounds.isEmpty()) continue;
      const size = bounds.getSize(new THREE.Vector3());
      const localPosition = outpostRoot.worldToLocal(
        new THREE.Vector3(
          (bounds.min.x + bounds.max.x) / 2,
          bounds.max.y + Math.max(size.y * 0.2, 0.8),
          (bounds.min.z + bounds.max.z) / 2,
        ),
      );
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(Math.max(Math.max(size.x, size.z) * 0.075, 0.7)),
        new THREE.MeshStandardMaterial({
          color: 0x64e8d2,
          emissive: 0x1bcab5,
          emissiveIntensity: 1.8,
          metalness: 0.15,
          roughness: 0.3,
        }),
      );
      marker.position.copy(localPosition);
      marker.name = `Readiness verified: ${challenge.id}`;
      group.add(marker);
    }

    if (group.children.length > 0) {
      challengeMarkerGroup = group;
      outpostRoot.add(group);
    }
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
    if (outpostRoot) outpostRoot.visible = true;
    if (airlockInterior) airlockInterior.visible = false;
    if (greenhouseInterior) greenhouseInterior.visible = false;
    if (activeModuleInterior) activeModuleInterior.visible = false;
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

  function beginEventPresentation(eventId, onPresented) {
    if (isDestroyed || eventCinematic?.eventId === eventId) return;
    if (!outpostRoot) {
      queuedEventPresentation = { eventId, onPresented };
      return;
    }

    const eventTarget = findEventTarget(eventId);
    if (!eventTarget) {
      console.error(
        `[Lunar event] No outpost model component matched target mapping for "${eventId}".`,
        EVENT_TARGET_PREFIXES[eventId],
      );
      onPresented?.();
      return;
    }

    queuedEventPresentation = null;
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

    eventAnimations.push((elapsed, delta) => {
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

  function buildEventVisualization() {
    if (!currentEventEffect || !outpostRoot) return;

    clearEventVisualization();
    const mappedTarget = findEventTarget(currentEventEffect);
    const bounds = mappedTarget?.bounds || new THREE.Box3().setFromObject(outpostRoot);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const outpostSize = new THREE.Box3().setFromObject(outpostRoot).getSize(new THREE.Vector3());
    const width = Math.max(size.x, size.z, outpostSize.x * 0.04, 1);
    const height = Math.max(size.y, outpostSize.y * 0.04, 1);
    const group = new THREE.Group();
    group.position.copy(center);
    group.updateMatrixWorld(true);
    eventVisualGroup = group;
    scene.add(group);
    const cameraDirection = (EVENT_CAMERA_DIRECTIONS[currentEventEffect]
      || new THREE.Vector3(1, 0.55, 1)).clone().normalize();

    if (currentEventEffect === 'fire_lab') {
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
      eventAnimations.push((time) => {
        fireLight.intensity = 62 + Math.sin(time * 18) * 20 + Math.random() * 12;
      });
    } else if (currentEventEffect === 'lunar_night') {
      hemisphereLight.intensity = 0.2;
      sun.intensity = 0.24;
      fill.intensity = 0.16;
      const floodlight = new THREE.PointLight(0x9bdcff, 45, width * 1.8);
      floodlight.position.set(0, height * 0.38, 0);
      group.add(floodlight);
      const transitionBeacon = new THREE.PointLight(0xff9f52, 25, width * 0.9);
      transitionBeacon.position.set(cameraDirection.x * size.x * 0.35, -height * 0.1, cameraDirection.z * size.z * 0.35);
      group.add(transitionBeacon);
    } else if (currentEventEffect === 'solar_storm') {
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
        eventAnimations.push((time) => {
          aurora.rotation.z += Math.sin(time * 0.5 + index) * 0.0008;
          aurora.material.opacity = 0.2 + (Math.sin(time * 1.4 + index) + 1) * 0.11;
        });
      }
    } else if (currentEventEffect === 'water_ice_exploration') {
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
      eventAnimations.push((time) => {
        scanRing.rotation.z = time * 0.32;
        scanRing.material.opacity = 0.38 + (Math.sin(time * 2.2) + 1) * 0.25;
        scanLight.intensity = 24 + (Math.sin(time * 3.5) + 1) * 16;
      });
    } else if (currentEventEffect === 'power_failure' || currentEventEffect === 'water_leak') {
      const location = new THREE.Vector3(
        cameraDirection.x * size.x * 0.36,
        currentEventEffect === 'water_leak' ? -height * 0.25 : height * 0.08,
        cameraDirection.z * size.z * 0.36,
      );
      if (currentEventEffect === 'power_failure') {
        hemisphereLight.intensity = 0.46;
        sun.intensity = 1.25;
        fill.intensity = 0.18;
      }
      const beacon = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(1, height * 0.11), Math.max(2, height * 0.5), 12),
        new THREE.MeshBasicMaterial({
          color: currentEventEffect === 'water_leak' ? 0x54ccff : 0xff493f,
          transparent: true,
          opacity: 0.78,
        }),
      );
      beacon.position.copy(location).add(new THREE.Vector3(0, height * 0.22, 0));
      group.add(beacon);
      const warningLight = new THREE.PointLight(
        currentEventEffect === 'water_leak' ? 0x36bfff : 0xff3228,
        55,
        width * 0.55,
      );
      warningLight.position.copy(beacon.position);
      group.add(warningLight);
      eventAnimations.push((time) => {
        const pulse = 0.45 + (Math.sin(time * 6) + 1) * 0.48;
        warningLight.intensity = 20 + pulse * 48;
        beacon.material.opacity = 0.28 + pulse * 0.62;
      });

      if (currentEventEffect === 'water_leak') {
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
    }
  }

  function setEventEffect(eventId) {
    currentEventEffect = eventId;
    hemisphereLight.intensity = 1.05;
    sun.intensity = 3.15;
    fill.intensity = 0.6;
    clearEventVisualization();
    buildEventVisualization();
  }

  function presentEvent(eventId, onPresented) {
    if (eventCinematic?.eventId === eventId) return;
    if (queuedEventPresentation?.eventId === eventId) return;
    beginEventPresentation(eventId, onPresented);
  }

  function returnFromEvent(onReturned) {
    startEventReturn(onReturned);
  }

  // Milky Way Skybox: Cached & mipmap-free to save ~45MB VRAM and eliminate hitching
  if (ASSET_CACHE.skyTexture) {
    scene.background = ASSET_CACHE.skyTexture;
    scene.backgroundIntensity = 0.8;
  } else {
    sharedTexLoader.load(
      '/lunar/textures/8k_stars_milky_way.jpg',
      texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        ASSET_CACHE.skyTexture = texture;
        if (!isDestroyed) {
          scene.background = texture;
          scene.backgroundIntensity = 0.8;
        }
      },
      undefined,
      () => console.warn('Could not load Milky Way texture.')
    );
  }

  // Earth
  const EARTH_DISTANCE = 120;
  const EARTH_CLOSEUP_DISTANCE = 1500;
  const EARTH_CLOSEUP_RADIUS = 1420;
  const EARTH_FIRST_PERSON_RADIUS = 85;
  const EARTH_ELEVATION_DEGREES = 72;
  const EARTH_AZIMUTH_DEGREES = 300;
  const earthAnchor = new THREE.Vector3(850, -100, 0);
  const earthDirection = new THREE.Vector3(
    Math.sin(THREE.MathUtils.degToRad(EARTH_AZIMUTH_DEGREES)) * Math.cos(THREE.MathUtils.degToRad(EARTH_ELEVATION_DEGREES)),
    Math.sin(THREE.MathUtils.degToRad(EARTH_ELEVATION_DEGREES)),
    Math.cos(THREE.MathUtils.degToRad(EARTH_AZIMUTH_DEGREES)) * Math.cos(THREE.MathUtils.degToRad(EARTH_ELEVATION_DEGREES))
  ).normalize();

  const earthTexturePaths = [
    '/Textures/8k_earth_daymap.jpg',
    '/Textures/8k_earth_nightmap.jpg',
    '/Textures/8k_earth_clouds.jpg',
    '/Textures/8k_earth_specular.jpeg',
  ];
  const setupEarth = ([dayMap, nightMap, cloudMap, specularMap]) => {
    if (isDestroyed) return;
    dayMap.colorSpace = THREE.SRGBColorSpace;
    nightMap.colorSpace = THREE.SRGBColorSpace;
    cloudMap.colorSpace = THREE.SRGBColorSpace;
    specularMap.colorSpace = THREE.NoColorSpace;
    for (const texture of [dayMap, nightMap, cloudMap, specularMap]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
    }

    const earthSurface = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 96),
      new THREE.MeshPhongMaterial({
        map: dayMap,
        emissiveMap: nightMap,
        emissive: new THREE.Color(0xffc777),
        emissiveIntensity: 0.7,
        specularMap,
        specular: new THREE.Color(0x454545),
        shininess: 18,
      })
    );
    const earthClouds = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 96),
      new THREE.MeshPhongMaterial({
        map: cloudMap,
        alphaMap: cloudMap,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        specular: new THREE.Color(0x111111),
        shininess: 8,
      })
    );
    earthClouds.scale.setScalar(1.003);
    earthClouds.renderOrder = 1;
    earthMesh = new THREE.Group();
    earthMesh.add(earthSurface, earthClouds);
    earthMesh.scale.setScalar(EARTH_FIRST_PERSON_RADIUS);
    earthMesh.position.copy(earthAnchor).addScaledVector(earthDirection, EARTH_DISTANCE);
    earthMesh.name = 'Earth';
    scene.add(earthMesh);
  };

  if (ASSET_CACHE.earthTextures) {
    setupEarth(ASSET_CACHE.earthTextures);
  } else {
    Promise.all(earthTexturePaths.map(path => new Promise((resolve, reject) => {
      sharedTexLoader.load(path, resolve, undefined, reject);
    }))).then(textures => {
      ASSET_CACHE.earthTextures = textures;
      setupEarth(textures);
    }).catch(error => console.warn('Could not load Earth textures.', error));
  }

  // Terrain scans: Apollo 12 & Apollo 16
  const APOLLO_12_POSITION_X = 0;
  const APOLLO_12_POSITION_Y = -2.75;
  const APOLLO_12_SCALE = 1;
  const LUNAR_OUTPOST_WIDTH = 72;
  const LUNAR_OUTPOST_POSITION_X = 0;
  const LUNAR_OUTPOST_POSITION_Y = 2.9;
  const LUNAR_OUTPOST_POSITION_Z = 0;
  const AIRLOCK_PROMPT_DISTANCE = 26;
  const AIRLOCK_INTERIOR_WIDTH = 25;
  const TOMATO_PLANT_Y_SCALE = 2;

  const terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0xb7b3ab,
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

  function onTerrainGeometryReady(entry, geometry) {
    if (isDestroyed) return;
    const box = geometry.boundingBox || new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
    const size = box.getSize(new THREE.Vector3());

    const terrain = new THREE.Mesh(geometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2;
    const horizontalSpan = Math.max(size.x, size.y) || 1;
    const horizontalScale = 190 / horizontalSpan;
    const nominalHeight = size.z * (190 / Math.max(size.x, size.y, size.z));
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
      apollo16.terrain.position.x = (apollo12.width + apollo16.width) / 2 - 4;
      const sceneCenterX = (apollo12.terrain.position.x + apollo16.terrain.position.x) / 2;
      const sceneWidth = apollo12.width + apollo16.width;
      controls.target.set(sceneCenterX, sharedRelief * 0.18, 0);
      camera.position.set(sceneCenterX + sceneWidth * 0.3, sharedRelief + sceneWidth * 0.48, sceneWidth * 0.72);
      controls.minDistance = sceneWidth * 0.12;
      controls.maxDistance = sceneWidth * 2.5;
      controls.update();
      buildHeightGrid();

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
          const targetX = apollo16.terrain.position.x;
          const targetZ = 0;
          outpost.position.x += targetX - (bounds.min.x + bounds.max.x) / 2;
          outpost.position.z += targetZ - (bounds.min.z + bounds.max.z) / 2;
          outpost.updateMatrixWorld(true);

          // Fast terrain raycast
          const raycaster = new THREE.Raycaster(
            new THREE.Vector3(targetX, sharedRelief + sceneWidth, targetZ),
            new THREE.Vector3(0, -1, 0),
            0,
            sceneWidth * 3
          );
          raycaster.firstHitOnly = true;
          const terrainHits = raycaster.intersectObjects([apollo12.terrain, apollo16.terrain], false);
          const surfaceY = terrainHits.length ? terrainHits[0].point.y : 0;
          const scaledBounds = new THREE.Box3().setFromObject(outpost);
          outpost.position.y += surfaceY - scaledBounds.min.y;
          outpost.position.x += LUNAR_OUTPOST_POSITION_X;
          outpost.position.y += LUNAR_OUTPOST_POSITION_Y;
          outpost.position.z += LUNAR_OUTPOST_POSITION_Z;
          outpost.updateMatrixWorld(true);

          const outpostBounds = new THREE.Box3().setFromObject(outpost);
          const outpostCenter = outpostBounds.getCenter(new THREE.Vector3());
          const outpostSize = outpostBounds.getSize(new THREE.Vector3());
          const viewOffset = Math.max(outpostSize.x, outpostSize.z) * 0.78;
          firstPersonStart.set(
            outpostCenter.x + viewOffset * 0.7,
            surfaceY + LUNAR_OUTPOST_POSITION_Y + Math.max(2, outpostSize.y * 0.14),
            outpostCenter.z + viewOffset * 0.7
          );
          firstPersonLookAt.set(outpostCenter.x, outpostBounds.min.y + outpostSize.y * 0.45, outpostCenter.z);

          outpost.traverse(object => {
            if (object.isMesh) {
              object.castShadow = true;
              object.receiveShadow = true;
            }
          });
          scene.add(outpost);
          outpost.updateMatrixWorld(true);
          outpostRoot = outpost;
          buildEventVisualization();

          addOutpostPartLabels(outpost);
          componentTargets = buildComponentTargets(outpost);
          mapComponents = buildMapComponents(outpost);
          if (mapComponents.length) {
            mapBounds = {
              minX: Math.min(...mapComponents.map(component => component.minX)),
              maxX: Math.max(...mapComponents.map(component => component.maxX)),
              minZ: Math.min(...mapComponents.map(component => component.minZ)),
              maxZ: Math.max(...mapComponents.map(component => component.maxZ))
            };
          }
          setChallengeFlags(challengeReadinessFlags);
          if (queuedEventPresentation) {
            beginEventPresentation(
              queuedEventPresentation.eventId,
              queuedEventPresentation.onPresented,
            );
          }

          const airlockEntrance = outpost.getObjectByName('005-airlock-with-dust-lock-vestibule');
          const entranceBounds = new THREE.Box3().setFromObject(airlockEntrance || outpost);
          airlockTriggerCenter = entranceBounds.getCenter(new THREE.Vector3());
          airlockTriggerRadius = AIRLOCK_PROMPT_DISTANCE;

          onLoading({ active: false, text: 'SURFACE RECON READY', progress: 100 });
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

  // Horizon Plane
  const horizonGeo = new THREE.PlaneGeometry(1200, 1200);
  const horizonMat = new THREE.MeshStandardMaterial({ color: 0x4b4947, roughness: 1 });
  const horizon = new THREE.Mesh(horizonGeo, horizonMat);
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.y = -1.2;
  scene.add(horizon);

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
      if (!match || !definitions[match[1]] || match[1] === '005') return;
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
    if (moduleInteriorLoading) return;
    moduleInteriorLoading = true;
    loadCachedGLTF(
      '/lunar/outpost_interior_kit.glb',
      kit => {
        moduleInteriorLoading = false;
        componentInteriorKit = kit;
        onReady(componentInteriorKit);
      },
      undefined,
      error => {
        console.error('Unable to load modular outpost interior kit', error);
        moduleInteriorLoading = false;
      }
    );
  }

  function ensureWorkshopInterior(onReady) {
    if (workshopInteriorModel) { onReady(workshopInteriorModel); return; }
    if (workshopInteriorLoading) return;
    workshopInteriorLoading = true;
    loadCachedGLTF(
      '/lunar/sci-fi_lab.glb',
      model => {
        workshopInteriorLoading = false;
        workshopInteriorModel = model;
        onReady(workshopInteriorModel);
      },
      undefined,
      error => {
        console.error('Unable to load workshop interior model', error);
        workshopInteriorLoading = false;
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

  function enterModuleInterior(target, workshopModel) {
    outsideCameraPosition = camera.position.clone();
    outsideCameraYaw = firstPersonYaw;
    outsideCameraPitch = firstPersonPitch;
    outsideBackground = scene.background;
    moonTerrainMeshes.forEach(terrain => { terrain.visible = false; });
    horizon.visible = false;
    if (outpostRoot) outpostRoot.visible = false;
    scene.background = new THREE.Color(0x10151b);
    activeModuleInterior = createModuleInterior(target.roomType, workshopModel);
    scene.add(activeModuleInterior);
    activeModuleInteriorBounds = new THREE.Box3().setFromObject(activeModuleInterior);
    camera.position.set(0, 1.65, 2.55);
    camera.rotation.order = 'YXZ';
    camera.lookAt(0, 1.65, -1.5);
    firstPersonYaw = camera.rotation.y;
    firstPersonPitch = camera.rotation.x;
    activeModuleInteriorLight = new THREE.PointLight(0xe4edff, 14, 24);
    activeModuleInteriorLight.position.set(0, 2.8, 0);
    scene.add(activeModuleInteriorLight);
    cameraMode = 'interior';
    onModeChange(cameraMode);
    controls.enabled = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
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
    scene.remove(activeModuleInterior);
    scene.remove(activeModuleInteriorLight);
    disposeModuleInterior(activeModuleInterior);
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
      onInsidePanelChange({ visible: true, label: 'INSIDE AIRLOCK · E TO EXIT', buttonText: 'EXIT AIRLOCK' });
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

  function enterNearbyComponent() {
    if (!activeComponentTarget) return;
    const target = activeComponentTarget;
    moduleReturnMode = 'exterior';
    if (target.roomType === 'greenhouse') {
      enterGreenhouseFromExterior();
      return;
    }
    if (target.roomType === 'engineering') {
      ensureWorkshopInterior(model => enterModuleInterior(target, model));
    } else {
      ensureComponentInteriorKit(() => enterModuleInterior(target));
    }
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
    airlockCenter = airlockInteriorBounds.getCenter(new THREE.Vector3());
  }

  function enterAirlockInterior() {
    outsideCameraPosition = camera.position.clone();
    outsideCameraYaw = firstPersonYaw;
    outsideCameraPitch = firstPersonPitch;
    outsideBackground = scene.background;
    moonTerrainMeshes.forEach(terrain => { terrain.visible = false; });
    horizon.visible = false;
    if (outpostRoot) outpostRoot.visible = false;
    scene.background = new THREE.Color(0x10151b);
    scene.add(airlockInterior);

    const roomSize = airlockInteriorBounds.getSize(new THREE.Vector3());
    const cameraY = airlockInteriorBounds.min.y + roomSize.y * 0.5;
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
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    setPrompt(null);
    airlockEndPromptDismissed = false;
    onInsidePanelChange({
      visible: true,
      label: 'INSIDE AIRLOCK · E TO EXIT',
      buttonText: 'EXIT AIRLOCK'
    });
  }

  function enterAirlock() {
    if (airlockLoading) return;
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
    camera.position.copy(outsideCameraPosition);
    firstPersonYaw = outsideCameraYaw;
    firstPersonPitch = outsideCameraPitch;
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
    greenhouseInterior.updateMatrixWorld(true);
    const floorLocalY = greenhouseInterior.worldToLocal(new THREE.Vector3(0, greenhouseInteriorBounds.min.y, 0)).y;

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
    const y = greenhouseInteriorBounds.min.y + size.y * 0.5;
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
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
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
        : 'RETURN TO AIRLOCK'
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
    ensureWorkshopInterior(model => enterModuleInterior({ name: 'Workshop', roomType: 'engineering' }, model));
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
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
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
  function toggleCameraMode() {
    if (eventCinematic) return;
    if (cameraMode === 'free' && (!outpostRoot || !heightGrid)) return;
    if (cameraMode === 'free') {
      savedFreePosition.copy(camera.position);
      savedFreeTarget.copy(controls.target);
      cameraMode = 'first-person';
      controls.enabled = false;
      camera.position.copy(firstPersonStart);
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
    if (eventCinematic) return;
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

    camera.position.copy(firstPersonStart);
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
    closeupEarthMesh.position.copy(earthAnchor).addScaledVector(closeupDirection, EARTH_CLOSEUP_DISTANCE);
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
  function handleCanvasClick() {
    if (eventCinematic) return;
    if (['first-person', 'interior'].includes(cameraMode) && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  }

  function handleMouseMove(event) {
    if (eventCinematic || !['first-person', 'interior'].includes(cameraMode) || document.pointerLockElement !== canvas) return;
    firstPersonYaw -= event.movementX * 0.0022;
    firstPersonPitch = THREE.MathUtils.clamp(firstPersonPitch - event.movementY * 0.0018, -1.45, 1.45);
  }

  function handleKeyDown(event) {
    if (eventCinematic) {
      event.preventDefault();
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'e' && cameraMode === 'interior') {
      event.preventDefault();
      if (currentPromptType === 'component') enterNearbyComponent();
      else if (activeModuleInterior?.visible) exitModuleInterior();
      else if (greenhouseInterior?.visible) returnToAirlock();
      else exitAirlock();
      return;
    }
    if (key === 'e' && cameraMode === 'first-person' && currentPromptType === 'component') {
      event.preventDefault();
      enterNearbyComponent();
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
    if (key === 'e' && cameraMode === 'first-person' && currentPromptType === 'airlock') {
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
    if ((key === 'escape' || key === 'n') && currentPromptType === 'component') {
      event.preventDefault();
      setPrompt(null);
      dismissedComponentId = activeComponentTarget?.id ?? null;
      return;
    }
    if (['first-person', 'interior'].includes(cameraMode) && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
      event.preventDefault();
    }
    keys.add(key);
  }

  function handleKeyUp(event) {
    if (eventCinematic) return;
    keys.delete(event.key.toLowerCase());
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  canvas.addEventListener('click', handleCanvasClick);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  window.addEventListener('resize', handleResize);

  // Prompt checks (zero per-frame Vector3 allocations)
  function updateAirlockPrompt() {
    if (cameraMode !== 'first-person' || !airlockTriggerCenter) {
      if (currentPromptType === 'airlock') setPrompt(null);
      return;
    }
    const dx = camera.position.x - airlockTriggerCenter.x;
    const dz = camera.position.z - airlockTriggerCenter.z;
    const distance = Math.hypot(dx, dz);
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

  function updateComponentPrompt() {
    if (cameraMode !== 'first-person' || !componentTargets.length || currentPromptType === 'airlock') {
      if (currentPromptType === 'component') setPrompt(null);
      return;
    }
    let nearest = null;
    let nearestDistance = Infinity;
    for (let i = 0; i < componentTargets.length; i++) {
      const target = componentTargets[i];
      const distance = Math.hypot(camera.position.x - target.center.x, camera.position.z - target.center.z);
      if (distance <= target.radius && distance < nearestDistance) {
        nearest = target;
        nearestDistance = distance;
      }
    }
    if (!nearest) {
      if (currentPromptType === 'component') setPrompt(null);
      activeComponentTarget = null;
      dismissedComponentId = null;
      return;
    }
    if (nearest.id === dismissedComponentId) {
      if (currentPromptType === 'component') setPrompt(null);
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

  let heightGrid = null;

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

  function keepCameraAboveSurface() {
    const h = sampleGroundHeight(camera.position.x, camera.position.z);
    if (h !== null) camera.position.y = h + 1.65;
  }

  function keepCameraInsideVerticalBounds(bounds) {
    if (!bounds) return;
    const floor = bounds.min.y + 1.65;
    const ceiling = bounds.max.y - 0.2;
    camera.position.y = floor <= ceiling
      ? THREE.MathUtils.clamp(camera.position.y, floor, ceiling)
      : (bounds.min.y + bounds.max.y) / 2;
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
        cinematic.stage = 'awaitingDecision';
        const callback = cinematic.onPresented;
        cinematic.onPresented = null;
        callback?.();
      }
      return;
    }

    if (cinematic.stage === 'awaitingDecision') return;

    cinematic.elapsed += delta;
    const progress = Math.min(cinematic.elapsed / 1.35, 1);
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
    }
  }

  // Animation loop with throttled prompt evaluation (10 Hz vs 120 Hz)
  let promptCheckTimer = 0;

  function animate() {
    if (isDestroyed) return;
    animId = requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.05);

    promptCheckTimer += dt;
    if (!eventCinematic && promptCheckTimer >= 0.1) {
      promptCheckTimer = 0;
      if (cameraMode === 'first-person') {
        updateAirlockPrompt();
        updateComponentPrompt();
      } else if (cameraMode === 'interior') {
        updateAirlockEndPrompt();
        updateGreenhouseDoorPrompt();
      }
    }

    if (eventCinematic) {
      animateEventCamera(dt);
    } else if (cameraMode === 'free') {
      controls.update();
    } else {
      const forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      const side = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(firstPersonPitch, firstPersonYaw, 0);
      camera.getWorldDirection(firstPersonForward).normalize();
      firstPersonRight.set(Math.cos(firstPersonYaw), 0, Math.sin(firstPersonYaw));
      firstPersonDirection.copy(firstPersonForward).multiplyScalar(forward).addScaledVector(firstPersonRight, side);
      if (firstPersonDirection.lengthSq()) {
        camera.position.addScaledVector(firstPersonDirection.normalize(), dt * 18);
      }
      if (greenhouseInterior?.visible && greenhouseInteriorBounds) {
        const wallInset = 0.8;
        camera.position.x = THREE.MathUtils.clamp(
          camera.position.x,
          greenhouseInteriorBounds.min.x + wallInset,
          greenhouseInteriorBounds.max.x - wallInset
        );
        camera.position.z = THREE.MathUtils.clamp(
          camera.position.z,
          greenhouseInteriorBounds.min.z + wallInset,
          greenhouseInteriorBounds.max.z - wallInset
        );
        keepCameraInsideVerticalBounds(greenhouseInteriorBounds);
      }
      if (activeModuleInterior?.visible && activeModuleInteriorBounds) {
        const wallInset = 0.8;
        camera.position.x = THREE.MathUtils.clamp(
          camera.position.x,
          activeModuleInteriorBounds.min.x + wallInset,
          activeModuleInteriorBounds.max.x - wallInset
        );
        camera.position.z = THREE.MathUtils.clamp(
          camera.position.z,
          activeModuleInteriorBounds.min.z + wallInset,
          activeModuleInteriorBounds.max.z - wallInset
        );
        keepCameraInsideVerticalBounds(activeModuleInteriorBounds);
      }
      if (cameraMode === 'interior' && airlockInterior && !greenhouseInterior?.visible && !activeModuleInterior?.visible) {
        keepCameraInsideVerticalBounds(airlockInteriorBounds);
      } else if (cameraMode === 'first-person') {
        keepCameraAboveSurface();
      }
    }

    for (const animateEvent of eventAnimations) {
      animateEvent(clock.elapsedTime, dt);
    }

    renderer.render(scene, camera);
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

    return {
      components: mapComponents,
      bounds: mapBounds,
      player,
      cameraMode
    };
  }

  animate();

  // Public API returned to React
  return {
    getMapSnapshot,
    setEventEffect,
    setChallengeFlags,
    presentEvent,
    returnFromEvent,
    toggleCameraMode,
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
    dismissComponent: () => {
      setPrompt(null);
      dismissedComponentId = activeComponentTarget?.id ?? null;
    },
    destroy: () => {
      isDestroyed = true;
      if (animId) cancelAnimationFrame(animId);
      canvas.removeEventListener('click', handleCanvasClick);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock?.();
      }

      queuedEventPresentation = null;
      eventCinematic = null;
      clearEventVisualization();
      if (challengeMarkerGroup) {
        outpostRoot?.remove(challengeMarkerGroup);
        challengeMarkerGroup.traverse(object => {
          object.geometry?.dispose();
          if (object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach(material => material.dispose());
          }
        });
        challengeMarkerGroup = null;
      }

      // Dispose label sprites
      for (let i = 0; i < labelTextures.length; i++) labelTextures[i].dispose();
      for (let i = 0; i < labelMaterials.length; i++) labelMaterials[i].dispose();
      labelTextures.length = 0;
      labelMaterials.length = 0;

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
          if (obj.geometry && obj.geometry !== ASSET_CACHE.apollo12Geo && obj.geometry !== ASSET_CACHE.apollo16Geo) {
            obj.geometry.dispose();
          }
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (let i = 0; i < mats.length; i++) {
              const m = mats[i];
              const isCachedTexture = texture => texture === ASSET_CACHE.skyTexture || ASSET_CACHE.earthTextures?.includes(texture);
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
