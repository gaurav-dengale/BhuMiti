import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  Rotate3d, Plane, PlayCircle, Image as ImageIcon, 
  Palette, Mountain, Activity, Grid, Crosshair, Ruler, RefreshCw, Navigation 
} from 'lucide-react';
import FlightHud from './FlightHud';
import ElevationLegend from './ElevationLegend';

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
        float cosAngle = clamp(dot(normalize(vNormal), vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
        float slopeDeg = acos(cosAngle) * 57.2957795;

        vec3 col = vec3(0.0, 0.8, 0.2);
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
        vec3 base = vec3(0.08, 0.12, 0.18);
        float distToLine = abs(fract(vElevation / uContourInterval - 0.5) - 0.5) / fwidth(vElevation / uContourInterval);
        float line = 1.0 - min(distToLine, 1.0);

        float distToMajor = abs(fract(vElevation / (uContourInterval * 5.0) - 0.5) - 0.5) / fwidth(vElevation / (uContourInterval * 5.0));
        float majorLine = 1.0 - min(distToMajor, 1.0);

        vec3 col = mix(base, vec3(0.0, 0.94, 1.0), line * 0.75);
        col = mix(col, vec3(1.0, 0.8, 0.2), majorLine * 0.9);

        gl_FragColor = vec4(col, 1.0);
      }
    `
  }
};

export default function Viewport3D({
  heightGrid,
  gridRes,
  minElev,
  maxElev,
  rgbPreview,
  zScale,
  baseShift
}) {
  const containerRef = useRef(null);
  
  // Interaction states
  const [navMode, setNavMode] = useState('orbit'); // 'orbit' | 'drone' | 'autopilot'
  const [activeShader, setActiveShader] = useState('rgb'); // 'rgb' | 'turbo' | 'slope' | 'contour' | 'wireframe'
  const [activeTool, setActiveTool] = useState('probe'); // 'probe' | 'measure'
  
  // Telemetry states
  const [probeData, setProbeData] = useState({ z: null, slope: null, coords: '--' });
  const [measureData, setMeasureData] = useState(null);
  const [flightData, setFlightData] = useState({ speed: 0, altitude: 100, heading: 45 });

  // Three.js refs
  const threeRefs = useRef({
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    terrainMesh: null,
    rgbTexture: null,
    measurePoints: [],
    measureMarkers: [],
    measureLine: null,
    droneKeys: {},
    droneVelocity: new THREE.Vector3(),
    autopilotAngle: 0
  });

  // Initialize Three.js Scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090e);
    scene.fog = new THREE.FogExp2(0x07090e, 0.0015);

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    camera.position.set(0, 220, 280);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 1500;
    controls.minDistance = 10;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.3);
    directionalLight.position.set(150, 300, 150);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const gridHelper = new THREE.GridHelper(600, 30, 0x00f0ff, 0x131b2a);
    gridHelper.position.y = -2;
    scene.add(gridHelper);

    threeRefs.current = {
      ...threeRefs.current,
      scene,
      camera,
      renderer,
      controls
    };

    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    // Keyboard handlers for drone flight
    const handleKeyDown = (e) => {
      threeRefs.current.droneKeys[e.code] = true;
      if (e.code === 'Escape') setNavMode('orbit');
    };
    const handleKeyUp = (e) => {
      threeRefs.current.droneKeys[e.code] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Animation loop
    const clock = new THREE.Clock();
    let animId;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      const { controls, camera, renderer, scene, droneKeys, droneVelocity } = threeRefs.current;

      if (controls && controls.enabled) {
        controls.update();
      }

      // Drone flight physics
      if (camera && droneKeys) {
        const moveSpeed = (droneKeys['ShiftLeft'] || droneKeys['ShiftRight']) ? 220 : 90;
        const forward = (droneKeys['KeyW'] ? 1 : 0) - (droneKeys['KeyS'] ? 1 : 0);
        const strafe = (droneKeys['KeyD'] ? 1 : 0) - (droneKeys['KeyA'] ? 1 : 0);
        const vertical = (droneKeys['KeyE'] ? 1 : 0) - (droneKeys['KeyQ'] ? 1 : 0);
        const turn = (droneKeys['ArrowRight'] ? -1 : 0) + (droneKeys['ArrowLeft'] ? 1 : 0);

        if (forward || strafe || vertical || turn) {
          camera.rotation.y += turn * 1.2 * delta;
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          const side = new THREE.Vector3().crossVectors(dir, camera.up).normalize();

          const targetVelocity = new THREE.Vector3();
          targetVelocity.addScaledVector(dir, forward * moveSpeed);
          targetVelocity.addScaledVector(side, strafe * moveSpeed);
          targetVelocity.y += vertical * (moveSpeed * 0.7);

          droneVelocity.lerp(targetVelocity, 0.1);
          camera.position.addScaledVector(droneVelocity, delta);

          if (camera.position.y < 15) camera.position.y = 15;

          setFlightData({
            speed: Math.round(droneVelocity.length() * 0.8),
            altitude: Math.round(camera.position.y),
            heading: Math.round(((camera.rotation.y * 180 / Math.PI) % 360 + 360) % 360)
          });
        }
      }

      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(animId);
      if (renderer && renderer.domElement) {
        renderer.domElement.remove();
      }
    };
  }, []);

  // Update nav mode controls
  useEffect(() => {
    const { controls, camera } = threeRefs.current;
    if (!controls) return;

    if (navMode === 'orbit') {
      controls.enabled = true;
    } else if (navMode === 'drone') {
      controls.enabled = false;
      if (camera) {
        camera.position.set(0, 80, 140);
        camera.lookAt(0, 0, 0);
      }
    } else if (navMode === 'autopilot') {
      controls.enabled = false;
    }
  }, [navMode]);

  // Load RGB Texture
  useEffect(() => {
    if (!rgbPreview) return;
    const img = new Image();
    img.src = rgbPreview;
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      threeRefs.current.rgbTexture = tex;
      rebuildTerrain();
    };
  }, [rgbPreview]);

  // Rebuild Terrain Mesh on Height Grid / Shader / Scale changes
  const rebuildTerrain = () => {
    const { scene, rgbTexture } = threeRefs.current;
    if (!scene || !heightGrid) return;

    if (threeRefs.current.terrainMesh) {
      scene.remove(threeRefs.current.terrainMesh);
    }

    const [rows, cols] = gridRes || [128, 128];
    const geometry = new THREE.PlaneGeometry(300, 300, cols - 1, rows - 1);
    geometry.rotateX(-Math.PI / 2);

    const posAttr = geometry.attributes.position;
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const metricZ = heightGrid[r][c];
        const scaledY = (metricZ + baseShift - minElev) * zScale * 0.8;
        posAttr.setY(idx, scaledY);
        idx++;
      }
    }
    geometry.computeVertexNormals();

    let material;
    if (activeShader === 'rgb') {
      material = new THREE.MeshStandardMaterial({
        map: rgbTexture,
        roughness: 0.8,
        metalness: 0.1
      });
    } else if (activeShader === 'turbo') {
      material = new THREE.ShaderMaterial({
        uniforms: {
          uMinElev: { value: 0 },
          uMaxElev: { value: (maxElev - minElev) * zScale * 0.8 }
        },
        vertexShader: CustomShaders.turboElevation.vertexShader,
        fragmentShader: CustomShaders.turboElevation.fragmentShader
      });
    } else if (activeShader === 'slope') {
      material = new THREE.ShaderMaterial({
        vertexShader: CustomShaders.slopeHeatmap.vertexShader,
        fragmentShader: CustomShaders.slopeHeatmap.fragmentShader
      });
    } else if (activeShader === 'contour') {
      material = new THREE.ShaderMaterial({
        uniforms: { uContourInterval: { value: 15.0 * zScale } },
        vertexShader: CustomShaders.contourIsolines.vertexShader,
        fragmentShader: CustomShaders.contourIsolines.fragmentShader
      });
    } else if (activeShader === 'wireframe') {
      material = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        wireframe: true
      });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    threeRefs.current.terrainMesh = mesh;
  };

  useEffect(() => {
    rebuildTerrain();
  }, [heightGrid, activeShader, zScale, baseShift]);

  // Pointer Move (Raycasting Probe)
  const handlePointerMove = (e) => {
    const { camera, terrainMesh } = threeRefs.current;
    if (!containerRef.current || !camera || !terrainMesh || navMode !== 'orbit') return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / containerRef.current.clientWidth) * 2 - 1,
      -((e.clientY - rect.top) / containerRef.current.clientHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrainMesh);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const point = hit.point;
      const metricZ = (point.y / (zScale * 0.8)) + minElev - baseShift;
      const normal = hit.face.normal;
      const cosAngle = Math.min(1.0, Math.max(0.0, normal.dot(new THREE.Vector3(0, 1, 0))));
      const slopeDeg = Math.acos(cosAngle) * (180 / Math.PI);

      setProbeData({
        z: metricZ,
        slope: slopeDeg,
        coords: `X:${point.x.toFixed(0)}, Z:${point.z.toFixed(0)}`
      });
    }
  };

  // Pointer Click (3D Height Measurement)
  const handlePointerClick = (e) => {
    if (activeTool !== 'measure') return;
    const { camera, terrainMesh, scene } = threeRefs.current;
    if (!containerRef.current || !camera || !terrainMesh || !scene) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / containerRef.current.clientWidth) * 2 - 1,
      -((e.clientY - rect.top) / containerRef.current.clientHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrainMesh);
    if (intersects.length === 0) return;

    const hit = intersects[0];
    const point = hit.point.clone();
    const metricZ = (point.y / (zScale * 0.8)) + minElev - baseShift;

    let pts = threeRefs.current.measurePoints;
    if (pts.length >= 2) {
      clearMeasurement();
      pts = [];
    }

    pts.push({ point, metricZ });
    threeRefs.current.measurePoints = pts;

    // Marker
    const markerGeo = new THREE.SphereGeometry(2.5, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({
      color: pts.length === 1 ? 0x00ffaa : 0x00f0ff
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.copy(point);
    scene.add(marker);
    threeRefs.current.measureMarkers.push(marker);

    if (pts.length === 2) {
      const p1 = pts[0];
      const p2 = pts[1];

      const lineGeo = new THREE.BufferGeometry().setFromPoints([p1.point, p2.point]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 });
      const line = new THREE.Line(lineGeo, lineMat);
      scene.add(line);
      threeRefs.current.measureLine = line;

      setMeasureData({
        baseZ: Math.min(p1.metricZ, p2.metricZ),
        roofZ: Math.max(p1.metricZ, p2.metricZ),
        deltaZ: Math.abs(p2.metricZ - p1.metricZ),
        dist3d: p1.point.distanceTo(p2.point)
      });
    }
  };

  const clearMeasurement = () => {
    const { scene } = threeRefs.current;
    if (!scene) return;

    threeRefs.current.measurePoints = [];
    threeRefs.current.measureMarkers.forEach(m => scene.remove(m));
    threeRefs.current.measureMarkers = [];
    if (threeRefs.current.measureLine) {
      scene.remove(threeRefs.current.measureLine);
      threeRefs.current.measureLine = null;
    }
    setMeasureData(null);
  };

  const resetCamera = () => {
    const { camera, controls } = threeRefs.current;
    if (camera && controls) {
      camera.position.set(0, 220, 280);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      setNavMode('orbit');
    }
  };

  return (
    <main className="viewport-center">
      <div 
        id="canvas-container" 
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onClick={handlePointerClick}
      />

      {/* Drone HUD */}
      {navMode === 'drone' && (
        <FlightHud 
          speed={flightData.speed}
          altitude={flightData.altitude}
          heading={flightData.heading}
        />
      )}

      {/* Floating Controls Bar */}
      <div className="floating-controls-bar glass-panel">
        <div className="control-btn-group">
          <button 
            className={`mode-btn ${navMode === 'orbit' ? 'active' : ''}`}
            onClick={() => setNavMode('orbit')}
          >
            <Rotate3d size={14} /> Orbit
          </button>
          <button 
            className={`mode-btn ${navMode === 'drone' ? 'active' : ''}`}
            onClick={() => setNavMode('drone')}
          >
            <Plane size={14} /> Drone Flight
          </button>
          <button 
            className={`mode-btn ${navMode === 'autopilot' ? 'active' : ''}`}
            onClick={() => setNavMode('autopilot')}
          >
            <PlayCircle size={14} /> Auto Flyover
          </button>
        </div>

        <div className="divider-v"></div>

        {/* Shaders */}
        <div className="control-btn-group">
          <button 
            className={`shader-btn ${activeShader === 'rgb' ? 'active' : ''}`}
            onClick={() => setActiveShader('rgb')}
          >
            <ImageIcon size={14} /> Optical RGB
          </button>
          <button 
            className={`shader-btn ${activeShader === 'turbo' ? 'active' : ''}`}
            onClick={() => setActiveShader('turbo')}
          >
            <Palette size={14} /> Elevation Tint
          </button>
          <button 
            className={`shader-btn ${activeShader === 'slope' ? 'active' : ''}`}
            onClick={() => setActiveShader('slope')}
          >
            <Mountain size={14} /> Slope Heatmap
          </button>
          <button 
            className={`shader-btn ${activeShader === 'contour' ? 'active' : ''}`}
            onClick={() => setActiveShader('contour')}
          >
            <Activity size={14} /> Contours
          </button>
          <button 
            className={`shader-btn ${activeShader === 'wireframe' ? 'active' : ''}`}
            onClick={() => setActiveShader('wireframe')}
          >
            <Grid size={14} /> Wireframe
          </button>
        </div>

        <div className="divider-v"></div>

        {/* Tools */}
        <div className="control-btn-group">
          <button 
            className={`tool-btn ${activeTool === 'probe' ? 'active' : ''}`}
            onClick={() => { setActiveTool('probe'); clearMeasurement(); }}
          >
            <Crosshair size={14} /> Probe
          </button>
          <button 
            className={`tool-btn ${activeTool === 'measure' ? 'active' : ''}`}
            onClick={() => setActiveTool('measure')}
          >
            <Ruler size={14} /> Height Meter
          </button>
          <button className="tool-btn" onClick={resetCamera}>
            <RefreshCw size={14} /> Reset
          </button>
        </div>
      </div>

      {/* Elevation Legend */}
      <ElevationLegend minElev={minElev} maxElev={maxElev} />

      {/* Cursor Probe Card */}
      <div className="cursor-probe-card glass-panel">
        <div className="probe-title">
          <Navigation size={14} /> Terrain Elevation Probe
        </div>
        <div className="probe-row">
          <span>Metric Altitude:</span>
          <strong className="text-green">{probeData.z != null ? `${probeData.z.toFixed(1)} m` : '-- m'}</strong>
        </div>
        <div className="probe-row">
          <span>Estimated Slope:</span>
          <strong>{probeData.slope != null ? `${probeData.slope.toFixed(1)}°` : '--°'}</strong>
        </div>
        <div className="probe-row">
          <span>Coordinates:</span>
          <span>{probeData.coords}</span>
        </div>
      </div>

      {/* Measure Result Card */}
      {measureData && (
        <div className="measure-card glass-panel">
          <div className="probe-title">
            <Ruler size={14} /> Structure Height Analysis
          </div>
          <div className="probe-row">
            <span>Ground Base:</span>
            <span>{measureData.baseZ.toFixed(1)} m</span>
          </div>
          <div className="probe-row">
            <span>Structure Roof:</span>
            <span>{measureData.roofZ.toFixed(1)} m</span>
          </div>
          <div className="probe-row highlight">
            <span>Net Height (&Delta;Z):</span>
            <strong className="text-cyan">{measureData.deltaZ.toFixed(1)} m</strong>
          </div>
          <div className="probe-row">
            <span>3D Distance:</span>
            <span>{measureData.dist3d.toFixed(1)} m</span>
          </div>
          <button className="btn btn-sm btn-outline mt-2" onClick={clearMeasurement}>
            Clear Measurement
          </button>
        </div>
      )}
    </main>
  );
}
