import terrainMesh from '../../../data/processed/jezero_terrain_mesh.json'
import globalTerrain from '../../../data/processed/mars_global_terrain.json'
import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

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

function createGlobalMolaTerrain(viewer: Cesium.Viewer) {
  const positions: Cesium.Cartesian3[] = []
  const indices: number[] = []

  const width = globalTerrain.width
  const height = globalTerrain.height
  const step = globalTerrain.step
  const verticalExaggeration = 40

  // Mars reference radius from the MOLA product
  const marsRadius = 3396000

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const latitude = globalTerrain.lat_start - row * step
      const longitude = globalTerrain.lon_start + col * step
      const elevation = globalTerrain.elevation[row][col]

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

  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: new Float64Array(
          Cesium.Cartesian3.packArray(positions),
        ),
      }),
    } as Cesium.GeometryAttributes,

    indices: new Uint32Array(indices),

    primitiveType: Cesium.PrimitiveType.TRIANGLES,

    boundingSphere: Cesium.BoundingSphere.fromPoints(
      positions,
    ),
  })

  Cesium.GeometryPipeline.computeNormal(geometry)

  viewer.scene.primitives.add(
    new Cesium.Primitive({
      asynchronous: false,
      cull: false,

      geometryInstances: new Cesium.GeometryInstance({
        geometry,

        attributes: {
          color:
            Cesium.ColorGeometryInstanceAttribute.fromColor(
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
    }),
  )
}

function createMolaTerrain(viewer: Cesium.Viewer) {
  const positions: Cesium.Cartesian3[] = []
  const indices: number[] = []

  const width = terrainMesh.width
  const height = terrainMesh.height

  const startLatitude = 20.4453125
  const startLongitude = 75.4453125
  const step = 0.0625

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const latitude = startLatitude - row * step
      const longitude = startLongitude + col * step
      const elevation = terrainMesh.elevation[row][col] * 8

      const marsRadius = 3396000
const radius = marsRadius + elevation * 25
const lat = Cesium.Math.toRadians(latitude)
const lon = Cesium.Math.toRadians(longitude)
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

  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: new Float64Array(
          Cesium.Cartesian3.packArray(positions),
        ),
      }),
    } as Cesium.GeometryAttributes,
    indices: new Uint32Array(indices),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromPoints(positions),
  })

    Cesium.GeometryPipeline.computeNormal(geometry)
  viewer.scene.primitives.add(
    new Cesium.Primitive({
      asynchronous: false,

      geometryInstances: new Cesium.GeometryInstance({
        geometry,

        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            Cesium.Color.fromCssColorString('#b86a4d'),
          ),
        },
      }),

      appearance: new Cesium.PerInstanceColorAppearance({
        flat: false,
        translucent: false,
      }),
    }),
  )
}

export default function MarsGlobe({
  viewerRef,
}: {
  viewerRef: React.MutableRefObject<Cesium.Viewer | null>
}) {
  const containerRef = useRef<HTMLDivElement>(null)

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

    createGlobalMolaTerrain(viewer)
    createMolaTerrain(viewer)
    

    // --------------------------------
    // MARS APPEARANCE
    // --------------------------------

    viewer.scene.backgroundColor =
      Cesium.Color.fromCssColorString('#05070d')

    viewer.scene.globe.baseColor =
      Cesium.Color.fromCssColorString('#a85c42')

    viewer.scene.globe.show = false

    // --------------------------------
    // JEZERO CRATER
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
    // PROTOTYPE SCIENCE TARGET
    // --------------------------------

    viewer.entities.add({
      name: 'Science Target 01',

      position: Cesium.Cartesian3.fromDegrees(
        77.50,
        18.47,
        0,
        Cesium.Ellipsoid.MARS,
      ),

      point: {
        pixelSize: 10,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
      },

      label: {
        text: 'SCIENCE TARGET 01',
        font: '12px sans-serif',
        fillColor: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -15),
      },
    })

    // --------------------------------
    // PROTOTYPE ROUTE
    // --------------------------------

    viewer.entities.add({
      name: 'Prototype Mission Route',

      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          77.40,
          18.40,
          77.44,
          18.43,
          77.48,
          18.46,
          77.50,
          18.47,
        ]),

        width: 5,
        material: Cesium.Color.ORANGE,
      },
    })

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

    console.log(
      'MOLA TERRAIN MESH:',
      terrainMesh.width,
      terrainMesh.height,
    )

    // --------------------------------
    // CLEANUP
    // --------------------------------

    return () => {
      viewer.destroy()
    }
  }, [viewerRef])

  return (
    <div
      ref={containerRef}
      className="mars-globe"
    />
  )
}