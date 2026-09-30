import React, { useState } from 'react';
import { Satellite, UploadCloud, Scan, Sliders, ImagePlus } from 'lucide-react';

export default function Sidebar({
  activeSample,
  onSelectSample,
  onUploadFile,
  previews,
  zScale,
  setZScale,
  baseShift,
  setBaseShift
}) {
  const [activeTab, setActiveTab] = useState('rgb');
  const [terrainPrior, setTerrainPrior] = useState('urban');

  const samples = [
    {
      id: 'urban',
      badge: 'Metropolitan',
      title: 'Urban Structures',
      meta: '20m - 135m | Skyscrapers'
    },
    {
      id: 'mountain',
      badge: 'Alpine',
      title: 'Himalayan Ridge',
      meta: '1400m - 3100m | Steep Slopes'
    },
    {
      id: 'disaster',
      badge: 'Disaster',
      badgeClass: 'badge-warning',
      title: 'Landslide Scar',
      meta: '280m - 720m | Subsidence'
    }
  ];

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFile(e.target.files[0], terrainPrior);
    }
  };

  return (
    <aside className="sidebar-left glass-panel">
      {/* Remote Sensing Scenarios */}
      <div className="panel-section">
        <h3 className="section-title">
          <Satellite size={15} /> Remote Sensing Scenarios
        </h3>
        <div className="sample-grid">
          {samples.map((s) => (
            <button
              key={s.id}
              className={`sample-btn ${activeSample === s.id ? 'active' : ''}`}
              onClick={() => onSelectSample(s.id)}
            >
              <span className={`sample-badge ${s.badgeClass || ''}`}>{s.badge}</span>
              <strong>{s.title}</strong>
              <span className="sample-meta">{s.meta}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Upload Optical Tile */}
      <div className="panel-section">
        <h3 className="section-title">
          <UploadCloud size={15} /> Ingest Optical Satellite Tile
        </h3>
        <div className="upload-dropzone">
          <input type="file" accept=".jpg,.jpeg,.png,.tif,.tiff" onChange={handleFileChange} />
          <ImagePlus className="upload-icon" size={24} />
          <p className="dropzone-text">Drop Optical Satellite Tile (PNG / JPG / GeoTIFF)</p>
          <span className="dropzone-hint">Supports non-georeferenced & georeferenced GeoTIFFs</span>
        </div>

        <div className="param-group">
          <label>Terrain Semantic Prior</label>
          <select 
            value={terrainPrior} 
            onChange={(e) => setTerrainPrior(e.target.value)}
            className="form-control"
          >
            <option value="urban">Urban / Built-Up (Dense Infrastructure)</option>
            <option value="mountain">Mountainous / High Relief Ridge</option>
            <option value="coastal">Coastal / Floodplain Lowland</option>
            <option value="disaster">Disaster / Landslide Impact Zone</option>
          </select>
        </div>
      </div>

      {/* Multi-Spectrum Layers */}
      <div className="panel-section">
        <h3 className="section-title">
          <Scan size={15} /> Multi-View Spectrum Layers
        </h3>
        <div className="preview-tabs">
          {['rgb', 'rdsm', 'dsm', 'normal'].map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'rgb' ? 'RGB' : tab === 'rdsm' ? 'rDSM' : tab === 'dsm' ? 'Metric DSM' : 'Normals'}
            </button>
          ))}
        </div>
        <div className="preview-viewer">
          {previews[activeTab] ? (
            <img src={previews[activeTab]} alt="Spectrum Preview" />
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Generating spectrum...</span>
          )}
        </div>
      </div>

      {/* Calibration Controls */}
      <div className="panel-section">
        <h3 className="section-title">
          <Sliders size={15} /> Scale & Relief Calibration
        </h3>
        <div className="slider-row">
          <div className="slider-label">
            <span>Z-Exaggeration</span>
            <span>{zScale.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="5.0"
            step="0.1"
            value={zScale}
            onChange={(e) => setZScale(parseFloat(e.target.value))}
          />
        </div>
        <div className="slider-row">
          <div className="slider-label">
            <span>Base Offset (m)</span>
            <span>{baseShift} m</span>
          </div>
          <input
            type="range"
            min="-200"
            max="1500"
            step="10"
            value={baseShift}
            onChange={(e) => setBaseShift(parseFloat(e.target.value))}
          />
        </div>
      </div>
    </aside>
  );
}
