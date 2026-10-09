import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Module-level caches: raw asset buffers loaded once to prevent memory leaks and repeated downloads
const ASSET_CACHE = {
  skyTexture: null,
  apollo12Geo: null,
  apollo16Geo: null,
  gltfs: new Map(), // path -> gltf.scene clone source
};

const sharedGltfLoader = new GLTFLoader();
const sharedStlLoader = new STLLoader();
const sharedTexLoader = new THREE.TextureLoader();

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
    onLoading = () => {},
    onModeChange = () => {},
    onEarthToggleChange = () => {},
    onPromptChange = () => {},
    onInsidePanelChange = () => {},
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
  const groundRaycaster = new THREE.Raycaster();
  const groundRayOrigin = new THREE.Vector3();
  const groundRayDirection = new THREE.Vector3(0, -1, 0);
  let groundCollisionObjects = [];

  let outpostRoot = null;
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
  scene.add(new THREE.HemisphereLight(0xc7d9ed, 0x34302b, 1.05));
  const sun = new THREE.DirectionalLight(0xffe7c3, 3.15);
  sun.position.set(-90, 125, 70);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x829dc3, 0.6);
  fill.position.set(80, 40, -100);
  scene.add(fill);

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

  loadCachedGLTF(
    '/models/earth.glb',
    model => {
      if (isDestroyed) return;
      const normalizedModel = new THREE.Group();
      normalizedModel.add(model);
      normalizedModel.updateMatrixWorld(true);
      const modelBounds = new THREE.Box3().setFromObject(normalizedModel);
      const modelCenter = modelBounds.getCenter(new THREE.Vector3());
      const modelSize = modelBounds.getSize(new THREE.Vector3());
      const modelDiameter = Math.max(modelSize.x, modelSize.y, modelSize.z, 0.0001);
      const unitScale = 2 / modelDiameter;
      normalizedModel.scale.setScalar(unitScale);
      normalizedModel.position.copy(modelCenter).multiplyScalar(-unitScale);

      earthMesh = new THREE.Group();
      earthMesh.add(normalizedModel);
      earthMesh.scale.setScalar(EARTH_FIRST_PERSON_RADIUS);
      earthMesh.position.copy(earthAnchor).addScaledVector(earthDirection, EARTH_DISTANCE);
      earthMesh.name = 'Earth';
      scene.add(earthMesh);
    },
    undefined,
    error => console.warn('Could not load /models/earth.glb.', error)
  );

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
          groundCollisionObjects = [...moonTerrainMeshes, outpostRoot];

          addOutpostPartLabels(outpost);
          componentTargets = buildComponentTargets(outpost);

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
    const names = {
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
    const partGroups = [];
    const addedLabels = new Set();
    outpost.traverse(object => {
      const match = object.name.match(/^(\d{3})-[^/]+$/);
      if (match && names[match[1]] && !addedLabels.has(names[match[1]])) {
        addedLabels.add(names[match[1]]);
        partGroups.push({ object, label: names[match[1]] });
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
      buttonText: 'EXIT MODULE'
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
    onInsidePanelChange({ visible: false, label: '', buttonText: '' });
    dismissedComponentId = activeComponentTarget?.id ?? null;
    activeComponentTarget = null;
  }

  function enterNearbyComponent() {
    if (!activeComponentTarget) return;
    const target = activeComponentTarget;
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
    if (['first-person', 'interior'].includes(cameraMode) && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  }

  function handleMouseMove(event) {
    if (!['first-person', 'interior'].includes(cameraMode) || document.pointerLockElement !== canvas) return;
    firstPersonYaw -= event.movementX * 0.0022;
    firstPersonPitch = THREE.MathUtils.clamp(firstPersonPitch - event.movementY * 0.0018, -1.45, 1.45);
  }

  function handleKeyDown(event) {
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
      if (key === 'arrowright' || key === 'd' || key === 'escape') {
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
        message: 'Left leads to the greenhouse. Right keeps you in the airlock.'
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

  function keepCameraAboveSurface() {
    if (!groundCollisionObjects.length) return;
    groundRayOrigin.set(camera.position.x, 10000, camera.position.z);
    groundRaycaster.set(groundRayOrigin, groundRayDirection);
    const hits = groundRaycaster.intersectObjects(groundCollisionObjects, true);
    if (hits.length) camera.position.y = Math.max(camera.position.y, hits[0].point.y + 1.65);
  }

  function keepCameraInsideVerticalBounds(bounds) {
    if (!bounds) return;
    const floor = bounds.min.y + 1.65;
    const ceiling = bounds.max.y - 0.2;
    camera.position.y = floor <= ceiling
      ? THREE.MathUtils.clamp(camera.position.y, floor, ceiling)
      : (bounds.min.y + bounds.max.y) / 2;
  }

  // Animation loop with throttled prompt evaluation (10 Hz vs 120 Hz)
  let promptCheckTimer = 0;

  function animate() {
    if (isDestroyed) return;
    animId = requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.05);

    promptCheckTimer += dt;
    if (promptCheckTimer >= 0.1) {
      promptCheckTimer = 0;
      if (cameraMode === 'first-person') {
        updateAirlockPrompt();
        updateComponentPrompt();
      } else if (cameraMode === 'interior') {
        updateAirlockEndPrompt();
        updateGreenhouseDoorPrompt();
      }
    }

    if (cameraMode === 'free') {
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

    renderer.render(scene, camera);
  }

  animate();

  // Public API returned to React
  return {
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
              if (m.map && m.map !== ASSET_CACHE.skyTexture) m.map.dispose();
              if (m.normalMap) m.normalMap.dispose();
              if (m.roughnessMap) m.roughnessMap.dispose();
              if (m.metalnessMap) m.metalnessMap.dispose();
              if (m.emissiveMap) m.emissiveMap.dispose();
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
