// Primera pantalla: crear una cuenta nueva o entrar con una que ya existe. No hay usuario ni
// contraseña: la cuenta es una llave que queda guardada en este dispositivo.
import { useState } from 'react'
import { mensajeDe } from '../lib/api'
import { crearLlave, leerLlave } from '../lib/billetera'
import { useSesion } from '../lib/sesion'
import { Aviso, Boton, Campo } from '../components/ui'
import { DireccionDelServidor } from './Ajustes'

export function Entrada() {
  const { entrar, info } = useSesion()
  const [conLlave, setConLlave] = useState(false)
  const [secreto, setSecreto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const entrarCon = async (llave: ReturnType<typeof crearLlave> | null) => {
    if (!llave) return setError('Esa llave no es válida. Empieza con S y tiene 56 letras y números.')
    setOcupado(true)
    setError('')
    try {
      await entrar(llave)
    } catch (fallo) {
      setError(mensajeDe(fallo))
      setOcupado(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-5 py-10">
      <header>
        <h1 className="text-4xl font-bold">Toki</h1>
        <p className="mt-2 text-lg text-suave">Paga con un toque de tu tarjeta. Tú decides cuánto se puede gastar.</p>
      </header>

      {error && <Aviso tono="error">{error}</Aviso>}

      {!conLlave ? (
        <div className="space-y-3">
          <Boton ancho ocupado={ocupado} onClick={() => entrarCon(crearLlave())}>Crear mi cuenta</Boton>
          <Boton ancho variante="secundario" disabled={ocupado} onClick={() => setConLlave(true)}>Ya tengo una cuenta</Boton>
          <p className="text-sm text-suave">
            La cuenta se crea en este dispositivo y solo tú tienes su llave. Toki no la guarda ni la puede recuperar.
          </p>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(evento) => {
            evento.preventDefault()
            entrarCon(leerLlave(secreto))
          }}
        >
          <Campo
            etiqueta="Llave secreta de la cuenta"
            ayuda="Si eres el comercio, entra con la llave de la cuenta que recibe los pagos."
            placeholder="S…"
            value={secreto}
            onChange={(evento) => setSecreto(evento.target.value)}
            type="password"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <Boton ancho type="submit" ocupado={ocupado}>Entrar</Boton>
          <Boton ancho variante="secundario" disabled={ocupado} onClick={() => setConLlave(false)}>Volver</Boton>
        </form>
      )}

      <footer className="space-y-3 border-t border-borde pt-4 text-sm text-suave">
        {info && <p>Red de Stellar: {info.red}. Moneda: {info.moneda}.</p>}
        <DireccionDelServidor />
      </footer>
    </main>
  )
}
