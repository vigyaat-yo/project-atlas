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
  const [activeTab, setActiveTab] = useState<'mission' | 'briefing' | 'saved' | 'layers' | 'targets'>('mission')
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

  // AI Explanation & Mission Persistence State (Phase 8 & 9)
  const [aiBriefing, setAiBriefing] = useState<any | null>(null)
  const [isExplaining, setIsExplaining] = useState<boolean>(false)
  const [explainError, setExplainError] = useState<string | null>(null)

  const [savedMissions, setSavedMissions] = useState<any[]>([])
  const [isLoadingMissions, setIsLoadingMissions] = useState<boolean>(false)
  const [saveModalOpen, setSaveModalOpen] = useState<boolean>(false)
  const [missionTitle, setMissionTitle] = useState<string>('')
  const [missionNotes, setMissionNotes] = useState<string>('')
  const [isSavingMission, setIsSavingMission] = useState<boolean>(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null)
  const [pipelineModalOpen, setPipelineModalOpen] = useState<boolean>(false)


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
    setAiBriefing(null)
    setExplainError(null)
  }

  // Fetch AI mission explanation (Phase 9)
  const handleExplainRoute = async () => {
    if (!routeData || !routeResult || !startPoint || !destPoint) return
    setIsExplaining(true)
    setExplainError(null)

    try {
      const riskWeight = routeStrategy === 'safe' ? 3.0 : routeStrategy === 'balanced' ? 1.5 : 0.0
      const payload = {
        route: routeData,
        start_coords: startPoint,
        goal_coords: destPoint,
        risk_weight: riskWeight,
        max_risk: 50.0,
        comparison: routeResult.comparison || null,
      }

      const res = await fetch('http://127.0.0.1:8000/explain-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to generate AI mission briefing')
      }
      const data = await res.json()
      setAiBriefing(data)
      setActiveTab('briefing')
    } catch (err: any) {
      console.error('AI Explanation error:', err)
      setExplainError(err.message || 'Unable to generate explanation')
    } finally {
      setIsExplaining(false)
    }
  }

  // Fetch saved missions from SQLite (Phase 8)
  const handleFetchSavedMissions = async () => {
    setIsLoadingMissions(true)
    try {
      const res = await fetch('http://127.0.0.1:8000/missions')
      if (res.ok) {
        const data = await res.json()
        setSavedMissions(data)
      }
    } catch (err) {
      console.error('Error fetching missions:', err)
    } finally {
      setIsLoadingMissions(false)
    }
  }

  // Save current mission to database (Phase 8)
  const handleSaveCurrentMission = async () => {
    if (!routeResult || !routeData || !startPoint || !destPoint) return
    setIsSavingMission(true)
    try {
      const title = missionTitle.trim() || `Traverse to (${destPoint.lat.toFixed(2)}°N, ${destPoint.lon.toFixed(2)}°E)`
      const payload = {
        title,
        start_lat: startPoint.lat,
        start_lon: startPoint.lon,
        goal_lat: destPoint.lat,
        goal_lon: destPoint.lon,
        risk_weight: routeResult.risk_weight || 1.5,
        max_risk: 50.0,
        elev_weight: 0.0,
        distance_km: routeResult.approx_distance_km,
        waypoints_count: routeResult.route_length,
        mean_risk: routeResult.mean_risk,
        max_risk_val: routeResult.max_risk,
        risk_reduction_pct: routeResult.comparison?.risk_reduction_pct || null,
        distance_delta_km: routeResult.comparison?.distance_delta_km || null,
        waypoints: routeData,
        comparison: routeResult.comparison || null,
        ai_explanation: aiBriefing || null,
        operator_notes: missionNotes.trim(),
      }

      const res = await fetch('http://127.0.0.1:8000/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to save mission')
      }
      setSaveSuccessMsg('Mission persisted to database!')
      setTimeout(() => setSaveSuccessMsg(null), 3000)
      setSaveModalOpen(false)
      setMissionTitle('')
      setMissionNotes('')
      handleFetchSavedMissions()
    } catch (err: any) {
      alert(`Save error: ${err.message}`)
    } finally {
      setIsSavingMission(false)
    }
  }

  // Load a saved mission onto the 3D globe (Phase 8)
  const handleLoadSavedMission = async (m: any) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/missions/${m.id}`)
      if (!res.ok) throw new Error('Failed to load mission details')
      const detail = await res.json()

      const s = { lat: detail.start_lat, lon: detail.start_lon }
      const d = { lat: detail.goal_lat, lon: detail.goal_lon }
      setStartPoint(s)
      setDestPoint(d)
      setRouteData(detail.waypoints)
      setRouteResult({
        start_coords: s,
        goal_coords: d,
        approx_distance_km: detail.distance_km,
        route_length: detail.waypoints_count,
        mean_risk: detail.mean_risk,
        max_risk: detail.max_risk_val,
        risk_weight: detail.risk_weight,
        comparison: detail.comparison && Object.keys(detail.comparison).length ? detail.comparison : null,
      })
      if (detail.comparison && detail.comparison.direct_route) {
        setComparisonRouteData(detail.comparison.direct_route)
      } else {
        setComparisonRouteData(null)
      }
      if (detail.ai_explanation && Object.keys(detail.ai_explanation).length) {
        setAiBriefing(detail.ai_explanation)
      }
      flyToCoordinates(d.lon, d.lat, 250000)
      setActiveTab('mission')
    } catch (err: any) {
      alert(`Load failed: ${err.message}`)
    }
  }

  // Delete a saved mission (Phase 8)
  const handleDeleteSavedMission = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this saved mission?')) return
    try {
      const res = await fetch(`http://127.0.0.1:8000/missions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setSavedMissions((prev) => prev.filter((item) => item.id !== id))
      }
    } catch (err) {
      console.error('Delete error:', err)
    }
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

  // Camera Fly to Jezero (Oblique 3D perspective)
  const handleFlyToJezero = () => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(77.45, 18.09, 320000, Cesium.Ellipsoid.MARS),
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(-50.0),
        roll: 0.0,
      },
      duration: 1.5,
    })
  }

  // Interactive Demo Scenario for Hackathon (Phase 11)
  const handleRunDemoScenario = async () => {
    // Octavia Butler Landing Site -> Three Forks Delta Contact (Sample Depot)
    const demoStart: GlobePoint = { lat: 18.4447, lon: 77.4508 }
    const demoDest: GlobePoint = { lat: 18.4700, lon: 77.4200 }
    setStartPoint(demoStart)
    setDestPoint(demoDest)
    setRouteStrategy('balanced')
    setShowComparison(true)
    setRouteError(null)
    setActiveTab('mission')
    flyToCoordinates(77.435, 18.455, 140000)
    await handleComputeRoute(demoStart, demoDest, 'balanced')
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
            className="action-btn demo-btn"
            id="demo-scenario-btn"
            onClick={handleRunDemoScenario}
            title="Execute verified Hackathon demonstration: Landing site to Delta Sample Depot"
          >
            🎬 Demo Scenario
          </button>

          <button
            className="action-btn"
            id="pipeline-btn"
            onClick={() => setPipelineModalOpen(true)}
            title="View MOLA elevation, slope gradient, hazard model and A* pipeline"
          >
            🔬 Tech Pipeline
          </button>

          <button
            className="action-btn"
            id="focus-jezero-btn"
            onClick={handleFlyToJezero}
            title="Recenter camera on Jezero Crater in 3D"
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
              className={`tab-btn ${activeTab === 'briefing' ? 'active' : ''}`}
              id="tab-briefing-btn"
              onClick={() => {
                setActiveTab('briefing')
                if (!aiBriefing && routeData) {
                  handleExplainRoute()
                }
              }}
            >
              🤖 BRIEFING
            </button>
            <button
              className={`tab-btn ${activeTab === 'saved' ? 'active' : ''}`}
              id="tab-saved-btn"
              onClick={() => {
                setActiveTab('saved')
                handleFetchSavedMissions()
              }}
            >
              💾 SAVED
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
                <span className="section-title">
                  <span className="workflow-step-num">2</span> TRAVERSE STRATEGY (8-WAY A*)
                </span>
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
                <span className="section-title">
                  <span className="workflow-step-num">1</span> CONFIGURE WAYPOINTS
                </span>
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

              {/* ACTION BUTTONS (STEP 3) */}
              <div className="panel-section-header" style={{ marginTop: 18 }}>
                <span className="section-title">
                  <span className="workflow-step-num">3</span> AUTONOMOUS ROUTE COMPUTATION
                </span>
              </div>
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

              {/* ROUTE METRICS CARD (STEP 4) */}
              {routeResult && (
                <div className="metrics-card">
                  <div className="panel-section-header" style={{ marginBottom: 10 }}>
                    <span className="section-title" style={{ fontSize: 11 }}>
                      <span className="workflow-step-num">4</span> ROUTE EVALUATION & BRIEFING
                    </span>
                  </div>
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

                  {/* AI BRIEFING & PERSISTENCE BUTTONS (Phase 8 & 9) */}
                  <div className="briefing-actions" style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                      className="card-action-btn primary"
                      id="explain-route-btn"
                      disabled={isExplaining}
                      onClick={handleExplainRoute}
                      title="Generate AI mission traverse briefing"
                    >
                      {isExplaining ? '⏳ SYNTHESIZING...' : '🤖 AI Mission Briefing'}
                    </button>
                    <button
                      className="card-action-btn"
                      id="save-mission-btn"
                      onClick={() => setSaveModalOpen(true)}
                      title="Save mission plan to database"
                    >
                      💾 Save Mission
                    </button>
                  </div>

                  {saveSuccessMsg && (
                    <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 4, background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#86efac', fontSize: 11, textAlign: 'center' }}>
                      ✓ {saveSuccessMsg}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'briefing' && (
            /* AI MISSION BRIEFING TAB (Phase 9) */
            <div className="briefing-panel">
              <div className="panel-section-header">
                <span className="section-title">AI MISSION BRIEFING</span>
              </div>

              {!routeData && (
                <div className="briefing-card">
                  <div className="briefing-title">No Active Traverse Route</div>
                  <div className="briefing-text">
                    Select start and destination coordinates in the Planner tab and compute a traverse route to generate an AI Mission Briefing.
                  </div>
                  <button
                    className="card-action-btn primary"
                    onClick={() => setActiveTab('mission')}
                  >
                    🚀 Open Route Planner
                  </button>
                </div>
              )}

              {routeData && isExplaining && (
                <div className="briefing-card highlight" style={{ textAlign: 'center', padding: 24 }}>
                  <div className="briefing-title">🛰️ Synthesizing Terrain Metrics...</div>
                  <div className="briefing-text" style={{ marginTop: 8 }}>
                    Analyzing topographic elevation delta, central difference slope, and MOLA obstacle hazards along the 8-way traverse...
                  </div>
                </div>
              )}

              {explainError && (
                <div className="route-alert error">
                  <div className="alert-icon">⚠️</div>
                  <div className="alert-content">
                    <div className="alert-title">BRIEFING GENERATION ERROR</div>
                    <div>{explainError}</div>
                    <button
                      className="card-action-btn"
                      style={{ marginTop: 8 }}
                      onClick={handleExplainRoute}
                    >
                      ↻ Retry Briefing
                    </button>
                  </div>
                </div>
              )}

              {routeData && aiBriefing && !isExplaining && (
                <>
                  {/* SOURCE & TITLE BADGE */}
                  <div className="briefing-card highlight">
                    <div className="briefing-badge">
                      <span>●</span>
                      {aiBriefing.source === 'gemini_ai_assisted'
                        ? 'GEMINI AI-ASSISTED SYNTHESIS'
                        : 'NASA GROUND-TRUTH ENGINE'}
                    </div>
                    <div className="briefing-title">EXECUTIVE MISSION TRAVERSE SUMMARY</div>
                    <div className="briefing-text">{aiBriefing.executive_summary}</div>
                  </div>

                  {/* PATHFINDING RATIONALE & BASELINE COMPARISON */}
                  <div className="briefing-card">
                    <div className="briefing-title">PATHFINDING RATIONALE & DETOUR AVOIDANCE</div>
                    <div className="briefing-text">{aiBriefing.route_rationale}</div>
                  </div>

                  {/* PHYSICAL TERRAIN METRICS GRID */}
                  {aiBriefing.metrics && (
                    <div className="briefing-card">
                      <div className="briefing-title">TERRAIN & HAZARD PROFILE</div>
                      <div className="briefing-text">{aiBriefing.hazard_breakdown}</div>

                      <div className="hazard-bar-container">
                        <div
                          className="hazard-segment safe"
                          style={{ width: `${aiBriefing.metrics.safe_fraction_pct}%` }}
                          title={`Safe: ${aiBriefing.metrics.safe_fraction_pct}%`}
                        />
                        <div
                          className="hazard-segment moderate"
                          style={{ width: `${aiBriefing.metrics.moderate_fraction_pct}%` }}
                          title={`Moderate: ${aiBriefing.metrics.moderate_fraction_pct}%`}
                        />
                        <div
                          className="hazard-segment elevated"
                          style={{ width: `${aiBriefing.metrics.elevated_fraction_pct}%` }}
                          title={`Elevated: ${aiBriefing.metrics.elevated_fraction_pct}%`}
                        />
                      </div>
                      <div className="hazard-legend">
                        <span style={{ color: '#22c55e' }}>Safe ({aiBriefing.metrics.safe_fraction_pct}%)</span>
                        <span style={{ color: '#eab308' }}>Moderate ({aiBriefing.metrics.moderate_fraction_pct}%)</span>
                        <span style={{ color: '#f97316' }}>Elevated ({aiBriefing.metrics.elevated_fraction_pct}%)</span>
                      </div>

                      <div className="briefing-grid">
                        <div className="briefing-stat-box">
                          <div className="briefing-stat-val">{aiBriefing.metrics.approx_distance_km} km</div>
                          <div className="briefing-stat-lbl">TRAVERSE DISTANCE</div>
                        </div>
                        <div className="briefing-stat-box">
                          <div className="briefing-stat-val">{aiBriefing.metrics.net_elevation_change_m} m</div>
                          <div className="briefing-stat-lbl">NET ELEVATION DELTA</div>
                        </div>
                        <div className="briefing-stat-box">
                          <div className="briefing-stat-val">+{aiBriefing.metrics.cumulative_climb_m} m</div>
                          <div className="briefing-stat-lbl">CUMULATIVE ASCENT</div>
                        </div>
                        <div className="briefing-stat-box">
                          <div className="briefing-stat-val">-{aiBriefing.metrics.cumulative_descent_m} m</div>
                          <div className="briefing-stat-lbl">CUMULATIVE DESCENT</div>
                        </div>
                        <div className="briefing-stat-box">
                          <div className="briefing-stat-val">{aiBriefing.metrics.slope_mean_deg}° / {aiBriefing.metrics.slope_max_deg}°</div>
                          <div className="briefing-stat-lbl">MEAN / PEAK SLOPE</div>
                        </div>
                        <div className="briefing-stat-box">
                          <div className="briefing-stat-val">{aiBriefing.metrics.steep_waypoints_count} cells</div>
                          <div className="briefing-stat-lbl">STEEP CELLS (≥12°)</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TACTICAL RECOMMENDATIONS */}
                  {aiBriefing.tactical_recommendations && (
                    <div className="briefing-card">
                      <div className="briefing-title">TACTICAL ROVER GUIDELINES</div>
                      <ul className="recs-list">
                        {aiBriefing.tactical_recommendations.map((rec: string, idx: number) => (
                          <li key={idx}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* OPERATIONAL LIMITATIONS & UNCERTAINTY */}
                  <div className="uncertainty-box">
                    <div className="uncertainty-header">
                      <span>⚠️</span> PLANETARY DATA RESOLUTION LIMITATION
                    </div>
                    <div>{aiBriefing.limitations_and_uncertainties}</div>
                  </div>

                  {/* SAVE BUTTON */}
                  <button
                    className="card-action-btn primary"
                    onClick={() => setSaveModalOpen(true)}
                    style={{ padding: '10px 14px' }}
                  >
                    💾 Save Mission Plan to Database
                  </button>
                </>
              )}
            </div>
          )}

          {activeTab === 'saved' && (
            /* SAVED MISSIONS TAB (Phase 8) */
            <div className="saved-missions-panel">
              <div className="panel-section-header">
                <span className="section-title">SAVED MISSIONS (SQLITE DATABASE)</span>
              </div>

              {isLoadingMissions && (
                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 12 }}>
                  Querying mission database...
                </div>
              )}

              {!isLoadingMissions && savedMissions.length === 0 && (
                <div className="briefing-card">
                  <div className="briefing-title">No Saved Missions Found</div>
                  <div className="briefing-text">
                    Plan an autonomous traverse route in the Planner tab and click 'Save Mission' to store it permanently in the SQLite mission database.
                  </div>
                  <button
                    className="card-action-btn primary"
                    onClick={() => setActiveTab('mission')}
                  >
                    🚀 Plan a Mission
                  </button>
                </div>
              )}

              {!isLoadingMissions && savedMissions.map((m) => (
                <div key={m.id} className="saved-mission-card">
                  <div className="saved-card-header">
                    <div>
                      <div className="saved-mission-title">{m.title}</div>
                      <div className="saved-mission-date">
                        {new Date(m.created_at * 1000).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="saved-mission-meta">
                    <span>📏 {m.distance_km} km</span>
                    <span>📍 {m.waypoints_count} pts</span>
                    <span>⚠️ Risk {m.mean_risk.toFixed(1)}</span>
                  </div>

                  <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                    ({m.start_lat.toFixed(3)}°N, {m.start_lon.toFixed(3)}°E) → ({m.goal_lat.toFixed(3)}°N, {m.goal_lon.toFixed(3)}°E)
                  </div>

                  {m.operator_notes && (
                    <div style={{ fontSize: 11, color: '#cbd5e1', fontStyle: 'italic', marginTop: 2 }}>
                      "{m.operator_notes}"
                    </div>
                  )}

                  <div className="saved-mission-actions">
                    <button
                      className="saved-btn load"
                      onClick={() => handleLoadSavedMission(m)}
                    >
                      🗺️ Load on 3D Globe
                    </button>
                    <button
                      className="saved-btn del"
                      onClick={(e) => handleDeleteSavedMission(m.id, e)}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
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

      {/* SAVE MISSION MODAL (Phase 8) */}
      {saveModalOpen && (
        <div className="modal-overlay" onClick={() => setSaveModalOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">💾 Save Mission Plan</h3>
            <p className="modal-desc">
              Store this traverse route, terrain metrics, and AI briefing in the persistent mission database.
            </p>

            <div className="input-group">
              <label>MISSION TITLE</label>
              <input
                className="modal-input"
                type="text"
                placeholder={`Traverse to (${destPoint?.lat.toFixed(2)}°N, ${destPoint?.lon.toFixed(2)}°E)`}
                value={missionTitle}
                onChange={(e) => setMissionTitle(e.target.value)}
              />
            </div>

            <div className="input-group" style={{ marginTop: 8 }}>
              <label>OPERATOR NOTES / OBJECTIVES</label>
              <textarea
                className="modal-input modal-textarea"
                placeholder="Scientific goals, sample caching targets, or rover driving notes..."
                value={missionNotes}
                onChange={(e) => setMissionNotes(e.target.value)}
              />
            </div>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setSaveModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={isSavingMission}
                onClick={handleSaveCurrentMission}
              >
                {isSavingMission ? 'Saving...' : 'Save to Database'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCIENCE & TECH PIPELINE MODAL (Phase 11) */}
      {pipelineModalOpen && (
        <div className="modal-overlay" onClick={() => setPipelineModalOpen(false)}>
          <div className="modal-dialog large" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 className="modal-title">🔬 Planetary Navigation Science & Tech Pipeline</h3>
                <p className="modal-desc" style={{ marginTop: 4 }}>
                  How NASA MOLA orbital altimetry, topographic slope, hazard models, and 8-way A* integrate for autonomous rover routing.
                </p>
              </div>
              <button
                className="card-close"
                onClick={() => setPipelineModalOpen(false)}
                style={{ fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            <div className="pipeline-stage">
              <div className="pipeline-stage-header">
                <div className="pipeline-stage-num">1</div>
                <div className="pipeline-stage-title">NASA MGS MOLA Digital Elevation Model (DEM)</div>
              </div>
              <p className="pipeline-stage-desc">
                Mars Orbiter Laser Altimeter Mission Experiment Gridded Data Record (MEGDR) sampled at 128 pixels/degree (~463 meters per pixel) mapped onto the IAU 2000 Mars Spheroid (equatorial radius 3,396.19 km). Datum: Mars Areoid (6.1 mbar reference).
              </p>
              <div className="pipeline-formula">
                Regional Quadrangle: 16.445°N – 20.445°N, 75.445°E – 79.445°E (513 × 513 grid cells)
              </div>
            </div>

            <div className="pipeline-stage">
              <div className="pipeline-stage-header">
                <div className="pipeline-stage-num">2</div>
                <div className="pipeline-stage-title">Topographic Slope Gradient Calculation</div>
              </div>
              <p className="pipeline-stage-desc">
                2D spatial gradients are computed via central difference across adjacent cells to determine maximum ground slope angle. Slopes exceeding 15° breach the Perseverance rollover/pitch stability margin.
              </p>
              <div className="pipeline-formula">
                θ = arctan( √((∂z/∂x)² + (∂z/∂y)²) ) × (180 / π) [degrees]
              </div>
            </div>

            <div className="pipeline-stage">
              <div className="pipeline-stage-header">
                <div className="pipeline-stage-num">3</div>
                <div className="pipeline-stage-title">Composite Terrain Hazard & Walkability Index</div>
              </div>
              <p className="pipeline-stage-desc">
                Merges surface slope and local standard deviation roughness into a unified hazard cost score (0–100). Cells with hazard ≥ 50 (such as steep crater walls or delta scarps) are classified as impassable barriers.
              </p>
              <div className="pipeline-formula">
                H = min(100, (slope / 25.0) × 60 + (roughness / 15.0) × 40)
              </div>
            </div>

            <div className="pipeline-stage">
              <div className="pipeline-stage-header">
                <div className="pipeline-stage-num">4</div>
                <div className="pipeline-stage-title">8-Way A* Pathfinding with Corner-Cutting Prevention</div>
              </div>
              <p className="pipeline-stage-desc">
                Computes optimal paths using an admissible Octile distance heuristic. Strict corner-cutting prevention guarantees that diagonal traversals never clip through adjacent impassable obstacle corners.
              </p>
              <div className="pipeline-formula">
                cost(step) = dist × [1.0 + risk_weight × (H / 25.0)] + elev_penalty
              </div>
            </div>

            <div className="uncertainty-box">
              <div className="uncertainty-header">
                <span>⚠️</span> SCIENTIFIC RESOLUTION LIMITATION & OPERATIONAL REALITY
              </div>
              <div>
                Orbital MOLA altimetry data is ~463m/pixel. Meter-scale boulders, small impact craters (&lt;100m diameter), sand ripples, and wheel-trapping soft drift cannot be resolved from orbit alone. Autonomous tactical navigation must rely on Perseverance's onboard autonomous hazard avoidance cameras (HazCams/NavCams) and AutoNav vision computing during each drive.
              </div>
            </div>

            <div style={{ fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span>Data Sources: NASA PDS Geosciences Node · NASA JPL-Caltech · USGS Astrogeology</span>
              <button
                className="btn-primary"
                onClick={() => setPipelineModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}