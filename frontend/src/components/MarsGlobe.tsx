import globalTerrain from '../../../data/processed/mars_global_terrain.json'
import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// ----------------------------------------------------------------
// ROUTE VISUALIZATION
// ----------------------------------------------------------------

export function showMissionRoute(
  viewer: Cesium.Viewer,
  route: number[][],
) {
  const positions = route.map(([row, col]) => {
    const latitude = 20.4453125 - row * 0.0078125
    const longitude = 75.4453125 + col * 0.0078125

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

/**
 * Elevation color ramp: deep blue (low) → cyan → green → yellow → red (high).
 */
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

/**
 * Slope color ramp: green (flat, 0°) → yellow → orange → red (steep, ≥30°).
 */
function slopeToColor(slopeDeg: number): RGBA {
  // Clamp to 0–30° range for visualization
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

/**
 * Hazard/risk color ramp: cool green (safe) → warm yellow → hot red (dangerous).
 * Risk is derived from slope: risk = slope_degrees * slope_degrees / 10.
 * The scale is clamped at risk=50 for visualization.
 */
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
// GLSL SHADERS FOR PER-VERTEX COLOR
// ----------------------------------------------------------------

const VERTEX_COLOR_VS = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec4 color;

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
// TERRAIN GEOMETRY CACHE
// ----------------------------------------------------------------

/**
 * Precomputed terrain geometry and derived analysis grids.
 * Positions/indices are shared across layer changes.
 * Slope and risk are computed once from the elevation grid.
 */
interface TerrainCache {
  packedPositions: Float64Array
  indices: Uint32Array
  boundingSphere: Cesium.BoundingSphere
  elevationMin: number
  elevationMax: number
  /** Slope in degrees for each grid cell */
  slopeGrid: Float32Array
  slopeMax: number
  /** Risk score for each grid cell (slope² / 10) */
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

  // Mars reference radius from the MOLA product
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

      // MOLA elevation is relative to the Mars areoid.
      // Build the actual planetary radius directly.
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
        topLeft,
        bottomLeft,
        topRight,
        topRight,
        bottomLeft,
        bottomRight,
      )
    }
  }

  // ----------------------------------------------------------
  // Compute slope (degrees) from elevation via finite differences
  // dy is constant: marsRadius * stepRadians
  // dx varies with latitude: marsRadius * cos(lat) * stepRadians
  // ----------------------------------------------------------
  const slopeGrid = new Float32Array(width * height)
  const riskGrid = new Float32Array(width * height)
  let slopeMax = 0
  let riskSum = 0

  const dy = marsRadius * stepRadians // metres per row step

  for (let row = 0; row < height; row++) {
    const latitude = globalTerrain.lat_start - row * step
    const cosLat = Math.cos(Cesium.Math.toRadians(latitude))
    const dx = marsRadius * cosLat * stepRadians // metres per col step

    for (let col = 0; col < width; col++) {
      // Elevation neighbours (clamped at boundaries)
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

      // Risk model: slope² / 10 (same model as the backend regional data)
      const risk = (slopeDeg * slopeDeg) / 10
      riskGrid[idx] = risk
      riskSum += risk
    }
  }

  terrainCache = {
    packedPositions: new Float64Array(
      Cesium.Cartesian3.packArray(positions),
    ),
    indices: new Uint32Array(indices),
    boundingSphere: Cesium.BoundingSphere.fromPoints(positions),
    elevationMin: elevMin,
    elevationMax: elevMax,
    slopeGrid,
    slopeMax,
    riskGrid,
    riskMax: Math.max(...riskGrid),
    riskMean: riskSum / (width * height),
  }

  console.log(
    'TERRAIN CACHE BUILT:',
    width, '×', height,
    '| elev:', elevMin.toFixed(0), '→', elevMax.toFixed(0), 'm',
    '| max slope:', slopeMax.toFixed(2), '°',
    '| mean risk:', terrainCache.riskMean.toFixed(2),
  )

  return terrainCache
}

// ----------------------------------------------------------------
// BUILD TERRAIN PRIMITIVE
// ----------------------------------------------------------------

/**
 * Creates a Cesium Primitive for the global MOLA terrain.
 *
 * - null            → flat Mars color (#a85c42)
 * - 'Elevation'     → per-vertex color ramp from MOLA elevations
 * - 'Slope'         → per-vertex color ramp from computed slope (degrees)
 * - 'Terrain hazards' → per-vertex color ramp from computed risk score
 */
function buildTerrainPrimitive(
  activeLayer: string | null,
): Cesium.Primitive {
  const cache = getTerrainCache()
  const width = globalTerrain.width
  const height = globalTerrain.height
  const vertexCount = width * height

  // Determine per-vertex color function
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
    // ---- PER-VERTEX COLORING ----
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
      } as Cesium.GeometryAttributes,
      indices: new Uint32Array(cache.indices),
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      boundingSphere: cache.boundingSphere.clone(),
    })

    Cesium.GeometryPipeline.computeNormal(geometry)

    return new Cesium.Primitive({
      asynchronous: false,
      cull: false,
      geometryInstances: new Cesium.GeometryInstance({ geometry }),
      appearance: new Cesium.Appearance({
        vertexShaderSource: VERTEX_COLOR_VS,
        fragmentShaderSource: VERTEX_COLOR_FS,
        renderState: Cesium.Appearance.getDefaultRenderState(
          false,
          false,
        ),
      }),
    })
  }

  // ---- DEFAULT: FLAT MARS COLOR ----
  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: new Float64Array(cache.packedPositions),
      }),
    } as Cesium.GeometryAttributes,
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
// SCIENCE TARGETS DATA
// ----------------------------------------------------------------

const SCIENCE_TARGETS = [
  {
    name: 'Séítah (South)',
    lon: 77.37,
    lat: 18.38,
    description: 'Olivine-rich terrain — key astrobiology target',
  },
  {
    name: 'Midway (Delta Front)',
    lon: 77.44,
    lat: 18.45,
    description: 'Ancient river delta front — sedimentary deposits',
  },
  {
    name: 'Crater Floor Fractured Rough',
    lon: 77.50,
    lat: 18.47,
    description: 'Igneous basement — earliest accessible rocks',
  },
  {
    name: 'Three Forks',
    lon: 77.42,
    lat: 18.47,
    description: 'Delta / crater floor contact zone',
  },
]

// ----------------------------------------------------------------
// PERSEVERANCE MISSION DATA
// ----------------------------------------------------------------

const PERSEVERANCE_WAYPOINTS = [
  {
    name: 'Perseverance Landing Site (Octavia E. Butler)',
    lon: 77.4508,
    lat: 18.4447,
    description: 'Touchdown: 18 Feb 2021',
    color: Cesium.Color.SPRINGGREEN,
    size: 16,
  },
  {
    name: 'Ingenuity Airfield',
    lon: 77.4511,
    lat: 18.4340,
    description: 'First powered flight on another planet — 19 Apr 2021',
    color: Cesium.Color.DEEPSKYBLUE,
    size: 12,
  },
]

// ----------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------

export default function MarsGlobe({
  viewerRef,
  activeLayer,
  overlays,
}: {
  viewerRef: React.MutableRefObject<Cesium.Viewer | null>
  activeLayer: string | null
  overlays: Set<string>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terrainPrimitiveRef = useRef<Cesium.Primitive | null>(null)
  const scienceEntityIds = useRef<string[]>([])
  const perseveranceEntityIds = useRef<string[]>([])

  // --------------------------------
  // VIEWER INITIALIZATION (runs once)
  // --------------------------------
  useEffect(() => {
    if (!containerRef.current) {
      return
    }

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

    // --------------------------------
    // MARS APPEARANCE
    // --------------------------------

    viewer.scene.backgroundColor =
      Cesium.Color.fromCssColorString('#05070d')

    viewer.scene.globe.baseColor =
      Cesium.Color.fromCssColorString('#a85c42')

    viewer.scene.globe.show = false

    // --------------------------------
    // JEZERO CRATER (always visible)
    // --------------------------------

    const jezeroLatitude = 18.44
    const jezeroLongitude = 77.45

    viewer.entities.add({
      name: 'Jezero Crater',

      position: Cesium.Cartesian3.fromDegrees(
        jezeroLongitude,
        jezeroLatitude,
        0,
        Cesium.Ellipsoid.MARS,
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

    // --------------------------------
    // SCIENCE TARGETS (toggleable)
    // --------------------------------

    const sciIds: string[] = []
    SCIENCE_TARGETS.forEach((target, i) => {
      const id = `science-target-${i}`
      sciIds.push(id)
      viewer.entities.add({
        id,
        name: target.name,
        description: target.description,
        show: false, // hidden by default, toggled by overlay

        position: Cesium.Cartesian3.fromDegrees(
          target.lon,
          target.lat,
          0,
          Cesium.Ellipsoid.MARS,
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

    // --------------------------------
    // PERSEVERANCE WAYPOINTS (toggleable)
    // --------------------------------

    const persIds: string[] = []
    PERSEVERANCE_WAYPOINTS.forEach((wp, i) => {
      const id = `perseverance-${i}`
      persIds.push(id)
      viewer.entities.add({
        id,
        name: wp.name,
        description: wp.description,
        show: false, // hidden by default

        position: Cesium.Cartesian3.fromDegrees(
          wp.lon,
          wp.lat,
          0,
          Cesium.Ellipsoid.MARS,
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

    // --------------------------------
    // CAMERA
    // --------------------------------

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        jezeroLongitude,
        jezeroLatitude,
        500000,
        Cesium.Ellipsoid.MARS,
      ),
      duration: 2,
    })

    // --------------------------------
    // SELECTION
    // --------------------------------

    viewer.selectedEntityChanged.addEventListener((entity) => {
      if (!entity) {
        return
      }

      console.log('Selected:', entity.name)
    })

    // --------------------------------
    // CLEANUP
    // --------------------------------

    return () => {
      viewerRef.current = null
      viewer.destroy()
    }
  }, [viewerRef])

  // --------------------------------
  // TERRAIN LAYER MANAGEMENT
  // Swaps the terrain primitive to reflect the active analysis layer.
  // --------------------------------
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    // Remove the previous terrain primitive (if any)
    if (terrainPrimitiveRef.current) {
      viewer.scene.primitives.remove(terrainPrimitiveRef.current)
      terrainPrimitiveRef.current = null
    }

    // Build and add the new terrain primitive
    const primitive = buildTerrainPrimitive(activeLayer)
    viewer.scene.primitives.add(primitive)
    terrainPrimitiveRef.current = primitive
  }, [activeLayer, viewerRef])

  // --------------------------------
  // OVERLAY MANAGEMENT
  // Toggles visibility of science targets and Perseverance markers.
  // --------------------------------
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const showScience = overlays.has('Science targets')
    scienceEntityIds.current.forEach((id) => {
      const entity = viewer.entities.getById(id)
      if (entity) entity.show = showScience
    })

    const showPerseverance = overlays.has('Perseverance')
    perseveranceEntityIds.current.forEach((id) => {
      const entity = viewer.entities.getById(id)
      if (entity) entity.show = showPerseverance
    })
  }, [overlays, viewerRef])

  return (
    <div
      ref={containerRef}
      className="mars-globe"
    />
  )
}