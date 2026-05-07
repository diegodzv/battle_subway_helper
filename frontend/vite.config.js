import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Reemplaza 'battle_subway_helper' con el nombre exacto de tu repositorio
export default defineConfig({
  plugins: [react()],
  base: '/battle_subway_helper/',
  build: {
    outDir: 'dist',
  },
})
