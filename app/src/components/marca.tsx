// La marca en pantalla: el logo, el arco y la franja azul noche que abre cada pantalla.
import type { ReactNode } from 'react'

const BASE = import.meta.env.BASE_URL

/**
 * El logo sin su cuadro: las letras y los arcos sobre azul noche. La imagen trae el azul de
 * fondo, así que solo va sobre superficies azul noche (ahí no se nota el recorte).
 */
export function Logo({ alto = 56, className = '' }: { alto?: number; className?: string }) {
  return <img src={`${BASE}logo-franja.png`} alt="Paizap" style={{ height: alto }} className={`w-auto select-none ${className}`} draggable={false} />
}

/** El logo en grande, para las pantallas de entrada. También solo sobre azul noche. */
export function LogoGrande() {
  return <Logo alto={148} className="-ml-2" />
}

/** El arco del logo: una media luna que se afina en las puntas. Toma el color del texto. */
export function Arco({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 110" fill="currentColor" aria-hidden className={className}>
      <path d="M4 104C38 30 150-8 236 44 158 16 62 42 4 104Z" />
    </svg>
  )
}

/**
 * La franja azul noche de arriba: el logo, una acción a la derecha y, debajo, lo más importante
 * de la pantalla (el saldo, lo vendido, el monto a pagar). El arco amarillo asoma por la derecha.
 */
export function Franja({ accion, children, ancho = 'max-w-md', arco = true }: { accion?: ReactNode; children?: ReactNode; ancho?: string; arco?: boolean }) {
  return (
    <div className="en-noche relative overflow-hidden">
      {arco && <Arco className="pointer-events-none absolute -right-14 bottom-3 w-60 text-rayo sm:right-6 sm:w-72" />}
      <div className={`relative mx-auto ${ancho} px-4 pt-3 pb-6`}>
        <div className="flex min-h-14 items-center justify-between gap-3">
          <Logo />
          {accion}
        </div>
        {children}
      </div>
    </div>
  )
}

/** Un monto en letra de marca, con la moneda en amarillo (sobre azul) o apagada (sobre claro). */
export function Monto({ valor, moneda, className = 'text-6xl' }: { valor: string; moneda: string; className?: string }) {
  return (
    <p className={`titulo cifras ${className}`}>
      {valor} <span className="text-[0.42em] text-acento">{moneda}</span>
    </p>
  )
}
