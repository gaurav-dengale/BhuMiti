import React, { useState } from 'react';
import { Layers, Download, CheckCheck, ChevronDown, Map, Box, Cpu } from 'lucide-react';

export default function Header({ 
  telemetry, 
  engineStatus, 
  onOpenValidation,
  apiBase
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="top-nav">
      <div className="brand-section">
        <div className="brand-logo">
          <Layers size={22} />
        </div>
        <div>
          <div className="brand-title">
            BhuMiti <span className="badge-accent">ISRO PS-26175</span>
          </div>
          <div className="brand-sub">Monocular Aerial DSM & 3D Flythrough Engine</div>
        </div>
      </div>

      {/* Telemetry Bar */}
      <div className="telemetry-bar">
        <div className="telemetry-item">
          <span className="telemetry-label">CRS</span>
          <span className="telemetry-val">{telemetry.crs || 'EPSG:4326 (WGS84)'}</span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">MIN ELEV</span>
          <span className="telemetry-val">{telemetry.minElev != null ? `${telemetry.minElev.toFixed(1)} m` : '-- m'}</span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">MAX ELEV</span>
          <span className="telemetry-val">{telemetry.maxElev != null ? `${telemetry.maxElev.toFixed(1)} m` : '-- m'}</span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">BACKBONE</span>
          <span className="telemetry-val text-cyan">Depth-Anything-V2</span>
        </div>
        <div className="telemetry-item status-indicator">
          <span className="pulse-dot"></span>
          <span>{engineStatus}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="header-actions">
        <button className="btn btn-outline" onClick={onOpenValidation}>
          <CheckCheck size={16} /> Accuracy Metrics
        </button>

        <div className="dropdown">
          <button 
            className="btn btn-primary"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <Download size={16} /> Export Data <ChevronDown size={14} />
          </button>
          {dropdownOpen && (
            <div className="dropdown-content" style={{ display: 'block' }}>
              <a href={`${apiBase}/api/export/geotiff`} target="_blank" rel="noreferrer">
                <Map size={14} /> GeoTIFF Metric DSM (.tif)
              </a>
              <a href={`${apiBase}/api/export/obj`} target="_blank" rel="noreferrer">
                <Box size={14} /> 3D Mesh (.obj)
              </a>
              <a href={`${apiBase}/api/export/gltf`} target="_blank" rel="noreferrer">
                <Layers size={14} /> 3D GLB/GLTF Binary (.glb)
              </a>
              <a href={`${apiBase}/api/export/xyz`} target="_blank" rel="noreferrer">
                <Cpu size={14} /> XYZ Point Cloud (.xyz)
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
