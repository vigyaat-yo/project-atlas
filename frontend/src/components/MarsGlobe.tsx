import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

export default function MarsGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const viewer = new Cesium.Viewer(containerRef.current, {
      // Use Mars instead of Earth
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

      // IMPORTANT:
      // Remove Cesium's default Earth imagery.
      baseLayer: false,
    })

    // --------------------------------
    // MARS APPEARANCE
    // --------------------------------

    viewer.scene.backgroundColor =
      Cesium.Color.fromCssColorString('#05070d')

    viewer.scene.globe.baseColor =
      Cesium.Color.fromCssColorString('#a85c42')

    viewer.scene.globe.show = true

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
        Cesium.Ellipsoid.MARS
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
        Cesium.Ellipsoid.MARS
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
        3500000,
        Cesium.Ellipsoid.MARS
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
      viewer.destroy()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="mars-globe"
    />
  )
}