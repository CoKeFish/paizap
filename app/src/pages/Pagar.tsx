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
import { Franja, Monto } from '../components/marca'
import { Aviso, Boton, Cargando, Cuadro, Etiqueta, estiloDeBoton } from '../components/ui'

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
  const puedePagar = esDueno && cuenta !== null && cuenta.tarjetas.length > 0

  return (
    <>
      {/* Arriba, en la franja: cuánto se paga y a quién. Cuando ya se pagó, la confirmación. */}
      <Franja>
        {pedido && (
          <div className="mt-6">
            {pago ? (
              <h1 className="flex items-center gap-2 text-rayo">
                <CircleCheck className="size-8" aria-hidden />
                <span className="titulo text-4xl">Pago aprobado</span>
              </h1>
            ) : (
              <p className="text-suave">{pedido.concepto || 'Total a pagar'}</p>
            )}
            {pedido.monto !== null && <Monto valor={monto(pedido.monto)} moneda={pedido.moneda} className="mt-2 text-7xl" />}
            <p className="mt-2 text-suave">{pago ? `a ${pedido.comercioNombre}` : pedido.comercioNombre}</p>
          </div>
        )}
      </Franja>

      <main className="mx-auto max-w-md space-y-4 px-4 pt-4 pb-10">
        {!pedido && (error ? <Aviso tono="error">{error}</Aviso> : <Cargando />)}

        {pedido && pago && (
          <>
            {pago.saldoCliente !== null && (
              <Cuadro>
                <p className="text-sm text-suave">Te queda en tu cuenta</p>
                <p className="titulo cifras mt-1 text-4xl">
                  {monto(pago.saldoCliente)} <span className="text-[0.5em] text-suave">{pedido.moneda}</span>
                </p>
              </Cuadro>
            )}
            <Link className={estiloDeBoton('principal', true)} to={`/recibo/${pago.recibo}`}>Ver el recibo</Link>
          </>
        )}

        {pedido && !pago && pedido.estado === 'pagado' && <Aviso tono="ok">Este cobro ya está pagado.</Aviso>}
        {pedido && !pago && pedido.estado === 'vencido' && (
          <Aviso>Este cobro ya no está disponible. Pide en la caja que lo generen de nuevo.</Aviso>
        )}

        {pedido && !pago && pedido.estado === 'pendiente' && (
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
                <Aviso>Para pagar desde aquí hace falta tu cuenta de Paizap en este dispositivo.</Aviso>
                <Link className={estiloDeBoton('principal', true)} to="/">Entrar o crear mi cuenta</Link>
              </>
            )}

            {estado === 'abierta' && rol === 'comercio' && (
              <Aviso>Entraste con la cuenta del comercio. Este cobro lo paga el cliente, con su tarjeta o con el QR.</Aviso>
            )}

            {esDueno && !cuenta && !error && <Cargando />}

            {esDueno && cuenta && cuenta.tarjetas.length === 0 && (
              <>
                <Aviso>Para pagar con el QR hace falta una tarjeta vinculada a tu cuenta: el pago usa su límite diario.</Aviso>
                <Link className={estiloDeBoton('principal', true)} to="/">Vincular una tarjeta</Link>
              </>
            )}

            {puedePagar && cuenta && (
              <>
                <Cuadro>
                  {cuenta.tarjetas.length > 1 ? (
                    <fieldset className="space-y-2">
                      <legend className="mb-2 text-sm font-medium">Pagar con</legend>
                      {cuenta.tarjetas.map((t) => (
                        <label key={t.uid} className={`flex items-center gap-3 rounded-xl border p-3 ${t.uid === uid ? 'border-texto' : 'border-borde'}`}>
                          <input type="radio" name="tarjeta" className="size-4 accent-noche" checked={t.uid === uid} onChange={() => setUid(t.uid)} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{t.nombre || 'Tarjeta'}</span>
                            <span className="block font-mono text-xs text-suave">{t.uid}</span>
                          </span>
                          {t.bloqueada && <Etiqueta tono="error">Bloqueada</Etiqueta>}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <p className="text-sm">
                      Se paga con la cuenta de {elegida?.nombre ? `«${elegida.nombre}»` : 'tu tarjeta'}, sin acercarla.
                    </p>
                  )}
                  <p className="cifras mt-3 border-t border-borde pt-3 text-sm text-suave">
                    Saldo {monto(cuenta.saldo)} {pedido.moneda} · tope de gasto {monto(cuenta.permiso.restante)} {pedido.moneda}
                  </p>
                </Cuadro>
                {elegida?.bloqueada && <Aviso tono="aviso">Esa tarjeta está bloqueada. Desbloquéala en tu billetera para pagar.</Aviso>}
                {error && <Aviso tono="error">{error}</Aviso>}
                <Boton ancho variante="rayo" className="min-h-14 text-2xl" ocupado={pagando} disabled={!elegida || elegida.bloqueada} onClick={pagar}>
                  {pagando ? 'Cobrando en Stellar…' : `Pagar ${monto(pedido.monto)} ${pedido.moneda}`}
                </Boton>
              </>
            )}

            {/* En la web, quien no tiene la billetera aquí puede pagar con código de cuenta y PIN. */}
            {!esNativa && !puedePagar && estado !== 'cargando' && (
              <a className="block text-center text-sm font-semibold text-acento hover:underline" href={`${servidor()}/p/${id}?simple=1`}>
                Pagar con código de cuenta y PIN
              </a>
            )}
          </>
        )}

        <Link className="block text-center text-sm font-semibold text-acento hover:underline" to="/">
          {esDueno ? 'Ir a mi billetera' : 'Ir a Paizap'}
        </Link>
      </main>
    </>
  )
}
