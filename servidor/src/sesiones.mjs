// Inicio de sesión de la app con la cuenta Stellar (SEP-10, Stellar Web Auth): no hay usuario ni
// contraseña. El servidor entrega un reto, la app lo firma con la llave de la cuenta y recibe una
// sesión. Así el servidor sabe de quién es la cuenta sin ver nunca su llave.
import crypto from 'node:crypto';
import { StrKey, WebAuth } from '@stellar/stellar-sdk';
import { PASSPHRASE } from './stellar.mjs';

const DOMINIO = process.env.DOMINIO ?? 'toki.local';
const DURACION_RETO = 300; // segundos
const DURACION_SESION = 12 * 60 * 60 * 1000;

let servidor; // Keypair de Paizap: firma los retos
let llave; // clave de las sesiones, derivada de la llave de Paizap

export function iniciar(toki) {
  servidor = toki;
  llave = crypto.createHash('sha256').update(`toki-sesiones:${toki.secret()}`).digest();
}

const firmar = (texto) => crypto.createHmac('sha256', llave).update(texto).digest('base64url');

/** Reto para `cuenta`: una transacción SEP-10 que no se puede mandar a la red, solo firmar. */
export function reto(cuenta) {
  if (!StrKey.isValidEd25519PublicKey(String(cuenta))) return null;
  return WebAuth.buildChallengeTx(servidor, cuenta, DOMINIO, DURACION_RETO, PASSPHRASE, DOMINIO);
}

/** Comprueba el reto firmado. Devuelve { cuenta, token, vence } o null si la firma no vale. */
export function abrir(retoFirmado) {
  try {
    const { clientAccountID } = WebAuth.readChallengeTx(retoFirmado, servidor.publicKey(), PASSPHRASE, DOMINIO, DOMINIO);
    WebAuth.verifyChallengeTxSigners(retoFirmado, servidor.publicKey(), PASSPHRASE, [clientAccountID], DOMINIO, DOMINIO);
    const vence = Date.now() + DURACION_SESION;
    const datos = Buffer.from(JSON.stringify({ c: clientAccountID, v: vence })).toString('base64url');
    return { cuenta: clientAccountID, token: `${datos}.${firmar(datos)}`, vence };
  } catch {
    return null;
  }
}

/** La cuenta dueña de la sesión de esta petición (cabecera Authorization: Bearer ...), o null. */
export function cuentaDe(req) {
  const [datos, firma] = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').split('.');
  if (!datos || !firma) return null;
  const esperada = firmar(datos);
  if (firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  try {
    const { c, v } = JSON.parse(Buffer.from(datos, 'base64url').toString());
    return v > Date.now() ? c : null;
  } catch {
    return null;
  }
}
