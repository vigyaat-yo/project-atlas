import globalTerrain from '../../../data/processed/mars_global_terrain.json'
import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// ----------------------------------------------------------------
// JEZERO GRID CONSTANTS (matching backend)
// ----------------------------------------------------------------

const GRID_LAT_START = 20.4453125
const GRID_LON_START = 75.4453125
const GRID_STEP = 0.0078125
const GRID_ROWS = 513
const GRID_COLS = 513
const GRID_LAT_END = GRID_LAT_START - (GRID_ROWS - 1) * GRID_STEP
const GRID_LON_END = GRID_LON_START + (GRID_COLS - 1) * GRID_STEP

// ----------------------------------------------------------------
// ROUTE VISUALIZATION (legacy export for test button)
// ----------------------------------------------------------------

export function showMissionRoute(
  viewer: Cesium.Viewer,
  route: number[][],
) {
  const positions = route.map(([row, col]) => {
    const latitude = GRID_LAT_START - row * GRID_STEP
    const longitude = GRID_LON_START + col * GRID_STEP

    return Cesium.Cartesian3.fromDegrees(
      longitude,
      latitude,
      0,
      Cesium.Ellipsoid.MARS,
    )
  })

  viewer.entities.add({
    name: 'A* Mission Route',
    polyline: {
      positions,
      width: 5,
      material: Cesium.Color.CYAN,
    },
  })
}

// ----------------------------------------------------------------
// COLOR RAMPS
// ----------------------------------------------------------------

type RGBA = [number, number, number, number]

function elevationToColor(
  value: number,
  min: number,
  max: number,
): RGBA {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  let r: number, g: number, b: number

  if (t < 0.15) {
    const s = t / 0.15
    r = 0.05; g = 0.0; b = 0.3 + 0.7 * s
  } else if (t < 0.30) {
    const s = (t - 0.15) / 0.15
    r = 0.0; g = s * 0.8; b = 1.0
  } else if (t < 0.45) {
    const s = (t - 0.30) / 0.15
    r = 0.0; g = 0.8 + 0.2 * s; b = 1.0 - s
  } else if (t < 0.60) {
    const s = (t - 0.45) / 0.15
    r = s; g = 1.0; b = 0.0
  } else if (t < 0.75) {
    const s = (t - 0.60) / 0.15
    r = 1.0; g = 1.0 - 0.4 * s; b = 0.0
  } else if (t < 0.90) {
    const s = (t - 0.75) / 0.15
    r = 1.0; g = 0.6 - 0.35 * s; b = 0.0
  } else {
    const s = (t - 0.90) / 0.10
    r = 1.0; g = 0.25 - 0.15 * s; b = 0.0
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255]
}

function slopeToColor(slopeDeg: number): RGBA {
  const t = Math.max(0, Math.min(1, slopeDeg / 30))
  let r: number, g: number, b: number

  if (t < 0.33) {
    const s = t / 0.33
    r = s; g = 0.8 + 0.2 * s; b = 0.15 * (1 - s)
  } else if (t < 0.66) {
    const s = (t - 0.33) / 0.33
    r = 1.0; g = 1.0 - 0.45 * s; b = 0.0
  } else {
    const s = (t - 0.66) / 0.34
    r = 1.0; g = 0.55 - 0.45 * s; b = 0.0
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255]
}

function riskToColor(risk: number): RGBA {
  const t = Math.max(0, Math.min(1, risk / 50))
  let r: number, g: number, b: number

  if (t < 0.2) {
    const s = t / 0.2
    r = 0.05; g = 0.5 + 0.3 * s; b = 0.4 * (1 - s)
  } else if (t < 0.5) {
    const s = (t - 0.2) / 0.3
    r = 0.3 + 0.7 * s; g = 0.8; b = 0.0
  } else if (t < 0.8) {
    const s = (t - 0.5) / 0.3
    r = 1.0; g = 0.8 - 0.5 * s; b = 0.0
  } else {
    const s = (t - 0.8) / 0.2
    r = 1.0; g = 0.3 - 0.25 * s; b = 0.05 * s
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255]
}

// ----------------------------------------------------------------
// GLSL SHADERS
// ----------------------------------------------------------------

const VERTEX_COLOR_VS = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec4 color;
in float batchId;

out vec4 v_color;
out vec3 v_normalEC;

void main()
{
    vec4 p = czm_computePosition();
    gl_Position = czm_modelViewProjectionRelativeToEye * p;
    v_normalEC = czm_normal * normal;
    v_color = color;
}
`

const VERTEX_COLOR_FS = `
in vec4 v_color;
in vec3 v_normalEC;

void main()
{
    vec3 n = normalize(v_normalEC);
    float NdotL = max(dot(n, czm_sunDirectionEC), 0.0);
    float light = NdotL * 0.65 + 0.35;
    out_FragColor = vec4(v_color.rgb * light, 1.0);
}
`

// ----------------------------------------------------------------
// TERRAIN CACHE
// ----------------------------------------------------------------

interface TerrainCache {
  packedPositions: Float64Array
  indices: Uint32Array
  boundingSphere: Cesium.BoundingSphere
  elevationMin: number
  elevationMax: number
  slopeGrid: Float32Array
  slopeMax: number
  riskGrid: Float32Array
  riskMax: number
  riskMean: number
}

let terrainCache: TerrainCache | null = null

function getTerrainCache(): TerrainCache {
  if (terrainCache) return terrainCache

  const positions: Cesium.Cartesian3[] = []
  const indices: number[] = []

  const width = globalTerrain.width
  const height = globalTerrain.height
  const step = globalTerrain.step
  const verticalExaggeration = 40
  const marsRadius = 3396000
  const stepRadians = Cesium.Math.toRadians(step)

  let elevMin = Infinity
  let elevMax = -Infinity

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const latitude = globalTerrain.lat_start - row * step
      const longitude = globalTerrain.lon_start + col * step
      const elevation = globalTerrain.elevation[row][col]

      if (elevation < elevMin) elevMin = elevation
      if (elevation > elevMax) elevMax = elevation

      const lat = Cesium.Math.toRadians(latitude)
      const lon = Cesium.Math.toRadians(longitude)
      const radius = marsRadius + elevation * verticalExaggeration
      const cosLat = Math.cos(lat)

      positions.push(
        new Cesium.Cartesian3(
          radius * cosLat * Math.cos(lon),
          radius * cosLat * Math.sin(lon),
          radius * Math.sin(lat),
        ),
      )
    }
  }

  for (let row = 0; row < height - 1; row++) {
    for (let col = 0; col < width - 1; col++) {
      const topLeft = row * width + col
      const topRight = topLeft + 1
      const bottomLeft = (row + 1) * width + col
      const bottomRight = bottomLeft + 1

      indices.push(
        topLeft, bottomLeft, topRight,
        topRight, bottomLeft, bottomRight,
      )
    }
  }

  // Compute slope and risk from elevation
  const slopeGrid = new Float32Array(width * height)
  const riskGrid = new Float32Array(width * height)
  let slopeMax = 0
  let riskMax = 0
  let riskSum = 0
  const dy = marsRadius * stepRadians

  for (let row = 0; row < height; row++) {
    const latitude = globalTerrain.lat_start - row * step
    const cosLat = Math.cos(Cesium.Math.toRadians(latitude))
    const dx = marsRadius * cosLat * stepRadians

    for (let col = 0; col < width; col++) {
      const r0 = row > 0 ? row - 1 : row
      const r1 = row < height - 1 ? row + 1 : row
      const c0 = col > 0 ? col - 1 : col
      const c1 = col < width - 1 ? col + 1 : col

      const dzDy =
        (globalTerrain.elevation[r1][col] - globalTerrain.elevation[r0][col]) /
        ((r1 - r0) * dy)

      const dzDx =
        dx > 0
          ? (globalTerrain.elevation[row][c1] - globalTerrain.elevation[row][c0]) /
            ((c1 - c0) * dx)
          : 0

      const slopeDeg =
        Math.atan(Math.sqrt(dzDx * dzDx + dzDy * dzDy)) * (180 / Math.PI)

      const idx = row * width + col
      slopeGrid[idx] = slopeDeg
      if (slopeDeg > slopeMax) slopeMax = slopeDeg

      const riskVal = (slopeDeg * slopeDeg) / 10
      riskGrid[idx] = riskVal
      if (riskVal > riskMax) riskMax = riskVal
      riskSum += riskVal
    }
  }

  terrainCache = {
    packedPositions: new Float64Array(Cesium.Cartesian3.packArray(positions)),
    indices: new Uint32Array(indices),
    boundingSphere: Cesium.BoundingSphere.fromPoints(positions),
    elevationMin: elevMin,
    elevationMax: elevMax,
    slopeGrid,
    slopeMax,
    riskGrid,
    riskMax,
    riskMean: riskSum / (width * height),
  }

  console.log(
    'TERRAIN CACHE:',
    width, '×', height,
    '| elev:', elevMin.toFixed(0), '→', elevMax.toFixed(0), 'm',
    '| slope max:', slopeMax.toFixed(2), '°',
  )

  return terrainCache
}

// ----------------------------------------------------------------
// BUILD TERRAIN PRIMITIVE
// ----------------------------------------------------------------

function buildTerrainPrimitive(
  activeLayer: string | null,
): Cesium.Primitive {
  const cache = getTerrainCache()
  const width = globalTerrain.width
  const height = globalTerrain.height
  const vertexCount = width * height

  let colorFn: ((row: number, col: number) => RGBA) | null = null

  if (activeLayer === 'Elevation') {
    colorFn = (row, col) =>
      elevationToColor(
        globalTerrain.elevation[row][col],
        cache.elevationMin,
        cache.elevationMax,
      )
  } else if (activeLayer === 'Slope') {
    colorFn = (row, col) =>
      slopeToColor(cache.slopeGrid[row * width + col])
  } else if (activeLayer === 'Terrain hazards') {
    colorFn = (row, col) =>
      riskToColor(cache.riskGrid[row * width + col])
  }

  if (colorFn) {
    const colors = new Uint8Array(vertexCount * 4)

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const idx = (row * width + col) * 4
        const [r, g, b, a] = colorFn(row, col)
        colors[idx] = r
        colors[idx + 1] = g
        colors[idx + 2] = b
        colors[idx + 3] = a
      }
    }

    const geometry = new Cesium.Geometry({
      attributes: {
        position: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.DOUBLE,
          componentsPerAttribute: 3,
          values: new Float64Array(cache.packedPositions),
        }),
        color: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.UNSIGNED_BYTE,
          componentsPerAttribute: 4,
          normalize: true,
          values: colors,
        }),
        batchId: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          componentsPerAttribute: 1,
          values: new Float32Array(vertexCount),
        }),
      } as unknown as Cesium.GeometryAttributes,
      indices: new Uint32Array(cache.indices),
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      boundingSphere: cache.boundingSphere.clone(),
    })

    Cesium.GeometryPipeline.computeNormal(geometry)

    return new Cesium.Primitive({
      asynchronous: false,
      cull: false,
      allowPicking: false,
      geometryInstances: new Cesium.GeometryInstance({ geometry }),
      appearance: new Cesium.Appearance({
        vertexShaderSource: VERTEX_COLOR_VS,
        fragmentShaderSource: VERTEX_COLOR_FS,
        renderState: (Cesium.Appearance as any).getDefaultRenderState(false, false),
      }),
    })
  }

  // Default flat Mars color
  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: new Float64Array(cache.packedPositions),
      }),
    } as unknown as Cesium.GeometryAttributes,
    indices: new Uint32Array(cache.indices),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: cache.boundingSphere.clone(),
  })

  Cesium.GeometryPipeline.computeNormal(geometry)

  return new Cesium.Primitive({
    asynchronous: false,
    cull: false,
    geometryInstances: new Cesium.GeometryInstance({
      geometry,
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(
          Cesium.Color.fromCssColorString('#a85c42'),
        ),
      },
    }),
    appearance: new Cesium.PerInstanceColorAppearance({
      flat: false,
      faceForward: true,
      translucent: false,
      closed: false,
    }),
  })
}

// ----------------------------------------------------------------
// SCIENCE TARGETS (Phase 5)
// ----------------------------------------------------------------

export interface ScienceTarget {
  name: string
  lon: number
  lat: number
  description: string
  type?: string
  priority?: string
}

export const SCIENCE_TARGETS: ScienceTarget[] = [
  { name: 'Midway (Delta Front)', lon: 77.44, lat: 18.45,
    description: 'Ancient river delta sediments rich in clays & carbonates; prime biosignature search zone.',
    type: 'Astrobiology & Sedimentology', priority: 'PRIMARY' },
  { name: 'Séítah (South)', lon: 77.37, lat: 18.38,
    description: 'Layered cumulate olivine sand dunes and rocks revealing ancient magma crystallization.',
    type: 'Igneous Petrology', priority: 'HIGH' },
  { name: 'Crater Floor Fractured Rough', lon: 77.50, lat: 18.47,
    description: 'Oldest exposed volcanic bedrock on crater floor with polygonal cooling joints.',
    type: 'Basement Stratigraphy', priority: 'MODERATE' },
  { name: 'Three Forks', lon: 77.42, lat: 18.47,
    description: 'Delta contact margin and site of the first sample cache depot on another planet.',
    type: 'Delta Staging & Sample Depot', priority: 'HIGH' },
  { name: 'Kodiak Butte', lon: 77.41, lat: 18.41,
    description: 'Isolated erosional remnant exhibiting classic delta strata, proving deep lake history.',
    type: 'Fluvial Geomorphology', priority: 'PRIMARY' },
  { name: 'Belva Crater Rim', lon: 77.38, lat: 18.52,
    description: '1-km impact crater cross-cutting the delta, revealing layered sedimentary deposition.',
    type: 'Impact Excavation', priority: 'HIGH' },
]

// ----------------------------------------------------------------
// PERSEVERANCE MISSION LANDMARKS (Phase 6)
// ----------------------------------------------------------------

export const PERSEVERANCE_WAYPOINTS = [
  { name: 'Perseverance Landing Site (Octavia E. Butler)',
    lon: 77.4508, lat: 18.4447,
    description: 'Sky Crane touchdown on Mars: 18 Feb 2021',
    color: Cesium.Color.SPRINGGREEN, size: 16 },
  { name: 'Ingenuity Airfield (Wright Brothers Field)',
    lon: 77.4511, lat: 18.4340,
    description: 'Site of first powered atmospheric flight on another planet: 19 Apr 2021',
    color: Cesium.Color.DEEPSKYBLUE, size: 13 },
  { name: 'Three Forks Sample Depot',
    lon: 77.4195, lat: 18.4712,
    description: '10 titanium sample tubes cached on surface for Mars Sample Return (MSR)',
    color: Cesium.Color.GOLD, size: 13 },
]

// ----------------------------------------------------------------
// ENTITY IDS
// ----------------------------------------------------------------

const ROUTE_START_ID = 'route-start-marker'
const ROUTE_DEST_ID = 'route-dest-marker'
const CALCULATED_ROUTE_ID = 'calculated-route'
const COMPARISON_ROUTE_ID = 'comparison-route'
const GRID_BOUNDARY_ID = 'grid-boundary'

// ----------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------

export interface GlobePoint {
  lat: number
  lon: number
}

export default function MarsGlobe({
  viewerRef,
  activeLayer,
  overlays,
  selectionMode,
  startPoint,
  destPoint,
  routeData,
  comparisonRouteData,
  onPointSelected,
  onTargetSelected,
}: {
  viewerRef: React.MutableRefObject<Cesium.Viewer | null>
  activeLayer: string | null
  overlays: Set<string>
  selectionMode: 'start' | 'destination' | null
  startPoint: GlobePoint | null
  destPoint: GlobePoint | null
  routeData: number[][] | null
  comparisonRouteData?: number[][] | null
  onPointSelected: (lat: number, lon: number) => void
  onTargetSelected?: (target: { name: string; description?: string }) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terrainPrimitiveRef = useRef<Cesium.Primitive | null>(null)
  const scienceEntityIds = useRef<string[]>([])
  const perseveranceEntityIds = useRef<string[]>([])

  // Refs to avoid re-registering the click handler
  const selectionModeRef = useRef(selectionMode)
  const onPointSelectedRef = useRef(onPointSelected)
  const onTargetSelectedRef = useRef(onTargetSelected)
  useEffect(() => {
    selectionModeRef.current = selectionMode
    onPointSelectedRef.current = onPointSelected
    onTargetSelectedRef.current = onTargetSelected
  }, [selectionMode, onPointSelected, onTargetSelected])

  // --------------------------------
  // VIEWER INITIALIZATION
  // --------------------------------
  useEffect(() => {
    if (!containerRef.current) return

    const viewer = new Cesium.Viewer(containerRef.current, {
      ellipsoid: Cesium.Ellipsoid.MARS,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      infoBox: false,
      selectionIndicator: false,
      baseLayer: false,
    })

    viewerRef.current = viewer

    viewer.scene.backgroundColor =
      Cesium.Color.fromCssColorString('#05070d')
    viewer.scene.globe.baseColor =
      Cesium.Color.fromCssColorString('#a85c42')
    viewer.scene.globe.show = false

    // ---- JEZERO CRATER (always visible) ----

    const jezeroLat = 18.44
    const jezeroLon = 77.45

    viewer.entities.add({
      name: 'Jezero Crater',
      position: Cesium.Cartesian3.fromDegrees(
        jezeroLon, jezeroLat, 0, Cesium.Ellipsoid.MARS,
      ),
      point: {
        pixelSize: 14,
        color: Cesium.Color.ORANGERED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: 'JEZERO CRATER',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -18),
      },
    })

    // ---- SCIENCE TARGETS (hidden by default) ----

    const sciIds: string[] = []
    SCIENCE_TARGETS.forEach((target, i) => {
      const id = `science-target-${i}`
      sciIds.push(id)
      viewer.entities.add({
        id,
        name: target.name,
        description: target.description,
        show: false,
        position: Cesium.Cartesian3.fromDegrees(
          target.lon, target.lat, 0, Cesium.Ellipsoid.MARS,
        ),
        point: {
          pixelSize: 11,
          color: Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
        },
        label: {
          text: target.name.toUpperCase(),
          font: '11px sans-serif',
          fillColor: Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -15),
        },
      })
    })
    scienceEntityIds.current = sciIds

    // ---- PERSEVERANCE (hidden by default) ----

    const persIds: string[] = []
    PERSEVERANCE_WAYPOINTS.forEach((wp, i) => {
      const id = `perseverance-${i}`
      persIds.push(id)
      viewer.entities.add({
        id,
        name: wp.name,
        description: wp.description,
        show: false,
        position: Cesium.Cartesian3.fromDegrees(
          wp.lon, wp.lat, 0, Cesium.Ellipsoid.MARS,
        ),
        point: {
          pixelSize: wp.size,
          color: wp.color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: wp.name.toUpperCase(),
          font: '11px sans-serif',
          fillColor: wp.color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -18),
        },
      })
    })
    perseveranceEntityIds.current = persIds

    // ---- GRID BOUNDARY (shown during selection) ----

    viewer.entities.add({
      id: GRID_BOUNDARY_ID,
      name: 'Jezero Route Planning Area',
      show: false,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(
          [
            GRID_LON_START, GRID_LAT_START,
            GRID_LON_END,   GRID_LAT_START,
            GRID_LON_END,   GRID_LAT_END,
            GRID_LON_START, GRID_LAT_END,
            GRID_LON_START, GRID_LAT_START,
          ],
          Cesium.Ellipsoid.MARS,
        ),
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.CYAN.withAlpha(0.6),
          dashLength: 16,
        }),
      },
    })

    // ---- CLICK HANDLER (point selection) ----

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction(
      (movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        if (!selectionModeRef.current) return

        const cartesian = viewer.camera.pickEllipsoid(
          movement.position,
          Cesium.Ellipsoid.MARS,
        )
        if (!cartesian) return

        const carto = Cesium.Cartographic.fromCartesian(
          cartesian,
          Cesium.Ellipsoid.MARS,
        )
        const lat = Cesium.Math.toDegrees(carto.latitude)
        const lon = Cesium.Math.toDegrees(carto.longitude)

        onPointSelectedRef.current(lat, lon)
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    )

    // ---- CAMERA ----

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        jezeroLon, jezeroLat, 500000, Cesium.Ellipsoid.MARS,
      ),
      duration: 2,
    })

    viewer.selectedEntityChanged.addEventListener((entity) => {
      if (!entity) return
      console.log('Selected:', entity.name)
      if (onTargetSelectedRef.current && entity.name) {
        let desc = ''
        if (typeof (entity as any).description?.getValue === 'function') {
          desc = (entity as any).description.getValue(viewer.clock.currentTime) || ''
        }
        onTargetSelectedRef.current({
          name: entity.name,
          description: desc,
        })
      }
    })

    return () => {
      handler.destroy()
      viewerRef.current = null
      viewer.destroy()
    }
  }, [viewerRef])

  // --------------------------------
  // TERRAIN LAYER
  // --------------------------------
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    if (terrainPrimitiveRef.current) {
      viewer.scene.primitives.remove(terrainPrimitiveRef.current)
      terrainPrimitiveRef.current = null
    }

    const primitive = buildTerrainPrimitive(activeLayer)
    viewer.scene.primitives.add(primitive)
    terrainPrimitiveRef.current = primitive
  }, [activeLayer, viewerRef])

  // --------------------------------
  // OVERLAYS
  // --------------------------------
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const showScience = overlays.has('Science targets')
    scienceEntityIds.current.forEach((id) => {
      const e = viewer.entities.getById(id)
      if (e) e.show = showScience
    })

    const showPers = overlays.has('Perseverance')
    perseveranceEntityIds.current.forEach((id) => {
      const e = viewer.entities.getById(id)
      if (e) e.show = showPers
    })
  }, [overlays, viewerRef])

  // --------------------------------
  // START / DESTINATION MARKERS
  // --------------------------------
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    // Start marker
    const existingStart = viewer.entities.getById(ROUTE_START_ID)
    if (existingStart) viewer.entities.remove(existingStart)

    if (startPoint) {
      viewer.entities.add({
        id: ROUTE_START_ID,
        name: 'Route Start',
        position: Cesium.Cartesian3.fromDegrees(
          startPoint.lon, startPoint.lat, 0, Cesium.Ellipsoid.MARS,
        ),
        point: {
          pixelSize: 16,
          color: Cesium.Color.LIME,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: `START\n${startPoint.lat.toFixed(3)}°N  ${startPoint.lon.toFixed(3)}°E`,
          font: '12px sans-serif',
          fillColor: Cesium.Color.LIME,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -20),
        },
      })
    }
  }, [startPoint, viewerRef])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const existingDest = viewer.entities.getById(ROUTE_DEST_ID)
    if (existingDest) viewer.entities.remove(existingDest)

    if (destPoint) {
      viewer.entities.add({
        id: ROUTE_DEST_ID,
        name: 'Route Destination',
        position: Cesium.Cartesian3.fromDegrees(
          destPoint.lon, destPoint.lat, 0, Cesium.Ellipsoid.MARS,
        ),
        point: {
          pixelSize: 16,
          color: Cesium.Color.RED,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: `DESTINATION\n${destPoint.lat.toFixed(3)}°N  ${destPoint.lon.toFixed(3)}°E`,
          font: '12px sans-serif',
          fillColor: Cesium.Color.RED,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -20),
        },
      })
    }
  }, [destPoint, viewerRef])

  // --------------------------------
  // CALCULATED ROUTE
  // --------------------------------
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const existing = viewer.entities.getById(CALCULATED_ROUTE_ID)
    if (existing) viewer.entities.remove(existing)

    if (routeData && routeData.length > 0) {
      const positions = routeData.map(([row, col]) => {
        const lat = GRID_LAT_START - row * GRID_STEP
        const lon = GRID_LON_START + col * GRID_STEP
        return Cesium.Cartesian3.fromDegrees(
          lon, lat, 0, Cesium.Ellipsoid.MARS,
        )
      })

      viewer.entities.add({
        id: CALCULATED_ROUTE_ID,
        name: 'Calculated Route',
        polyline: {
          positions,
          width: 5,
          material: Cesium.Color.CYAN,
        },
      })
    }
  }, [routeData, viewerRef])

  // --------------------------------
  // COMPARISON ROUTE (Phase 4 Baseline)
  // --------------------------------
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const existing = viewer.entities.getById(COMPARISON_ROUTE_ID)
    if (existing) viewer.entities.remove(existing)

    if (comparisonRouteData && comparisonRouteData.length > 0) {
      const positions = comparisonRouteData.map(([row, col]) => {
        const lat = GRID_LAT_START - row * GRID_STEP
        const lon = GRID_LON_START + col * GRID_STEP
        return Cesium.Cartesian3.fromDegrees(
          lon, lat, 0, Cesium.Ellipsoid.MARS,
        )
      })

      viewer.entities.add({
        id: COMPARISON_ROUTE_ID,
        name: 'Direct / Shortest Baseline',
        polyline: {
          positions,
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.ORANGE.withAlpha(0.85),
            dashLength: 12,
          }),
        },
      })
    }
  }, [comparisonRouteData, viewerRef])

  // --------------------------------
  // SELECTION MODE (cursor + grid boundary)
  // --------------------------------
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    // Crosshair cursor when selecting
    viewer.scene.canvas.style.cursor = selectionMode ? 'crosshair' : ''

    // Show grid boundary when selecting
    const boundary = viewer.entities.getById(GRID_BOUNDARY_ID)
    if (boundary) boundary.show = !!selectionMode
  }, [selectionMode, viewerRef])

  return (
    <div
      ref={containerRef}
      className="mars-globe"
    />
  )
}