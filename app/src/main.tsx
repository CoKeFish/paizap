import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router'
import './index.css'
import { ProveedorDeSesion, useSesion } from './lib/sesion'
import { Aviso, Boton, Cargando } from './components/ui'
import { DireccionDelServidor } from './pages/Ajustes'
import { Billetera } from './pages/Billetera'
import { Entrada } from './pages/Entrada'
import { Panel } from './pages/Panel'
import { Recibo } from './pages/Recibo'

/** La pantalla principal depende de la sesión: quien entra con la cuenta del comercio ve el panel. */
function Inicio() {
  const { estado, error, rol, reintentar } = useSesion()
  if (estado === 'abierta') return rol === 'comercio' ? <Panel /> : <Billetera />
  if (estado === 'sin-cuenta') return <Entrada />
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-5 py-10">
      <h1 className="text-4xl font-bold">Toki</h1>
      {estado === 'cargando' && <Cargando texto="Conectando…" />}
      {estado === 'sin-servidor' && <p className="text-suave">Escribe la dirección del servidor de Toki para empezar.</p>}
      {estado === 'error' && (
        <>
          <Aviso tono="error">{error}</Aviso>
          <Boton onClick={reintentar}>Reintentar</Boton>
        </>
      )}
      {estado !== 'cargando' && <DireccionDelServidor />}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorDeSesion>
      <HashRouter>
        <Routes>
          <Route path="/recibo/:codigo" element={<Recibo />} />
          <Route path="*" element={<Inicio />} />
        </Routes>
      </HashRouter>
    </ProveedorDeSesion>
  </StrictMode>,
)
