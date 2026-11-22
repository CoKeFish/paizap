// Conexión con el servidor de Paizap.
//
// En la web, el servidor es el mismo que entrega la página. En la app de Android no hay «mismo
// origen»: la dirección sale de VITE_SERVIDOR_URL al compilar y se puede cambiar en Ajustes
// (queda guardada solo en el dispositivo).
import { Capacitor } from '@capacitor/core'
import type { Keypair } from '@stellar/stellar-sdk'
import { firmarReto } from './billetera'

const CLAVE_SERVIDOR = 'paizap.servidor'
export const esNativa = Capacitor.isNativePlatform()
const DE_FABRICA = (import.meta.env.VITE_SERVIDOR_URL ?? '').replace(/\/+$/, '')

export function servidor(): string {
  return (localStorage.getItem(CLAVE_SERVIDOR) ?? DE_FABRICA).replace(/\/+$/, '')
}

export function cambiarServidor(url: string) {
  const limpia = url.trim().replace(/\/+$/, '')
  if (limpia) localStorage.setItem(CLAVE_SERVIDOR, limpia)
  else localStorage.removeItem(CLAVE_SERVIDOR)
}

/** Hace falta escribir la dirección del servidor: app de Android compilada sin una de fábrica. */
export const faltaServidor = () => esNativa && !servidor()

export class ErrorDeServidor extends Error {
  estado: number
  /** El motivo tal como lo mandó el servidor (sin tildes, para la pantalla del terminal). */
  motivo: string
  constructor(estado: number, mensaje: string, motivo = '') {
    super(mensaje)
    this.estado = estado
    this.motivo = motivo
  }
}

// ---- Lo que responde el servidor ----

export interface Info {
  red: string
  moneda: string
  token: string
  gastador: string
  comercio: string
  comercioNombre: string
  limiteDiario: number
  recargaPrueba: string | null
  explorador: string
}

export type Rol = 'dueno' | 'comercio'

export interface Movimiento {
  n: number
  fecha: string
  tipo: 'cobro' | 'recarga' | 'permiso'
  uid?: string
  monto: string
  concepto: string
  /** Cómo se pagó: acercando la tarjeta o escaneando el QR del terminal. */
  medio?: 'tarjeta' | 'qr'
  ok: boolean
  motivo?: string
  recibo?: string
  hash?: string
}

export interface Tarjeta {
  uid: string
  nombre: string
  bloqueada: boolean
  limiteDiario: number | null
  gastadoHoy: string
  /** Código de cuenta para pagar con el QR desde un celular sin la billetera (con el PIN). */
  codigo: string | null
  tienePin: boolean
}

export interface Cuenta {
  cuenta: string
  rol: Rol
  existe: boolean
  saldo: string
  permiso: { restante: string; vence: { ledger: number; fecha: string } | null; firmado: string | null }
  limiteDiario: number
  tarjetas: Tarjeta[]
  movimientos: Movimiento[]
  n: number
}

export interface TarjetaNueva {
  uid: string
  fecha: string
}

export interface Panel {
  n: number
  moneda: string
  comercio: string
  saldo: string | null
  hoy: {
    dia: string
    total: string
    aprobados: number
    rechazados: number
    tarjetas: number
    porConcepto: { concepto: string; cantidad: number; total: string }[]
    horas: string[]
    horaActual: number
  }
  cobros: Movimiento[]
  /** Cobros que el terminal tiene en pantalla esperando el pago (tarjeta o QR). */
  esperando: { id: string; monto: string; concepto: string; fecha: string }[]
  terminal: { ultimoContacto: string | null }
  tarjetasNuevas: TarjetaNueva[]
  tarjetasRegistradas: number
}

/** Un cobro que el terminal dejó listo para pagar con el QR de su pantalla. */
export interface Pedido {
  id: string
  estado: 'pendiente' | 'pagado' | 'vencido'
  monto: string | null
  concepto: string
  moneda: string
  comercio: string
  comercioNombre: string
}

export interface ResultadoDePago {
  hash: string
  recibo: string
  saldoCliente: string | null
  permisoRestante: string | null
  hoyRestante: string
}

export interface Recibo {
  codigo: string
  hash: string
  enlace: string
  moneda: string
  comercio: string
  monto: string | null
  concepto: string
  fecha: string | null
}

// ---- Peticiones ----

let sesion: { token: string; llave: Keypair; red: string } | null = null

async function pedirSinSesion<T>(metodo: string, ruta: string, cuerpo?: unknown, token?: string): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(`${servidor()}${ruta}`, {
      method: metodo,
      headers: {
        ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  } catch {
    throw new ErrorDeServidor(0, 'No hay conexión con el servidor de Paizap.')
  }
  let datos: { ok?: boolean; motivo?: string } = {}
  try {
    datos = await respuesta.json()
  } catch {
    // respuesta sin JSON: se trata como un error del servidor
  }
  if (!respuesta.ok || datos.ok === false) {
    const motivo = datos.motivo ?? `el servidor respondió ${respuesta.status}`
    throw new ErrorDeServidor(respuesta.status, motivo.charAt(0).toUpperCase() + motivo.slice(1) + '.', datos.motivo)
  }
  return datos as T
}

export const leerInfo = () => pedirSinSesion<Info>('GET', '/api/info')
export const leerRecibo = (codigo: string) => pedirSinSesion<Recibo>('GET', `/api/recibos/${codigo}`)
export const leerPedido = (id: string) => pedirSinSesion<Pedido>('GET', `/api/pedidos/${id}`)

/** Abre sesión: pide el reto, lo firma con la llave de la cuenta y recibe la sesión. */
export async function abrirSesion(llave: Keypair, red: string): Promise<{ cuenta: string; rol: Rol }> {
  const { reto } = await pedirSinSesion<{ reto: string }>('GET', `/api/sesion/reto?cuenta=${llave.publicKey()}`)
  const abierta = await pedirSinSesion<{ token: string; cuenta: string; rol: Rol }>('POST', '/api/sesion', {
    reto: firmarReto(reto, red, llave),
  })
  sesion = { token: abierta.token, llave, red }
  return { cuenta: abierta.cuenta, rol: abierta.rol }
}

export function cerrarSesion() {
  sesion = null
}

/** Petición con sesión. Si la sesión venció, la app la renueva sola (tiene la llave) y reintenta. */
export async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  if (!sesion) throw new ErrorDeServidor(401, 'Sesión cerrada.')
  try {
    return await pedirSinSesion<T>(metodo, ruta, cuerpo, sesion.token)
  } catch (error) {
    if (!(error instanceof ErrorDeServidor) || error.estado !== 401 || !sesion) throw error
    await abrirSesion(sesion.llave, sesion.red)
    return pedirSinSesion<T>(metodo, ruta, cuerpo, sesion.token)
  }
}

export const mensajeDe = (error: unknown) => (error instanceof Error ? error.message : 'Algo salió mal.')
