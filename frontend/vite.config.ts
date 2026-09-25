import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesiumPlugin from 'vite-plugin-cesium'

const cesium = (cesiumPlugin as unknown as () => import('vite').Plugin)

export default defineConfig({
  plugins: [
    react(),
    cesium(),
  ],
})