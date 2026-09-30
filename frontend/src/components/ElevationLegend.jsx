import React from 'react';

export default function ElevationLegend({ minElev, maxElev }) {
  const min = minElev != null ? minElev.toFixed(0) : '0';
  const max = maxElev != null ? maxElev.toFixed(0) : '100';
  const mid = minElev != null && maxElev != null ? ((minElev + maxElev) / 2).toFixed(0) : '50';

  return (
    <div className="elevation-legend glass-panel">
      <div className="legend-header">Elevation Scale (m)</div>
      <div className="legend-bar"></div>
      <div className="legend-labels">
        <span>{min}m</span>
        <span>{mid}m</span>
        <span>{max}m</span>
      </div>
    </div>
  );
}
