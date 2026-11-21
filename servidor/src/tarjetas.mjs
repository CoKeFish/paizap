// Registro de tarjetas: UID de la tarjeta -> cuenta Stellar del dueño, más lo que el dueño decide
// desde la app (nombre, bloqueo y límite diario).
// Se guarda en datos/tarjetas.json (un volumen de Docker) para sobrevivir a reinicios.
//
// MVP de testnet: si al registrar no se da una cuenta, se crea un cliente nuevo, se fondea con
// friendbot y firma el permiso de gasto para Toki. Con la app, el dueño vincula la tarjeta a su
// propia cuenta y firma el permiso en su celular.
import fs from 'node:fs';
import path from 'node:path';
import { Keypair, aprobar, fondearTestnet, ledgerEnDias } from './stellar.mjs';

const ARCHIVO = process.env.TARJETAS_ARCHIVO ?? 'datos/tarjetas.json';
const PERMISO = process.env.PERMISO_MONTO ?? '100';
const DIAS = Number(process.env.PERMISO_DIAS ?? 7);

let registro = {}; // uid -> { cuenta, secreto?, nombre?, bloqueada?, limiteDiario? }

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

export async function registrar(uid, cuenta, gastador) {
  const clave = normalizar(uid);
  if (cuenta) {
    registro[clave] = { cuenta };
    guardar();
    return { uid: clave, cuenta, nueva: false };
  }
  const cliente = Keypair.random();
  await fondearTestnet(cliente.publicKey());
  await aprobar(cliente, gastador, PERMISO, await ledgerEnDias(DIAS));
  registro[clave] = { cuenta: cliente.publicKey(), secreto: cliente.secret() };
  guardar();
  return { uid: clave, cuenta: cliente.publicKey(), nueva: true, permiso: PERMISO, dias: DIAS };
}

// ---- Lo que hace el dueño desde la app ----

/** Lo que la app ve de una tarjeta (nunca la llave de las cuentas de prueba). */
const publica = (uid, t) => ({
  uid,
  nombre: t.nombre ?? '',
  bloqueada: Boolean(t.bloqueada),
  limiteDiario: t.limiteDiario ?? null,
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
