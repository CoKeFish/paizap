// Servidor de Paizap (MVP). Atiende a tres clientes en la misma dirección:
//
// El terminal (cabecera X-Terminal-Token): manda el toque de la tarjeta y el monto; el servidor
// busca la cuenta de la tarjeta, revisa el bloqueo y el límite diario y cobra en Stellar con el
// permiso de gasto.
//   POST /cobros    { id, uid, monto, sun, concepto }
//   GET  /cobros/<id>                        consulta un cobro sin cobrar
//   POST /pedidos   { id, monto, concepto }  deja un cobro listo para pagar con el QR
//   POST /pedidos/<id>/cancelar              lo cancela
//   GET  /r/<código>                         recibo: el enlace corto del QR del terminal
//
// El celular del cliente, al escanear el QR de pago del terminal (sin sesión):
//   GET  /p/<id>                             página de pago
//   POST /p/<id>/pagar { codigo, pin }       paga con el código de cuenta y el PIN
//
// La app, web y celular (sesión abierta con la cuenta Stellar, ver sesiones.mjs):
//   GET  /api/info                           red, moneda y cuentas de Paizap y del comercio
//   GET  /api/sesion/reto?cuenta=G...        reto para firmar
//   POST /api/sesion { reto }                reto firmado -> sesión
//   GET  /api/recibos/<código>               datos de un recibo
//   GET  /api/pedidos/<id>                   datos de un cobro que espera pago
//   POST /api/pedidos/<id>/pagar { uid }     lo paga con una tarjeta mía, sin acercarla
//   POST /api/tarjetas/<uid>/pin             PIN nuevo para pagar con el QR sin la app
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
//   POST /tarjetas/pin { uid }               PIN nuevo para pagar con el QR
//   GET  /tarjetas  ·  DELETE /tarjetas/<uid>
//
//   GET  /salud
// Todo lo demás es la web (carpeta `publico`, la compilación de app/).
import fs from 'node:fs';
import http from 'node:http';
import * as estaticos from './estaticos.mjs';
import * as historial from './historial.mjs';
import { paginaPago } from './pagina-pago.mjs';
import * as sesiones from './sesiones.mjs';
import {
  Keypair, RED, TOKEN, aUnidades, cobrar, cuentaExiste, deUnidades, enviarFirmada, fondearTestnet,
  ledgerEnDias, leerAprobacion, permiso, prepararAprobacion, saldo, simbolo, transferir, vencimientoPermiso,
  verificarCobro,
} from './stellar.mjs';
import * as tarjetas from './tarjetas.mjs';

function requerida(nombre) {
  if (!process.env[nombre]) {
    console.error(`Falta la variable ${nombre}. Corre con: doppler run --project paizap --config dev -- ...`);
    process.exit(1);
  }
  return process.env[nombre];
}

const paizap = Keypair.fromSecret(requerida('PAIZAP_SECRET'));
const COMERCIO = requerida('COMERCIO_PUBLIC');
const TERMINAL_TOKEN = process.env.TERMINAL_TOKEN ?? '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const LIMITE_DIARIO = Number(process.env.LIMITE_DIARIO || 15);
const MONTO_MAXIMO = Number(process.env.MONTO_MAXIMO || 100);
const RECARGA_PRUEBA = process.env.RECARGA_PRUEBA || '20';
const PERMISO_MAXIMO = Number(process.env.PERMISO_MAXIMO || 1000);
const PERMISO_DIAS_MAXIMO = 90;
const NOMBRE_COMERCIO = process.env.COMERCIO_NOMBRE || 'Comercio de prueba';
const PUERTO = Number(process.env.PUERTO || 8080);

tarjetas.cargar(JSON.parse(process.env.TARJETAS || '{}'));
sesiones.iniciar(paizap);

const enlaceExplorador = (hash) =>
  `https://stellar.expert/explorer/${RED === 'mainnet' ? 'public' : 'testnet'}/tx/${hash}`;

// El código del token ("XLM", "USDC") se le pregunta al contrato; si la red no responde al
// arrancar, se vuelve a intentar la próxima vez que haga falta.
let moneda = null;
async function leerMoneda() {
  if (!moneda) moneda = await simbolo(paizap.publicKey()).catch(() => null);
  return moneda ?? '';
}
leerMoneda();

// Las transacciones de Paizap salen de una sola cuenta: se hacen de a una para no chocar en la
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
    saldoComercio.pendiente = saldo(COMERCIO, paizap.publicKey())
      .then((unidades) => { saldoComercio.valor = deUnidades(unidades); })
      .catch(() => {})
      .finally(() => { saldoComercio.momento = Date.now(); saldoComercio.pendiente = null; });
  }
  return saldoComercio.valor;
}

// Cobros que un terminal está firmando él mismo en este momento (id -> momento): entre que los
// prepara y los registra, ese cobro no se puede pagar también con el QR.
const enTerminal = new Map();
const EN_TERMINAL_MS = 3 * 60 * 1000;
const cobrandoEnTerminal = (id) => enTerminal.has(id) && Date.now() - enTerminal.get(id) < EN_TERMINAL_MS;

// `medio` dice cómo se pagó: acercando la tarjeta ("tarjeta") o escaneando el QR ("qr").
// Cuando el terminal firma el cobro con su propia llave, pasa dos veces por aquí:
//   soloValidar       revisa la tarjeta, el bloqueo y el límite y devuelve la cuenta, sin cobrar;
//   hashDelTerminal   el cobro ya está en la red: se comprueba ahí y se anota igual que los demás;
//   rechazoDelTerminal  la red no dejó pasar el cobro del terminal: solo se anota el rechazo.
async function procesarCobro({ id, uid, monto, concepto, medio, soloValidar, hashDelTerminal, rechazoDelTerminal }) {
  uid = tarjetas.normalizar(uid);
  monto = String(monto ?? '');
  concepto = String(concepto ?? '').slice(0, 40);
  medio = medio === 'qr' ? 'qr' : 'tarjeta';
  const valor = Number(monto);
  if (!uid || !/^\d+(\.\d{1,7})?$/.test(monto) || !(valor > 0)) {
    return [400, { ok: false, motivo: 'datos incompletos' }];
  }
  if (valor > MONTO_MAXIMO) return [400, { ok: false, motivo: `monto mayor a ${MONTO_MAXIMO}` }];

  const rechazar = (estado, motivo, cuenta, extra = {}) => {
    historial.anotar({ id, uid, cuenta, monto, concepto, medio, ok: false, motivo });
    return [estado, { ok: false, motivo, ...extra }];
  };

  if (!tarjetas.buscar(uid)) {
    vistas.set(uid, Date.now());
    return rechazar(404, 'tarjeta no registrada', undefined, { uid });
  }

  const [estado, cuerpo] = await enCola(async () => {
    const tarjeta = tarjetas.buscar(uid);
    if (!tarjeta) return rechazar(404, 'tarjeta no registrada', undefined, { uid });
    if (rechazoDelTerminal) return rechazar(402, rechazoDelTerminal, tarjeta.cuenta);
    const limite = tarjeta.limiteDiario ?? LIMITE_DIARIO;
    // Un cobro que el terminal ya hizo solo se anota: el bloqueo y el límite se revisaron al prepararlo.
    if (!hashDelTerminal) {
      if (tarjeta.bloqueada) return rechazar(403, 'tarjeta bloqueada', tarjeta.cuenta);
      if (historial.gastadoHoy(uid) + aUnidades(monto) > aUnidades(limite)) {
        return rechazar(402, `supera el limite diario (${limite})`, tarjeta.cuenta);
      }
    }
    if (soloValidar) {
      return [200, { ok: true, cuenta: tarjeta.cuenta, comercio: COMERCIO, gastador: paizap.publicKey(), token: TOKEN }];
    }
    let hash;
    try {
      if (hashDelTerminal) {
        await verificarCobro(hashDelTerminal, { gastador: paizap.publicKey(), cliente: tarjeta.cuenta, comercio: COMERCIO, monto });
        hash = hashDelTerminal;
      } else {
        hash = await cobrar(paizap, tarjeta.cuenta, COMERCIO, monto);
      }
    } catch (error) {
      // Sin permiso suficiente, permiso vencido o sin saldo: la red no deja pasar el cobro.
      console.error('cobro rechazado:', error.message);
      return rechazar(402, 'la red rechazo el cobro (saldo o permiso)', tarjeta.cuenta);
    }
    const recibo = guardarRecibo(hash);
    historial.anotar({ id, uid, cuenta: tarjeta.cuenta, monto, concepto, medio, ok: true, hash, recibo });
    return [200, { ok: true, hash, recibo, monto, cuenta: tarjeta.cuenta, limite }];
  });
  if (estado !== 200 || soloValidar) return [estado, cuerpo];

  // El cobro ya está hecho: si estas lecturas fallan, el terminal igual recibe su «aprobado».
  leerSaldoComercio(true);
  const { cuenta, limite, ...respuesta } = cuerpo;
  const [restante, saldoCliente] = await Promise.all([
    permiso(cuenta, paizap.publicKey()),
    saldo(cuenta, paizap.publicKey()),
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

// ---- Pago con QR ----

// Pedidos: cobros que el terminal deja listos para pagar también con el QR de su pantalla. El id
// del pedido es el mismo id del cobro, así que se pague con la tarjeta o con el QR se cobra una
// sola vez.
const pedidos = new Map(); // id -> { monto, concepto, creado, cancelado, pagadoPor }
const PEDIDO_VIGENCIA_MS = 5 * 60 * 1000;
function pedidoVigente(id) {
  const pedido = pedidos.get(id);
  if (!pedido || pedido.cancelado || Date.now() - pedido.creado > PEDIDO_VIGENCIA_MS) return null;
  return pedido;
}

/** Los cobros que el terminal tiene en espera de pago, para el panel del comercio. */
function pedidosEnEspera() {
  const lista = [];
  for (const [id, pedido] of pedidos) {
    if (pedidoVigente(id) && !cobrosHechos[id]) {
      lista.push({ id, monto: pedido.monto, concepto: pedido.concepto, fecha: new Date(pedido.creado).toISOString() });
    }
  }
  return lista.reverse();
}

// Paga un pedido con la cuenta de una tarjeta, sin acercar la tarjeta: desde la página del QR
// (código de cuenta y PIN) o desde la app (sesión de la cuenta). Usa el mismo permiso de gasto,
// el mismo bloqueo y el mismo límite diario que la tarjeta.
async function pagarPedido(id, uid) {
  const pedido = pedidoVigente(id);
  if (!pedido) {
    return [410, { ok: false, motivo: cobrosHechos[id] ? 'este cobro ya esta pagado' : 'este cobro ya no esta disponible' }];
  }
  // Si otra persona ya lo está pagando (con su tarjeta o desde otro celular), a esta no se le
  // muestra el resultado de aquella.
  if ((cobrosHechos[id] || cobrosPorId.has(id)) && pedido.pagadoPor !== uid) {
    return [409, { ok: false, motivo: 'este cobro ya se esta pagando' }];
  }
  // Alguien acercó la tarjeta y el terminal está firmando ese cobro: no se cobra otra vez por aquí.
  if (cobrandoEnTerminal(id)) return [409, { ok: false, motivo: 'este cobro ya se esta pagando' }];
  pedido.pagadoPor = uid;
  const inicio = Date.now();
  const [estado, cuerpo] = await cobroUnaVez({ id, uid, monto: pedido.monto, concepto: pedido.concepto, medio: 'qr' });
  if (estado !== 200) pedido.pagadoPor = undefined;
  console.log(`${new Date().toISOString()} cobro por QR ${id} ${uid} ${pedido.monto}${pedido.concepto ? ` [${pedido.concepto}]` : ''} -> ${estado} ${cuerpo.hash ?? cuerpo.motivo} (${Date.now() - inicio} ms)`);
  return [estado, cuerpo];
}

// Los motivos del cobro van sin tildes para la pantalla del terminal; en la página se dicen bien.
function motivoParaPagina(motivo = '') {
  if (motivo.startsWith('supera el limite diario')) return 'Con este pago superas tu límite diario.';
  if (motivo.startsWith('la red rechazo')) return 'No hay saldo o permiso suficiente en tu cuenta.';
  if (motivo.startsWith('monto mayor')) return 'El monto supera el máximo por pago.';
  if (motivo === 'tarjeta bloqueada') return 'Tu tarjeta está bloqueada.';
  if (motivo === 'este cobro ya esta pagado') return 'Este cobro ya está pagado.';
  if (motivo === 'este cobro ya no esta disponible') return 'Este cobro ya no está disponible.';
  if (motivo === 'este cobro ya se esta pagando') return 'Este cobro ya se está pagando.';
  return motivo || 'No se pudo cobrar.';
}

// ---- Lo que ve la app ----

// Un movimiento, como lo ve el dueño de la cuenta o el comercio.
const movimiento = (c) => ({
  n: c.n, fecha: c.fecha, tipo: c.tipo ?? 'cobro', uid: c.uid, monto: c.monto, concepto: c.concepto ?? '',
  medio: c.medio ?? 'tarjeta', ok: c.ok, motivo: c.motivo, recibo: c.recibo, hash: c.hash,
});

async function datosDeCuenta(cuenta) {
  const fuente = paizap.publicKey();
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
    esperando: pedidosEnEspera(),
    terminal: { ultimoContacto: contactoTerminal },
    tarjetasNuevas: tarjetasNuevas(),
    tarjetasRegistradas: tarjetas.cantidad(),
  };
}

// Recarga de prueba: en testnet no hay dónde comprar, así que Paizap manda un monto fijo de su
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
  const hash = await enCola(() => transferir(paizap, cuenta, RECARGA_PRUEBA));
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
  const xdr = await prepararAprobacion(cuenta, paizap.publicKey(), monto, vence);
  return [200, { ok: true, xdr, monto, dias, vence, gastador: paizap.publicKey(), token: TOKEN }];
}

async function enviarPermiso(cuenta, { xdr }) {
  let aprobacion;
  try {
    aprobacion = leerAprobacion(String(xdr ?? ''));
  } catch {
    aprobacion = null;
  }
  // Solo se manda lo que es, exactamente, el permiso de gasto de esta cuenta para Paizap.
  if (!aprobacion || aprobacion.dueno !== cuenta || aprobacion.gastador !== paizap.publicKey()) {
    return [400, { ok: false, motivo: 'eso no es un permiso de gasto de esta cuenta' }];
  }
  let hash;
  try {
    hash = await enviarFirmada(aprobacion.tx, paizap); // Paizap paga la comisión
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
      ok: true, red: RED, moneda: await leerMoneda(), token: TOKEN, gastador: paizap.publicKey(), comercio: COMERCIO,
      comercioNombre: NOMBRE_COMERCIO, limiteDiario: LIMITE_DIARIO, recargaPrueba: RED === 'mainnet' ? null : RECARGA_PRUEBA,
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

  // Un cobro que espera pago: lo que muestra la app antes de pagar.
  const dePedido = ruta.match(/^\/api\/pedidos\/([\w-]{3,64})(\/pagar)?$/);
  if (dePedido && !dePedido[2] && metodo === 'GET') {
    const id = dePedido[1];
    const pedido = pedidos.get(id);
    return responder(res, 200, {
      ok: true, id, estado: cobrosHechos[id] ? 'pagado' : pedidoVigente(id) ? 'pendiente' : 'vencido',
      monto: pedido?.monto ?? null, concepto: pedido?.concepto ?? '', moneda: await leerMoneda(),
      comercio: COMERCIO, comercioNombre: NOMBRE_COMERCIO,
    });
  }

  // De aquí en adelante hace falta una sesión.
  const cuenta = sesiones.cuentaDe(req);
  if (!cuenta) return responder(res, 401, { ok: false, motivo: 'sesion vencida' });

  // Pagar un pedido desde la app: la sesión prueba que la cuenta es de quien paga, así que no
  // hace falta PIN. Se cobra con una de sus tarjetas (su bloqueo y su límite diario).
  if (dePedido && dePedido[2] && metodo === 'POST') {
    const uid = tarjetas.normalizar((await leerJson(req)).uid);
    if (tarjetas.buscar(uid)?.cuenta !== cuenta) {
      return responder(res, 404, { ok: false, motivo: 'esa tarjeta no es de esta cuenta' });
    }
    return responder(res, ...(await pagarPedido(dePedido[1], uid)));
  }

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

  // PIN nuevo para pagar con el QR desde un celular sin la app. Se muestra una sola vez.
  const pinDeTarjeta = metodo === 'POST' && ruta.match(/^\/api\/tarjetas\/([0-9A-Fa-f:%-]{8,40})\/pin$/);
  if (pinDeTarjeta) {
    const acceso = tarjetas.nuevoPin(decodeURIComponent(pinDeTarjeta[1]), cuenta);
    if (!acceso) return responder(res, 404, { ok: false, motivo: 'esa tarjeta no es de esta cuenta' });
    return responder(res, 200, { ok: true, ...acceso });
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
    const url = new URL(req.url, 'http://paizap');
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
      // Con la web instalada, el QR abre el recibo de Paizap (monto, producto y enlace a la red);
      // sin ella, va directo a la transacción en el explorador.
      res.writeHead(302, { location: estaticos.hayWeb() ? `/#/recibo/${codigo}` : enlaceExplorador(hash) });
      return res.end();
    }

    // ---- Pago con QR ----
    // El terminal registra el cobro pendiente para que se pueda pagar desde el celular.
    if (req.method === 'POST' && ruta === '/pedidos') {
      if (!autorizado(req, 'x-terminal-token', TERMINAL_TOKEN)) {
        return responder(res, 401, { ok: false, motivo: 'terminal no autorizado' });
      }
      const { id, monto, concepto } = await leerJson(req);
      if (!/^[\w-]{3,64}$/.test(String(id)) || !/^\d+(\.\d{1,7})?$/.test(String(monto)) || !(Number(monto) > 0)) {
        return responder(res, 400, { ok: false, motivo: 'datos incompletos' });
      }
      for (const [otro, pedido] of pedidos) {
        if (Date.now() - pedido.creado > PEDIDO_VIGENCIA_MS) pedidos.delete(otro);
      }
      pedidos.set(id, { monto: String(monto), concepto: String(concepto ?? '').slice(0, 40), creado: Date.now() });
      return responder(res, 200, { ok: true, vigenciaSegundos: PEDIDO_VIGENCIA_MS / 1000 });
    }

    // El terminal cancela el pedido (el comercio canceló o se venció la espera).
    const cancelacion = req.method === 'POST' && ruta.match(/^\/pedidos\/([\w-]{3,64})\/cancelar$/);
    if (cancelacion) {
      if (!autorizado(req, 'x-terminal-token', TERMINAL_TOKEN)) {
        return responder(res, 401, { ok: false, motivo: 'terminal no autorizado' });
      }
      const id = cancelacion[1];
      if (cobrosHechos[id] || cobrosPorId.has(id)) {
        return responder(res, 409, { ok: false, motivo: 'ya se esta pagando' });
      }
      if (pedidos.has(id)) pedidos.get(id).cancelado = true;
      return responder(res, 200, { ok: true });
    }

    // La página que abre el QR en el celular del cliente. Es liviana y no depende de la web: pide
    // el código de cuenta y el PIN. Si en ese navegador está la billetera de Paizap, la página pasa
    // a ella (#/pagar/<id>) y se paga sin PIN.
    const pagina = req.method === 'GET' && ruta.match(/^\/p\/([\w-]{3,64})$/);
    if (pagina) {
      const id = pagina[1];
      const pedido = pedidoVigente(id);
      const aviso = cobrosHechos[id]
        ? 'Este cobro ya está pagado.'
        : pedido ? '' : 'Este cobro ya no está disponible. Pide en la caja que lo generen de nuevo.';
      res.writeHead(aviso ? 410 : 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(paginaPago({
        id, monto: pedido?.monto, concepto: pedido?.concepto, moneda: await leerMoneda(), comercio: NOMBRE_COMERCIO, aviso,
        conBilletera: estaticos.hayWeb(),
      }));
    }

    // El cliente paga desde la página: código de cuenta y PIN.
    const pagoQr = req.method === 'POST' && ruta.match(/^\/p\/([\w-]{3,64})\/pagar$/);
    if (pagoQr) {
      const id = pagoQr[1];
      if (!pedidoVigente(id)) {
        return responder(res, 410, { ok: false, motivo: cobrosHechos[id] ? 'Este cobro ya está pagado.' : 'Este cobro ya no está disponible.' });
      }
      const { codigo, pin } = await leerJson(req);
      const acceso = tarjetas.entrar(codigo, pin);
      if (acceso.error) return responder(res, 401, { ok: false, motivo: acceso.error });
      const [estado, cuerpo] = await pagarPedido(id, acceso.uid);
      return responder(res, estado, estado === 200 ? cuerpo : { ok: false, motivo: motivoParaPagina(cuerpo.motivo) });
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

    // Terminal que firma el cobro con su propia llave (SDK), paso 1: el servidor revisa la tarjeta,
    // el bloqueo y el límite y le dice de qué cuenta cobrar. No cobra.
    if (req.method === 'POST' && ruta === '/cobros/preparar') {
      if (!autorizado(req, 'x-terminal-token', TERMINAL_TOKEN)) {
        return responder(res, 401, { ok: false, motivo: 'terminal no autorizado' });
      }
      const pedido = await leerJson(req);
      const id = String(pedido.id ?? '');
      if (id && cobrosHechos[id]) return responder(res, 200, cobrosHechos[id]);  // ya lo pagaron (con el QR, o es un reintento)
      if (id && cobrosPorId.has(id)) {
        const [estado, cuerpo] = await cobrosPorId.get(id);  // lo están pagando con el QR: espera el resultado
        return responder(res, estado, cuerpo);
      }
      const [estado, cuerpo] = await procesarCobro({ ...pedido, medio: 'tarjeta', soloValidar: true }).catch((error) => {
        console.error(error);
        return [500, { ok: false, motivo: 'error del servidor' }];
      });
      if (estado === 200 && id) enTerminal.set(id, Date.now());
      console.log(`${new Date().toISOString()} cobro ${id || '-'} ${pedido.uid} ${pedido.monto} lo firma el terminal -> ${estado} ${cuerpo.motivo ?? 'preparado'}`);
      return responder(res, estado, cuerpo);
    }

    // Paso 2: el terminal ya cobró en la red y manda el hash. El servidor lo comprueba en la red y
    // lo anota (historial, límite diario y recibo), igual que un cobro hecho por él. Si la red
    // rechazó el cobro, el terminal manda el motivo y solo se anota el rechazo.
    if (req.method === 'POST' && ruta === '/cobros/registrar') {
      if (!autorizado(req, 'x-terminal-token', TERMINAL_TOKEN)) {
        return responder(res, 401, { ok: false, motivo: 'terminal no autorizado' });
      }
      const pedido = await leerJson(req);
      const id = String(pedido.id ?? '');
      const hash = String(pedido.hash ?? '').toLowerCase();
      const inicio = Date.now();
      let estado, cuerpo;
      if (!hash) {
        const motivo = String(pedido.motivo ?? '').slice(0, 60) || 'la red rechazo el cobro (saldo o permiso)';
        [estado, cuerpo] = await procesarCobro({ ...pedido, medio: 'tarjeta', rechazoDelTerminal: motivo });
      } else {
        [estado, cuerpo] = await cobroUnaVez({ ...pedido, medio: 'tarjeta', hashDelTerminal: hash });
      }
      enTerminal.delete(id);
      console.log(`${new Date().toISOString()} cobro ${id || '-'} ${pedido.uid} ${pedido.monto} firmado por el terminal -> ${estado} ${cuerpo.hash ?? cuerpo.motivo} (${Date.now() - inicio} ms)`);
      return responder(res, estado, cuerpo);
    }

    if (req.method === 'POST' && ruta === '/cobros') {
      if (!autorizado(req, 'x-terminal-token', TERMINAL_TOKEN)) {
        return responder(res, 401, { ok: false, motivo: 'terminal no autorizado' });
      }
      const pedido = await leerJson(req);
      const inicio = Date.now();
      const [estado, cuerpo] = await cobroUnaVez({ ...pedido, medio: 'tarjeta' });
      const concepto = pedido.concepto ? ` [${String(pedido.concepto).slice(0, 40)}]` : '';
      console.log(`${new Date().toISOString()} cobro ${pedido.id ?? '-'} ${pedido.uid} ${pedido.monto}${concepto} -> ${estado} ${cuerpo.hash ?? cuerpo.motivo} (${Date.now() - inicio} ms)`);
      return responder(res, estado, cuerpo);
    }

    // PIN nuevo para pagar desde el celular. El PIN se devuelve una sola vez.
    if (req.method === 'POST' && ruta === '/tarjetas/pin') {
      if (!ADMIN_TOKEN || !autorizado(req, 'x-admin-token', ADMIN_TOKEN)) {
        return responder(res, 401, { ok: false, motivo: 'no autorizado' });
      }
      const acceso = tarjetas.nuevoPin((await leerJson(req)).uid);
      if (!acceso) return responder(res, 404, { ok: false, motivo: 'tarjeta no registrada' });
      return responder(res, 200, { ok: true, ...acceso });
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
        const registro = await enCola(() => tarjetas.registrar(uid, cuenta, paizap.publicKey()));
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
  console.log(`Paizap escuchando en :${PUERTO} · red ${RED} · token ${TOKEN} · comercio ${COMERCIO} · ${tarjetas.cantidad()} tarjetas · web ${estaticos.hayWeb() ? 'sí' : 'no'}`);
});
