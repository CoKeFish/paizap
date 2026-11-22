import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `base: './'` deja las rutas relativas: la misma compilación sirve para la web (la entrega el
// servidor de Paizap) y para la app de Android (Capacitor la abre desde el paquete).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5180 },
  build: { chunkSizeWarningLimit: 2000 },
})
