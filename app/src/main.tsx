import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes, useNavigate } from 'react-router'
import { App } from '@capacitor/app'
import './index.css'
import { esNativa } from './lib/api'
import { ProveedorDeSesion, useSesion } from './lib/sesion'
import { LogoGrande } from './components/marca'
import { Aviso, Boton, Cargando } from './components/ui'
import { DireccionDelServidor } from './pages/Ajustes'
import { Billetera } from './pages/Billetera'
import { Entrada } from './pages/Entrada'
import { Pagar } from './pages/Pagar'
import { Panel } from './pages/Panel'
import { Recibo } from './pages/Recibo'

/**
 * En Android, la página que abre el QR de pago ofrece «Abrir en la app»: ese enlace
 * (paizap://pagar/<id>) llega aquí y lleva a la pantalla de pago.
 */
function EnlacesDeLaApp() {
  const navegar = useNavigate()
  useEffect(() => {
    if (!esNativa) return
    const escucha = App.addListener('appUrlOpen', ({ url }) => {
      const pago = url.match(/^paizap:\/\/pagar\/([\w-]{3,64})$/)
      if (pago) navegar(`/pagar/${pago[1]}`)
    })
    return () => {
      escucha.then((e) => e.remove())
    }
  }, [navegar])
  return null
}

/** La pantalla principal depende de la sesión: quien entra con la cuenta del comercio ve el panel. */
function Inicio() {
  const { estado, error, rol, reintentar } = useSesion()
  if (estado === 'abierta') return rol === 'comercio' ? <Panel /> : <Billetera />
  if (estado === 'sin-cuenta') return <Entrada />
  return (
    <main className="en-noche flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-md flex-col gap-4">
        <LogoGrande />
        {estado === 'cargando' && <Cargando texto="Conectando…" />}
        {estado === 'sin-servidor' && <p className="text-suave">Escribe la dirección del servidor de Paizap para empezar.</p>}
        {estado === 'error' && (
          <>
            <Aviso tono="error">{error}</Aviso>
            <Boton variante="rayo" onClick={reintentar}>Reintentar</Boton>
          </>
        )}
        {estado !== 'cargando' && <DireccionDelServidor />}
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorDeSesion>
      <HashRouter>
        <EnlacesDeLaApp />
        <Routes>
          <Route path="/recibo/:codigo" element={<Recibo />} />
          <Route path="/pagar/:id" element={<Pagar />} />
          <Route path="*" element={<Inicio />} />
        </Routes>
      </HashRouter>
    </ProveedorDeSesion>
  </StrictMode>,
)
