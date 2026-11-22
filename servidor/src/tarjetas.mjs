// Registro de tarjetas: UID de la tarjeta -> cuenta Stellar del dueño, más lo que el dueño decide
// desde la app (nombre, bloqueo y límite diario).
// Se guarda en datos/tarjetas.json (un volumen de Docker) para sobrevivir a reinicios.
//
// Cada tarjeta tiene además un código de cuenta (6 dígitos) y un PIN (4 dígitos) para pagar sin
// la tarjeta, desde el celular, escaneando el QR del terminal. Del PIN solo se guarda su hash.
//
// MVP de testnet: si al registrar no se da una cuenta, se crea un cliente nuevo, se fondea con
// friendbot y firma el permiso de gasto para Toki. Con la app, el dueño vincula la tarjeta a su
// propia cuenta y firma el permiso en su celular.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Keypair, aprobar, fondearTestnet, ledgerEnDias } from './stellar.mjs';

const ARCHIVO = process.env.TARJETAS_ARCHIVO ?? 'datos/tarjetas.json';
const PERMISO = process.env.PERMISO_MONTO ?? '100';
const DIAS = Number(process.env.PERMISO_DIAS ?? 7);
const MAX_FALLOS = 5;
const BLOQUEO_MS = 10 * 60 * 1000;

let registro = {}; // uid -> { cuenta, secreto?, nombre?, bloqueada?, limiteDiario?, codigo?, sal?, pin? }

/** "04 a1:b2-..." -> "04:A1:B2:..." */
export function normalizar(uid) {
  const hex = String(uid ?? '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length < 8 || hex.length > 20 || hex.length % 2) return '';
  return hex.match(/../g).join(':');
}

function guardar() {
  fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
  fs.writeFileSync(ARCHIVO, JSON.stringify(registro, null, 2));
}

/** Carga el archivo; las tarjetas de `iniciales` (de la variable TARJETAS) se suman si faltan. */
export function cargar(iniciales = {}) {
  if (fs.existsSync(ARCHIVO)) registro = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
  for (const [uid, cuenta] of Object.entries(iniciales)) {
    const clave = normalizar(uid);
    if (clave && !registro[clave]) registro[clave] = { cuenta };
  }
  guardar();
}

export const buscar = (uid) => registro[normalizar(uid)];
export const cantidad = () => Object.keys(registro).length;
export const listar = () => Object.fromEntries(Object.entries(registro).map(([uid, t]) => [uid, t.cuenta]));

// ---- Código de cuenta y PIN ----

const hashPin = (pin, sal) => crypto.scryptSync(String(pin), sal, 32).toString('hex');

function codigoLibre() {
  for (;;) {
    const codigo = String(crypto.randomInt(100000, 1000000));
    if (!Object.values(registro).some((t) => t.codigo === codigo)) return codigo;
  }
}

/** Le pone un PIN nuevo a la tarjeta (y un código de cuenta si no tenía). Devuelve el PIN en claro
 *  una sola vez: después solo queda su hash. Con `cuenta`, solo si la tarjeta es de esa cuenta. */
export function nuevoPin(uid, cuenta) {
  const clave = normalizar(uid);
  const tarjeta = registro[clave];
  if (!tarjeta || (cuenta && tarjeta.cuenta !== cuenta)) return null;
  tarjeta.codigo ??= codigoLibre();
  const pin = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  tarjeta.sal = crypto.randomBytes(8).toString('hex');
  tarjeta.pin = hashPin(pin, tarjeta.sal);
  guardar();
  return { uid: clave, codigo: tarjeta.codigo, pin };
}

// Fallos de PIN por código de cuenta: tras varios seguidos, la cuenta queda bloqueada un rato.
const fallos = new Map(); // codigo -> { cuenta, hasta }

/** Comprueba código de cuenta y PIN. Devuelve { uid } o { error }. */
export function entrar(codigo, pin) {
  codigo = String(codigo ?? '').replace(/\D/g, '');
  if (codigo.length !== 6) return { error: 'Código de cuenta o PIN incorrecto.' };
  const intento = fallos.get(codigo);
  if (intento?.hasta > Date.now()) {
    return { error: 'Demasiados intentos. Espera unos minutos.' };
  }
  const entrada = Object.entries(registro).find(([, t]) => t.codigo === codigo);
  const correcto = entrada && entrada[1].pin &&
    crypto.timingSafeEqual(Buffer.from(hashPin(pin, entrada[1].sal)), Buffer.from(entrada[1].pin));
  if (!correcto) {
    const cuenta = (intento?.hasta > 0 ? 0 : intento?.cuenta ?? 0) + 1;
    fallos.set(codigo, { cuenta, hasta: cuenta >= MAX_FALLOS ? Date.now() + BLOQUEO_MS : 0 });
    return { error: 'Código de cuenta o PIN incorrecto.' };
  }
  fallos.delete(codigo);
  return { uid: entrada[0] };
}

// ---- Registro ----

export async function registrar(uid, cuenta, gastador) {
  const clave = normalizar(uid);
  if (cuenta) {
    // Si la tarjeta ya era de esa cuenta conserva su nombre, bloqueo y límite; si cambia de
    // cuenta, empieza de cero. El PIN siempre es nuevo.
    const anterior = registro[clave];
    registro[clave] = anterior?.cuenta === cuenta ? anterior : { cuenta };
    guardar();
    return { cuenta, nueva: false, ...nuevoPin(clave) };
  }
  const cliente = Keypair.random();
  await fondearTestnet(cliente.publicKey());
  await aprobar(cliente, gastador, PERMISO, await ledgerEnDias(DIAS));
  registro[clave] = { cuenta: cliente.publicKey(), secreto: cliente.secret() };
  guardar();
  return { cuenta: cliente.publicKey(), nueva: true, permiso: PERMISO, dias: DIAS, ...nuevoPin(clave) };
}

// ---- Lo que hace el dueño desde la app ----

/** Lo que la app ve de una tarjeta (nunca la llave de las cuentas de prueba ni el PIN). */
const publica = (uid, t) => ({
  uid,
  nombre: t.nombre ?? '',
  bloqueada: Boolean(t.bloqueada),
  limiteDiario: t.limiteDiario ?? null,
  codigo: t.codigo ?? null, // código de cuenta para pagar con el QR
  tienePin: Boolean(t.pin),
});

export const deCuenta = (cuenta) =>
  Object.entries(registro).filter(([, t]) => t.cuenta === cuenta).map(([uid, t]) => publica(uid, t));

/** Vincula una tarjeta sin dueño a `cuenta`. Si ya es de otra cuenta, no la toca. */
export function vincular(uid, cuenta, nombre = '') {
  const clave = normalizar(uid);
  if (!clave) return { error: 'uid' };
  const actual = registro[clave];
  if (actual && actual.cuenta !== cuenta) return { error: 'ocupada' };
  registro[clave] = { ...actual, cuenta, nombre: String(nombre).trim().slice(0, 24) || actual?.nombre || '' };
  guardar();
  return { tarjeta: publica(clave, registro[clave]) };
}

/** Cambia nombre, bloqueo o límite diario de una tarjeta de `cuenta`. */
export function actualizar(uid, cuenta, cambios) {
  const clave = normalizar(uid);
  const tarjeta = registro[clave];
  if (!tarjeta || tarjeta.cuenta !== cuenta) return null;
  if (typeof cambios.nombre === 'string') tarjeta.nombre = cambios.nombre.trim().slice(0, 24);
  if (typeof cambios.bloqueada === 'boolean') tarjeta.bloqueada = cambios.bloqueada;
  if (cambios.limiteDiario === null) delete tarjeta.limiteDiario;
  else if (Number(cambios.limiteDiario) > 0) tarjeta.limiteDiario = Math.round(Number(cambios.limiteDiario) * 100) / 100;
  guardar();
  return publica(clave, tarjeta);
}

/** Desvincula una tarjeta. Con `cuenta`, solo si es de esa cuenta. */
export function quitar(uid, cuenta) {
  const clave = normalizar(uid);
  const tarjeta = registro[clave];
  if (!tarjeta || (cuenta && tarjeta.cuenta !== cuenta)) return false;
  delete registro[clave];
  guardar();
  return true;
}
