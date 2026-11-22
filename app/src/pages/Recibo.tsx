// Recibo de un pago: lo abre el QR que muestra el terminal. No hace falta tener cuenta.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CircleCheck, ExternalLink } from 'lucide-react'
import { leerRecibo, mensajeDe, type Recibo as DatosDelRecibo } from '../lib/api'
import { cuentaCorta, fechaYHora, monto } from '../lib/formato'
import { Franja, Monto } from '../components/marca'
import { Aviso, Cargando, Cuadro, estiloDeBoton } from '../components/ui'

export function Recibo() {
  const { codigo = '' } = useParams()
  const [recibo, setRecibo] = useState<DatosDelRecibo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    leerRecibo(codigo).then(setRecibo).catch((fallo) => setError(mensajeDe(fallo)))
  }, [codigo])

  return (
    <>
      <Franja>
        {recibo && (
          <div className="mt-6">
            <h1 className="flex items-center gap-2 text-rayo">
              <CircleCheck className="size-8" aria-hidden />
              <span className="titulo text-4xl">Pago aprobado</span>
            </h1>
            {recibo.monto && <Monto valor={monto(recibo.monto)} moneda={recibo.moneda} className="mt-2 text-7xl" />}
          </div>
        )}
      </Franja>

      <main className="mx-auto max-w-md space-y-4 px-4 pt-4 pb-10">
        {error && <Aviso tono="error">{error}</Aviso>}
        {!recibo && !error && <Cargando />}
        {recibo && (
          <>
            <Cuadro>
              <dl className="space-y-2 text-sm">
                {recibo.concepto && <Linea nombre="Producto" valor={recibo.concepto} />}
                {recibo.fecha && <Linea nombre="Fecha" valor={fechaYHora(recibo.fecha)} />}
                <Linea nombre="Comercio" valor={cuentaCorta(recibo.comercio)} />
                <Linea nombre="Recibo" valor={recibo.codigo} />
              </dl>
              <p className="mt-3 text-sm text-suave">El pago quedó registrado en la red de Stellar. Cualquiera puede comprobarlo.</p>
            </Cuadro>
            <a className={estiloDeBoton('principal', true)} href={recibo.enlace} target="_blank" rel="noreferrer">
              Ver la transacción en Stellar <ExternalLink className="size-4" aria-hidden />
            </a>
          </>
        )}
        <Link className="block text-center text-sm font-semibold text-acento hover:underline" to="/">Ir a Paizap</Link>
      </main>
    </>
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
