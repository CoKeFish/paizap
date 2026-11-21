// Pagar un cobro del terminal desde la billetera, sin acercar la tarjeta. Llega aquí quien
// escanea el QR de pago con la billetera en el navegador, o quien abre el enlace en la app. Paga
// la sesión de la cuenta, sin PIN, con el tope de gasto y el límite diario de siempre.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CircleCheck } from 'lucide-react'
import {
  ErrorDeServidor, esNativa, leerPedido, mensajeDe, pedir, servidor,
  type Cuenta, type Pedido, type ResultadoDePago,
} from '../lib/api'
import { monto, motivoDePago } from '../lib/formato'
import { useSesion, useSondeo } from '../lib/sesion'
import { Aviso, Boton, Cargando, Etiqueta } from '../components/ui'

export function Pagar() {
  const { id = '' } = useParams()
  // Cada cobro empieza de cero: sin la `key`, al abrir otro enlace con esta pantalla ya abierta
  // quedaría a la vista el «Pago aprobado» del cobro anterior.
  return <PantallaDePago key={id} id={id} />
}

function PantallaDePago({ id }: { id: string }) {
  const { estado, rol, error: errorDeSesion, reintentar } = useSesion()
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [uid, setUid] = useState('')
  const [pagando, setPagando] = useState(false)
  const [pago, setPago] = useState<ResultadoDePago | null>(null)
  const [error, setError] = useState('')

  // Mientras la pantalla está abierta, el cobro puede pagarse con una tarjeta o cancelarse en el
  // terminal: se vuelve a preguntar cada pocos segundos.
  useSondeo(async () => {
    try {
      setPedido(await leerPedido(id))
    } catch (fallo) {
      if (!pedido) setError(mensajeDe(fallo))
    }
  }, 3000, !pago)

  const esDueno = estado === 'abierta' && rol === 'dueno'
  useEffect(() => {
    if (!esDueno) return
    pedir<Cuenta>('GET', '/api/cuenta')
      .then((datos) => {
        setCuenta(datos)
        setUid((datos.tarjetas.find((t) => !t.bloqueada) ?? datos.tarjetas[0])?.uid ?? '')
      })
      .catch((fallo) => setError(mensajeDe(fallo)))
  }, [esDueno])

  const pagar = async () => {
    setPagando(true)
    setError('')
    try {
      setPago(await pedir<ResultadoDePago>('POST', `/api/pedidos/${id}/pagar`, { uid }))
    } catch (fallo) {
      setError(fallo instanceof ErrorDeServidor && fallo.motivo ? motivoDePago(fallo.motivo) : mensajeDe(fallo))
    } finally {
      setPagando(false)
    }
  }

  const elegida = cuenta?.tarjetas.find((t) => t.uid === uid)

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-5 py-10">
      {!pedido && (error ? <Aviso tono="error">{error}</Aviso> : <Cargando />)}

      {pedido && pago && (
        <section className="rounded-xl border border-borde bg-panel p-6 text-center">
          <CircleCheck className="mx-auto size-12 text-ok" aria-hidden />
          <h1 className="mt-3 text-xl font-bold">Pago aprobado</h1>
          <p className="cifras mt-2 text-4xl font-bold">
            {monto(pedido.monto)} <span className="text-lg font-semibold text-suave">{pedido.moneda}</span>
          </p>
          <p className="mt-1 text-sm text-suave">a {pedido.comercioNombre}</p>
          {pago.saldoCliente !== null && (
            <p className="cifras mt-4 text-sm text-suave">Te quedan {monto(pago.saldoCliente)} {pedido.moneda}.</p>
          )}
          <Link
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-marca px-4 text-sm font-semibold text-marca-texto"
            to={`/recibo/${pago.recibo}`}
          >
            Ver el recibo
          </Link>
        </section>
      )}

      {pedido && !pago && (
        <section className="space-y-4 rounded-xl border border-borde bg-panel p-6">
          <div>
            <p className="text-sm text-suave">{pedido.concepto || 'Total a pagar'}</p>
            {pedido.monto !== null && (
              <p className="cifras text-5xl font-bold">
                {monto(pedido.monto)} <span className="text-lg font-semibold text-suave">{pedido.moneda}</span>
              </p>
            )}
            <p className="mt-1 text-sm text-suave">{pedido.comercioNombre}</p>
          </div>

          {pedido.estado === 'pagado' && <Aviso tono="ok">Este cobro ya está pagado.</Aviso>}
          {pedido.estado === 'vencido' && <Aviso>Este cobro ya no está disponible. Pide en la caja que lo generen de nuevo.</Aviso>}

          {pedido.estado === 'pendiente' && (
            <>
              {estado === 'cargando' && <Cargando texto="Abriendo tu cuenta…" />}

              {estado === 'error' && (
                <>
                  <Aviso tono="error">{errorDeSesion}</Aviso>
                  <Boton ancho onClick={reintentar}>Reintentar</Boton>
                </>
              )}

              {(estado === 'sin-cuenta' || estado === 'sin-servidor') && (
                <>
                  <Aviso>Para pagar desde aquí hace falta tu cuenta de Toki en este dispositivo.</Aviso>
                  <Link className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-marca px-4 text-sm font-semibold text-marca-texto" to="/">
                    Entrar o crear mi cuenta
                  </Link>
                </>
              )}

              {estado === 'abierta' && rol === 'comercio' && (
                <Aviso>Entraste con la cuenta del comercio. Este cobro lo paga el cliente, con su tarjeta o con el QR.</Aviso>
              )}

              {esDueno && !cuenta && !error && <Cargando />}

              {esDueno && cuenta && cuenta.tarjetas.length === 0 && (
                <>
                  <Aviso>Para pagar con el QR hace falta una tarjeta vinculada a tu cuenta: el pago usa su límite diario.</Aviso>
                  <Link className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-marca px-4 text-sm font-semibold text-marca-texto" to="/">
                    Vincular una tarjeta
                  </Link>
                </>
              )}

              {esDueno && cuenta && cuenta.tarjetas.length > 0 && (
                <>
                  {cuenta.tarjetas.length > 1 ? (
                    <fieldset className="space-y-2">
                      <legend className="mb-1 text-sm font-medium">Pagar con</legend>
                      {cuenta.tarjetas.map((t) => (
                        <label key={t.uid} className={`flex items-center gap-3 rounded-lg border p-3 ${t.uid === uid ? 'border-acento' : 'border-borde'}`}>
                          <input type="radio" name="tarjeta" className="size-4 accent-acento" checked={t.uid === uid} onChange={() => setUid(t.uid)} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{t.nombre || 'Tarjeta'}</span>
                            <span className="block font-mono text-xs text-suave">{t.uid}</span>
                          </span>
                          {t.bloqueada && <Etiqueta tono="error">Bloqueada</Etiqueta>}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <p className="text-sm text-suave">
                      Se paga con la cuenta de {elegida?.nombre ? `«${elegida.nombre}»` : 'tu tarjeta'}, sin acercarla.
                    </p>
                  )}
                  <p className="cifras text-sm text-suave">
                    Saldo {monto(cuenta.saldo)} {pedido.moneda} · tope de gasto {monto(cuenta.permiso.restante)} {pedido.moneda}
                  </p>
                  {elegida?.bloqueada && <Aviso tono="aviso">Esa tarjeta está bloqueada. Desbloquéala en tu billetera para pagar.</Aviso>}
                  {error && <Aviso tono="error">{error}</Aviso>}
                  <Boton ancho ocupado={pagando} disabled={!elegida || elegida.bloqueada} onClick={pagar}>
                    {pagando ? 'Cobrando en Stellar…' : `Pagar ${monto(pedido.monto)} ${pedido.moneda}`}
                  </Boton>
                </>
              )}

              {/* En la web, quien no tiene la billetera aquí puede pagar con código de cuenta y PIN. */}
              {!esNativa && !(esDueno && cuenta && cuenta.tarjetas.length > 0) && estado !== 'cargando' && (
                <a className="block text-center text-sm text-acento hover:underline" href={`${servidor()}/p/${id}?simple=1`}>
                  Pagar con código de cuenta y PIN
                </a>
              )}
            </>
          )}
        </section>
      )}

      <Link className="text-center text-sm text-acento hover:underline" to="/">
        {esDueno ? 'Ir a mi billetera' : 'Ir a Toki'}
      </Link>
    </main>
  )
}
