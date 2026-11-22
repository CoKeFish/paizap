// La app de Android es la misma web (la compilación de `dist`) dentro de un WebView nativo.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // El identificador de la app no cambia con la marca: cambiarlo la volvería otra app en el celular.
  appId: 'app.toki.billetera',
  appName: 'Paizap',
  webDir: 'dist',
  backgroundColor: '#000b25', // el azul noche del logo, mientras carga
  plugins: {
    // Las peticiones salen por HTTP nativo y no por el WebView: la app corre en https://localhost
    // y el servidor de pruebas es otro origen y usa HTTP sin cifrar.
    CapacitorHttp: { enabled: true },
    // Detrás de la barra de estado siempre hay azul noche: sus íconos van en blanco.
    SystemBars: { style: 'DARK' },
  },
}

export default config
