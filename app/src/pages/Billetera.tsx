// Billetera del dueño de la cuenta: saldo, tope de gasto (el permiso que firma para Toki),
// tarjetas y movimientos.
import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { ArrowDownLeft, Check, CreditCard, Lock, QrCode, Settings, ShieldCheck, X } from 'lucide-react'
import { mensajeDe, pedir, type Cuenta, type Movimiento, type Tarjeta, type TarjetaNueva } from '../lib/api'
import { firmarPermiso } from '../lib/billetera'
import { cuando, cuentaCorta, diasHasta, fechaLarga, hace, monto, motivoClaro } from '../lib/formato'
import { useSesion, useSondeo } from '../lib/sesion'
import { Franja, Monto } from '../components/marca'
import { Aviso, Barra, Boton, Campo, Cargando, Copiar, Cuadro, Etiqueta, Interruptor, Qr, Ventana } from '../components/ui'
import { Ajustes } from './Ajustes'

type Abierta = null | 'recargar' | 'tope' | 'vincular' | 'ajustes' | { tarjeta: Tarjeta }

export function Billetera() {
  const { info, cuenta: direccion } = useSesion()
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState<Abierta>(null)

  const cargar = useCallback(async () => {
    try {
      setCuenta(await pedir<Cuenta>('GET', '/api/cuenta'))
      setError('')
    } catch (fallo) {
      setError(mensajeDe(fallo))
    }
  }, [])

  // Cada pocos segundos pregunta si hay movimientos nuevos (no consulta la red); cuando los hay,
  // o cada medio minuto, vuelve a leer el saldo y el tope.
  const [ultimaLectura, setUltimaLectura] = useState(0)
  useSondeo(async () => {
    if (!cuenta || Date.now() - ultimaLectura > 30000) {
      setUltimaLectura(Date.now())
      return cargar()
    }
    const { n } = await pedir<{ n: number }>('GET', '/api/movimientos')
    if (n !== cuenta.n) await cargar()
  }, 3000)

  if (!cuenta || !info) {
    return (
      <>
        <Franja arco={false} />
        <main className="mx-auto max-w-md px-4 py-6">
          {error ? <Aviso tono="error">{error}</Aviso> : <Cargando />}
        </main>
      </>
    )
  }

  const moneda = info.moneda
  const restante = Number(cuenta.permiso.restante)
  const cerrar = () => setAbierta(null)
  const alTerminar = () => {
    cerrar()
    cargar()
  }
  const nombreDe = (uid?: string) => cuenta.tarjetas.find((t) => t.uid === uid)?.nombre || uid || ''

  return (
    <>
    {/* Arriba, en la franja: el saldo y la acción principal. */}
    <Franja
      accion={
        <Boton variante="sobre-noche" onClick={() => setAbierta('ajustes')}>
          <Settings className="size-4" aria-hidden /> Mi cuenta
        </Boton>
      }
    >
      <h1 className="mt-5 text-sm text-suave">Saldo de la cuenta {cuentaCorta(direccion)}</h1>
      <Monto valor={monto(cuenta.saldo)} moneda={moneda} className="mt-1 text-6xl" />
      <Boton variante="rayo" className="mt-5" onClick={() => setAbierta('recargar')}>
        <ArrowDownLeft className="size-5" aria-hidden /> Recargar
      </Boton>
    </Franja>

    <main className="mx-auto max-w-md space-y-4 px-4 pt-4 pb-10">
      {error && <Aviso tono="error">{error}</Aviso>}

      <Pasos cuenta={cuenta} abrir={setAbierta} />

      <Cuadro
        titulo="Tope de gasto"
        accion={cuenta.existe && <Boton variante="texto" onClick={() => setAbierta('tope')}>{restante > 0 ? 'Cambiar' : 'Firmar'}</Boton>}
      >
        {restante > 0 ? (
          <div className="space-y-2">
            <p className="titulo cifras text-4xl">
              {monto(restante)} <span className="text-[0.5em] text-suave">{moneda}</span>
            </p>
            {cuenta.permiso.firmado && Number(cuenta.permiso.firmado) >= restante && (
              <>
                <Barra valor={restante} total={Number(cuenta.permiso.firmado)} />
                <p className="text-sm text-suave">Quedan {monto(restante)} de los {monto(cuenta.permiso.firmado)} que firmaste.</p>
              </>
            )}
            <p className="text-sm text-suave">
              Es lo máximo que tus tarjetas pueden gastar en total. La red de Stellar no deja cobrar más.
              {cuenta.permiso.vence && ` Vence el ${fechaLarga(cuenta.permiso.vence.fecha)} (en ${diasHasta(cuenta.permiso.vence.fecha)} días).`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-suave">
            Tus tarjetas todavía no pueden pagar. Firma un tope: Paizap podrá cobrar hasta ese monto y nada más.
          </p>
        )}
      </Cuadro>

      <Cuadro titulo="Tarjetas" accion={<Boton variante="texto" onClick={() => setAbierta('vincular')}>Vincular tarjeta</Boton>}>
        {cuenta.tarjetas.length === 0 ? (
          <p className="text-sm text-suave">Todavía no tienes tarjetas. Vincula una para pagar con un toque.</p>
        ) : (
          <>
            <ul className="divide-y divide-borde">
              {cuenta.tarjetas.map((tarjeta) => (
                <FilaDeTarjeta key={tarjeta.uid} tarjeta={tarjeta} limitePorDefecto={cuenta.limiteDiario} moneda={moneda} alCambiar={cargar} editar={() => setAbierta({ tarjeta })} />
              ))}
            </ul>
            <p className="mt-3 flex items-start gap-2 border-t border-borde pt-3 text-sm text-suave">
              <QrCode className="mt-0.5 size-4 shrink-0" aria-hidden />
              También pagas sin la tarjeta: escanea con la cámara el QR que muestra el terminal.
            </p>
          </>
        )}
      </Cuadro>

      <Cuadro titulo="Movimientos">
        {cuenta.movimientos.length === 0 ? (
          <p className="text-sm text-suave">Aquí van a aparecer tus pagos y recargas.</p>
        ) : (
          <ul className="divide-y divide-borde">
            {cuenta.movimientos.map((m) => (
              <FilaDeMovimiento key={m.n} m={m} moneda={moneda} tarjeta={nombreDe(m.uid)} />
            ))}
          </ul>
        )}
      </Cuadro>

      {abierta === 'recargar' && <Recargar cuenta={cuenta} alCerrar={cerrar} alTerminar={cargar} />}
      {abierta === 'tope' && <CambiarTope cuenta={cuenta} alCerrar={cerrar} alTerminar={alTerminar} />}
      {abierta === 'vincular' && <VincularTarjeta alCerrar={cerrar} alTerminar={alTerminar} />}
      {abierta === 'ajustes' && <Ajustes alCerrar={cerrar} />}
      {abierta && typeof abierta === 'object' && (
        <EditarTarjeta tarjeta={abierta.tarjeta} limitePorDefecto={cuenta.limiteDiario} moneda={moneda} alCerrar={cerrar} alTerminar={alTerminar} />
      )}
    </main>
    </>
  )
}

/** Los tres pasos para que una cuenta nueva pueda pagar. Desaparecen cuando están hechos. */
function Pasos({ cuenta, abrir }: { cuenta: Cuenta; abrir: (ventana: Abierta) => void }) {
  const pasos = [
    { hecho: cuenta.existe, texto: 'Activa tu cuenta con una recarga', accion: 'Recargar', ventana: 'recargar' as const },
    { hecho: Number(cuenta.permiso.restante) > 0, texto: 'Firma tu tope de gasto', accion: 'Firmar', ventana: 'tope' as const },
    { hecho: cuenta.tarjetas.length > 0, texto: 'Vincula tu tarjeta', accion: 'Vincular', ventana: 'vincular' as const },
  ]
  if (pasos.every((p) => p.hecho)) return null
  const siguiente = pasos.findIndex((p) => !p.hecho)
  return (
    <Cuadro titulo="Para empezar a pagar">
      <ol className="space-y-3">
        {pasos.map((paso, i) => (
          <li key={paso.texto} className="flex items-center gap-3">
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${paso.hecho ? 'bg-ok-fondo text-ok' : 'bg-fondo text-suave border border-borde'}`}>
              {paso.hecho ? <Check className="size-4" aria-label="Hecho" /> : i + 1}
            </span>
            <span className={`flex-1 text-sm ${paso.hecho ? 'text-suave line-through' : 'font-medium'}`}>{paso.texto}</span>
            {i === siguiente && <Boton onClick={() => abrir(paso.ventana)}>{paso.accion}</Boton>}
          </li>
        ))}
      </ol>
    </Cuadro>
  )
}

function FilaDeTarjeta({ tarjeta, limitePorDefecto, moneda, alCambiar, editar }: { tarjeta: Tarjeta; limitePorDefecto: number; moneda: string; alCambiar: () => void; editar: () => void }) {
  const [ocupado, setOcupado] = useState(false)
  const limite = tarjeta.limiteDiario ?? limitePorDefecto
  const bloquear = async (bloqueada: boolean) => {
    setOcupado(true)
    try {
      await pedir('PATCH', `/api/tarjetas/${tarjeta.uid}`, { bloqueada })
      alCambiar()
    } finally {
      setOcupado(false)
    }
  }
  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <CreditCard className="mt-0.5 size-5 shrink-0 text-suave" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{tarjeta.nombre || 'Tarjeta'}</p>
          <p className="font-mono text-xs text-suave">{tarjeta.uid}</p>
        </div>
        {tarjeta.bloqueada ? <Etiqueta tono="error">Bloqueada</Etiqueta> : <Etiqueta tono="ok">Activa</Etiqueta>}
      </div>
      {/* La barra avisa en naranja cuando la tarjeta ya gastó casi todo su límite del día. */}
      <Barra valor={Number(tarjeta.gastadoHoy)} total={limite} tono={Number(tarjeta.gastadoHoy) >= limite * 0.8 ? 'aviso' : 'marca'} />
      <p className="cifras text-sm text-suave">Hoy gastó {monto(tarjeta.gastadoHoy)} de {monto(limite)} {moneda}</p>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Interruptor activo={tarjeta.bloqueada} alCambiar={bloquear} etiqueta={`Bloquear ${tarjeta.nombre || tarjeta.uid}`} deshabilitado={ocupado} />
          <Lock className="size-4 text-suave" aria-hidden /> Bloquear
        </label>
        <Boton variante="texto" onClick={editar}>Nombre, límite y PIN</Boton>
      </div>
    </li>
  )
}

function FilaDeMovimiento({ m, moneda, tarjeta }: { m: Movimiento; moneda: string; tarjeta: string }) {
  if (m.tipo === 'permiso') {
    return (
      <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
        <ShieldCheck className="size-5 shrink-0 text-suave" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{Number(m.monto) > 0 ? `Firmaste un tope de ${monto(m.monto)} ${moneda}` : 'Quitaste el permiso de gasto'}</p>
          <p className="text-xs text-suave">{cuando(m.fecha)}</p>
        </div>
      </li>
    )
  }
  if (m.tipo === 'recarga') {
    return (
      <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
        <ArrowDownLeft className="size-5 shrink-0 text-ok" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{m.concepto}</p>
          <p className="text-xs text-suave">{cuando(m.fecha)}</p>
        </div>
        {m.monto && <p className="cifras font-semibold text-ok">+{monto(m.monto)}</p>}
      </li>
    )
  }
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      {!m.ok ? (
        <X className="size-5 shrink-0 text-error" aria-hidden />
      ) : m.medio === 'qr' ? (
        <QrCode className="size-5 shrink-0 text-suave" aria-hidden />
      ) : (
        <CreditCard className="size-5 shrink-0 text-suave" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{m.ok ? m.concepto || 'Pago' : motivoClaro(m.motivo)}</p>
        <p className="truncate text-xs text-suave">
          {tarjeta}{m.medio === 'qr' && ', con QR'} · {cuando(m.fecha)}
          {m.recibo && <> · <Link className="text-acento hover:underline" to={`/recibo/${m.recibo}`}>Recibo</Link></>}
        </p>
      </div>
      <p className={`cifras font-semibold ${m.ok ? '' : 'text-suave line-through'}`}>−{monto(m.monto)}</p>
    </li>
  )
}

function Recargar({ cuenta, alCerrar, alTerminar }: { cuenta: Cuenta; alCerrar: () => void; alTerminar: () => void }) {
  const { info } = useSesion()
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null)

  const recargar = async () => {
    setOcupado(true)
    setMensaje(null)
    try {
      const r = await pedir<{ creada?: boolean; monto?: string }>('POST', '/api/cuenta/recarga')
      setMensaje({ tono: 'ok', texto: r.creada ? 'Cuenta activada en testnet, con saldo de prueba.' : `Llegaron ${monto(r.monto)} ${info?.moneda}.` })
      alTerminar()
    } catch (fallo) {
      setMensaje({ tono: 'error', texto: mensajeDe(fallo) })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Ventana titulo="Recargar" alCerrar={alCerrar}>
      {info?.recargaPrueba && (
        <div className="space-y-2">
          <p className="text-sm text-suave">
            {cuenta.existe
              ? `Estás en la red de pruebas de Stellar. La recarga de prueba manda ${monto(info.recargaPrueba)} ${info.moneda} a tu cuenta.`
              : 'Estás en la red de pruebas de Stellar. La primera recarga crea tu cuenta en la red, con saldo de prueba.'}
          </p>
          <Boton ancho variante="rayo" ocupado={ocupado} onClick={recargar}>
            {cuenta.existe ? `Recargar ${monto(info.recargaPrueba)} ${info.moneda} de prueba` : 'Activar mi cuenta'}
          </Boton>
        </div>
      )}
      {mensaje && <Aviso tono={mensaje.tono}>{mensaje.texto}</Aviso>}
      <div className="space-y-2 border-t border-borde pt-4">
        <p className="text-sm font-medium">Recibir desde otra billetera</p>
        <p className="text-sm text-suave">Manda {info?.moneda} en Stellar a esta dirección y el saldo aparece aquí.</p>
        <div className="flex justify-center"><Qr texto={cuenta.cuenta} /></div>
        <p className="break-all rounded-lg bg-fondo p-3 font-mono text-xs">{cuenta.cuenta}</p>
        <Copiar texto={cuenta.cuenta} etiqueta="Copiar dirección" />
      </div>
    </Ventana>
  )
}

const DURACIONES = [7, 30, 90]

function CambiarTope({ cuenta, alCerrar, alTerminar }: { cuenta: Cuenta; alCerrar: () => void; alTerminar: () => void }) {
  const { info, llave } = useSesion()
  const [valor, setValor] = useState(cuenta.permiso.firmado && Number(cuenta.permiso.firmado) > 0 ? cuenta.permiso.firmado : '50')
  const [dias, setDias] = useState(30)
  const [paso, setPaso] = useState('')
  const [error, setError] = useState('')
  const tienePermiso = Number(cuenta.permiso.restante) > 0

  // El servidor arma el permiso; la app comprueba que diga lo pedido, lo firma aquí con la llave
  // del dispositivo y lo devuelve para que el servidor lo mande a la red.
  const firmar = async (tope: string) => {
    if (!info || !llave) return
    setError('')
    try {
      if (!/^\d+([.,]\d{1,2})?$/.test(tope.trim())) throw new Error('Escribe un monto, por ejemplo 50 o 25,50.')
      const pedido = tope.trim().replace(',', '.')
      setPaso('Preparando el permiso…')
      const preparado = await pedir<{ xdr: string }>('POST', '/api/permiso/preparar', { monto: pedido, dias })
      setPaso('Firmando en este dispositivo…')
      const firmado = firmarPermiso(preparado.xdr, info.red, llave, { token: info.token, gastador: info.toki, monto: pedido })
      setPaso('Registrando en Stellar…')
      await pedir('POST', '/api/permiso', { xdr: firmado })
      alTerminar()
    } catch (fallo) {
      setError(mensajeDe(fallo))
      setPaso('')
    }
  }

  return (
    <Ventana titulo="Tope de gasto" alCerrar={alCerrar}>
      <p className="text-sm text-suave">
        Con tu firma, Paizap puede cobrar de tu cuenta hasta este monto en total, hasta que venza. La plata se queda en tu cuenta
        hasta que pagas, y la red de Stellar no deja pasar del tope.
      </p>
      <Campo etiqueta={`Tope (${info?.moneda})`} value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" disabled={Boolean(paso)} />
      <div>
        <p className="mb-1 text-sm font-medium">Vence en</p>
        <div className="grid grid-cols-3 gap-2">
          {DURACIONES.map((d) => (
            <Boton key={d} variante={d === dias ? 'principal' : 'secundario'} aria-pressed={d === dias} disabled={Boolean(paso)} onClick={() => setDias(d)}>
              {d} días
            </Boton>
          ))}
        </div>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {paso && <Aviso>{paso}</Aviso>}
      <Boton ancho variante="rayo" ocupado={Boolean(paso)} onClick={() => firmar(valor)}>Firmar tope</Boton>
      {tienePermiso && (
        <Boton ancho variante="peligro" disabled={Boolean(paso)} onClick={() => firmar('0')}>Quitar el permiso</Boton>
      )}
    </Ventana>
  )
}

function VincularTarjeta({ alCerrar, alTerminar }: { alCerrar: () => void; alTerminar: () => void }) {
  const [nuevas, setNuevas] = useState<TarjetaNueva[]>([])
  const [uid, setUid] = useState('')
  const [nombre, setNombre] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  useSondeo(async () => {
    setNuevas((await pedir<{ tarjetas: TarjetaNueva[] }>('GET', '/api/tarjetas/nuevas')).tarjetas)
  }, 2000)

  const vincular = async (numero: string) => {
    setOcupado(true)
    setError('')
    try {
      await pedir('POST', '/api/tarjetas', { uid: numero, nombre })
      alTerminar()
    } catch (fallo) {
      setError(mensajeDe(fallo))
      setOcupado(false)
    }
  }

  return (
    <Ventana titulo="Vincular tarjeta" alCerrar={alCerrar}>
      <Campo etiqueta="Nombre de la tarjeta" ayuda="Para reconocerla, por ejemplo de quién es." placeholder="Recreo de Ana" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={24} />

      <div className="space-y-2">
        <p className="text-sm font-medium">Tarjetas nuevas vistas en el terminal</p>
        {nuevas.length === 0 ? (
          <p className="text-sm text-suave">
            Pide un cobro en el terminal y acerca la tarjeta nueva. El terminal dirá «No registrada» y la tarjeta aparecerá aquí.
          </p>
        ) : (
          <ul className="space-y-2">
            {nuevas.map((t) => (
              <li key={t.uid} className="flex items-center justify-between gap-3 rounded-lg border border-borde p-3">
                <div>
                  <p className="font-mono text-sm">{t.uid}</p>
                  <p className="text-xs text-suave">Vista {hace(t.fecha)}</p>
                </div>
                <Boton ocupado={ocupado} onClick={() => vincular(t.uid)}>Vincular</Boton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="space-y-2 border-t border-borde pt-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          vincular(uid)
        }}
      >
        <Campo etiqueta="O escribe su número" ayuda="Es el UID que muestra el terminal." placeholder="A7:08:0B:75" value={uid} onChange={(e) => setUid(e.target.value)} autoCapitalize="characters" spellCheck={false} />
        <Boton type="submit" variante="secundario" ocupado={ocupado} disabled={!uid.trim()}>Vincular con este número</Boton>
      </form>
      {error && <Aviso tono="error">{error}</Aviso>}
    </Ventana>
  )
}

function EditarTarjeta({ tarjeta, limitePorDefecto, moneda, alCerrar, alTerminar }: { tarjeta: Tarjeta; limitePorDefecto: number; moneda: string; alCerrar: () => void; alTerminar: () => void }) {
  const [nombre, setNombre] = useState(tarjeta.nombre)
  const [limite, setLimite] = useState(tarjeta.limiteDiario === null ? '' : String(tarjeta.limiteDiario))
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState('')
  // El PIN recién creado: el servidor lo entrega una sola vez y guarda solo su hash.
  const [acceso, setAcceso] = useState<{ codigo: string; pin: string } | null>(null)

  const crearPin = async () => {
    setOcupado(true)
    setError('')
    try {
      setAcceso(await pedir<{ codigo: string; pin: string }>('POST', `/api/tarjetas/${tarjeta.uid}/pin`))
    } catch (fallo) {
      setError(mensajeDe(fallo))
    } finally {
      setOcupado(false)
    }
  }

  const hacer = async (tarea: () => Promise<unknown>) => {
    setOcupado(true)
    setError('')
    try {
      await tarea()
      alTerminar()
    } catch (fallo) {
      setError(mensajeDe(fallo))
      setOcupado(false)
    }
  }
  const guardar = () => {
    const numero = Number(limite.replace(',', '.'))
    if (limite.trim() && !(numero > 0)) return setError('El límite diario es un monto mayor a cero, o vacío para usar el de Paizap.')
    return hacer(() => pedir('PATCH', `/api/tarjetas/${tarjeta.uid}`, { nombre, limiteDiario: limite.trim() ? numero : null }))
  }

  return (
    <Ventana titulo={tarjeta.nombre || 'Tarjeta'} alCerrar={alCerrar}>
      <p className="font-mono text-sm text-suave">{tarjeta.uid}</p>
      <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={24} />
      <Campo
        etiqueta={`Límite diario (${moneda})`}
        ayuda={`Lo máximo que esta tarjeta puede gastar por día. Vacío: ${monto(limitePorDefecto)}, el límite de Paizap.`}
        value={limite}
        onChange={(e) => setLimite(e.target.value)}
        inputMode="decimal"
        placeholder={String(limitePorDefecto)}
      />
      {error && <Aviso tono="error">{error}</Aviso>}
      <Boton ancho ocupado={ocupado} onClick={guardar}>Guardar cambios</Boton>

      <div className="space-y-2 border-t border-borde pt-4">
        <p className="text-sm font-medium">Pagar con el QR del terminal</p>
        <p className="text-sm text-suave">
          Con tu billetera pagas el QR sin PIN. Para pagar desde un celular que no la tiene, la página del QR pide
          el código de cuenta y un PIN.
        </p>
        {acceso ? (
          <div className="rounded-lg bg-fondo p-3">
            <dl className="cifras grid grid-cols-2 gap-2 text-center">
              <div>
                <dt className="text-xs text-suave">Código de cuenta</dt>
                <dd className="text-2xl font-bold">{acceso.codigo}</dd>
              </div>
              <div>
                <dt className="text-xs text-suave">PIN</dt>
                <dd className="text-2xl font-bold">{acceso.pin}</dd>
              </div>
            </dl>
            <p className="mt-2 text-center text-xs text-suave">Anota el PIN: no se vuelve a mostrar. Si lo olvidas, crea otro.</p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">
              {tarjeta.codigo ? <>Código de cuenta <span className="cifras font-semibold">{tarjeta.codigo}</span></> : 'Todavía sin PIN'}
            </p>
            <Boton variante="secundario" disabled={ocupado} onClick={crearPin}>{tarjeta.tienePin ? 'Cambiar el PIN' : 'Crear un PIN'}</Boton>
          </div>
        )}
      </div>

      <div className="border-t border-borde pt-4">
        {confirmar ? (
          <div className="space-y-2">
            <Aviso tono="aviso">La tarjeta deja de pagar y queda libre para vincularla a otra cuenta.</Aviso>
            <div className="flex gap-2">
              <Boton variante="peligro" disabled={ocupado} onClick={() => hacer(() => pedir('DELETE', `/api/tarjetas/${tarjeta.uid}`))}>Desvincular</Boton>
              <Boton variante="secundario" onClick={() => setConfirmar(false)}>Cancelar</Boton>
            </div>
          </div>
        ) : (
          <Boton variante="peligro" onClick={() => setConfirmar(true)}>Desvincular esta tarjeta</Boton>
        )}
      </div>
    </Ventana>
  )
}
