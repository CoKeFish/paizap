// Cómo se muestran montos, fechas y cuentas.

const NUMERO = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "1234.5" -> "1.234,50" */
export function monto(valor: string | number | null | undefined): string {
  const n = Number(valor)
  return Number.isFinite(n) ? NUMERO.format(n) : '0,00'
}

/** "GABC…WXYZ" */
export const cuentaCorta = (cuenta: string) => `${cuenta.slice(0, 4)}…${cuenta.slice(-4)}`

const HORA = new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const DIA = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short' })
const DIA_LARGO = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })

const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** "14:05" si es de hoy; "20 nov, 14:05" si no. */
export function cuando(fecha: string): string {
  const f = new Date(fecha)
  return mismoDia(f, new Date()) ? HORA.format(f) : `${DIA.format(f)}, ${HORA.format(f)}`
}

export const fechaLarga = (fecha: string) => DIA_LARGO.format(new Date(fecha))
export const fechaYHora = (fecha: string) => `${DIA_LARGO.format(new Date(fecha))}, ${HORA.format(new Date(fecha))}`

/** "hace 12 s", "hace 3 min", "hace 2 h" */
export function hace(fecha: string): string {
  const segundos = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 1000))
  if (segundos < 60) return `hace ${segundos} s`
  if (segundos < 3600) return `hace ${Math.round(segundos / 60)} min`
  if (segundos < 86400) return `hace ${Math.round(segundos / 3600)} h`
  return `hace ${Math.round(segundos / 86400)} d`
}

/** Días que faltan para una fecha. */
export const diasHasta = (fecha: string) => Math.max(0, Math.round((new Date(fecha).getTime() - Date.now()) / 86400000))

/** Los motivos de rechazo del servidor, dichos para una persona. */
export function motivoClaro(motivo: string | undefined): string {
  if (!motivo) return 'Rechazado'
  if (motivo.startsWith('supera el limite diario')) return 'Pasaba el límite diario'
  if (motivo.startsWith('la red rechazo')) return 'Sin saldo o sin tope de gasto'
  if (motivo === 'tarjeta bloqueada') return 'Tarjeta bloqueada'
  if (motivo === 'tarjeta no registrada') return 'Tarjeta sin dueño'
  return motivo.charAt(0).toUpperCase() + motivo.slice(1)
}

/** Por qué no salió un pago con el QR, dicho a quien está pagando. */
export function motivoDePago(motivo: string): string {
  if (motivo.startsWith('supera el limite diario')) return 'Con este pago pasas el límite diario de la tarjeta.'
  if (motivo.startsWith('la red rechazo')) return 'No alcanza tu saldo o tu tope de gasto.'
  if (motivo.startsWith('monto mayor')) return 'El monto supera el máximo por pago.'
  if (motivo === 'tarjeta bloqueada') return 'Esa tarjeta está bloqueada.'
  if (motivo === 'este cobro ya esta pagado') return 'Este cobro ya está pagado.'
  if (motivo === 'este cobro ya no esta disponible') return 'Este cobro ya no está disponible. Pide en la caja que lo generen de nuevo.'
  if (motivo === 'este cobro ya se esta pagando') return 'Alguien más ya está pagando este cobro.'
  return motivo.charAt(0).toUpperCase() + motivo.slice(1) + '.'
}
