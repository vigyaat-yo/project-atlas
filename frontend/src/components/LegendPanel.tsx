import React from 'react'

interface LegendProps {
  activeLayer: string | null
}

export const LegendPanel: React.FC<LegendProps> = ({ activeLayer }) => {
  if (!activeLayer) return null

  if (activeLayer === 'Elevation') {
    return (
      <div className="legend-card" id="legend-elevation">
        <div className="legend-header">
          <span className="legend-indicator" style={{ background: '#38bdf8' }} />
          <div>
            <h3 className="legend-title">MOLA TOPOGRAPHY (ELEVATION)</h3>
            <p className="legend-subtitle">Mars Orbiter Laser Altimeter · Datum: Aeroid (0 m)</p>
          </div>
        </div>

        <div className="legend-bar elevation-gradient" />
        <div className="legend-labels">
          <span>-8,200 m (Basins)</span>
          <span>-2,500 m (Jezero)</span>
          <span>0 m</span>
          <span>+21,200 m (Peaks)</span>
        </div>

        <div className="legend-meta">
          <div className="meta-item">
            <span className="meta-dot" style={{ background: '#0284c7' }} />
            <span>Lowlands & Impact Basins (Hellas, Argyre)</span>
          </div>
          <div className="meta-item">
            <span className="meta-dot" style={{ background: '#22c55e' }} />
            <span>Jezero Crater Floor (-2,500m to -2,600m)</span>
          </div>
          <div className="meta-item">
            <span className="meta-dot" style={{ background: '#ef4444' }} />
            <span>Volcanic Plateaus (Tharsis, Olympus Mons)</span>
          </div>
        </div>
      </div>
    )
  }

  if (activeLayer === 'Slope') {
    return (
      <div className="legend-card" id="legend-slope">
        <div className="legend-header">
          <span className="legend-indicator" style={{ background: '#22c55e' }} />
          <div>
            <h3 className="legend-title">SURFACE SLOPE INCLINATION</h3>
            <p className="legend-subtitle">Calculated terrain gradient · Degrees from horizontal</p>
          </div>
        </div>

        <div className="legend-bar slope-gradient" />
        <div className="legend-labels">
          <span>0° (Flat)</span>
          <span>10° (Caution)</span>
          <span>15° (Critical)</span>
          <span>≥ 30° (Wall)</span>
        </div>

        <div className="legend-meta">
          <div className="meta-item">
            <span className="meta-dot" style={{ background: '#22c55e' }} />
            <span><strong>0° – 10°: Nominal</strong> (Safe for autonomous rover traversal)</span>
          </div>
          <div className="meta-item">
            <span className="meta-dot" style={{ background: '#eab308' }} />
            <span><strong>10° – 15°: Elevated Slip</strong> (Reduced traverse speed, route penalty)</span>
          </div>
          <div className="meta-item">
            <span className="meta-dot" style={{ background: '#ef4444' }} />
            <span><strong>&gt; 15°: Hazardous</strong> (Exceeds rover pitch threshold, no-go zone)</span>
          </div>
        </div>
      </div>
    )
  }

  if (activeLayer === 'Terrain hazards') {
    return (
      <div className="legend-card" id="legend-hazard">
        <div className="legend-header">
          <span className="legend-indicator" style={{ background: '#f97316' }} />
          <div>
            <h3 className="legend-title">TERRAIN HAZARD INDEX (RISK)</h3>
            <p className="legend-subtitle">Composite slope, boulder distribution & roughness</p>
          </div>
        </div>

        <div className="legend-bar hazard-gradient" />
        <div className="legend-labels">
          <span>0 (Smooth)</span>
          <span>20 (Moderate)</span>
          <span>40 (High)</span>
          <span>50+ (Untraversable)</span>
        </div>

        <div className="legend-meta">
          <div className="meta-item">
            <span className="meta-dot" style={{ background: '#0d9488' }} />
            <span><strong>0 – 20: Safe Regolith</strong> (Delta deposits & flat plains)</span>
          </div>
          <div className="meta-item">
            <span className="meta-dot" style={{ background: '#eab308' }} />
            <span><strong>20 – 40: Moderate Cost</strong> (Dune crests & rock fields)</span>
          </div>
          <div className="meta-item">
            <span className="meta-dot" style={{ background: '#ef4444' }} />
            <span><strong>≥ 50: Hard Obstacle</strong> (Crater scarps, A* impassable barrier)</span>
          </div>
        </div>
      </div>
    )
  }

  return null
}
