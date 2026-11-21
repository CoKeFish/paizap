// Registro de tarjetas: UID de la tarjeta -> cuenta Stellar del cliente.
// Se guarda en datos/tarjetas.json (un volumen de Docker) para sobrevivir a reinicios.
//
// MVP de testnet: si al registrar no se da una cuenta, se crea un cliente nuevo, se fondea con
// friendbot y firma el permiso de gasto para Toki. En producción eso lo hace el dueño desde la app.
import fs from 'node:fs';
import path from 'node:path';
import { Keypair, aprobar, fondearTestnet, ledgerActual } from './stellar.mjs';

const ARCHIVO = process.env.TARJETAS_ARCHIVO ?? 'datos/tarjetas.json';
const PERMISO = process.env.PERMISO_MONTO ?? '100';
const DIAS = Number(process.env.PERMISO_DIAS ?? 7);

let registro = {}; // uid -> { cuenta, secreto? }

/** "04 a1:b2-..." -> "04:A1:B2:..." */
export function normalizar(uid) {
  const hex = String(uid ?? '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length < 8 || hex.length % 2) return '';
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
  const vence = (await ledgerActual()) + Math.round((DIAS * 86400) / 5);
  await aprobar(cliente, gastador, PERMISO, vence);
  registro[clave] = { cuenta: cliente.publicKey(), secreto: cliente.secret() };
  guardar();
  return { uid: clave, cuenta: cliente.publicKey(), nueva: true, permiso: PERMISO, dias: DIAS };
}
