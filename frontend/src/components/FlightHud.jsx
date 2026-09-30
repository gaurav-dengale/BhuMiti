import React from 'react';

export default function FlightHud({ speed, altitude, heading }) {
  return (
    <div className="flight-hud">
      <div className="hud-crosshair"></div>
      <div className="hud-left-tape">
        <span className="hud-tape-title">IAS KTS</span>
        <span className="hud-tape-val">{speed}</span>
      </div>
      <div className="hud-right-tape">
        <span className="hud-tape-title">ALT AGL (m)</span>
        <span className="hud-tape-val">{altitude}</span>
      </div>
      <div className="hud-compass">
        <span>HDG {heading.toString().padStart(3, '0')}°</span>
      </div>
      <div className="hud-controls-hint">
        <span>[W/S] Thrust</span> | <span>[A/D] Strafe</span> | <span>[Q/E] Altitude</span> | <span>[SHIFT] Turbo</span> | <span>[ESC] Exit Flight</span>
      </div>
    </div>
  );
}
