// Ajustes de la cuenta: su dirección, el respaldo de la llave, el servidor y cerrar sesión.
import { useState } from 'react'
import { cambiarServidor, esNativa, servidor } from '../lib/api'
import { useSesion } from '../lib/sesion'
import { Aviso, Boton, Campo, Copiar, Qr, Ventana } from '../components/ui'

/** En la app de Android, a qué servidor de Paizap se conecta. En la web no hace falta: es el mismo. */
export function DireccionDelServidor() {
  const { reintentar } = useSesion()
  const [url, setUrl] = useState(servidor())
  if (!esNativa) return null
  return (
    <form
      className="space-y-2"
      onSubmit={(evento) => {
        evento.preventDefault()
        cambiarServidor(url)
        reintentar()
      }}
    >
      <Campo
        etiqueta="Servidor de Paizap"
        placeholder="http://bore.pub:48123"
        value={url}
        onChange={(evento) => setUrl(evento.target.value)}
        inputMode="url"
        autoCapitalize="none"
        spellCheck={false}
      />
      <Boton variante="secundario" type="submit">Guardar y conectar</Boton>
    </form>
  )
}

export function Ajustes({ alCerrar }: { alCerrar: () => void }) {
  const { cuenta, llave, info, salir } = useSesion()
  const [verLlave, setVerLlave] = useState(false)
  const [confirmarSalida, setConfirmarSalida] = useState(false)

  return (
    <Ventana titulo="Mi cuenta" alCerrar={alCerrar}>
      <div className="space-y-2">
        <p className="text-sm font-medium">Dirección de la cuenta</p>
        <p className="break-all rounded-lg bg-fondo p-3 font-mono text-sm">{cuenta}</p>
        <div className="flex items-center gap-3">
          <Copiar texto={cuenta} etiqueta="Copiar dirección" />
        </div>
        <Qr texto={cuenta} lado={140} />
      </div>

      <div className="space-y-2 border-t border-borde pt-4">
        <p className="text-sm font-medium">Respaldo de la llave</p>
        <p className="text-sm text-suave">
          Con esta llave se entra a la cuenta desde otro celular. Quien la tenga puede mover tu saldo: guárdala donde nadie más la vea.
        </p>
        {verLlave && llave ? (
          <>
            <p className="break-all rounded-lg bg-aviso-fondo p-3 font-mono text-sm">{llave.secret()}</p>
            <div className="flex gap-2">
              <Copiar texto={llave.secret()} etiqueta="Copiar llave" />
              <Boton variante="secundario" onClick={() => setVerLlave(false)}>Ocultar</Boton>
            </div>
          </>
        ) : (
          <Boton variante="secundario" onClick={() => setVerLlave(true)}>Mostrar mi llave</Boton>
        )}
      </div>

      {info && (
        <p className="border-t border-borde pt-4 text-sm text-suave">
          Red de Stellar: {info.red}. Moneda: {info.moneda}.
        </p>
      )}

      {esNativa && (
        <div className="border-t border-borde pt-4">
          <DireccionDelServidor />
        </div>
      )}

      <div className="space-y-2 border-t border-borde pt-4">
        {confirmarSalida ? (
          <>
            <Aviso tono="aviso">
              Al cerrar sesión la llave se borra de este dispositivo. Sin el respaldo de la llave no podrás volver a entrar a esta cuenta.
            </Aviso>
            <div className="flex gap-2">
              <Boton variante="peligro" onClick={salir}>Borrar la llave y salir</Boton>
              <Boton variante="secundario" onClick={() => setConfirmarSalida(false)}>Cancelar</Boton>
            </div>
          </>
        ) : (
          <Boton variante="peligro" onClick={() => setConfirmarSalida(true)}>Cerrar sesión</Boton>
        )}
      </div>
    </Ventana>
  )
}
