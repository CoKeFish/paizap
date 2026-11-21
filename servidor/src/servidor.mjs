// Servidor de Toki (MVP). Atiende a tres clientes en la misma dirección:
//
// El terminal (cabecera X-Terminal-Token): manda el toque de la tarjeta y el monto; el servidor
// busca la cuenta de la tarjeta, revisa el bloqueo y el límite diario y cobra en Stellar con el
// permiso de gasto.
//   POST /cobros    { id, uid, monto, sun, concepto }
//   GET  /cobros/<id>                        consulta un cobro sin cobrar
//   GET  /r/<código>                         recibo: el enlace corto del QR del terminal
//
// La app, web y celular (sesión abierta con la cuenta Stellar, ver sesiones.mjs):
//   GET  /api/info                           red, moneda y cuentas de Toki y del comercio
//   GET  /api/sesion/reto?cuenta=G...        reto para firmar
//   POST /api/sesion { reto }                reto firmado -> sesión
//   GET  /api/recibos/<código>               datos de un recibo
//   GET  /api/cuenta                         saldo, permiso de gasto, tarjetas y movimientos
//   POST /api/cuenta/recarga                 recarga de prueba (solo testnet)
//   POST /api/permiso/preparar { monto, dias }   arma el permiso de gasto para firmarlo en la app
//   POST /api/permiso { xdr }                manda a la red el permiso ya firmado
//   GET  /api/tarjetas/nuevas                tarjetas sin dueño que el terminal vio hace poco
//   POST /api/tarjetas { uid, nombre }       vincula una tarjeta a mi cuenta
//   PATCH y DELETE /api/tarjetas/<uid>       nombre, bloqueo y límite diario; desvincular
//   GET  /api/movimientos                    cobros de mis tarjetas, recargas y permisos
//   GET  /api/panel                          ventas en vivo (solo la cuenta del comercio)
//
// Administración (cabecera X-Admin-Token):
//   POST /tarjetas  { uid, cuenta? }         sin cuenta: crea un cliente de testnet
//   GET  /tarjetas  ·  DELETE /tarjetas/<uid>
//
//   GET  /salud
// Todo lo demás es la web (carpeta `publico`, la compilación de app/).
import fs from 'node:fs';
import http from 'node:http';
import * as estaticos from './estaticos.mjs';
import * as historial from './historial.mjs';
import * as sesiones from './sesiones.mjs';
import {
  Keypair, RED, TOKEN, aUnidades, cobrar, cuentaExiste, deUnidades, enviarFirmada, fondearTestnet,
  ledgerEnDias, leerAprobacion, permiso, prepararAprobacion, saldo, simbolo, transferir, vencimientoPermiso,
} from './stellar.mjs';
import * as tarjetas from './tarjetas.mjs';

function requerida(nombre) {
  if (!process.env[nombre]) {
    console.error(`Falta la variable ${nombre}. Corre con: doppler run --project toki --config dev -- ...`);
    process.exit(1);
  }
  return process.env[nombre];
}

const toki = Keypair.fromSecret(requerida('TOKI_SECRET'));
const COMERCIO = requerida('COMERCIO_PUBLIC');
const TERMINAL_TOKEN = process.env.TERMINAL_TOKEN ?? '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const LIMITE_DIARIO = Number(process.env.LIMITE_DIARIO || 15);
const MONTO_MAXIMO = Number(process.env.MONTO_MAXIMO || 100);
const RECARGA_PRUEBA = process.env.RECARGA_PRUEBA || '20';
const PERMISO_MAXIMO = Number(process.env.PERMISO_MAXIMO || 1000);
const PERMISO_DIAS_MAXIMO = 90;
const PUERTO = Number(process.env.PUERTO || 8080);

tarjetas.cargar(JSON.parse(process.env.TARJETAS || '{}'));
sesiones.iniciar(toki);

const enlaceExplorador = (hash) =>
  `https://stellar.expert/explorer/${RED === 'mainnet' ? 'public' : 'testnet'}/tx/${hash}`;

// El código del token ("XLM", "USDC") se le pregunta al contrato; si la red no responde al
// arrancar, se vuelve a intentar la próxima vez que haga falta.
let moneda = null;
async function leerMoneda() {
  if (!moneda) moneda = await simbolo(toki.publicKey()).catch(() => null);
  return moneda ?? '';
}
leerMoneda();

// Las transacciones de Toki salen de una sola cuenta: se hacen de a una para no chocar en la
// secuencia. El límite diario se revisa dentro de la cola, así dos cobros seguidos de la misma
// tarjeta no pasan los dos por debajo del límite.
let cola = Promise.resolve();
function enCola(tarea) {
  const resultado = cola.then(tarea);
  cola = resultado.catch(() => {});
  return resultado;
}

// Recibos: un código corto por cobro. El terminal lo muestra en un QR (en su pantalla solo cabe
// un enlace corto) y GET /r/<código> lleva al recibo.
const ARCHIVO_RECIBOS = 'datos/recibos.json';
const recibos = fs.existsSync(ARCHIVO_RECIBOS) ? JSON.parse(fs.readFileSync(ARCHIVO_RECIBOS, 'utf8')) : {};
function guardarRecibo(hash) {
  const codigo = hash.slice(0, 8);
  recibos[codigo] = hash;
  const codigos = Object.keys(recibos);
  if (codigos.length > 2000) delete recibos[codigos[0]];
  fs.mkdirSync('datos', { recursive: true });
  fs.writeFileSync(ARCHIVO_RECIBOS, JSON.stringify(recibos));
  return codigo;
}

// Tarjetas sin dueño que pasaron por el terminal en los últimos minutos. La app las ofrece para
// vincular: acercar la tarjeta nueva al terminal evita escribir su UID.
const MINUTOS_NUEVA = 5;
const vistas = new Map(); // uid -> momento
function tarjetasNuevas() {
  const ahora = Date.now();
  const lista = [];
  for (const [uid, momento] of vistas) {
    if (ahora - momento > MINUTOS_NUEVA * 60000 || tarjetas.buscar(uid)) vistas.delete(uid);
    else lista.push({ uid, fecha: new Date(momento).toISOString() });
  }
  return lista.reverse();
}

// Último contacto del terminal (cualquier petición con su clave), para el panel del comercio.
let contactoTerminal = null;

// Saldo de la cuenta del comercio en la red: se relee después de cada venta y, si no, cada 30 s.
const saldoComercio = { valor: null, momento: 0, pendiente: null };
function leerSaldoComercio(forzar = false) {
  if (!saldoComercio.pendiente && (forzar || Date.now() - saldoComercio.momento > 30000)) {
    saldoComercio.pendiente = saldo(COMERCIO, toki.publicKey())
      .then((unidades) => { saldoComercio.valor = deUnidades(unidades); })
      .catch(() => {})
      .finally(() => { saldoComercio.momento = Date.now(); saldoComercio.pendiente = null; });
  }
  return saldoComercio.valor;
}

async function procesarCobro({ id, uid, monto, concepto }) {
  uid = tarjetas.normalizar(uid);
  monto = String(monto ?? '');
  concepto = String(concepto ?? '').slice(0, 40);
  const valor = Number(monto);
  if (!uid || !/^\d+(\.\d{1,7})?$/.test(monto) || !(valor > 0)) {
    return [400, { ok: false, motivo: 'datos incompletos' }];
  }
  if (valor > MONTO_MAXIMO) return [400, { ok: false, motivo: `monto mayor a ${MONTO_MAXIMO}` }];

  const rechazar = (estado, motivo, cuenta, extra = {}) => {
    historial.anotar({ id, uid, cuenta, monto, concepto, ok: false, motivo });
    return [estado, { ok: false, motivo, ...extra }];
  };

  if (!tarjetas.buscar(uid)) {
    vistas.set(uid, Date.now());
    return rechazar(404, 'tarjeta no registrada', undefined, { uid });
  }

  const [estado, cuerpo] = await enCola(async () => {
    const tarjeta = tarjetas.buscar(uid);
    if (!tarjeta) return rechazar(404, 'tarjeta no registrada', undefined, { uid });
    if (tarjeta.bloqueada) return rechazar(403, 'tarjeta bloqueada', tarjeta.cuenta);
    const limite = tarjeta.limiteDiario ?? LIMITE_DIARIO;
    if (historial.gastadoHoy(uid) + aUnidades(monto) > aUnidades(limite)) {
      return rechazar(402, `supera el limite diario (${limite})`, tarjeta.cuenta);
    }
    let hash;
    try {
      hash = await cobrar(toki, tarjeta.cuenta, COMERCIO, monto);
    } catch (error) {
      // Sin permiso suficiente, permiso vencido o sin saldo: la red no deja pasar el cobro.
      console.error('cobro rechazado:', error.message);
      return rechazar(402, 'la red rechazo el cobro (saldo o permiso)', tarjeta.cuenta);
    }
    const recibo = guardarRecibo(hash);
    historial.anotar({ id, uid, cuenta: tarjeta.cuenta, monto, concepto, ok: true, hash, recibo });
    return [200, { ok: true, hash, recibo, monto, cuenta: tarjeta.cuenta, limite }];
  });
  if (estado !== 200) return [estado, cuerpo];

  // El cobro ya está hecho: si estas lecturas fallan, el terminal igual recibe su «aprobado».
  leerSaldoComercio(true);
  const { cuenta, limite, ...respuesta } = cuerpo;
  const [restante, saldoCliente] = await Promise.all([
    permiso(cuenta, toki.publicKey()),
    saldo(cuenta, toki.publicKey()),
  ]).catch(() => [null, null]);
  return [200, {
    ...respuesta,
    permisoRestante: restante === null ? null : deUnidades(restante),
    saldoCliente: saldoCliente === null ? null : deUnidades(saldoCliente),
    hoyRestante: deUnidades(aUnidades(limite) - historial.gastadoHoy(uid)),
  }];
}

// Cobros ya procesados (o en curso) por id: si el terminal reintenta porque no le llegó la
// respuesta, recibe la misma respuesta y no se cobra dos veces. Los cobros hechos se guardan
// también en disco: si el servidor se reinicia y el terminal vuelve a preguntar por un cobro que
// no pudo confirmar, recibe el resultado guardado y no se cobra otra vez.
const cobrosPorId = new Map();
const ARCHIVO_COBROS = 'datos/cobros.json';
const cobrosHechos = fs.existsSync(ARCHIVO_COBROS) ? JSON.parse(fs.readFileSync(ARCHIVO_COBROS, 'utf8')) : {};
function guardarCobro(id, cuerpo) {
  cobrosHechos[id] = cuerpo;
  const ids = Object.keys(cobrosHechos);
  if (ids.length > 5000) delete cobrosHechos[ids[0]];
  fs.mkdirSync('datos', { recursive: true });
  fs.writeFileSync(ARCHIVO_COBROS, JSON.stringify(cobrosHechos));
}

function cobroUnaVez(pedido) {
  const id = String(pedido.id ?? '');
  const procesar = () => procesarCobro(pedido).catch((error) => {
    console.error(error);
    return [500, { ok: false, motivo: 'error del servidor' }];
  });
  if (!id) return procesar();
  if (cobrosHechos[id]) {
    console.log(`cobro ${id} ya estaba hecho: devuelvo la respuesta guardada`);
    return [200, cobrosHechos[id]];
  }
  if (!cobrosPorId.has(id)) {
    const promesa = procesar();
    cobrosPorId.set(id, promesa);
    // Si falló por datos o por la red, se puede reintentar con el mismo id; si se cobró, no.
    promesa.then(([estado, cuerpo]) => {
      if (estado === 200) guardarCobro(id, cuerpo);
      else cobrosPorId.delete(id);
    });
  } else {
    console.log(`cobro ${id} repetido: devuelvo la respuesta anterior`);
  }
  return cobrosPorId.get(id);
}

// ---- Lo que ve la app ----

// Un movimiento, como lo ve el dueño de la cuenta o el comercio.
const movimiento = (c) => ({
  n: c.n, fecha: c.fecha, tipo: c.tipo ?? 'cobro', uid: c.uid, monto: c.monto, concepto: c.concepto ?? '',
  ok: c.ok, motivo: c.motivo, recibo: c.recibo, hash: c.hash,
});

async function datosDeCuenta(cuenta) {
  const fuente = toki.publicKey();
  const [existe, unidades, restante, vence] = await Promise.all([
    cuentaExiste(cuenta),
    saldo(cuenta, fuente).catch(() => 0n),
    permiso(cuenta, fuente).catch(() => 0n),
    vencimientoPermiso(cuenta, fuente).catch(() => null),
  ]);
  // El tope que el dueño firmó la última vez, para mostrar cuánto queda de cuánto.
  const firmado = historial.ultimos(1, (c) => c.tipo === 'permiso' && c.cuenta === cuenta)[0];
  return {
    cuenta,
    rol: cuenta === COMERCIO ? 'comercio' : 'dueno',
    existe,
    saldo: deUnidades(unidades),
    permiso: { restante: deUnidades(restante), vence: restante > 0n ? vence : null, firmado: firmado?.monto ?? null },
    limiteDiario: LIMITE_DIARIO,
    tarjetas: tarjetas.deCuenta(cuenta).map((t) => ({ ...t, gastadoHoy: deUnidades(historial.gastadoHoy(t.uid)) })),
    movimientos: historial.ultimos(30, (c) => c.cuenta === cuenta).map(movimiento),
    n: historial.numero(),
  };
}

function datosDelPanel() {
  const hoy = historial.resumenDeHoy();
  return {
    n: historial.numero(),
    comercio: COMERCIO,
    saldo: leerSaldoComercio(),
    hoy: {
      dia: hoy.dia,
      total: deUnidades(hoy.total),
      aprobados: hoy.aprobados,
      rechazados: hoy.rechazados,
      tarjetas: hoy.tarjetas,
      porConcepto: hoy.porConcepto.map((p) => ({ ...p, total: deUnidades(p.total) })),
      horas: hoy.horas.map(deUnidades),
      horaActual: hoy.horaActual,
    },
    cobros: historial.ultimos(40, (c) => !c.tipo).map(movimiento),
    terminal: { ultimoContacto: contactoTerminal },
    tarjetasNuevas: tarjetasNuevas(),
    tarjetasRegistradas: tarjetas.cantidad(),
  };
}

// Recarga de prueba: en testnet no hay dónde comprar, así que Toki manda un monto fijo de su
// cuenta. Una cuenta nueva primero se crea con friendbot.
const ultimaRecarga = new Map();
async function recargaDePrueba(cuenta) {
  if (RED === 'mainnet') return [400, { ok: false, motivo: 'la recarga de prueba solo existe en testnet' }];
  if (Date.now() - (ultimaRecarga.get(cuenta) ?? 0) < 15000) {
    return [429, { ok: false, motivo: 'espera unos segundos entre recargas' }];
  }
  ultimaRecarga.set(cuenta, Date.now());
  if (!(await cuentaExiste(cuenta))) {
    await fondearTestnet(cuenta);
    historial.anotar({ tipo: 'recarga', cuenta, monto: '', concepto: 'Cuenta creada en testnet', ok: true });
    return [200, { ok: true, creada: true }];
  }
  const hash = await enCola(() => transferir(toki, cuenta, RECARGA_PRUEBA));
  historial.anotar({ tipo: 'recarga', cuenta, monto: RECARGA_PRUEBA, concepto: 'Recarga de prueba', ok: true, hash });
  return [200, { ok: true, hash, monto: RECARGA_PRUEBA }];
}

async function prepararPermiso(cuenta, { monto, dias }) {
  monto = String(monto ?? '').trim();
  dias = Math.round(Number(dias));
  if (!/^\d+(\.\d{1,7})?$/.test(monto) || Number(monto) > PERMISO_MAXIMO) {
    return [400, { ok: false, motivo: `el tope va de 0 a ${PERMISO_MAXIMO}` }];
  }
  if (!(dias >= 1 && dias <= PERMISO_DIAS_MAXIMO)) {
    return [400, { ok: false, motivo: `la duracion va de 1 a ${PERMISO_DIAS_MAXIMO} dias` }];
  }
  if (!(await cuentaExiste(cuenta))) return [409, { ok: false, motivo: 'la cuenta todavia no existe en la red' }];
  const vence = await ledgerEnDias(dias);
  const xdr = await prepararAprobacion(cuenta, toki.publicKey(), monto, vence);
  return [200, { ok: true, xdr, monto, dias, vence, gastador: toki.publicKey(), token: TOKEN }];
}

async function enviarPermiso(cuenta, { xdr }) {
  let aprobacion;
  try {
    aprobacion = leerAprobacion(String(xdr ?? ''));
  } catch {
    aprobacion = null;
  }
  // Solo se manda lo que es, exactamente, el permiso de gasto de esta cuenta para Toki.
  if (!aprobacion || aprobacion.dueno !== cuenta || aprobacion.gastador !== toki.publicKey()) {
    return [400, { ok: false, motivo: 'eso no es un permiso de gasto de esta cuenta' }];
  }
  let hash;
  try {
    hash = await enviarFirmada(aprobacion.tx, toki); // Toki paga la comisión
  } catch (error) {
    console.error('permiso rechazado:', error.message);
    return [402, { ok: false, motivo: 'la red rechazo el permiso' }];
  }
  historial.anotar({ tipo: 'permiso', cuenta, monto: aprobacion.monto, concepto: 'Tope de gasto', ok: true, hash });
  console.log(`permiso de ${cuenta}: hasta ${aprobacion.monto}, vence en el ledger ${aprobacion.vence}`);
  return [200, { ok: true, hash, monto: aprobacion.monto, vence: aprobacion.vence }];
}

// ---- HTTP ----

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-max-age': '86400',
};

function responder(res, estado, cuerpo) {
  res.writeHead(estado, { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS });
  res.end(JSON.stringify(cuerpo));
}

async function leerJson(req) {
  let texto = '';
  for await (const parte of req) {
    texto += parte;
    if (texto.length > 100000) throw Object.assign(new Error('cuerpo demasiado grande'), { estado: 413 });
  }
  try {
    return JSON.parse(texto || '{}') ?? {};
  } catch {
    throw Object.assign(new Error('JSON inválido'), { estado: 400 });
  }
}

const autorizado = (req, cabecera, token) => !token || req.headers[cabecera] === token;

async function atenderApp(req, res, ruta, consulta) {
  const metodo = req.method;

  if (metodo === 'GET' && ruta === '/api/info') {
    return responder(res, 200, {
      ok: true, red: RED, moneda: await leerMoneda(), token: TOKEN, toki: toki.publicKey(), comercio: COMERCIO,
      limiteDiario: LIMITE_DIARIO, recargaPrueba: RED === 'mainnet' ? null : RECARGA_PRUEBA,
      explorador: enlaceExplorador('').replace(/\/tx\/$/, ''),
    });
  }

  if (metodo === 'GET' && ruta === '/api/sesion/reto') {
    const reto = sesiones.reto(consulta.get('cuenta'));
    if (!reto) return responder(res, 400, { ok: false, motivo: 'cuenta invalida' });
    return responder(res, 200, { ok: true, reto });
  }

  if (metodo === 'POST' && ruta === '/api/sesion') {
    const sesion = sesiones.abrir(String((await leerJson(req)).reto ?? ''));
    if (!sesion) return responder(res, 401, { ok: false, motivo: 'la firma no corresponde a la cuenta' });
    return responder(res, 200, { ok: true, ...sesion, rol: sesion.cuenta === COMERCIO ? 'comercio' : 'dueno' });
  }

  const recibo = metodo === 'GET' && ruta.match(/^\/api\/recibos\/([0-9a-f]{8})$/i);
  if (recibo) {
    const codigo = recibo[1].toLowerCase();
    const hash = recibos[codigo];
    if (!hash) return responder(res, 404, { ok: false, motivo: 'recibo no encontrado' });
    const cobro = historial.porRecibo(codigo);
    return responder(res, 200, {
      ok: true, codigo, hash, enlace: enlaceExplorador(hash), moneda: await leerMoneda(), comercio: COMERCIO,
      monto: cobro?.monto ?? null, concepto: cobro?.concepto ?? '', fecha: cobro?.fecha ?? null,
    });
  }

  // De aquí en adelante hace falta una sesión.
  const cuenta = sesiones.cuentaDe(req);
  if (!cuenta) return responder(res, 401, { ok: false, motivo: 'sesion vencida' });

  if (metodo === 'GET' && ruta === '/api/cuenta') return responder(res, 200, { ok: true, ...(await datosDeCuenta(cuenta)) });

  if (metodo === 'GET' && ruta === '/api/movimientos') {
    return responder(res, 200, {
      ok: true, n: historial.numero(),
      movimientos: historial.ultimos(100, (c) => c.cuenta === cuenta).map(movimiento),
    });
  }

  if (metodo === 'POST' && ruta === '/api/cuenta/recarga') return responder(res, ...(await recargaDePrueba(cuenta)));
  if (metodo === 'POST' && ruta === '/api/permiso/preparar') {
    return responder(res, ...(await prepararPermiso(cuenta, await leerJson(req))));
  }
  if (metodo === 'POST' && ruta === '/api/permiso') return responder(res, ...(await enviarPermiso(cuenta, await leerJson(req))));

  if (metodo === 'GET' && ruta === '/api/tarjetas/nuevas') {
    return responder(res, 200, { ok: true, tarjetas: tarjetasNuevas() });
  }

  if (metodo === 'POST' && ruta === '/api/tarjetas') {
    const { uid, nombre } = await leerJson(req);
    const { tarjeta, error } = tarjetas.vincular(uid, cuenta, nombre);
    if (error === 'uid') return responder(res, 400, { ok: false, motivo: 'ese numero de tarjeta no es valido' });
    if (error === 'ocupada') return responder(res, 409, { ok: false, motivo: 'esa tarjeta ya es de otra cuenta' });
    console.log(`tarjeta ${tarjeta.uid} vinculada a ${cuenta}`);
    return responder(res, 200, { ok: true, tarjeta });
  }

  const deTarjeta = ruta.match(/^\/api\/tarjetas\/([0-9A-Fa-f:%-]{8,40})$/);
  if (deTarjeta && metodo === 'PATCH') {
    const tarjeta = tarjetas.actualizar(decodeURIComponent(deTarjeta[1]), cuenta, await leerJson(req));
    if (!tarjeta) return responder(res, 404, { ok: false, motivo: 'esa tarjeta no es de esta cuenta' });
    return responder(res, 200, { ok: true, tarjeta });
  }
  if (deTarjeta && metodo === 'DELETE') {
    if (!tarjetas.quitar(decodeURIComponent(deTarjeta[1]), cuenta)) {
      return responder(res, 404, { ok: false, motivo: 'esa tarjeta no es de esta cuenta' });
    }
    return responder(res, 200, { ok: true });
  }

  if (metodo === 'GET' && ruta === '/api/panel') {
    if (cuenta !== COMERCIO) return responder(res, 403, { ok: false, motivo: 'solo la cuenta del comercio ve las ventas' });
    return responder(res, 200, { ok: true, moneda: await leerMoneda(), ...datosDelPanel() });
  }

  return responder(res, 404, { ok: false, motivo: 'no existe' });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://toki');
    const ruta = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (TERMINAL_TOKEN && req.headers['x-terminal-token'] === TERMINAL_TOKEN) contactoTerminal = new Date().toISOString();

    if (req.method === 'GET' && ruta === '/salud') {
      return responder(res, 200, { ok: true, red: RED, token: TOKEN, comercio: COMERCIO, tarjetas: tarjetas.cantidad() });
    }

    const recibo = req.method === 'GET' && ruta.match(/^\/r\/([0-9a-f]{8})$/i);
    if (recibo) {
      const codigo = recibo[1].toLowerCase();
      const hash = recibos[codigo];
      if (!hash) return responder(res, 404, { ok: false, motivo: 'recibo no encontrado' });
      // Con la web instalada, el QR abre el recibo de Toki (monto, producto y enlace a la red);
      // sin ella, va directo a la transacción en el explorador.
      res.writeHead(302, { location: estaticos.hayWeb() ? `/#/recibo/${codigo}` : enlaceExplorador(hash) });
      return res.end();
    }

    // Consulta de un cobro por su id, sin cobrar: la usa el terminal cuando no le llegó la respuesta.
    const consulta = req.method === 'GET' && ruta.match(/^\/cobros\/([\w-]{3,64})$/);
    if (consulta) {
      if (!autorizado(req, 'x-terminal-token', TERMINAL_TOKEN)) {
        return responder(res, 401, { ok: false, motivo: 'terminal no autorizado' });
      }
      const id = consulta[1];
      if (cobrosHechos[id]) return responder(res, 200, cobrosHechos[id]);
      if (cobrosPorId.has(id)) {
        const [estado, cuerpo] = await cobrosPorId.get(id);  // todavía se está cobrando: espera el resultado
        return responder(res, estado, cuerpo);
      }
      return responder(res, 404, { ok: false, motivo: 'ese cobro no llego al servidor' });
    }

    if (req.method === 'POST' && ruta === '/cobros') {
      if (!autorizado(req, 'x-terminal-token', TERMINAL_TOKEN)) {
        return responder(res, 401, { ok: false, motivo: 'terminal no autorizado' });
      }
      const pedido = await leerJson(req);
      const inicio = Date.now();
      const [estado, cuerpo] = await cobroUnaVez(pedido);
      const concepto = pedido.concepto ? ` [${String(pedido.concepto).slice(0, 40)}]` : '';
      console.log(`${new Date().toISOString()} cobro ${pedido.id ?? '-'} ${pedido.uid} ${pedido.monto}${concepto} -> ${estado} ${cuerpo.hash ?? cuerpo.motivo} (${Date.now() - inicio} ms)`);
      return responder(res, estado, cuerpo);
    }

    const deAdmin = ruta.match(/^\/tarjetas(?:\/([0-9A-Fa-f:%-]{8,40}))?$/);
    if (deAdmin) {
      if (!ADMIN_TOKEN || !autorizado(req, 'x-admin-token', ADMIN_TOKEN)) {
        return responder(res, 401, { ok: false, motivo: 'no autorizado' });
      }
      if (req.method === 'GET' && !deAdmin[1]) return responder(res, 200, { ok: true, tarjetas: tarjetas.listar() });
      if (req.method === 'POST' && !deAdmin[1]) {
        const { uid, cuenta } = await leerJson(req);
        if (!tarjetas.normalizar(uid)) return responder(res, 400, { ok: false, motivo: 'falta uid' });
        const registro = await enCola(() => tarjetas.registrar(uid, cuenta, toki.publicKey()));
        console.log(`tarjeta ${registro.uid} -> ${registro.cuenta}`);
        return responder(res, 200, { ok: true, ...registro });
      }
      if (req.method === 'DELETE' && deAdmin[1]) {
        const quitada = tarjetas.quitar(decodeURIComponent(deAdmin[1]));
        return responder(res, quitada ? 200 : 404, quitada ? { ok: true } : { ok: false, motivo: 'tarjeta no registrada' });
      }
    }

    if (ruta.startsWith('/api/')) return await atenderApp(req, res, ruta, url.searchParams);
    if (estaticos.servir(req, res)) return;
    responder(res, 404, { ok: false, motivo: 'no existe' });
  } catch (error) {
    if (!error.estado) console.error(error);
    if (!res.headersSent) responder(res, error.estado ?? 500, { ok: false, motivo: error.estado ? error.message : 'error del servidor' });
  }
}).listen(PUERTO, () => {
  console.log(`Toki escuchando en :${PUERTO} · red ${RED} · token ${TOKEN} · comercio ${COMERCIO} · ${tarjetas.cantidad()} tarjetas · web ${estaticos.hayWeb() ? 'sí' : 'no'}`);
});
