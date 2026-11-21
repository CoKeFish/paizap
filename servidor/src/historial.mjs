// Historial de cobros: cada intento que llega del terminal, aprobado o rechazado. De aquí salen
// el gasto del día de cada tarjeta, los movimientos que ve el dueño y las ventas que ve el
// comercio. Se guarda en datos/historial.json para sobrevivir a reinicios.
import fs from 'node:fs';
import path from 'node:path';
import { aUnidades } from './stellar.mjs';

const ARCHIVO = process.env.HISTORIAL_ARCHIVO ?? 'datos/historial.json';
const MAXIMO = 5000;
// El día (para el límite diario y las ventas de hoy) es el del lugar donde está el comercio.
const ZONA = process.env.ZONA_HORARIA ?? 'America/La_Paz';

let cobros = fs.existsSync(ARCHIVO) ? JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) : [];
let ultimo = cobros.length ? cobros[cobros.length - 1].n : 0;

const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const formatoHora = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hourCycle: 'h23' });
/** "2026-11-21" en la zona horaria del comercio. */
export const dia = (fecha = Date.now()) => formatoDia.format(new Date(fecha));
const hora = (fecha) => Number(formatoHora.format(new Date(fecha)));

/**
 * Anota un intento de cobro: { id, uid, cuenta, monto, concepto, ok, hash, recibo, motivo }.
 * Las recargas y los permisos de gasto del dueño se anotan con `tipo` ("recarga", "permiso").
 */
export function anotar(cobro) {
  const registro = { n: ++ultimo, fecha: new Date().toISOString(), ...cobro };
  cobros.push(registro);
  if (cobros.length > MAXIMO) cobros = cobros.slice(-MAXIMO);
  fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
  fs.writeFileSync(ARCHIVO, JSON.stringify(cobros));
  return registro;
}

export const numero = () => ultimo;

/** Lo que una tarjeta gastó hoy, en unidades mínimas del token. */
export function gastadoHoy(uid) {
  const hoy = dia();
  let total = 0n;
  for (let i = cobros.length - 1; i >= 0 && dia(cobros[i].fecha) === hoy; i--) {
    if (cobros[i].ok && cobros[i].uid === uid) total += aUnidades(cobros[i].monto);
  }
  return total;
}

/** Los últimos `cantidad` cobros que cumplen `filtro`, del más nuevo al más viejo. */
export function ultimos(cantidad, filtro = () => true) {
  const lista = [];
  for (let i = cobros.length - 1; i >= 0 && lista.length < cantidad; i--) {
    if (filtro(cobros[i])) lista.push(cobros[i]);
  }
  return lista;
}

export const porRecibo = (codigo) => cobros.findLast((c) => c.recibo === codigo);

/** Ventas de hoy: totales, por producto y por hora. Los montos van en unidades mínimas. */
export function resumenDeHoy() {
  const hoy = dia();
  const deHoy = [];
  for (let i = cobros.length - 1; i >= 0 && dia(cobros[i].fecha) === hoy; i--) deHoy.push(cobros[i]);

  let total = 0n;
  let aprobados = 0;
  let rechazados = 0;
  const conceptos = new Map();
  const horas = Array.from({ length: 24 }, () => 0n);
  const tarjetas = new Set();
  for (const cobro of deHoy) {
    if (cobro.tipo) continue; // recargas y permisos no son ventas
    if (!cobro.ok) {
      rechazados++;
      continue;
    }
    const monto = aUnidades(cobro.monto);
    total += monto;
    aprobados++;
    tarjetas.add(cobro.uid);
    horas[hora(cobro.fecha)] += monto;
    const nombre = cobro.concepto || '';
    const acumulado = conceptos.get(nombre) ?? { concepto: nombre, cantidad: 0, total: 0n };
    acumulado.cantidad++;
    acumulado.total += monto;
    conceptos.set(nombre, acumulado);
  }
  const porConcepto = [...conceptos.values()].sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0));
  return { dia: hoy, total, aprobados, rechazados, tarjetas: tarjetas.size, porConcepto, horas, horaActual: hora(Date.now()) };
}
