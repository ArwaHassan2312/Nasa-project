import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { getProceduralModel } from '../../utils/proceduralEquipment';

// Map task IDs to their 3D equipment models and interaction zones
const EQUIPMENT_3D_MODELS = {
  'habitat-waterline-inspection': {
    modelPath: '/lunar/equipment/pipe_joint.glb',
    hotspots: [
      { id: 'pipe-joint', position: [0, 0, 0], label: 'Pipe joint', radius: 0.15 },
      { id: 'valve', position: [-0.3, 0.1, 0], label: 'Water valve', radius: 0.12 },
    ],
    cameraPosition: [0.5, 0.3, 0.8],
    cameraTarget: [0, 0, 0],
  },
  'oxygen-loop-filter-service': {
    modelPath: '/lunar/equipment/filter_housing.glb',
    hotspots: [
      { id: 'filter', position: [0, 0, 0], label: 'Air filter', radius: 0.18 },
      { id: 'cover', position: [0, 0.2, 0], label: 'Filter cover', radius: 0.15 },
    ],
    cameraPosition: [0.6, 0.4, 0.9],
    cameraTarget: [0, 0, 0],
  },
  'solar-array-inspection': {
    modelPath: '/lunar/equipment/solar_panel.glb',
    hotspots: [
      { id: 'connection', position: [0.2, -0.1, 0], label: 'Power connection', radius: 0.12 },
      { id: 'connector', position: [0.25, -0.15, 0], label: 'Cable connector', radius: 0.10 },
    ],
    cameraPosition: [0.8, 0.5, 1.2],
    cameraTarget: [0, 0, 0],
  },
  'battery-readiness-check': {
    modelPath: '/lunar/equipment/battery_unit.glb',
    hotspots: [
      { id: 'charge-port', position: [0.15, 0, 0], label: 'Charge port', radius: 0.12 },
      { id: 'terminal', position: [-0.15, 0, 0], label: 'Terminal', radius: 0.10 },
    ],
    cameraPosition: [0.7, 0.4, 1.0],
    cameraTarget: [0, 0, 0],
  },
  'solar-tracker-alignment': {
    modelPath: '/lunar/equipment/tracker_hinge.glb',
    hotspots: [
      { id: 'hinge', position: [0, 0, 0], label: 'Tracker hinge', radius: 0.15 },
    ],
    cameraPosition: [0.8, 0.6, 1.1],
    cameraTarget: [0, 0, 0],
  },
  'nuclear-unit-coolant-check': {
    modelPath: '/lunar/equipment/coolant_valve.glb',
    hotspots: [
      { id: 'valve', position: [0, 0, 0], label: 'Coolant valve', radius: 0.14 },
    ],
    cameraPosition: [0.6, 0.5, 1.0],
    cameraTarget: [0, 0, 0],
  },
  'water-recycler-backflush': {
    modelPath: '/lunar/equipment/recycler_filter.glb',
    hotspots: [
      { id: 'filter', position: [0, 0, 0], label: 'Clogged filter', radius: 0.16 },
    ],
    cameraPosition: [0.7, 0.4, 1.0],
    cameraTarget: [0, 0, 0],
  },
  'greenhouse-nutrient-balance': {
    modelPath: '/lunar/equipment/feed_valve.glb',
    hotspots: [
      { id: 'valve', position: [0, 0, 0], label: 'Plant feed valve', radius: 0.12 },
    ],
    cameraPosition: [0.5, 0.3, 0.8],
    cameraTarget: [0, 0, 0],
  },
  'eva-suit-life-support-check': {
    modelPath: '/lunar/equipment/eva_suit.glb',
    hotspots: [
      { id: 'hose', position: [0.1, 0.3, 0], label: 'Air hose coupling', radius: 0.12 },
    ],
    cameraPosition: [1.0, 0.8, 1.5],
    cameraTarget: [0, 0.3, 0],
  },
  'rover-wheel-and-brake-check': {
    modelPath: '/lunar/rover/rover.glb',
    hotspots: [
      { id: 'wheel', position: [0.3, -0.2, 0.4], label: 'Rover wheel', radius: 0.18 },
    ],
    cameraPosition: [1.2, 0.5, 1.5],
    cameraTarget: [0.3, -0.2, 0.4],
  },
  'science-instrument-calibration': {
    modelPath: '/lunar/equipment/telescope.glb',
    hotspots: [
      { id: 'lens', position: [0, 0.2, 0], label: 'Telescope lens', radius: 0.14 },
    ],
    cameraPosition: [0.8, 0.6, 1.2],
    cameraTarget: [0, 0.2, 0],
  },
  'communications-backup-beacon-test': {
    modelPath: '/lunar/equipment/backup_beacon.glb',
    hotspots: [
      { id: 'antenna', position: [0, 0.3, 0], label: 'Backup antenna', radius: 0.15 },
    ],
    cameraPosition: [0.9, 0.7, 1.3],
    cameraTarget: [0, 0.3, 0],
  },
  'radiation-shelter-seal-check': {
    modelPath: '/lunar/equipment/shelter_hatch.glb',
    hotspots: [
      { id: 'seal', position: [0, 0, 0.1], label: 'Hatch seal', radius: 0.13 },
    ],
    cameraPosition: [0.6, 0.4, 1.0],
    cameraTarget: [0, 0, 0],
  },
};

const sharedDracoLoader = new DRACOLoader();
sharedDracoLoader.setDecoderPath('/draco/');
const sharedGltfLoader = new GLTFLoader().setDRACOLoader(sharedDracoLoader);

export default function ThreeDEquipmentViewer({
  taskId,
  onPartClick,
  onToolDrop,
  highlightPart,
  showLabels = true,
  interactionMode = 'inspect', // 'inspect' | 'repair'
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const equipmentRef = useRef(null);
  const hotspotsRef = useRef([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const [hoveredHotspot, setHoveredHotspot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const equipmentConfig = EQUIPMENT_3D_MODELS[taskId];

  useEffect(() => {
    if (!containerRef.current || !equipmentConfig) {
      setError(`No 3D equipment configured for task: ${taskId}`);
      return;
    }

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e14);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    const [cx, cy, cz] = equipmentConfig.cameraPosition;
    camera.position.set(cx, cy, cz);
    const [tx, ty, tz] = equipmentConfig.cameraTarget;
    camera.lookAt(tx, ty, tz);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting - bright focused work light setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(2, 3, 4);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.4);
    fillLight.position.set(-2, 1, -1);
    scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(0xffeecc, 0.3);
    backLight.position.set(0, -1, -2);
    scene.add(backLight);

    // Try to load glTF model, fall back to procedural model
    const loadEquipmentModel = () => {
      // First try procedural model (instant)
      const proceduralModel = getProceduralModel(taskId);
      if (proceduralModel) {
        const equipment = proceduralModel;
        equipment.scale.setScalar(1);
        equipment.position.set(0, 0, 0);
        
        // Ensure equipment receives shadows
        equipment.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              child.material.needsUpdate = true;
            }
          }
        });

        scene.add(equipment);
        equipmentRef.current = equipment;

        // Create hotspot markers
        const hotspots = equipmentConfig.hotspots.map((hotspot) => {
          const geometry = new THREE.SphereGeometry(hotspot.radius, 16, 16);
          const material = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0,
          });
          const sphere = new THREE.Mesh(geometry, material);
          sphere.position.set(...hotspot.position);
          sphere.userData = {id: hotspot.id, label: hotspot.label };
          
          // Add visible glow ring
          const ringGeometry = new THREE.RingGeometry(hotspot.radius * 0.9, hotspot.radius * 1.1, 32);
          const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffaa,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.4,
          });
          const ring = new THREE.Mesh(ringGeometry, ringMaterial);
          ring.lookAt(camera.position);
          sphere.add(ring);
          sphere.userData.ring = ring;

          scene.add(sphere);
          return sphere;
        });
        hotspotsRef.current = hotspots;

        setLoading(false);
        return;
      }

      // Fallback: try to load glTF (for rover and other existing models)
      sharedGltfLoader.load(
        equipmentConfig.modelPath,
        (gltf) => {
          const equipment = gltf.scene;
          equipment.scale.setScalar(1);
          equipment.position.set(0, 0, 0);
          
          equipment.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.material) {
                child.material.needsUpdate = true;
              }
            }
          });

          scene.add(equipment);
          equipmentRef.current = equipment;

          const hotspots = equipmentConfig.hotspots.map((hotspot) => {
            const geometry = new THREE.SphereGeometry(hotspot.radius, 16, 16);
            const material = new THREE.MeshBasicMaterial({
              color: 0x00ff88,
              transparent: true,
              opacity: 0,
            });
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.set(...hotspot.position);
            sphere.userData = {id: hotspot.id, label: hotspot.label };
            
            const ringGeometry = new THREE.RingGeometry(hotspot.radius * 0.9, hotspot.radius * 1.1, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
              color: 0x00ffaa,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.4,
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.lookAt(camera.position);
            sphere.add(ring);
            sphere.userData.ring = ring;

            scene.add(sphere);
            return sphere;
          });
          hotspotsRef.current = hotspots;

          setLoading(false);
        },
        undefined,
        (err) => {
          console.error('Error loading glTF equipment model:', err);
          // If glTF fails and no procedural model, show error
          setError(`No equipment model available for ${taskId}`);
          setLoading(false);
        }
      );
    };

    loadEquipmentModel();

    // Animation loop
    let animationId;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      
      // Pulse hotspot rings
      hotspotsRef.current.forEach((hotspot, index) => {
        if (hotspot.userData.ring) {
          const time = Date.now() * 0.001 + index * 0.5;
          hotspot.userData.ring.material.opacity = 0.3 + Math.sin(time * 2) * 0.2;
          hotspot.userData.ring.scale.set(
            1 + Math.sin(time * 3) * 0.1,
            1 + Math.sin(time * 3) * 0.1,
            1
          );
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // Handle mouse interaction
    const handleMouseMove = (event) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(hotspotsRef.current);

      if (intersects.length > 0) {
        const hitHotspot = intersects[0].object;
        setHoveredHotspot(hitHotspot.userData);
        container.style.cursor = 'pointer';
      } else {
        setHoveredHotspot(null);
        container.style.cursor = 'default';
      }
    };

    const handleClick = (event) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(hotspotsRef.current);

      if (intersects.length > 0) {
        const hitHotspot = intersects[0].object;
        onPartClick?.(hitHotspot.userData.id);
      }
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('click', handleClick);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('click', handleClick);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [taskId, equipmentConfig, onPartClick]);

  // Update highlighted part
  useEffect(() => {
    if (!highlightPart) return;
    
    hotspotsRef.current.forEach((hotspot) => {
      if (hotspot.userData.id === highlightPart) {
        hotspot.material.opacity = 0.3;
        hotspot.material.color.setHex(0xff4444);
        if (hotspot.userData.ring) {
          hotspot.userData.ring.material.color.setHex(0xff4444);
          hotspot.userData.ring.material.opacity = 0.8;
        }
      } else {
        hotspot.material.opacity = 0;
        hotspot.material.color.setHex(0x00ff88);
        if (hotspot.userData.ring) {
          hotspot.userData.ring.material.color.setHex(0x00ffaa);
          hotspot.userData.ring.material.opacity = 0.4;
        }
      }
    });
  }, [highlightPart]);

  if (!equipmentConfig) {
    return (
      <div className="threed-equipment-viewer">
        <div className="threed-error">
          <p>⚠️ No 3D equipment configured for this task</p>
          <p className="threed-error-detail">Task ID: {taskId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="threed-equipment-viewer">
      <div
        ref={containerRef}
        className="threed-canvas-container"
        style={{
          width: '100%',
          height: '100%',
          minHeight: '400px',
          position: 'relative',
        }}
      />
      {loading && (
        <div className="threed-loading">
          <div className="threed-loading-spinner" />
          <p>Loading equipment...</p>
        </div>
      )}
      {error && (
        <div className="threed-error">
          <p>⚠️ {error}</p>
        </div>
      )}
      {showLabels && hoveredHotspot && (
        <div className="threed-hotspot-label">
          {hoveredHotspot.label}
        </div>
      )}
      <div className="threed-controls-hint">
        {interactionMode === 'inspect' ? '👆 Click highlighted parts' : '🔧 Drag tools onto highlighted areas'}
      </div>
    </div>
  );
}
