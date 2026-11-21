// Panel del comercio: las ventas de hoy, a medida que llegan del terminal.
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { Settings } from 'lucide-react'
import { mensajeDe, pedir, type Movimiento, type Panel as DatosDelPanel } from '../lib/api'
import { cuando, cuentaCorta, hace, monto, motivoClaro } from '../lib/formato'
import { useSesion, useSondeo } from '../lib/sesion'
import { Aviso, Cargando, Boton, Copiar, Cuadro, Etiqueta } from '../components/ui'
import { Ajustes } from './Ajustes'

const MINUTOS_TERMINAL_ACTIVO = 10

export function Panel() {
  const { cuenta } = useSesion()
  const [panel, setPanel] = useState<DatosDelPanel | null>(null)
  const [error, setError] = useState('')
  const [ajustes, setAjustes] = useState(false)
  // Hasta qué cobro se había visto: los que llegan después se marcan un momento.
  const visto = useRef<number | null>(null)
  const [desde, setDesde] = useState<number | null>(null)

  useSondeo(async () => {
    try {
      const datos = await pedir<DatosDelPanel>('GET', '/api/panel')
      if (visto.current !== null && datos.n > visto.current) setDesde(visto.current)
      visto.current = datos.n
      setPanel(datos)
      setError('')
    } catch (fallo) {
      setError(mensajeDe(fallo))
    }
  }, 2500)

  if (!panel) {
    return <main className="mx-auto max-w-5xl px-4 py-6">{error ? <Aviso tono="error">{error}</Aviso> : <Cargando />}</main>
  }

  const { hoy, moneda } = panel
  const contacto = panel.terminal.ultimoContacto
  const terminalActivo = contacto !== null && Date.now() - new Date(contacto).getTime() < MINUTOS_TERMINAL_ACTIVO * 60000
  const promedio = hoy.aprobados ? Number(hoy.total) / hoy.aprobados : 0

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 pt-5 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Ventas de hoy</h1>
          <p className="text-sm text-suave">Comercio {cuentaCorta(cuenta)}</p>
        </div>
        <div className="flex items-center gap-3">
          {contacto === null ? (
            <Etiqueta>Terminal sin conectar</Etiqueta>
          ) : (
            <Etiqueta tono={terminalActivo ? 'ok' : 'aviso'}>Terminal: último contacto {hace(contacto)}</Etiqueta>
          )}
          <Boton variante="secundario" onClick={() => setAjustes(true)}>
            <Settings className="size-4" aria-hidden /> Mi cuenta
          </Boton>
        </div>
      </header>

      {error && <Aviso tono="error">{error}</Aviso>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Dato titulo="Vendido hoy" valor={`${monto(hoy.total)} ${moneda}`} destacado />
        <Dato titulo="Cobros aprobados" valor={String(hoy.aprobados)} detalle={hoy.aprobados ? `Promedio ${monto(promedio)}` : undefined} />
        <Dato titulo="Rechazados" valor={String(hoy.rechazados)} />
        <Dato titulo="Saldo de la cuenta" valor={panel.saldo === null ? '…' : `${monto(panel.saldo)} ${moneda}`} detalle="En Stellar, ya disponible" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Cuadro titulo="Cobros" className="min-w-0 lg:col-span-2">
          {panel.cobros.length === 0 ? (
            <p className="text-sm text-suave">Todavía no hay cobros. Cuando alguien pague en el terminal, aparece aquí al instante.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {panel.cobros.map((c) => (
                <FilaDeCobro key={c.n} c={c} nuevo={desde !== null && c.n > desde} />
              ))}
            </ul>
          )}
        </Cuadro>

        <div className="min-w-0 space-y-4">
          <Cuadro titulo="Por producto">
            {hoy.porConcepto.length === 0 ? (
              <p className="text-sm text-suave">Sin ventas hoy.</p>
            ) : (
              <table className="cifras w-full text-sm">
                <thead>
                  <tr className="text-left text-suave">
                    <th className="pb-2 font-medium">Producto</th>
                    <th className="pb-2 text-right font-medium">Ventas</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {hoy.porConcepto.map((p) => (
                    <tr key={p.concepto}>
                      <td className="py-2">{p.concepto || 'Monto escrito en caja'}</td>
                      <td className="py-2 text-right">{p.cantidad}</td>
                      <td className="py-2 text-right font-semibold">{monto(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Cuadro>

          <Cuadro titulo="Ventas por hora">
            <PorHora horas={hoy.horas} horaActual={hoy.horaActual} />
          </Cuadro>

          <Cuadro titulo="Tarjetas">
            <p className="text-sm text-suave">{panel.tarjetasRegistradas} tarjetas registradas. {hoy.tarjetas} pagaron hoy.</p>
            {panel.tarjetasNuevas.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium">Sin dueño, vistas hace poco</p>
                <ul className="space-y-2">
                  {panel.tarjetasNuevas.map((t) => (
                    <li key={t.uid} className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm">{t.uid}</p>
                        <p className="text-xs text-suave">{hace(t.fecha)}</p>
                      </div>
                      <Copiar texto={t.uid} />
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-suave">El dueño la vincula desde su app.</p>
              </div>
            )}
          </Cuadro>
        </div>
      </div>

      {ajustes && <Ajustes alCerrar={() => setAjustes(false)} />}
    </main>
  )
}

function Dato({ titulo, valor, detalle, destacado }: { titulo: string; valor: string; detalle?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${destacado ? 'border-marca bg-marca text-marca-texto' : 'border-borde bg-panel'}`}>
      <p className={`text-sm ${destacado ? 'opacity-80' : 'text-suave'}`}>{titulo}</p>
      <p className="cifras mt-1 text-2xl font-bold">{valor}</p>
      {detalle && <p className={`mt-1 text-xs ${destacado ? 'opacity-80' : 'text-suave'}`}>{detalle}</p>}
    </div>
  )
}

function FilaDeCobro({ c, nuevo }: { c: Movimiento; nuevo: boolean }) {
  return (
    <li className={`flex items-center gap-3 px-1 py-3 ${nuevo ? 'recien-llegado' : ''}`}>
      <p className="cifras w-12 shrink-0 text-sm text-suave sm:w-24">{cuando(c.fecha)}</p>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{c.concepto || 'Monto escrito en caja'}</p>
        <p className="truncate font-mono text-xs text-suave">{c.uid}</p>
      </div>
      {c.ok ? (
        <>
          {c.recibo && <Link className="text-sm text-acento hover:underline" to={`/recibo/${c.recibo}`}>Recibo</Link>}
          <p className="cifras w-20 text-right font-semibold">{monto(c.monto)}</p>
        </>
      ) : (
        <>
          <Etiqueta tono="error">{motivoClaro(c.motivo)}</Etiqueta>
          <p className="cifras w-20 text-right text-suave line-through">{monto(c.monto)}</p>
        </>
      )}
    </li>
  )
}

/** Barras con lo vendido en cada hora del día, desde la primera venta hasta la hora actual. */
function PorHora({ horas, horaActual }: { horas: string[]; horaActual: number }) {
  const valores = horas.map(Number)
  const primera = valores.findIndex((v) => v > 0)
  if (primera < 0) return <p className="text-sm text-suave">Sin ventas hoy.</p>
  const inicio = Math.min(primera, Math.max(0, horaActual - 5))
  const tramo = valores.slice(inicio, horaActual + 1)
  const maximo = Math.max(...tramo)
  return (
    <div>
      <div className="flex h-24 items-end gap-1" role="img" aria-label="Ventas por hora">
        {tramo.map((valor, i) => (
          <div key={i} className="flex h-full flex-1 items-end" title={`${inicio + i}:00 — ${monto(valor)}`}>
            <div className="w-full rounded-t bg-marca" style={{ height: `${valor > 0 ? Math.max(6, (valor / maximo) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="cifras mt-1 flex justify-between text-xs text-suave">
        <span>{inicio}:00</span>
        <span>{horaActual}:00</span>
      </div>
    </div>
  )
}
