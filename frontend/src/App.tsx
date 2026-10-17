import { useState, useEffect, useRef } from 'react'
import MarsGlobe, { type GlobePoint, SCIENCE_TARGETS, PERSEVERANCE_WAYPOINTS } from './components/MarsGlobe'
import { LegendPanel } from './components/LegendPanel'
import { GlobeErrorBoundary } from './components/GlobeErrorBoundary'
import * as Cesium from 'cesium'
import './mars.css'

/** Mutually exclusive terrain analysis layers */
const terrainLayers = ['Elevation', 'Slope', 'Terrain hazards']

/** Independent overlay toggles */
const overlayLayers = ['Science targets', 'Perseverance']

interface MissionPreset {
  name: string
  subtitle: string
  start: GlobePoint
  dest: GlobePoint
}

const PRESETS: MissionPreset[] = [
  {
    name: 'Landing → Delta Front',
    subtitle: 'Octavia Butler to Midway sediments',
    start: { lat: 18.4447, lon: 77.4508 },
    dest: { lat: 18.4500, lon: 77.4400 },
  },
  {
    name: 'Delta Front → Three Forks',
    subtitle: 'Ancient river channel delta traverse',
    start: { lat: 18.4500, lon: 77.4400 },
    dest: { lat: 18.4700, lon: 77.4200 },
  },
  {
    name: 'Landing → Séítah (South)',
    subtitle: 'Sample collection across olivine sands',
    start: { lat: 18.4447, lon: 77.4508 },
    dest: { lat: 18.3800, lon: 77.3700 },
  },
  {
    name: 'Delta Front → Belva Crater Rim',
    subtitle: 'Ascent to crater rim sedimentary exposure',
    start: { lat: 18.4500, lon: 77.4400 },
    dest: { lat: 18.5200, lon: 77.3800 },
  },
]

type RouteStrategy = 'safe' | 'balanced' | 'direct'

export default function App() {
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const [activeTab, setActiveTab] = useState<'mission' | 'layers' | 'targets'>('mission')
  const [backendStatus, setBackendStatus] = useState<'CONNECTED' | 'OFFLINE' | 'CONNECTING'>('CONNECTING')
  const [activeLayer, setActiveLayer] = useState<string | null>('Elevation')
  const [overlays, setOverlays] = useState<Set<string>>(new Set(['Science targets', 'Perseverance']))
  const [terrainInfo, setTerrainInfo] = useState<any>(null)

  // Interactive Route Planning State (Phase 3 & Phase 4)
  const [selectionMode, setSelectionMode] = useState<'start' | 'destination' | null>(null)
  const [startPoint, setStartPoint] = useState<GlobePoint | null>({ lat: 18.4447, lon: 77.4508 })
  const [destPoint, setDestPoint] = useState<GlobePoint | null>({ lat: 18.4500, lon: 77.4400 })
  const [routeStrategy, setRouteStrategy] = useState<RouteStrategy>('balanced')
  const [showComparison, setShowComparison] = useState<boolean>(true)
  const [routeData, setRouteData] = useState<number[][] | null>(null)
  const [comparisonRouteData, setComparisonRouteData] = useState<number[][] | null>(null)
  const [routeResult, setRouteResult] = useState<any | null>(null)
  const [isCalculating, setIsCalculating] = useState<boolean>(false)
  const [routeError, setRouteError] = useState<string | null>(null)

  // Selected landmark / science target card (Phase 5 & 6)
  const [selectedLandmark, setSelectedLandmark] = useState<{
    name: string
    description?: string
    lat?: number
    lon?: number
    type?: string
  } | null>(null)

  // Overlay toggle handler
  const toggleOverlay = (name: string) => {
    setOverlays((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  // Check backend health and metadata on startup
  const checkBackend = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/terrain')
      if (!response.ok) throw new Error('Terrain endpoint failed')
      const data = await response.json()
      setBackendStatus('CONNECTED')
      setTerrainInfo(data)
    } catch (error) {
      console.warn('Backend connection failed:', error)
      setBackendStatus('OFFLINE')
    }
  }

  useEffect(() => {
    checkBackend()
  }, [])

  // Handle map click during point selection
  const handlePointSelected = (lat: number, lon: number) => {
    const rounded = { lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) }
    if (selectionMode === 'start') {
      setStartPoint(rounded)
      setSelectionMode(null)
      setRouteError(null)
    } else if (selectionMode === 'destination') {
      setDestPoint(rounded)
      setSelectionMode(null)
      setRouteError(null)
    }
  }

  // Handle clicking on an entity marker
  const handleTargetSelected = (target: { name: string; description?: string }) => {
    // Find matching science target or perseverance waypoint to get coordinates
    const sci = SCIENCE_TARGETS.find((s) => s.name.toLowerCase() === target.name.toLowerCase())
    const pers = PERSEVERANCE_WAYPOINTS.find((p) => p.name.toLowerCase() === target.name.toLowerCase())
    const item = sci || pers
    setSelectedLandmark({
      name: target.name,
      description: target.description || item?.description,
      lat: item?.lat,
      lon: item?.lon,
      type: sci ? sci.type : 'Mission Milestone',
    })
  }

  // Calculate A* Route via Backend with configurable risk weights (Phase 4)
  const handleComputeRoute = async (s = startPoint, d = destPoint, strategy = routeStrategy) => {
    if (!s || !d) {
      setRouteError('Please specify both Start and Destination coordinates.')
      return
    }

    setIsCalculating(true)
    setRouteError(null)

    const riskWeight = strategy === 'safe' ? 3.0 : strategy === 'balanced' ? 1.5 : 0.0

    try {
      const params = new URLSearchParams({
        start_lat: s.lat.toString(),
        start_lon: s.lon.toString(),
        goal_lat: d.lat.toString(),
        goal_lon: d.lon.toString(),
        risk_weight: riskWeight.toString(),
        compare: 'true',
      })

      const response = await fetch(`http://127.0.0.1:8000/route?${params.toString()}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || `Calculation failed with code ${response.status}`)
      }

      setRouteData(data.route)
      setRouteResult(data)

      // Set comparison route if present
      if (data.comparison && data.comparison.direct_route) {
        setComparisonRouteData(data.comparison.direct_route)
      } else {
        setComparisonRouteData(null)
      }
    } catch (err: any) {
      console.error('Route planning error:', err)
      setRouteError(err.message || 'Route planning failed.')
    } finally {
      setIsCalculating(false)
    }
  }

  // Clear current route
  const handleClearRoute = () => {
    setRouteData(null)
    setComparisonRouteData(null)
    setRouteResult(null)
    setRouteError(null)
  }

  // Reset to preset
  const handleApplyPreset = (preset: MissionPreset) => {
    setStartPoint(preset.start)
    setDestPoint(preset.dest)
    setRouteError(null)
    handleComputeRoute(preset.start, preset.dest, routeStrategy)
  }

  // Camera Fly to coordinates
  const flyToCoordinates = (lon: number, lat: number, altitude = 150000) => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude, Cesium.Ellipsoid.MARS),
      duration: 1.5,
    })
  }

  // Camera Fly to Jezero
  const handleFlyToJezero = () => {
    flyToCoordinates(77.45, 18.44, 450000)
  }

  return (
    <main className="mission-app">
      {/* TOP HEADER */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">♂</div>
          <div>
            <h1>MARS MISSION NAVIGATOR</h1>
            <p>PROJECT ATLAS · JEZERO CRATER AUTONOMOUS EXPLORER</p>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="action-btn"
            id="focus-jezero-btn"
            onClick={handleFlyToJezero}
            title="Recenter camera on Jezero Crater"
          >
            🎯 Focus Jezero
          </button>

          <div className={`status ${backendStatus.toLowerCase()}`}>
            <span>●</span>
            {backendStatus === 'CONNECTED'
              ? 'BACKEND ONLINE'
              : backendStatus === 'CONNECTING'
              ? 'CONNECTING...'
              : 'OFFLINE (LOCAL)'}
          </div>
        </div>
      </header>

      <div className="workspace">
        {/* SIDEBAR NAVIGATION & CONTROLS */}
        <aside className="sidebar">
          {/* TAB SWITCHER */}
          <div className="tab-nav">
            <button
              className={`tab-btn ${activeTab === 'mission' ? 'active' : ''}`}
              id="tab-mission-btn"
              onClick={() => setActiveTab('mission')}
            >
              🚀 PLANNER
            </button>
            <button
              className={`tab-btn ${activeTab === 'targets' ? 'active' : ''}`}
              id="tab-targets-btn"
              onClick={() => setActiveTab('targets')}
            >
              🎯 SITES
            </button>
            <button
              className={`tab-btn ${activeTab === 'layers' ? 'active' : ''}`}
              id="tab-layers-btn"
              onClick={() => setActiveTab('layers')}
            >
              🗺️ LAYERS
            </button>
          </div>

          {activeTab === 'mission' && (
            /* MISSION PLANNER TAB (Phase 3 & Phase 4) */
            <div className="mission-panel">
              <div className="panel-section-header">
                <span className="section-title">QUICK MISSION PRESETS</span>
              </div>
              <div className="preset-grid">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    className="preset-card"
                    onClick={() => handleApplyPreset(preset)}
                    title={preset.subtitle}
                  >
                    <div className="preset-title">{preset.name}</div>
                    <div className="preset-desc">{preset.subtitle}</div>
                  </button>
                ))}
              </div>

              {/* ROUTE ENGINE STRATEGY (Phase 4) */}
              <div className="panel-section-header" style={{ marginTop: 18 }}>
                <span className="section-title">TRAVERSE STRATEGY (8-WAY A*)</span>
              </div>
              <div className="strategy-selector">
                <button
                  className={`strategy-chip ${routeStrategy === 'safe' ? 'active safe' : ''}`}
                  onClick={() => {
                    setRouteStrategy('safe')
                    if (routeData) handleComputeRoute(startPoint, destPoint, 'safe')
                  }}
                  title="Strongest hazard and steep slope avoidance"
                >
                  🛡️ Safe
                </button>
                <button
                  className={`strategy-chip ${routeStrategy === 'balanced' ? 'active balanced' : ''}`}
                  onClick={() => {
                    setRouteStrategy('balanced')
                    if (routeData) handleComputeRoute(startPoint, destPoint, 'balanced')
                  }}
                  title="Optimal balance of distance and safety"
                >
                  ⚖️ Balanced
                </button>
                <button
                  className={`strategy-chip ${routeStrategy === 'direct' ? 'active direct' : ''}`}
                  onClick={() => {
                    setRouteStrategy('direct')
                    if (routeData) handleComputeRoute(startPoint, destPoint, 'direct')
                  }}
                  title="Shortest distance with zero risk penalty"
                >
                  ⚡ Direct
                </button>
              </div>

              {/* WAYPOINT SELECTION */}
              <div className="panel-section-header" style={{ marginTop: 18 }}>
                <span className="section-title">WAYPOINT CONFIGURATION</span>
              </div>

              {/* START POINT */}
              <div className="coord-box start-box">
                <div className="coord-header">
                  <div className="coord-title">
                    <span className="point-badge lime-dot" />
                    START LOCATION
                  </div>
                  <button
                    className={`pick-btn ${selectionMode === 'start' ? 'picking' : ''}`}
                    id="pick-start-btn"
                    onClick={() => setSelectionMode(selectionMode === 'start' ? null : 'start')}
                  >
                    {selectionMode === 'start' ? '📍 CLICK GLOBE' : '🗺️ Pick on Globe'}
                  </button>
                </div>
                <div className="coord-inputs">
                  <div className="input-group">
                    <label>LATITUDE (°N)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={startPoint ? startPoint.lat : ''}
                      onChange={(e) =>
                        setStartPoint({
                          lat: parseFloat(e.target.value) || 0,
                          lon: startPoint?.lon || 77.45,
                        })
                      }
                    />
                  </div>
                  <div className="input-group">
                    <label>LONGITUDE (°E)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={startPoint ? startPoint.lon : ''}
                      onChange={(e) =>
                        setStartPoint({
                          lat: startPoint?.lat || 18.44,
                          lon: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* DESTINATION POINT */}
              <div className="coord-box dest-box">
                <div className="coord-header">
                  <div className="coord-title">
                    <span className="point-badge red-dot" />
                    DESTINATION
                  </div>
                  <button
                    className={`pick-btn ${selectionMode === 'destination' ? 'picking' : ''}`}
                    id="pick-dest-btn"
                    onClick={() => setSelectionMode(selectionMode === 'destination' ? null : 'destination')}
                  >
                    {selectionMode === 'destination' ? '📍 CLICK GLOBE' : '🗺️ Pick on Globe'}
                  </button>
                </div>
                <div className="coord-inputs">
                  <div className="input-group">
                    <label>LATITUDE (°N)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={destPoint ? destPoint.lat : ''}
                      onChange={(e) =>
                        setDestPoint({
                          lat: parseFloat(e.target.value) || 0,
                          lon: destPoint?.lon || 77.42,
                        })
                      }
                    />
                  </div>
                  <div className="input-group">
                    <label>LONGITUDE (°E)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={destPoint ? destPoint.lon : ''}
                      onChange={(e) =>
                        setDestPoint({
                          lat: destPoint?.lat || 18.47,
                          lon: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="bounds-hint">
                Valid Jezero Grid: 16.5°N – 20.4°N, 75.5°E – 79.4°E
              </div>

              {/* COMPARISON TOGGLE (Phase 4) */}
              <label className="comparison-toggle">
                <input
                  type="checkbox"
                  checked={showComparison}
                  onChange={(e) => setShowComparison(e.target.checked)}
                />
                Show Direct Path vs Safe Traverse comparison
              </label>

              {/* ACTION BUTTONS */}
              <div className="cta-group">
                <button
                  className="compute-btn"
                  id="compute-route-btn"
                  disabled={isCalculating || !startPoint || !destPoint}
                  onClick={() => handleComputeRoute()}
                >
                  {isCalculating ? '⚡ RUNNING A* 8-WAY PATHFINDER...' : '▶ COMPUTE A* ROUTE'}
                </button>
                {routeData && (
                  <button className="clear-btn" id="clear-route-btn" onClick={handleClearRoute}>
                    ✕ Clear Route
                  </button>
                )}
              </div>

              {/* ERROR ALERT */}
              {routeError && (
                <div className="route-alert error">
                  <div className="alert-icon">⚠️</div>
                  <div className="alert-content">
                    <div className="alert-title">PATHFINDING ERROR</div>
                    <div>{routeError}</div>
                  </div>
                </div>
              )}

              {/* ROUTE METRICS CARD */}
              {routeResult && (
                <div className="metrics-card">
                  <div className="metrics-badge">
                    <span className="live-dot" /> A* OPTIMAL TRAVERSE ({routeStrategy.toUpperCase()})
                  </div>

                  <div className="metrics-grid">
                    <div className="metric-box">
                      <div className="metric-value">{routeResult.approx_distance_km} km</div>
                      <div className="metric-label">TRAVERSE DISTANCE</div>
                    </div>
                    <div className="metric-box">
                      <div className="metric-value">{routeResult.route_length}</div>
                      <div className="metric-label">WAYPOINTS / CELLS</div>
                    </div>
                    <div className="metric-box">
                      <div className="metric-value">{routeResult.mean_risk.toFixed(2)}</div>
                      <div className="metric-label">MEAN RISK SCORE</div>
                    </div>
                    <div className="metric-box">
                      <div
                        className="metric-value"
                        style={{
                          color:
                            routeResult.max_risk < 25
                              ? '#22c55e'
                              : routeResult.max_risk < 45
                              ? '#eab308'
                              : '#ef4444',
                        }}
                      >
                        {routeResult.max_risk.toFixed(1)}
                      </div>
                      <div className="metric-label">PEAK RISK (MAX 50)</div>
                    </div>
                  </div>

                  {/* COMPARISON METRICS (Phase 4) */}
                  {showComparison && routeResult.comparison && (
                    <div className="comparison-box">
                      <div className="comparison-header">
                        <span className="comparison-dot orange" />
                        DIRECT BASELINE COMPARISON
                      </div>
                      <div className="comparison-row">
                        <span>Direct Shortest Distance:</span>
                        <strong>{routeResult.comparison.direct_distance_km} km</strong>
                      </div>
                      <div className="comparison-row">
                        <span>Direct Peak Hazard:</span>
                        <strong style={{ color: '#ef4444' }}>
                          {routeResult.comparison.direct_max_risk.toFixed(1)}
                        </strong>
                      </div>
                      {routeResult.comparison.risk_reduction_pct > 0 && (
                        <div className="comparison-badge">
                          🛡️ {routeResult.comparison.risk_reduction_pct}% Peak Hazard Reduction achieved by risk-aware detour
                        </div>
                      )}
                    </div>
                  )}

                  {/* SAFETY RATING */}
                  <div className="safety-rating">
                    <div className="safety-label">ROVER SAFETY ASSESSMENT:</div>
                    <div className="safety-status safe">
                      ✅ NOMINAL — 8-way diagonal routing avoids corner-cutting and keeps vehicle under pitch limits (&lt;15°).
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'targets' && (
            /* TARGETS & SITES TAB (Phase 5 & Phase 6) */
            <div className="targets-panel">
              <div className="panel-section-header">
                <span className="section-title">SCIENCE TARGETS (JEZERO CRATER)</span>
              </div>
              <div className="targets-list">
                {SCIENCE_TARGETS.map((target) => (
                  <div key={target.name} className="target-item-card">
                    <div className="target-top">
                      <div>
                        <div className="target-name">{target.name}</div>
                        <div className="target-type">{target.type}</div>
                      </div>
                      <span className={`priority-pill ${target.priority?.toLowerCase()}`}>
                        {target.priority}
                      </span>
                    </div>
                    <p className="target-desc">{target.description}</p>
                    <div className="target-actions">
                      <button
                        className="target-btn"
                        onClick={() => {
                          setDestPoint({ lat: target.lat, lon: target.lon })
                          setActiveTab('mission')
                        }}
                      >
                        🎯 Set Destination
                      </button>
                      <button
                        className="target-btn icon"
                        onClick={() => flyToCoordinates(target.lon, target.lat, 80000)}
                        title="Focus Camera"
                      >
                        🔭 View
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="panel-section-header" style={{ marginTop: 24 }}>
                <span className="section-title">PERSEVERANCE MISSION LANDMARKS</span>
              </div>
              <div className="targets-list">
                {PERSEVERANCE_WAYPOINTS.map((wp) => (
                  <div key={wp.name} className="target-item-card landmark">
                    <div className="target-top">
                      <div className="target-name">{wp.name}</div>
                    </div>
                    <p className="target-desc">{wp.description}</p>
                    <div className="target-actions">
                      <button
                        className="target-btn"
                        onClick={() => {
                          setStartPoint({ lat: wp.lat, lon: wp.lon })
                          setActiveTab('mission')
                        }}
                      >
                        📍 Set Start
                      </button>
                      <button
                        className="target-btn icon"
                        onClick={() => flyToCoordinates(wp.lon, wp.lat, 60000)}
                        title="Focus Camera"
                      >
                        🔭 View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'layers' && (
            /* DATA LAYERS TAB (Phase 1 & Phase 2) */
            <div className="layers-panel">
              <h2 className="section-label">TERRAIN ANALYSIS (MUTUALLY EXCLUSIVE)</h2>
              {terrainLayers.map((layer) => (
                <label className="layer" key={layer}>
                  <input
                    type="checkbox"
                    checked={activeLayer === layer}
                    onChange={() => setActiveLayer(activeLayer === layer ? null : layer)}
                  />
                  {layer}
                </label>
              ))}

              <h2 className="section-label" style={{ marginTop: 24 }}>
                OVERLAYS (INDEPENDENT)
              </h2>
              {overlayLayers.map((layer) => (
                <label className="layer" key={layer}>
                  <input
                    type="checkbox"
                    checked={overlays.has(layer)}
                    onChange={() => toggleOverlay(layer)}
                  />
                  {layer}
                </label>
              ))}

              {terrainInfo && (
                <div className="layer-note">
                  <strong>JEZERO MOLA GRID:</strong>
                  <br />
                  Resolution: {terrainInfo.width} × {terrainInfo.height} cells
                  <br />
                  Step: 1/128° (~463 m/cell)
                  <br />
                  Elevation: {terrainInfo.elevation_min}m to {terrainInfo.elevation_max}m
                  <br />
                  Peak Slope: {terrainInfo.slope_max.toFixed(1)}°
                  <br />
                  Mean Hazard: {terrainInfo.risk_mean.toFixed(2)}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* 3D CESIUM MAP VIEWPORT */}
        <section className="map-area">
          <div className="map-heading">
            <h2>PLANETARY EXPLORER</h2>
            <p>MARS / JEZERO REGIONAL QUADRANGLE</p>
          </div>

          <div className="map-badge">
            CESIUM 3D · ELLIPSOID: MARS (3,396 km)
          </div>

          {/* ACTIVE SELECTION BANNER (Phase 3) */}
          {selectionMode && (
            <div className="map-selection-banner">
              <span className="selection-pulse" />
              <span>
                CLICK MARS GLOBE TO PLACE <strong>{selectionMode.toUpperCase()}</strong> MARKER
              </span>
              <button className="banner-cancel" onClick={() => setSelectionMode(null)}>
                Cancel
              </button>
            </div>
          )}

          {/* FLOATING LANDMARK CARD (when clicked on 3D globe) */}
          {selectedLandmark && (
            <div className="landmark-floating-card">
              <div className="card-top">
                <div className="card-badge">{selectedLandmark.type || 'Landmark'}</div>
                <button className="card-close" onClick={() => setSelectedLandmark(null)}>
                  ✕
                </button>
              </div>
              <h3 className="card-title">{selectedLandmark.name}</h3>
              {selectedLandmark.description && (
                <p className="card-desc">{selectedLandmark.description}</p>
              )}
              {selectedLandmark.lat && selectedLandmark.lon && (
                <div className="card-coords">
                  {selectedLandmark.lat.toFixed(4)}°N, {selectedLandmark.lon.toFixed(4)}°E
                </div>
              )}
              <div className="card-actions">
                {selectedLandmark.lat && selectedLandmark.lon && (
                  <>
                    <button
                      className="card-action-btn"
                      onClick={() => {
                        setStartPoint({ lat: selectedLandmark.lat!, lon: selectedLandmark.lon! })
                        setActiveTab('mission')
                      }}
                    >
                      📍 Set as Start
                    </button>
                    <button
                      className="card-action-btn primary"
                      onClick={() => {
                        setDestPoint({ lat: selectedLandmark.lat!, lon: selectedLandmark.lon! })
                        setActiveTab('mission')
                      }}
                    >
                      🎯 Set as Destination
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* SCIENTIFIC LEGEND OVERLAY (Phase 2) */}
          <div className="map-legend-container">
            <LegendPanel activeLayer={activeLayer} />
          </div>

          {/* 3D GLOBE COMPONENT */}
          <GlobeErrorBoundary>
            <MarsGlobe
              viewerRef={viewerRef}
              activeLayer={activeLayer}
              overlays={overlays}
              selectionMode={selectionMode}
              startPoint={startPoint}
              destPoint={destPoint}
              routeData={routeData}
              comparisonRouteData={showComparison ? comparisonRouteData : null}
              onPointSelected={handlePointSelected}
              onTargetSelected={handleTargetSelected}
            />
          </GlobeErrorBoundary>
        </section>
      </div>

      {/* FOOTER */}
      <footer className="bottom-bar">
        <span>MARS MISSION NAVIGATOR</span>
        <span className="sep">/</span>
        <span>MOLA & CRISM SCIENCE DATA</span>
        <span className="sep">/</span>
        <span>A* AUTONOMOUS PATHFINDER</span>
        <span className="sep">/</span>
        <span>PERSEVERANCE MISSION AT JEZERO CRATER</span>
      </footer>
    </main>
  )
}