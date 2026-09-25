import { useRef, useState } from 'react'
import MarsGlobe, { showMissionRoute } from './components/MarsGlobe'
import type { Viewer } from 'cesium'

import './mars.css'

const layers = [
  'Elevation',
  'Slope',
  'Terrain hazards',
  'Science targets',
  'Perseverance',
]

export default function App() {
  const viewerRef = useRef<Viewer | null>(null)
  const [backendStatus, setBackendStatus] = useState('NOT TESTED')
  const [terrainInfo, setTerrainInfo] = useState<any>(null)
  const [routeLength, setRouteLength] = useState<number | null>(null)
  const [routeRisk, setRouteRisk] = useState<{
  mean: number
  max: number
} | null>(null)

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
          <h2 className="section-label">DATA LAYERS</h2>

          {layers.map((layer) => (
            <label className="layer" key={layer}>
              <input type="checkbox" disabled />
              {layer}
            </label>
          ))}

          <div className="layer-note">
            DATA LAYERS ARE CURRENTLY
            <br />
            INACTIVE.
            <br />
            <br />
            NASA terrain and mission data
            will be connected in upcoming
            development phases.
          </div>

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

          <MarsGlobe viewerRef={viewerRef} />
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