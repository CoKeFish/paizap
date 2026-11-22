// Estado de la sesión: qué servidor, qué cuenta y con qué rol. La llave guardada en el
// dispositivo abre la sesión sola al entrar.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Keypair } from '@stellar/stellar-sdk'
import { abrirSesion, cerrarSesion, faltaServidor, leerInfo, mensajeDe, type Info, type Rol } from './api'
import { borrarLlave, guardarLlave, llaveGuardada } from './billetera'

interface Sesion {
  estado: 'cargando' | 'sin-servidor' | 'sin-cuenta' | 'abierta' | 'error'
  error: string
  info: Info | null
  llave: Keypair | null
  cuenta: string
  rol: Rol
  /** Entra con una llave (nueva o escrita por la persona) y la deja guardada en el dispositivo. */
  entrar: (llave: Keypair) => Promise<void>
  /** Cierra la sesión y borra la llave de este dispositivo. */
  salir: () => void
  /** Vuelve a conectar (después de cambiar el servidor o de un error). */
  reintentar: () => void
}

const Contexto = createContext<Sesion | null>(null)

export function useSesion(): Sesion {
  const sesion = useContext(Contexto)
  if (!sesion) throw new Error('useSesion fuera de <ProveedorDeSesion>')
  return sesion
}

export function ProveedorDeSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Sesion['estado']>('cargando')
  const [error, setError] = useState('')
  const [info, setInfo] = useState<Info | null>(null)
  const [llave, setLlave] = useState<Keypair | null>(null)
  const [rol, setRol] = useState<Rol>('dueno')

  const conectar = useCallback(async () => {
    if (faltaServidor()) return setEstado('sin-servidor')
    setEstado('cargando')
    try {
      const datos = await leerInfo()
      setInfo(datos)
      const guardada = llaveGuardada()
      if (!guardada) return setEstado('sin-cuenta')
      const abierta = await abrirSesion(guardada, datos.red)
      setLlave(guardada)
      setRol(abierta.rol)
      setEstado('abierta')
    } catch (fallo) {
      setError(mensajeDe(fallo))
      setEstado('error')
    }
  }, [])

  useEffect(() => {
    conectar()
  }, [conectar])

  const entrar = useCallback(async (nueva: Keypair) => {
    const datos = info ?? (await leerInfo())
    const abierta = await abrirSesion(nueva, datos.red)
    guardarLlave(nueva)
    setInfo(datos)
    setLlave(nueva)
    setRol(abierta.rol)
    setEstado('abierta')
  }, [info])

  const salir = useCallback(() => {
    borrarLlave()
    cerrarSesion()
    setLlave(null)
    setEstado('sin-cuenta')
  }, [])

  return (
    <Contexto.Provider value={{ estado, error, info, llave, cuenta: llave?.publicKey() ?? '', rol, entrar, salir, reintentar: conectar }}>
      {children}
    </Contexto.Provider>
  )
}

/** Repite `tarea` cada `ms` mientras la pantalla esté visible; devuelve cómo pedirla ya. */
export function useSondeo(tarea: () => Promise<void>, ms: number, activo = true) {
  const [marca, setMarca] = useState(0)
  useEffect(() => {
    if (!activo) return
    let vivo = true
    let espera: ReturnType<typeof setTimeout>
    const ciclo = async () => {
      if (document.visibilityState === 'visible') await tarea().catch(() => {})
      if (vivo) espera = setTimeout(ciclo, ms)
    }
    ciclo()
    return () => {
      vivo = false
      clearTimeout(espera)
    }
    // `tarea` cambia en cada render; el ciclo se reinicia solo cuando cambia `marca`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, activo, marca])
  return useCallback(() => setMarca((m) => m + 1), [])
}
