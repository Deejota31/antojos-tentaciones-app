import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // El modo demo importa ../apps-script/Code.gs como texto para ejecutar el mismo backend en el navegador.
  server: { fs: { allow: ['..'] } },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
})
