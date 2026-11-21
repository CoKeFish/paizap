// La app de Android es la misma web (la compilación de `dist`) dentro de un WebView nativo.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.toki.billetera',
  appName: 'Toki',
  webDir: 'dist',
  backgroundColor: '#f8fafc',
  plugins: {
    // Las peticiones salen por HTTP nativo y no por el WebView: la app corre en https://localhost
    // y el servidor de pruebas es otro origen y usa HTTP sin cifrar.
    CapacitorHttp: { enabled: true },
  },
}

export default config
