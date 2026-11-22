// Piezas de interfaz que usan todas las pantallas. Los colores salen de src/index.css.
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, LoaderCircle, X } from 'lucide-react'

// `rayo` es el botón amarillo: la acción principal de la pantalla, una sola. `sobre-noche` es el
// botón secundario dentro de la franja azul.
type Variante = 'principal' | 'rayo' | 'secundario' | 'sobre-noche' | 'texto' | 'peligro'

const ESTILO: Record<Variante, string> = {
  principal: 'bg-marca text-marca-texto text-sm font-semibold hover:opacity-90',
  rayo: 'titulo bg-rayo text-noche min-h-12 text-xl uppercase tracking-wide hover:bg-rayo-fuerte',
  secundario: 'bg-panel text-texto text-sm font-semibold border border-borde hover:bg-fondo',
  'sobre-noche': 'bg-transparent text-white text-sm font-semibold border border-noche-linea hover:bg-noche-alta',
  texto: 'text-acento text-sm font-semibold hover:underline px-0!',
  peligro: 'bg-panel text-error text-sm font-semibold border border-error/40 hover:bg-error-fondo',
}

/** Las clases de un botón, para darle su aspecto también a un enlace. */
export function estiloDeBoton(variante: Variante = 'principal', ancho = false): string {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 transition
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento
    disabled:cursor-not-allowed disabled:opacity-50 ${ESTILO[variante]} ${ancho ? 'w-full' : ''}`
}

export function Boton({
  variante = 'principal', ocupado = false, ancho = false, className = '', children, disabled, ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; ocupado?: boolean; ancho?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || ocupado}
      className={`${estiloDeBoton(variante, ancho)} ${className}`}
      {...resto}
    >
      {ocupado && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Cuadro({ titulo, accion, children, className = '' }: { titulo?: string; accion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-borde bg-panel p-4 ${className}`}>
      {(titulo || accion) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {titulo && <h2 className="text-base font-semibold">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children}
    </section>
  )
}

export function Campo({ etiqueta, ayuda, className = '', ...resto }: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{etiqueta}</span>
      <input
        className={`min-h-11 w-full rounded-xl border border-borde bg-panel px-3 text-base text-texto outline-none
          focus:border-acento focus:ring-2 focus:ring-acento/30 ${className}`}
        {...resto}
      />
      {ayuda && <span className="mt-1 block text-sm text-suave">{ayuda}</span>}
    </label>
  )
}

type Tono = 'neutro' | 'ok' | 'aviso' | 'error'
const TONO: Record<Tono, string> = {
  neutro: 'bg-fondo text-suave border border-borde',
  ok: 'bg-ok-fondo text-ok',
  aviso: 'bg-aviso-fondo text-aviso',
  error: 'bg-error-fondo text-error',
}

export function Etiqueta({ tono = 'neutro', children }: { tono?: Tono; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TONO[tono]}`}>{children}</span>
}

export function Aviso({ tono = 'neutro', children }: { tono?: Tono; children: ReactNode }) {
  return <p role={tono === 'error' ? 'alert' : undefined} className={`rounded-xl px-3 py-2 text-sm ${TONO[tono]}`}>{children}</p>
}

/** Ventana sobre la pantalla: en el celular sube desde abajo; en pantallas grandes va al centro. */
export function Ventana({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children: ReactNode }) {
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => evento.key === 'Escape' && alCerrar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [alCerrar])
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-noche/60 sm:items-center" onClick={alCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(evento) => evento.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" className="rounded-lg p-2 text-suave hover:bg-fondo">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  )
}

export function Interruptor({ activo, alCambiar, etiqueta, deshabilitado }: { activo: boolean; alCambiar: (valor: boolean) => void; etiqueta: string; deshabilitado?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => alCambiar(!activo)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento ${activo ? 'bg-error' : 'bg-borde'}`}
    >
      <span className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : ''}`} />
    </button>
  )
}

/** Barra de avance: cuánto se usó de un total. */
export function Barra({ valor, total, tono = 'marca' }: { valor: number; total: number; tono?: 'marca' | 'aviso' }) {
  const porcentaje = total > 0 ? Math.min(100, Math.max(0, (valor / total) * 100)) : 0
  return (
    <div className="h-2 overflow-hidden rounded-full bg-borde" role="presentation">
      <div className={`h-full rounded-full ${tono === 'aviso' ? 'bg-aviso' : 'bg-marca'}`} style={{ width: `${porcentaje}%` }} />
    </div>
  )
}

export function Copiar({ texto, etiqueta = 'Copiar' }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      // Sin permiso para el portapapeles (página sin HTTPS): se copia con un campo de texto.
      const campo = document.createElement('textarea')
      campo.value = texto
      document.body.appendChild(campo)
      campo.select()
      document.execCommand('copy')
      campo.remove()
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }
  return (
    <Boton variante="secundario" onClick={copiar}>
      {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copiado ? 'Copiado' : etiqueta}
    </Boton>
  )
}

export function Qr({ texto, lado = 180 }: { texto: string; lado?: number }) {
  const [imagen, setImagen] = useState('')
  useEffect(() => {
    QRCode.toDataURL(texto, { margin: 1, width: lado * 2 }).then(setImagen).catch(() => setImagen(''))
  }, [texto, lado])
  return imagen ? <img src={imagen} width={lado} height={lado} alt="Código QR de la cuenta" className="rounded-lg border border-borde" /> : null
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-suave">
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span>{texto}</span>
    </div>
  )
}
