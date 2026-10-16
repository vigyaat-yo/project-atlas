import { useRef, useState } from 'react'
import MarsGlobe, { showMissionRoute } from './components/MarsGlobe'
import type { Viewer } from 'cesium'

import './mars.css'

/** Mutually exclusive terrain analysis layers */
const terrainLayers = ['Elevation', 'Slope', 'Terrain hazards']

/** Independent overlay toggles */
const overlayLayers = ['Science targets', 'Perseverance']

export default function App() {
  const viewerRef = useRef<Viewer | null>(null)
  const [backendStatus, setBackendStatus] = useState('NOT TESTED')
  const [activeLayer, setActiveLayer] = useState<string | null>(null)
  const [overlays, setOverlays] = useState<Set<string>>(new Set())
  const [terrainInfo, setTerrainInfo] = useState<any>(null)
  const [routeLength, setRouteLength] = useState<number | null>(null)
  const [routeRisk, setRouteRisk] = useState<{
  mean: number
  max: number
} | null>(null)

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

  const checkBackend = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/terrain')
      const data = await response.json()

      console.log('MARSWAY TERRAIN:', data)
      setBackendStatus('CONNECTED')
      setTerrainInfo(data)
    } catch (error) {
      console.error('Backend connection failed:', error)
      setBackendStatus('OFFLINE')
    }
  }

  const checkRoute = async () => {
  try {
    const response = await fetch('http://127.0.0.1:8000/route')
    const data = await response.json()

    console.log('MARSWAY ROUTE:', data)
    setRouteLength(data.route_length)
    setRouteRisk({
  mean: data.mean_risk,
  max: data.max_risk,
})
if (viewerRef.current) {
  showMissionRoute(viewerRef.current, data.route)
}
  } catch (error) {
    console.error('Route request failed:', error)
  }
}

  return (
    <main className="mission-app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">♂</div>

          <div>
            <h1>MARS MISSION NAVIGATOR</h1>
            <p>PLANETARY EXPLORATION SYSTEM</p>
          </div>
        </div>

        <div className="status">
          <span>●</span> SYSTEM ONLINE
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <h2 className="section-label">TERRAIN ANALYSIS</h2>

          {terrainLayers.map((layer) => (
            <label className="layer" key={layer}>
              <input
                type="checkbox"
                checked={activeLayer === layer}
                onChange={() =>
                  setActiveLayer(activeLayer === layer ? null : layer)
                }
              />
              {layer}
            </label>
          ))}

          <h2 className="section-label" style={{ marginTop: 24 }}>
            OVERLAYS
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

          {(activeLayer || overlays.size > 0) && (
            <div className="layer-note">
              {activeLayer && (
                <>
                  ACTIVE LAYER:
                  <br />
                  {activeLayer}
                </>
              )}
              {activeLayer && overlays.size > 0 && (
                <>
                  <br />
                  <br />
                </>
              )}
              {overlays.size > 0 && (
                <>
                  OVERLAYS:
                  <br />
                  {[...overlays].join(', ')}
                </>
              )}
            </div>
          )}

          <button onClick={checkBackend}>
            Test Terrain API
          </button>
          <button onClick={checkRoute}>
            Test A* Route
          </button>

          <div className="layer-note">
            BACKEND STATUS:
            <br />
            {backendStatus}
          </div>
          {routeLength !== null && routeRisk !== null && (
  <div className="layer-note">
    A* ROUTE
    <br />
    LENGTH: {routeLength} CELLS
    <br />
    MEAN RISK: {routeRisk.mean.toFixed(2)}
    <br />
    MAX RISK: {routeRisk.max.toFixed(2)}
  </div>
)}
          {terrainInfo && (
  <div className="layer-note">
    TERRAIN: {terrainInfo.name}
    <br />
    GRID: {terrainInfo.width} × {terrainInfo.height}
    <br />
    ELEVATION: {terrainInfo.elevation_min}m → {terrainInfo.elevation_max}m
    <br />
    MAX SLOPE: {terrainInfo.slope_max.toFixed(2)}°
    <br />
    MEAN RISK: {terrainInfo.risk_mean.toFixed(2)}
  </div>
        )}
        </aside>

        <section className="map-area">
          <div className="map-heading">
            <h2>PLANETARY EXPLORER</h2>
            <p>MARS / GLOBAL VIEW</p>
          </div>

          <div className="map-badge">
            3D VIEWPORT · PROTOTYPE
          </div>

          <MarsGlobe
            viewerRef={viewerRef}
            activeLayer={activeLayer}
            overlays={overlays}
          />
        </section>
      </div>

      <footer className="bottom-bar">
        MARS MISSION NAVIGATOR &nbsp; / &nbsp;
        EXPLORER MODULE &nbsp; / &nbsp;
        PROTOTYPE BUILD
      </footer>
    </main>
  )
}