# 🛰️ DepthWizard: Single-View Height Estimation & 3D Flythrough

> **ISRO SIH Problem Statement ID: 26175**  
> **Theme: Disaster Management / Earth Observation**  
> **Organization: Indian Space Research Organisation (ISRO)** | **Team:** Burning Hammer

DepthWizard is an end-to-end geospatial intelligence pipeline and 3D visualization suite that transforms single-view optical RGB remote sensing imagery (PNG, JPG, or GeoTIFF) into high-precision metric Digital Surface Models (DSMs) and renders interactive, navigable 3D terrain flythroughs in real time.

---

## 🌟 Key Capabilities

1. **Elevation Extraction Backbone**:
   - Monocular depth backbone with edge-preserving bilateral filtering to capture crisp building boundaries, road grids, and high-relief topography from single-view satellite imagery.
   - Computes continuous Relative Disparity ($rDSM$).

2. **Geospatial Scale & Metric Calibration**:
   - **Non-Georeferenced (PNG/JPG)**: Converts relative depth to metric elevation ($Z_{metric}$) using scene-level semantic terrain priors (Urban, Mountain, Coastal, Disaster).
   - **Georeferenced (GeoTIFF)**: Computes affine scale and shift parameters ($Z = s \cdot d_{rel} + t$) using robust **RANSAC / Huber-loss** regression against coarse reference DEMs (e.g. SRTM 30m / Copernicus DEM) and Ground Control Points (GCPs).
   - Exports 32-bit Float GeoTIFF DSM with standard coordinate reference systems (`EPSG:4326`, UTM).

3. **React + Three.js 3D Flythrough & Analytics Cockpit**:
   - **Interactive Navigation Modes**:
     - 🪐 **Orbital Inspection**: 360° rotation, pan, and smooth zoom.
     - ✈️ **First-Person Drone / Aircraft Flythrough**: Dynamic flight simulator physics with airspeed (knots), altitude AGL, heading compass, and pitch ladder HUD.
     - 🎥 **Cinematic Autopilot**: Automated spline orbit flyover.
   - **Real-Time Topographic Shaders**:
     - Optical RGB Satellite Texture mapping
     - Hypsometric Elevation Colormap (Turbo, Viridis)
     - Slope Hazard Gradient (Green $\rightarrow$ Yellow $\rightarrow$ Red steep slopes)
     - Topographic Contour Lines (Isolines)
     - 3D Wireframe Mesh Grid
   - **Geospatial Measurement Suite**:
     - 🎯 **Real-time Elevation Probe**: Instant altitude ($Z$ in meters), slope angle, and coordinate display on hover.
     - 📐 **3D Structure Height Meter**: Point-to-point laser measurement for building heights ($\Delta Z = Z_{roof} - Z_{ground}$).

4. **ISRO SIH Evaluation & Validation Suite**:
   - Automated computation of **RMSE**, **MAE**, **$R^2$ Correlation**, and **LE90** (Linear Error at 90% confidence) against reference LiDAR/DEM datasets.
   - Visual difference error heatmaps ($|Z_{pred} - Z_{ref}|$) and landscape stability analysis across urban, mountainous, sparse, and disaster impact zones.

5. **Multi-Format 3D Asset & GeoTIFF Exporter**:
   - One-click export to **GeoTIFF (`.tif`)**, **3D Mesh (`.obj`, `.glb`)**, and **XYZ Point Cloud (`.xyz`)**.

---

## 📁 Repository Structure

```
d:/DeapthWizard/
├── backend/
│   ├── main.py                  # FastAPI REST server & API endpoints
│   ├── elevation_engine.py      # Monocular depth backbone & normal generator
│   ├── geo_calibration.py       # RANSAC / Huber scale-shift & SRTM calibration
│   ├── geotiff_handler.py       # 32-bit Float GeoTIFF parser and exporter
│   ├── mesh_generator.py        # 3D OBJ, GLTF, PLY, and XYZ Point Cloud builder
│   ├── metrics.py               # RMSE, MAE, R², LE90, and slope error metrics
│   └── sample_generator.py      # Realistic synthetic satellite test scenarios
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx       # Telemetry bar, ISRO badge & export dropdown
│   │   │   ├── Sidebar.jsx      # Scenario selector, tile ingest, spectrum tabs
│   │   │   ├── Viewport3D.jsx   # Three.js 3D canvas, shaders & measurement tools
│   │   │   ├── FlightHud.jsx    # Drone flight simulator HUD instruments
│   │   │   ├── ElevationLegend.jsx # Floating color ramp legend
│   │   │   └── ValidationModal.jsx # SIH evaluation & error heatmap report
│   │   ├── App.jsx              # Main React state manager
│   │   ├── main.jsx             # React 18 DOM mount
│   │   └── index.css            # Dark glassmorphism geospatial design system
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## ⚡ Quick Start Guide

### 1. Launch the Backend API (FastAPI)
In a terminal, run:
```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be available at: `http://localhost:8000/docs`

### 2. Launch the React Frontend (Vite)
In a second terminal, run:
```bash
cd frontend
npm run dev
```
Open your browser at: `http://localhost:5173`

---

## 🕹️ Controls Reference

| Mode | Control | Action |
|---|---|---|
| **Orbit** | Left Mouse Drag | Rotate camera around terrain |
| **Orbit** | Right Mouse Drag | Pan view |
| **Orbit** | Scroll Wheel | Zoom in / out |
| **Drone Flight** | `W` / `S` | Forward / Reverse thrust |
| **Drone Flight** | `A` / `D` | Strafe Left / Right |
| **Drone Flight** | `Q` / `E` | Ascend / Descend |
| **Drone Flight** | `Shift` | Turbo speed boost |
| **Drone Flight** | `Arrow Left` / `Arrow Right` | Yaw rotation |
| **Drone Flight** | `ESC` | Exit flight simulator |
| **Probe Tool** | Hover | Real-time altitude, slope & coordinates |
| **Height Meter** | Click 2 points | Measure building height $\Delta Z$ and 3D direct distance |
