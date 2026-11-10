import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/**
 * Procedural 3D equipment generators for rapid prototyping
 * These create simple but functional equipment models until proper glTF assets are available
 */

function createPipeJoint() {
  const group = new THREE.Group();
  
  // Main pipe horizontal
  const pipeGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 16);
  const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 });
  const pipe1 = new THREE.Mesh(pipeGeometry, pipeMaterial);
  pipe1.rotation.z = Math.PI / 2;
  pipe1.position.set(0, 0, 0);
  group.add(pipe1);
  
  // Vertical pipe down
  const pipe2 = new THREE.Mesh(pipeGeometry.clone(), pipeMaterial);
  pipe2.scale.y = 0.5;
  pipe2.position.set(0, -0.15, 0);
  group.add(pipe2);
  
  // Joint connector (the leaking part)
  const jointGeometry = new THREE.SphereGeometry(0.06, 16, 16);
  const jointMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7, roughness: 0.4 });
  const joint = new THREE.Mesh(jointGeometry, jointMaterial);
  joint.position.set(0, 0, 0);
  joint.name = 'pipe-joint';
  group.add(joint);
  
  // Water drip particles (visual indicator of leak)
  const dropGeometry = new THREE.SphereGeometry(0.01, 8, 8);
  const dropMaterial = new THREE.MeshStandardMaterial({ color: 0x4488ff, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 3; i++) {
    const drop = new THREE.Mesh(dropGeometry, dropMaterial);
    drop.position.set(0, -0.05 - i * 0.05, 0);
    group.add(drop);
  }
  
  // Valve
  const valveGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const valveMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444, metalness: 0.6, roughness: 0.5 });
  const valve = new THREE.Mesh(valveGeometry, valveMaterial);
  valve.position.set(-0.3, 0.1, 0);
  valve.name = 'valve';
  group.add(valve);
  
  return group;
}

function createFilterHousing() {
  const group = new THREE.Group();
  
  // Housing box
  const housingGeometry = new THREE.BoxGeometry(0.3, 0.4, 0.2);
  const housingMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.5, roughness: 0.6 });
  const housing = new THREE.Mesh(housingGeometry, housingMaterial);
  group.add(housing);
  
  // Filter (visible through grill)
  const filterGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 16);
  const filterMaterial = new THREE.MeshStandardMaterial({ color: 0x886644, metalness: 0.2, roughness: 0.9 });
  const filter = new THREE.Mesh(filterGeometry, filterMaterial);
  filter.position.set(0, 0, 0.05);
  filter.name = 'filter';
  group.add(filter);
  
  // Cover
  const coverGeometry = new THREE.BoxGeometry(0.32, 0.12, 0.05);
  const coverMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7, roughness: 0.4 });
  const cover = new THREE.Mesh(coverGeometry, coverMaterial);
  cover.position.set(0, 0.2, 0);
  cover.name = 'cover';
  group.add(cover);
  
  return group;
}

function createSolarPanel() {
  const group = new THREE.Group();
  
  // Panel surface
  const panelGeometry = new THREE.BoxGeometry(0.6, 0.4, 0.02);
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2a44, metalness: 0.8, roughness: 0.2 });
  const panel = new THREE.Mesh(panelGeometry, panelMaterial);
  group.add(panel);
  
  // Solar cells grid pattern
  const cellGeometry = new THREE.PlaneGeometry(0.08, 0.08);
  const cellMaterial = new THREE.MeshStandardMaterial({ color: 0x2244aa, metalness: 0.9, roughness: 0.1 });
  for (let x = -2; x <= 2; x++) {
    for (let y = -1; y <= 1; y++) {
      const cell = new THREE.Mesh(cellGeometry, cellMaterial);
      cell.position.set(x * 0.1, y * 0.12, 0.011);
      group.add(cell);
    }
  }
  
  // Power connection (the faulty part)
  const connectorGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8);
  const connectorMaterial = new THREE.MeshStandardMaterial({ color: 0xccaa00, metalness: 0.9, roughness: 0.3 });
  const connector = new THREE.Mesh(connectorGeometry, connectorMaterial);
  connector.position.set(0.2, -0.1, 0);
  connector.rotation.x = Math.PI / 2;
  connector.name = 'connection';
  group.add(connector);
  
  // Cable
  const cableGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.15, 8);
  const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const cable = new THREE.Mesh(cableGeometry, cableMaterial);
  cable.position.set(0.25, -0.15, 0);
  cable.rotation.z = Math.PI / 4;
  group.add(cable);
  
  return group;
}

function createBatteryUnit() {
  const group = new THREE.Group();
  
  // Battery container
  const containerGeometry = new THREE.BoxGeometry(0.4, 0.3, 0.25);
  const containerMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.5 });
  const container = new THREE.Mesh(containerGeometry, containerMaterial);
  group.add(container);
  
  // Charge port (left side)
  const portGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 16);
  const portMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, metalness: 0.8, roughness: 0.3, emissive: 0x003300 });
  const chargePort = new THREE.Mesh(portGeometry, portMaterial);
  chargePort.position.set(0.15, 0, 0);
  chargePort.rotation.z = Math.PI / 2;
  chargePort.name = 'charge-port';
  group.add(chargePort);
  
  // Terminal (right side)
  const terminalGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.06, 16);
  const terminalMaterial = new THREE.MeshStandardMaterial({ color: 0xcc6600, metalness: 0.9, roughness: 0.2 });
  const terminal = new THREE.Mesh(terminalGeometry, terminalMaterial);
  terminal.position.set(-0.15, 0, 0);
  terminal.rotation.z = Math.PI / 2;
  terminal.name = 'terminal';
  group.add(terminal);
  
  // Status lights
  const lightGeometry = new THREE.CircleGeometry(0.02, 16);
  const lightMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.5 });
  const light = new THREE.Mesh(lightGeometry, lightMaterial);
  light.position.set(0, 0.1, 0.126);
  group.add(light);
  
  return group;
}

function createTrackerHinge() {
  const group = new THREE.Group();
  
  // Base mount
  const baseGeometry = new THREE.CylinderGeometry(0.15, 0.18, 0.08, 16);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7, roughness: 0.4 });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.set(0, -0.15, 0);
  group.add(base);
  
  // Hinge mechanism
  const hingeGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.25, 16);
  const hingeMaterial = new THREE.MeshStandardMaterial({ color: 0xaa6600, metalness: 0.8, roughness: 0.3 });
  const hinge = new THREE.Mesh(hingeGeometry, hingeMaterial);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, 0, 0);
  hinge.name = 'hinge';
  group.add(hinge);
  
  // Rotating arm
  const armGeometry = new THREE.BoxGeometry(0.3, 0.05, 0.08);
  const armMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.5 });
  const arm = new THREE.Mesh(armGeometry, armMaterial);
  arm.position.set(0, 0.1, 0);
  group.add(arm);
  
  // Alignment mark
  const markGeometry = new THREE.CircleGeometry(0.02, 16);
  const markMaterial = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.5 });
  const mark = new THREE.Mesh(markGeometry, markMaterial);
  mark.position.set(0.1, 0.1, 0.041);
  group.add(mark);
  
  return group;
}

function createCoolantValve() {
  const group = new THREE.Group();
  
  // Pipe
  const pipeGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 16);
  const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x4488cc, metalness: 0.8, roughness: 0.3 });
  const pipe = new THREE.Mesh(pipeGeometry, pipeMaterial);
  pipe.rotation.z = Math.PI / 2;
  group.add(pipe);
  
  // Valve wheel
  const wheelGeometry = new THREE.TorusGeometry(0.08, 0.02, 16, 32);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0xff4400, metalness: 0.7, roughness: 0.4 });
  const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
  wheel.rotation.y = Math.PI / 2;
  wheel.position.set(0, 0.12, 0);
  wheel.name = 'valve';
  group.add(wheel);
  
  // Spoke handles
  for (let i = 0; i < 4; i++) {
    const spokeGeometry = new THREE.BoxGeometry(0.015, 0.1, 0.015);
    const spoke = new THREE.Mesh(spokeGeometry, wheelMaterial);
    const angle = (i / 4) * Math.PI * 2;
    spoke.position.set(0, 0.12 + Math.cos(angle) * 0.08, Math.sin(angle) * 0.08);
    group.add(spoke);
  }
  
  // Service mark indicator
  const markGeometry = new THREE.BoxGeometry(0.03, 0.01, 0.01);
  const markMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00aa00, emissiveIntensity: 0.6 });
  const mark = new THREE.Mesh(markGeometry, markMaterial);
  mark.position.set(0, 0.08, 0);
  group.add(mark);
  
  return group;
}

function createRecyclerFilter() {
  const group = new THREE.Group();
  
  // Main recycler unit
  const unitGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.3, 16);
  const unitMaterial = new THREE.MeshStandardMaterial({ color: 0x668844, metalness: 0.5, roughness: 0.6 });
  const unit = new THREE.Mesh(unitGeometry, unitMaterial);
  group.add(unit);
  
  // Filter grill (shows clogged state)
  const grillGeometry = new THREE.PlaneGeometry(0.2, 0.15);
  const grillMaterial = new THREE.MeshStandardMaterial({ color: 0x886622, metalness: 0.3, roughness: 0.8 });
  const grill = new THREE.Mesh(grillGeometry, grillMaterial);
  grill.position.set(0, 0, 0.151);
  grill.name = 'filter';
  group.add(grill);
  
  // Dust/clog particles
  const dustGeometry = new THREE.SphereGeometry(0.015, 8, 8);
  const dustMaterial = new THREE.MeshStandardMaterial({ color: 0x554433, roughness: 0.9 });
  for (let i = 0; i < 8; i++) {
    const dust = new THREE.Mesh(dustGeometry, dustMaterial);
    const angle = (i / 8) * Math.PI * 2;
    dust.position.set(Math.cos(angle) * 0.08, Math.sin(angle) * 0.06, 0.16);
    group.add(dust);
  }
  
  return group;
}

function createFeedValve() {
  const group = new THREE.Group();
  
  // Feed pipe
  const pipeGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 16);
  const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x66cc66, metalness: 0.6, roughness: 0.4 });
  const pipe = new THREE.Mesh(pipeGeometry, pipeMaterial);
  pipe.rotation.z = Math.PI / 2;
  group.add(pipe);
  
  // Valve control dial
  const dialGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 32);
  const dialMaterial = new THREE.MeshStandardMaterial({ color: 0x44aa44, metalness: 0.7, roughness: 0.3 });
  const dial = new THREE.Mesh(dialGeometry, dialMaterial);
  dial.position.set(0, 0.1, 0);
  dial.name = 'valve';
  group.add(dial);
  
  // Pointer indicator
  const pointerGeometry = new THREE.BoxGeometry(0.05, 0.01, 0.01);
  const pointerMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 0.5 });
  const pointer = new THREE.Mesh(pointerGeometry, pointerMaterial);
  pointer.position.set(0.025, 0.1, 0.016);
  group.add(pointer);
  
  // Flow range marks
  const markGeometry = new THREE.CircleGeometry(0.008, 16);
  const goodMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00aa00 });
  const badMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000 });
  
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const mark = new THREE.Mesh(markGeometry, i >= 2 && i <= 5 ? goodMaterial : badMaterial);
    mark.position.set(Math.cos(angle) * 0.065, 0.1 + Math.sin(angle) * 0.065, 0.016);
    group.add(mark);
  }
  
  return group;
}

function createEVASuit() {
  const group = new THREE.Group();
  
  // Suit torso
  const torsoGeometry = new THREE.CylinderGeometry(0.12, 0.14, 0.3, 16);
  const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.3, roughness: 0.6 });
  const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
  group.add(torso);
  
  // Helmet
  const helmetGeometry = new THREE.SphereGeometry(0.1, 16, 16);
  const helmetMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x88aaff, 
    metalness: 0.9, 
    roughness: 0.1, 
    transparent: true, 
    opacity: 0.7 
  });
  const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
  helmet.position.set(0, 0.25, 0);
  group.add(helmet);
  
  // Air hose
  const hoseGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8);
  const hoseMaterial = new THREE.MeshStandardMaterial({ color: 0x4488ff, metalness: 0.5, roughness: 0.5 });
  const hose = new THREE.Mesh(hoseGeometry, hoseMaterial);
  hose.position.set(0.1, 0.1, 0);
  hose.rotation.z = -Math.PI / 4;
  hose.name = 'hose';
  group.add(hose);
  
  // Hose coupling (the faulty part)
  const couplingGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8);
  const couplingMaterial = new THREE.MeshStandardMaterial({ color: 0xff8800, metalness: 0.8, roughness: 0.3 });
  const coupling = new THREE.Mesh(couplingGeometry, couplingMaterial);
  coupling.position.set(0.15, 0.05, 0);
  group.add(coupling);
  
  return group;
}

function createTelescope() {
  const group = new THREE.Group();
  
  // Tripod base
  const baseGeometry = new THREE.ConeGeometry(0.12, 0.08, 3);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.5 });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.set(0, -0.2, 0);
  base.rotation.y = Math.PI / 6;
  group.add(base);
  
  // Telescope barrel
  const barrelGeometry = new THREE.CylinderGeometry(0.05, 0.06, 0.35, 16);
  const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x334466, metalness: 0.7, roughness: 0.4 });
  const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
  barrel.position.set(0, 0, 0);
  barrel.rotation.z = Math.PI / 6;
  group.add(barrel);
  
  // Lens (the calibration target)
  const lensGeometry = new THREE.CylinderGeometry(0.055, 0.055, 0.02, 32);
  const lensMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x6688ff, 
    metalness: 0.9, 
    roughness: 0.05, 
    emissive: 0x334488, 
    emissiveIntensity: 0.3 
  });
  const lens = new THREE.Mesh(lensGeometry, lensMaterial);
  lens.position.set(0, 0.175, -0.1);
  lens.rotation.z = Math.PI / 6;
  lens.name = 'lens';
  group.add(lens);
  
  // Calibration control dial
  const dialGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16);
  const dialMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 });
  const dial = new THREE.Mesh(dialGeometry, dialMaterial);
  dial.position.set(-0.08, -0.05, 0);
  dial.rotation.x = Math.PI / 2;
  group.add(dial);
  
  return group;
}

function createBackupBeacon() {
  const group = new THREE.Group();
  
  // Beacon base
  const baseGeometry = new THREE.BoxGeometry(0.15, 0.08, 0.15);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0xcc6644, metalness: 0.5, roughness: 0.6 });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.set(0, -0.1, 0);
  group.add(base);
  
  // Antenna mast
  const mastGeometry = new THREE.CylinderGeometry(0.01, 0.015, 0.3, 8);
  const mastMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 });
  const mast = new THREE.Mesh(mastGeometry, mastMaterial);
  mast.position.set(0, 0.1, 0);
  group.add(mast);
  
  // Antenna element
  const antennaGeometry = new THREE.TorusGeometry(0.08, 0.008, 8, 16);
  const antennaMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa44, metalness: 0.9, roughness: 0.2 });
  const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
  antenna.position.set(0, 0.25, 0);
  antenna.name = 'antenna';
  group.add(antenna);
  
  // Signal lights
  const lightGeometry = new THREE.SphereGeometry(0.015, 16, 16);
  const activeLightMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x00ff00, 
    emissive: 0x00ff00, 
    emissiveIntensity: 0.8 
  });
  const inactiveLightMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
  
  for (let i = 0; i < 4; i++) {
    const light = new THREE.Mesh(lightGeometry, i === 0 ? activeLightMaterial : inactiveLightMaterial);
    light.position.set(0.06 * Math.cos(i * Math.PI / 2), -0.05, 0.06 * Math.sin(i * Math.PI / 2));
    group.add(light);
  }
  
  return group;
}

function createShelterHatch() {
  const group = new THREE.Group();
  
  // Hatch door
  const hatchGeometry = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 32);
  const hatchMaterial = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6, roughness: 0.5 });
  const hatch = new THREE.Mesh(hatchGeometry, hatchMaterial);
  hatch.rotation.x = Math.PI / 2;
  group.add(hatch);
  
  // Hatch seal ring (the inspected part)
  const sealGeometry = new THREE.TorusGeometry(0.17, 0.015, 16, 32);
  const sealMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
  const seal = new THREE.Mesh(sealGeometry, sealMaterial);
  seal.rotation.x = Math.PI / 2;
  seal.position.set(0, 0, 0.026);
  seal.name = 'seal';
  group.add(seal);
  
  // Worn section indicator (red highlight)
  const wornGeometry = new THREE.TorusGeometry(0.17, 0.02, 16, 32, Math.PI / 3);
  const wornMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 0.5 });
  const worn = new THREE.Mesh(wornGeometry, wornMaterial);
  worn.rotation.x = Math.PI / 2;
  worn.rotation.z = Math.PI / 4;
  worn.position.set(0, 0, 0.027);
  group.add(worn);
  
  // Hatch handle
  const handleGeometry = new THREE.TorusGeometry(0.06, 0.015, 16, 32);
  const handleMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.8, roughness: 0.3 });
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, 0, -0.026);
  group.add(handle);
  
  return group;
}

function createGenericEquipment(color = 0x888888) {
  const group = new THREE.Group();
  
  // Simple box equipment
  const boxGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.2);
  const boxMaterial = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.6 });
  const box = new THREE.Mesh(boxGeometry, boxMaterial);
  group.add(box);
  
  // Interaction point
  const pointGeometry = new THREE.SphereGeometry(0.05, 16, 16);
  const pointMaterial = new THREE.MeshStandardMaterial({ color: 0xff8800, metalness: 0.7, roughness: 0.4 });
  const point = new THREE.Mesh(pointGeometry, pointMaterial);
  point.position.set(0, 0, 0.12);
  group.add(point);
  
  return group;
}

/**
 * Create all equipment models and save them as glTF files
 */
export function createAllEquipmentModels() {
  const models = {
    'pipe_joint': createPipeJoint(),
    'filter_housing': createFilterHousing(),
    'solar_panel': createSolarPanel(),
    'battery_unit': createBatteryUnit(),
    'tracker_hinge': createGenericEquipment(0xaa6600),
    'coolant_valve': createGenericEquipment(0x4488cc),
    'recycler_filter': createGenericEquipment(0x668844),
    'feed_valve': createGenericEquipment(0x66cc66),
    'eva_suit': createGenericEquipment(0xeeeeee),
    'telescope': createGenericEquipment(0x334466),
    'backup_beacon': createGenericEquipment(0xcc6644),
    'shelter_hatch': createGenericEquipment(0x777777),
  };
  
  return models;
}

/**
 * Export a Three.js group as glTF binary
 */
export function exportToGLTF(model, callback) {
  const exporter = new GLTFExporter();
  exporter.parse(
    model,
    (gltf) => {
      callback(gltf);
    },
    (error) => {
      console.error('GLTFExporter error:', error);
    },
    { binary: true }
  );
}

/**
 * Get procedural model directly for inline use
 */
export function getProceduralModel(taskId) {
  const modelMap = {
    'habitat-waterline-inspection': createPipeJoint,
    'oxygen-loop-filter-service': createFilterHousing,
    'solar-array-inspection': createSolarPanel,
    'battery-readiness-check': createBatteryUnit,
    'solar-tracker-alignment': createTrackerHinge,
    'nuclear-unit-coolant-check': createCoolantValve,
    'water-recycler-backflush': createRecyclerFilter,
    'greenhouse-nutrient-balance': createFeedValve,
    'eva-suit-life-support-check': createEVASuit,
    'rover-wheel-and-brake-check': null, // Uses existing rover model
    'science-instrument-calibration': createTelescope,
    'communications-backup-beacon-test': createBackupBeacon,
    'radiation-shelter-seal-check': createShelterHatch,
  };
  
  const creator = modelMap[taskId];
  return creator ? creator() : null;
}
