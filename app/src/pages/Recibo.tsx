// Recibo de un pago: lo abre el QR que muestra el terminal. No hace falta tener cuenta.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CircleCheck, ExternalLink } from 'lucide-react'
import { leerRecibo, mensajeDe, type Recibo as DatosDelRecibo } from '../lib/api'
import { cuentaCorta, fechaYHora, monto } from '../lib/formato'
import { Aviso, Cargando } from '../components/ui'

export function Recibo() {
  const { codigo = '' } = useParams()
  const [recibo, setRecibo] = useState<DatosDelRecibo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    leerRecibo(codigo).then(setRecibo).catch((fallo) => setError(mensajeDe(fallo)))
  }, [codigo])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-5 py-10">
      {error && <Aviso tono="error">{error}</Aviso>}
      {!recibo && !error && <Cargando />}
      {recibo && (
        <section className="rounded-xl border border-borde bg-panel p-6 text-center">
          <CircleCheck className="mx-auto size-12 text-ok" aria-hidden />
          <h1 className="mt-3 text-xl font-bold">Pago aprobado</h1>
          {recibo.monto && (
            <p className="cifras mt-2 text-4xl font-bold">
              {monto(recibo.monto)} <span className="text-lg font-semibold text-suave">{recibo.moneda}</span>
            </p>
          )}
          <dl className="mt-5 space-y-2 text-left text-sm">
            {recibo.concepto && <Linea nombre="Producto" valor={recibo.concepto} />}
            {recibo.fecha && <Linea nombre="Fecha" valor={fechaYHora(recibo.fecha)} />}
            <Linea nombre="Comercio" valor={cuentaCorta(recibo.comercio)} />
            <Linea nombre="Recibo" valor={recibo.codigo} />
          </dl>
          <a
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-marca px-4 text-sm font-semibold text-marca-texto"
            href={recibo.enlace}
            target="_blank"
            rel="noreferrer"
          >
            Ver la transacción en Stellar <ExternalLink className="size-4" aria-hidden />
          </a>
          <p className="mt-3 text-xs text-suave">El pago quedó registrado en la red de Stellar. Cualquiera puede comprobarlo.</p>
        </section>
      )}
      <Link className="text-center text-sm text-acento hover:underline" to="/">Ir a Toki</Link>
    </main>
  )
}

function Linea({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-borde pb-2">
      <dt className="text-suave">{nombre}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  )
}
