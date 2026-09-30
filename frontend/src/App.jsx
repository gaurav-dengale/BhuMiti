import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Viewport3D from './components/Viewport3D';
import ValidationModal from './components/ValidationModal';

const API_BASE = import.meta.env.VITE_API_BASE || (window.location.port === '5173' ? 'http://localhost:8000' : '');

export default function App() {
  const [activeSample, setActiveSample] = useState('urban');
  const [engineStatus, setEngineStatus] = useState('SYSTEM READY');
  const [isValidationOpen, setIsValidationOpen] = useState(false);
  const [validationData, setValidationData] = useState(null);

  // Elevation and Telemetry State
  const [telemetry, setTelemetry] = useState({
    crs: 'EPSG:4326 (WGS84)',
    minElev: null,
    maxElev: null
  });
  const [heightGrid, setHeightGrid] = useState(null);
  const [gridRes, setGridRes] = useState([128, 128]);
  const [previews, setPreviews] = useState({});
  const [zScale, setZScale] = useState(1.5);
  const [baseShift, setBaseShift] = useState(0);

  // Load Initial Sample
  const loadSample = async (sampleId) => {
    try {
      setEngineStatus('COMPUTING DSM...');
      setActiveSample(sampleId);

      const formData = new FormData();
      formData.append('sample_id', sampleId);

      const res = await fetch(`${API_BASE}/api/load_sample`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.status === 'success') {
        setHeightGrid(data.height_grid);
        setGridRes(data.grid_resolution);
        setTelemetry({
          crs: data.metadata.crs || 'EPSG:4326',
          minElev: data.min_elevation,
          maxElev: data.max_elevation
        });
        setPreviews({
          rgb: data.rgb_preview,
          rdsm: data.rdsm_preview,
          dsm: data.dsm_preview,
          normal: data.normal_preview
        });
        setEngineStatus('DSM ACTIVE');
      }
    } catch (err) {
      console.error('Failed to load sample:', err);
      setEngineStatus('OFFLINE (Check Backend)');
    }
  };

  // Upload Custom File
  const handleUploadFile = async (file, terrainPrior) => {
    try {
      setEngineStatus('ESTIMATING ELEVATION...');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('terrain_prior', terrainPrior);

      const res = await fetch(`${API_BASE}/api/process_upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.status === 'success') {
        setHeightGrid(data.height_grid);
        setGridRes(data.grid_resolution);
        setTelemetry({
          crs: data.metadata.crs || 'Local / Non-Geo',
          minElev: data.min_elevation,
          maxElev: data.max_elevation
        });
        setPreviews({
          rgb: data.rgb_preview,
          rdsm: data.rdsm_preview,
          dsm: data.dsm_preview,
          normal: data.normal_preview
        });
        setEngineStatus('ESTIMATION COMPLETE');
      }
    } catch (err) {
      console.error('Failed to process upload:', err);
      alert('Upload failed. Ensure FastAPI backend is running.');
      setEngineStatus('ERROR');
    }
  };

  // Open Validation Modal
  const handleOpenValidation = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/validate`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        setValidationData(data);
      }
    } catch (err) {
      console.error('Validation request failed:', err);
    }
    setIsValidationOpen(true);
  };

  useEffect(() => {
    loadSample('urban');
  }, []);

  return (
    <>
      <Header
        telemetry={telemetry}
        engineStatus={engineStatus}
        onOpenValidation={handleOpenValidation}
        apiBase={API_BASE}
      />

      <div className="main-container">
        <Sidebar
          activeSample={activeSample}
          onSelectSample={loadSample}
          onUploadFile={handleUploadFile}
          previews={previews}
          zScale={zScale}
          setZScale={setZScale}
          baseShift={baseShift}
          setBaseShift={setBaseShift}
        />

        <Viewport3D
          heightGrid={heightGrid}
          gridRes={gridRes}
          minElev={telemetry.minElev}
          maxElev={telemetry.maxElev}
          rgbPreview={previews.rgb}
          zScale={zScale}
          baseShift={baseShift}
        />
      </div>

      <ValidationModal
        isOpen={isValidationOpen}
        onClose={() => setIsValidationOpen(false)}
        validationData={validationData}
      />
    </>
  );
}
