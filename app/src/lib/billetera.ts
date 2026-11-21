// La llave de la cuenta vive solo en este dispositivo. Con ella la app abre sesión y firma el
// permiso de gasto; el servidor de Toki nunca la ve. Antes de firmar, la app lee lo que le
// mandaron y comprueba que sea exactamente lo que el dueño pidió.
import { Address, Keypair, Networks, StrKey, TransactionBuilder, scValToNative } from '@stellar/stellar-sdk'

const CLAVE = 'toki.llave'

export const fraseDeRed = (red: string) => (red === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET)

export function llaveGuardada(): Keypair | null {
  try {
    const secreto = localStorage.getItem(CLAVE)
    return secreto ? Keypair.fromSecret(secreto) : null
  } catch {
    return null
  }
}

export function guardarLlave(llave: Keypair) {
  localStorage.setItem(CLAVE, llave.secret())
}

export function borrarLlave() {
  localStorage.removeItem(CLAVE)
}

export const crearLlave = () => Keypair.random()

/** La llave secreta que escribió la persona ("S..."), o null si no es válida. */
export function leerLlave(secreto: string): Keypair | null {
  const texto = secreto.trim().toUpperCase()
  return StrKey.isValidEd25519SecretSeed(texto) ? Keypair.fromSecret(texto) : null
}

/**
 * Firma el reto de inicio de sesión (SEP-10). Un reto de verdad no se puede mandar a la red: su
 * secuencia es 0 y solo trae operaciones de datos. Si no es así, no se firma.
 */
export function firmarReto(reto: string, red: string, llave: Keypair): string {
  const tx = TransactionBuilder.fromXDR(reto, fraseDeRed(red))
  if ('innerTransaction' in tx || tx.sequence !== '0' || tx.operations.some((o) => o.type !== 'manageData')) {
    throw new Error('El servidor mandó un reto que no es un inicio de sesión. No se firmó.')
  }
  tx.sign(llave)
  return tx.toXDR()
}

export interface PermisoEsperado {
  token: string    // contrato del token
  gastador: string // cuenta de Toki
  monto: string    // tope pedido, "25" o "25.5"
}

const ESCALA = 10_000_000n
function aUnidades(valor: string): bigint {
  const [entero, decimales = ''] = valor.trim().split('.')
  return BigInt(entero || '0') * ESCALA + BigInt(decimales.padEnd(7, '0').slice(0, 7) || '0')
}

/**
 * Firma el permiso de gasto que armó el servidor, después de comprobar que dice lo que el dueño
 * pidió: una sola operación, `approve` en el contrato del token, de esta cuenta para Toki y por
 * ese monto. Cualquier otra cosa no se firma.
 */
export function firmarPermiso(xdr: string, red: string, llave: Keypair, esperado: PermisoEsperado): string {
  const tx = TransactionBuilder.fromXDR(xdr, fraseDeRed(red))
  const rechazo = new Error('El permiso que mandó el servidor no coincide con lo que pediste. No se firmó.')
  if ('innerTransaction' in tx || tx.source !== llave.publicKey() || tx.operations.length !== 1) throw rechazo
  const [operacion] = tx.operations
  if (operacion.type !== 'invokeHostFunction' || operacion.func.type !== 'hostFunctionTypeInvokeContract') throw rechazo
  const llamada = operacion.func.invokeContract
  if (Address.fromScAddress(llamada.contractAddress).toString() !== esperado.token) throw rechazo
  if (llamada.functionName.toString() !== 'approve' || llamada.args.length !== 4) throw rechazo
  const [dueno, gastador, unidades] = llamada.args.map((valor) => scValToNative(valor))
  if (dueno !== llave.publicKey() || gastador !== esperado.gastador || BigInt(unidades) !== aUnidades(esperado.monto)) throw rechazo
  tx.sign(llave)
  return tx.toXDR()
}
