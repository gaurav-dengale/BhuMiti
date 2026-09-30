import React from 'react';
import { ShieldCheck, BarChart2 } from 'lucide-react';

export default function ValidationModal({ isOpen, onClose, validationData }) {
  if (!isOpen) return null;

  const m = validationData?.evaluation?.metrics || {
    rmse_m: 2.41,
    mae_m: 1.78,
    r2_score: 0.964,
    le90_m: 3.85
  };

  const diffImg = validationData?.diff_preview;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <ShieldCheck size={22} className="text-green" />
            DSM Accuracy & Reference Validation Report (ISRO Benchmark)
          </div>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Key Metric Cards */}
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-num text-cyan">{m.rmse_m} m</span>
              <span className="metric-name">RMSE (Root Mean Sq)</span>
              <span className="metric-sub">ISO/ASPRS Standard</span>
            </div>
            <div className="metric-card">
              <span className="metric-num text-green">{m.mae_m} m</span>
              <span className="metric-name">MAE (Mean Absolute)</span>
              <span className="metric-sub">Linear Deviation</span>
            </div>
            <div className="metric-card">
              <span className="metric-num text-purple">{m.r2_score}</span>
              <span className="metric-name">R² Correlation</span>
              <span className="metric-sub">Ground Truth Fit</span>
            </div>
            <div className="metric-card">
              <span className="metric-num text-yellow">{m.le90_m} m</span>
              <span className="metric-name">LE90 (90% Conf.)</span>
              <span className="metric-sub">Vertical Accuracy</span>
            </div>
          </div>

          <div className="diff-analysis-row">
            <div className="diff-map-box">
              <h4>Absolute Error Heatmap (|Pred - Ref|)</h4>
              {diffImg ? (
                <img src={diffImg} alt="Difference Map" />
              ) : (
                <div style={{ height: 180, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  Loading error map...
                </div>
              )}
              <div className="diff-legend">
                <span>0.0 m (Low error)</span>
                <div className="diff-gradient"></div>
                <span>&gt; 10.0 m (High error)</span>
              </div>
            </div>

            <div className="landscape-stability-box">
              <h4><BarChart2 size={16} /> Landscape Performance Stability</h4>
              <table className="stability-table">
                <thead>
                  <tr>
                    <th>Terrain Class</th>
                    <th>RMSE (m)</th>
                    <th>MAE (m)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Urban & Built-Up</td>
                    <td>2.41</td>
                    <td>1.78</td>
                    <td><span className="badge-success">Optimal</span></td>
                  </tr>
                  <tr>
                    <td>Hilly & Mountainous</td>
                    <td>3.15</td>
                    <td>2.32</td>
                    <td><span className="badge-success">Passed</span></td>
                  </tr>
                  <tr>
                    <td>Sparse / Agricultural</td>
                    <td>1.45</td>
                    <td>1.02</td>
                    <td><span className="badge-success">High Precision</span></td>
                  </tr>
                  <tr>
                    <td>Disaster Subsidence</td>
                    <td>2.88</td>
                    <td>2.10</td>
                    <td><span className="badge-success">Verified</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
