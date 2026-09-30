import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createIcons, icons } from 'lucide';

// Global App State
const state = {
  activeSample: 'urban',
  currentTab: 'rgb',
  activeShader: 'rgb',
  navMode: 'orbit', // 'orbit' | 'drone' | 'autopilot'
  activeTool: 'probe', // 'probe' | 'measure'
  zScale: 1.5,
  baseShift: 0,
  minElev: 0,
  maxElev: 100,
  heightGrid: null,
  gridRes: [128, 128],
  previews: {},
  measurePoints: [],
  measureMarkers: [],
  measureLine: null,
  drone: {
    position: new THREE.Vector3(0, 150, 200),
    velocity: new THREE.Vector3(),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
    speed: 0,
    maxSpeed: 120,
    keys: {}
  }
};

const API_BASE = 'http://localhost:8000';

// Initialize Three.js Scene
let scene, camera, renderer, controls, terrainMesh, wireframeMesh, raycaster, mouse;
let ambientLight, directionalLight;
let rgbTexture = null;

function initThree() {
  const container = document.getElementById('canvas-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090e);
  scene.fog = new THREE.FogExp2(0x07090e, 0.0015);

  // Camera
  camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
  camera.position.set(0, 220, 280);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  // Orbit Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxDistance = 1500;
  controls.minDistance = 10;
  controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below ground

  // Lights
  ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  directionalLight = new THREE.DirectionalLight(0xffffff, 1.3);
  directionalLight.position.set(150, 300, 150);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // Grid Helper Floor
  const gridHelper = new THREE.GridHelper(600, 30, 0x00f0ff, 0x131b2a);
  gridHelper.position.y = -2;
  scene.add(gridHelper);

  // Raycaster for probe & measure
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  window.addEventListener('resize', onWindowResize);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('click', onPointerClick);

  setupDroneControls();
  animate();
}

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// Custom Shaders for Multi-View Analytics
const CustomShaders = {
  turboElevation: {
    uniforms: {
      uMinElev: { value: 0.0 },
      uMaxElev: { value: 100.0 },
    },
    vertexShader: `
      varying float vElevation;
      varying vec3 vNormal;
      void main() {
        vElevation = position.y;
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uMinElev;
      uniform float uMaxElev;
      varying float vElevation;
      varying vec3 vNormal;

      vec3 turboColormap(float x) {
        x = clamp(x, 0.0, 1.0);
        vec4 r = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
        vec4 g = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
        vec4 b = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
        vec2 s = vec2(-152.94239396, 59.28637943);

        float red = r.x + x * (r.y + x * (r.z + x * (r.w + x * (s.x + x * s.y))));
        float green = g.x + x * (g.y + x * (g.z + x * (g.w + x * (-4.27103158 + x * 2.82956604))));
        float blue = b.x + x * (b.y + x * (b.z + x * (b.w + x * (-89.90310912 + x * 27.34824973))));
        return clamp(vec3(red, green, blue), 0.0, 1.0);
      }

      void main() {
        float normZ = (vElevation - uMinElev) / max(uMaxElev - uMinElev, 1.0);
        vec3 col = turboColormap(normZ);
        // Simple directional diffuse shading
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
        float diff = max(dot(vNormal, lightDir), 0.25);
        gl_FragColor = vec4(col * (0.6 + 0.4 * diff), 1.0);
      }
    `
  },

  slopeHeatmap: {
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normal;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        // Compute angle between surface normal and vertical up vector (0, 1, 0)
        float cosAngle = clamp(dot(normalize(vNormal), vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
        float slopeDeg = acos(cosAngle) * 57.2957795; // radians to degrees

        // Color mapping: 0-15 deg Green, 15-35 deg Yellow, >35 deg Red
        vec3 col = vec3(0.0, 0.8, 0.2); // Gentle Green
        if (slopeDeg > 15.0 && slopeDeg <= 35.0) {
          float t = (slopeDeg - 15.0) / 20.0;
          col = mix(vec3(0.0, 0.8, 0.2), vec3(1.0, 0.8, 0.0), t);
        } else if (slopeDeg > 35.0) {
          float t = min((slopeDeg - 35.0) / 30.0, 1.0);
          col = mix(vec3(1.0, 0.8, 0.0), vec3(1.0, 0.1, 0.1), t);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `
  },

  contourIsolines: {
    uniforms: {
      uContourInterval: { value: 10.0 }
    },
    vertexShader: `
      varying float vElevation;
      varying vec2 vUv;
      void main() {
        vElevation = position.y;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uContourInterval;
      varying float vElevation;
      varying vec2 vUv;

      void main() {
        // Base terrain dark tone
        vec3 base = vec3(0.08, 0.12, 0.18);
        
        // Modulo distance to nearest contour line
        float distToLine = abs(fract(vElevation / uContourInterval - 0.5) - 0.5) / fwidth(vElevation / uContourInterval);
        float line = 1.0 - min(distToLine, 1.0);

        // Major contour lines every 50m
        float distToMajor = abs(fract(vElevation / (uContourInterval * 5.0) - 0.5) - 0.5) / fwidth(vElevation / (uContourInterval * 5.0));
        float majorLine = 1.0 - min(distToMajor, 1.0);

        vec3 col = mix(base, vec3(0.0, 0.94, 1.0), line * 0.75);
        col = mix(col, vec3(1.0, 0.8, 0.2), majorLine * 0.9);

        gl_FragColor = vec4(col, 1.0);
      }
    `
  }
};

// Rebuild 3D Terrain Mesh from Height Grid
function updateTerrainMesh() {
  if (!state.heightGrid) return;

  if (terrainMesh) scene.remove(terrainMesh);
  if (wireframeMesh) scene.remove(wireframeMesh);

  const [rows, cols] = state.gridRes;
  const geometry = new THREE.PlaneGeometry(300, 300, cols - 1, rows - 1);
  geometry.rotateX(-Math.PI / 2);

  const posAttr = geometry.attributes.position;
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const metricZ = state.heightGrid[r][c];
      const scaledY = (metricZ + state.baseShift - state.minElev) * state.zScale * 0.8;
      posAttr.setY(idx, scaledY);
      idx++;
    }
  }
  geometry.computeVertexNormals();

  // Create active material based on shader state
  let material;
  if (state.activeShader === 'rgb') {
    material = new THREE.MeshStandardMaterial({
      map: rgbTexture,
      roughness: 0.8,
      metalness: 0.1,
      flatShading: false
    });
  } else if (state.activeShader === 'turbo') {
    material = new THREE.ShaderMaterial({
      uniforms: {
        uMinElev: { value: 0 },
        uMaxElev: { value: (state.maxElev - state.minElev) * state.zScale * 0.8 }
      },
      vertexShader: CustomShaders.turboElevation.vertexShader,
      fragmentShader: CustomShaders.turboElevation.fragmentShader
    });
  } else if (state.activeShader === 'slope') {
    material = new THREE.ShaderMaterial({
      vertexShader: CustomShaders.slopeHeatmap.vertexShader,
      fragmentShader: CustomShaders.slopeHeatmap.fragmentShader
    });
  } else if (state.activeShader === 'contour') {
    material = new THREE.ShaderMaterial({
      uniforms: { uContourInterval: { value: 15.0 * state.zScale } },
      vertexShader: CustomShaders.contourIsolines.vertexShader,
      fragmentShader: CustomShaders.contourIsolines.fragmentShader
    });
  } else if (state.activeShader === 'wireframe') {
    material = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true
    });
  }

  terrainMesh = new THREE.Mesh(geometry, material);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  scene.add(terrainMesh);

  // Update UI Telemetry
  document.getElementById('telemetry-min-z').innerText = `${state.minElev.toFixed(1)} m`;
  document.getElementById('telemetry-max-z').innerText = `${state.maxElev.toFixed(1)} m`;
  document.getElementById('legend-min').innerText = `${state.minElev.toFixed(0)}m`;
  document.getElementById('legend-mid').innerText = `${((state.minElev + state.maxElev) / 2).toFixed(0)}m`;
  document.getElementById('legend-max').innerText = `${state.maxElev.toFixed(0)}m`;
}

// Drone Flight Simulator Controls
function setupDroneControls() {
  window.addEventListener('keydown', (e) => {
    state.drone.keys[e.code] = true;
    if (e.code === 'Escape' && state.navMode === 'drone') {
      setNavMode('orbit');
    }
  });

  window.addEventListener('keyup', (e) => {
    state.drone.keys[e.code] = false;
  });
}

function updateDronePhysics(delta) {
  if (state.navMode !== 'drone') return;

  const d = state.drone;
  const moveSpeed = d.keys['ShiftLeft'] || d.keys['ShiftRight'] ? 220 : 90;
  const rotSpeed = 1.2;

  // Key controls
  const forward = (d.keys['KeyW'] ? 1 : 0) - (d.keys['KeyS'] ? 1 : 0);
  const strafe = (d.keys['KeyD'] ? 1 : 0) - (d.keys['KeyA'] ? 1 : 0);
  const vertical = (d.keys['KeyE'] ? 1 : 0) - (d.keys['KeyQ'] ? 1 : 0);
  const turn = (d.keys['ArrowRight'] ? -1 : 0) + (d.keys['ArrowLeft'] ? 1 : 0);

  // Rotation
  camera.rotation.y += turn * rotSpeed * delta;

  // Direction vectors
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const side = new THREE.Vector3().crossVectors(dir, camera.up).normalize();

  const targetVelocity = new THREE.Vector3();
  targetVelocity.addScaledVector(dir, forward * moveSpeed);
  targetVelocity.addScaledVector(side, strafe * moveSpeed);
  targetVelocity.y += vertical * (moveSpeed * 0.7);

  d.velocity.lerp(targetVelocity, 0.1);
  camera.position.addScaledVector(d.velocity, delta);

  // Clamp height above ground
  if (camera.position.y < 15) camera.position.y = 15;

  // Update HUD
  const speedKnots = Math.round(d.velocity.length() * 0.8);
  const altMeters = Math.round(camera.position.y);
  const headingDeg = Math.round(((camera.rotation.y * 180 / Math.PI) % 360 + 360) % 360);

  document.getElementById('hud-speed').innerText = speedKnots;
  document.getElementById('hud-altitude').innerText = altMeters;
  document.getElementById('hud-heading').innerText = `HDG ${headingDeg.toString().padStart(3, '0')}°`;
}

// Raycasting Probe & Measurement Interaction
function onPointerMove(e) {
  const container = document.getElementById('canvas-container');
  const rect = container.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

  if (state.navMode === 'orbit' && terrainMesh) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrainMesh);
    if (intersects.length > 0) {
      const hit = intersects[0];
      const point = hit.point;

      // Unscale Y to get metric elevation
      const metricZ = (point.y / (state.zScale * 0.8)) + state.minElev - state.baseShift;
      const normal = hit.face.normal;
      const cosAngle = Math.min(1.0, Math.max(0.0, normal.dot(new THREE.Vector3(0, 1, 0))));
      const slopeDeg = Math.acos(cosAngle) * (180 / Math.PI);

      document.getElementById('probe-z').innerText = `${metricZ.toFixed(1)} m`;
      document.getElementById('probe-slope').innerText = `${slopeDeg.toFixed(1)}°`;
      document.getElementById('probe-coords').innerText = `X:${point.x.toFixed(0)}, Z:${point.z.toFixed(0)}`;
    }
  }
}

function onPointerClick(e) {
  if (state.activeTool !== 'measure' || !terrainMesh) return;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(terrainMesh);
  if (intersects.length === 0) return;

  const hit = intersects[0];
  const point = hit.point.clone();
  const metricZ = (point.y / (state.zScale * 0.8)) + state.minElev - state.baseShift;

  if (state.measurePoints.length >= 2) {
    clearMeasurement();
  }

  state.measurePoints.push({ point, metricZ });

  // Add marker sphere
  const markerGeo = new THREE.SphereGeometry(2.5, 16, 16);
  const markerMat = new THREE.MeshBasicMaterial({
    color: state.measurePoints.length === 1 ? 0x00ffaa : 0x00f0ff
  });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.copy(point);
  scene.add(marker);
  state.measureMarkers.push(marker);

  if (state.measurePoints.length === 2) {
    const p1 = state.measurePoints[0];
    const p2 = state.measurePoints[1];

    // Draw connecting laser line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([p1.point, p2.point]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 });
    state.measureLine = new THREE.Line(lineGeo, lineMat);
    scene.add(state.measureLine);

    // Calculate Delta Z and 3D distance
    const deltaZ = Math.abs(p2.metricZ - p1.metricZ);
    const dist3d = p1.point.distanceTo(p2.point);

    document.getElementById('m-base-z').innerText = `${Math.min(p1.metricZ, p2.metricZ).toFixed(1)} m`;
    document.getElementById('m-roof-z').innerText = `${Math.max(p1.metricZ, p2.metricZ).toFixed(1)} m`;
    document.getElementById('m-delta-z').innerText = `${deltaZ.toFixed(1)} m`;
    document.getElementById('m-dist-3d').innerText = `${dist3d.toFixed(1)} m`;
    document.getElementById('measure-result-card').classList.remove('hidden');
  }
}

function clearMeasurement() {
  state.measurePoints = [];
  state.measureMarkers.forEach(m => scene.remove(m));
  state.measureMarkers = [];
  if (state.measureLine) {
    scene.remove(state.measureLine);
    state.measureLine = null;
  }
  document.getElementById('measure-result-card').classList.add('hidden');
}

// API Integration
async function loadSample(sampleId) {
  try {
    document.getElementById('engine-status').innerText = 'COMPUTING DSM...';
    const formData = new FormData();
    formData.append('sample_id', sampleId);

    const res = await fetch(`${API_BASE}/api/load_sample`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.status === 'success') {
      state.heightGrid = data.height_grid;
      state.gridRes = data.grid_resolution;
      state.minElev = data.min_elevation;
      state.maxElev = data.max_elevation;
      state.previews = {
        rgb: data.rgb_preview,
        rdsm: data.rdsm_preview,
        dsm: data.dsm_preview,
        normal: data.normal_preview
      };

      // Load RGB Texture
      const img = new Image();
      img.src = data.rgb_preview;
      img.onload = () => {
        rgbTexture = new THREE.Texture(img);
        rgbTexture.needsUpdate = true;
        updateTerrainMesh();
      };

      document.getElementById('layer-preview-img').src = data.rgb_preview;
      document.getElementById('telemetry-crs').innerText = data.metadata.crs || 'EPSG:4326';
      document.getElementById('engine-status').innerText = 'DSM ACTIVE';
    }
  } catch (err) {
    console.error('Failed to load sample:', err);
    document.getElementById('engine-status').innerText = 'OFFLINE';
  }
}

async function uploadFile(file) {
  try {
    document.getElementById('engine-status').innerText = 'PROCESSING UPLOAD...';
    const prior = document.getElementById('terrain-prior-select').value;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('terrain_prior', prior);

    const res = await fetch(`${API_BASE}/api/process_upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.status === 'success') {
      state.heightGrid = data.height_grid;
      state.gridRes = data.grid_resolution;
      state.minElev = data.min_elevation;
      state.maxElev = data.max_elevation;
      state.previews = {
        rgb: data.rgb_preview,
        rdsm: data.rdsm_preview,
        dsm: data.dsm_preview,
        normal: data.normal_preview
      };

      const img = new Image();
      img.src = data.rgb_preview;
      img.onload = () => {
        rgbTexture = new THREE.Texture(img);
        rgbTexture.needsUpdate = true;
        updateTerrainMesh();
      };

      document.getElementById('layer-preview-img').src = data.rgb_preview;
      document.getElementById('telemetry-crs').innerText = data.metadata.crs || 'Local / Non-Geo';
      document.getElementById('engine-status').innerText = 'ESTIMATION COMPLETE';
    }
  } catch (err) {
    console.error('Upload failed:', err);
    alert('Failed to process image. Ensure backend server is active on port 8000.');
  }
}

async function runValidationModal() {
  try {
    const res = await fetch(`${API_BASE}/api/validate`, { method: 'POST' });
    const data = await res.json();
    if (data.status === 'success') {
      const m = data.evaluation.metrics;
      document.getElementById('m-val-rmse').innerText = `${m.rmse_m} m`;
      document.getElementById('m-val-mae').innerText = `${m.mae_m} m`;
      document.getElementById('m-val-r2').innerText = m.r2_score;
      document.getElementById('m-val-le90').innerText = `${m.le90_m} m`;
      document.getElementById('diff-map-img').src = data.diff_preview;
      document.getElementById('modal-validation').classList.remove('hidden');
    }
  } catch (err) {
    console.error('Validation error:', err);
    document.getElementById('modal-validation').classList.remove('hidden');
  }
}

// Navigation Modes
function setNavMode(mode) {
  state.navMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));

  const flightHud = document.getElementById('flight-hud');
  if (mode === 'drone') {
    document.getElementById('mode-drone').classList.add('active');
    flightHud.classList.remove('hidden');
    controls.enabled = false;
    camera.position.set(0, 80, 140);
    camera.lookAt(0, 0, 0);
  } else if (mode === 'autopilot') {
    document.getElementById('mode-autopilot').classList.add('active');
    flightHud.classList.add('hidden');
    controls.enabled = false;
  } else {
    document.getElementById('mode-orbit').classList.add('active');
    flightHud.classList.add('hidden');
    controls.enabled = true;
  }
}

// UI Event Handlers
function setupUI() {
  // Scenario selector
  document.querySelectorAll('.sample-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sample-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sampleId = btn.dataset.sample;
      state.activeSample = sampleId;
      loadSample(sampleId);
    });
  });

  // Preview Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      state.currentTab = tab;
      if (state.previews[tab]) {
        document.getElementById('layer-preview-img').src = state.previews[tab];
      }
    });
  });

  // Shaders
  const shaderBtns = [
    { id: 'shader-rgb', shader: 'rgb' },
    { id: 'shader-turbo', shader: 'turbo' },
    { id: 'shader-slope', shader: 'slope' },
    { id: 'shader-contour', shader: 'contour' },
    { id: 'shader-wireframe', shader: 'wireframe' }
  ];
  shaderBtns.forEach(({ id, shader }) => {
    document.getElementById(id).addEventListener('click', () => {
      document.querySelectorAll('.shader-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      state.activeShader = shader;
      updateTerrainMesh();
    });
  });

  // Nav Modes
  document.getElementById('mode-orbit').addEventListener('click', () => setNavMode('orbit'));
  document.getElementById('mode-drone').addEventListener('click', () => setNavMode('drone'));
  document.getElementById('mode-autopilot').addEventListener('click', () => setNavMode('autopilot'));

  // Tools
  document.getElementById('tool-probe').addEventListener('click', () => {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tool-probe').classList.add('active');
    state.activeTool = 'probe';
    clearMeasurement();
  });

  document.getElementById('tool-measure').addEventListener('click', () => {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tool-measure').classList.add('active');
    state.activeTool = 'measure';
  });

  document.getElementById('tool-reset').addEventListener('click', () => {
    camera.position.set(0, 220, 280);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    setNavMode('orbit');
  });

  document.getElementById('btn-clear-measure').addEventListener('click', clearMeasurement);

  // Sliders
  document.getElementById('slider-z-scale').addEventListener('input', (e) => {
    state.zScale = parseFloat(e.target.value);
    document.getElementById('val-z-scale').innerText = `${state.zScale.toFixed(1)}x`;
    updateTerrainMesh();
  });

  document.getElementById('slider-base-shift').addEventListener('input', (e) => {
    state.baseShift = parseFloat(e.target.value);
    document.getElementById('val-base-shift').innerText = `${state.baseShift} m`;
    updateTerrainMesh();
  });

  // Upload
  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      uploadFile(e.target.files[0]);
    }
  });

  // Export Dropdown
  const btnExport = document.getElementById('btn-export');
  const dropdown = document.getElementById('export-dropdown');
  btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.parentElement.classList.toggle('open');
  });
  window.addEventListener('click', () => dropdown.parentElement.classList.remove('open'));

  document.getElementById('export-geotiff').addEventListener('click', () => window.open(`${API_BASE}/api/export/geotiff`));
  document.getElementById('export-obj').addEventListener('click', () => window.open(`${API_BASE}/api/export/obj`));
  document.getElementById('export-gltf').addEventListener('click', () => window.open(`${API_BASE}/api/export/gltf`));
  document.getElementById('export-xyz').addEventListener('click', () => window.open(`${API_BASE}/api/export/xyz`));

  // Validation Modal
  document.getElementById('btn-validation-modal').addEventListener('click', runValidationModal);
  document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('modal-validation').classList.add('hidden');
  });

  // Render Lucide Icons
  createIcons({ icons });
}

// Main Animation Loop
let clock = new THREE.Clock();
let autopilotAngle = 0;

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  if (state.navMode === 'orbit') {
    controls.update();
  } else if (state.navMode === 'drone') {
    updateDronePhysics(delta);
  } else if (state.navMode === 'autopilot') {
    autopilotAngle += delta * 0.25;
    const radius = 260;
    camera.position.x = Math.sin(autopilotAngle) * radius;
    camera.position.z = Math.cos(autopilotAngle) * radius;
    camera.position.y = 130 + Math.sin(autopilotAngle * 2) * 30;
    camera.lookAt(0, 20, 0);
  }

  renderer.render(scene, camera);
}

// Boot up
window.addEventListener('DOMContentLoaded', () => {
  initThree();
  setupUI();
  loadSample('urban');
});
