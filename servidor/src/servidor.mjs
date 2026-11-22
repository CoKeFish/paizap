// Servidor de Toki (MVP): el terminal manda el toque de la tarjeta y el monto; el servidor busca
// la cuenta de la tarjeta, revisa el límite diario y cobra en Stellar con el permiso de gasto.
//
//   POST /cobros    { id, uid, monto, sun }  cabecera X-Terminal-Token
//   GET  /cobros/<id>                        consulta un cobro sin cobrar (cabecera X-Terminal-Token)
//   POST /pedidos   { id, monto, concepto }  deja un cobro listo para pagar con el QR (X-Terminal-Token)
//   POST /pedidos/<id>/cancelar              lo cancela (X-Terminal-Token)
//   GET  /p/<id>                             página de pago que abre el QR en el celular
//   POST /p/<id>/pagar { codigo, pin }       paga desde esa página
//   POST /tarjetas/pin { uid }               PIN nuevo para pagar desde el celular (X-Admin-Token)
//   GET  /r/<código>                         recibo: redirige a la transacción en el explorador
//   POST /tarjetas  { uid, cuenta? }         cabecera X-Admin-Token  (sin cuenta: crea un cliente de testnet)
//   GET  /tarjetas                           cabecera X-Admin-Token
//   GET  /salud
import fs from 'node:fs';
import http from 'node:http';
import { Keypair, RED, TOKEN, cobrar, deUnidades, permiso, saldo } from './stellar.mjs';
import * as tarjetas from './tarjetas.mjs';
import { paginaPago } from './pagina-pago.mjs';

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
const LIMITE_DIARIO = Number(process.env.LIMITE_DIARIO ?? 15);
const MONTO_MAXIMO = Number(process.env.MONTO_MAXIMO ?? 100);
const PUERTO = Number(process.env.PUERTO ?? 8080);

tarjetas.cargar(JSON.parse(process.env.TARJETAS ?? '{}'));

// Gasto del día por tarjeta (en memoria: se reinicia con el servidor; basta para el MVP).
const gastoDelDia = new Map();
const hoy = () => new Date().toISOString().slice(0, 10);
function gastado(uid) {
  const g = gastoDelDia.get(uid);
  return g && g.dia === hoy() ? g.total : 0;
}

// Las transacciones de Toki salen de una sola cuenta: se hacen de a una para no chocar en la
// secuencia.
let cola = Promise.resolve();
function enCola(tarea) {
  const resultado = cola.then(tarea);
  cola = resultado.catch(() => {});
  return resultado;
}

// Cobros ya procesados (o en curso) por id: si el terminal reintenta porque no le llegó la
// respuesta, recibe la misma respuesta y no se cobra dos veces.
const cobrosPorId = new Map();

// Recibos: un código corto por cobro. El terminal lo muestra en un QR (en su pantalla solo cabe
// un enlace corto) y GET /r/<código> redirige a la transacción en el explorador de Stellar.
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
const enlaceExplorador = (hash) =>
  `https://stellar.expert/explorer/${RED === 'mainnet' ? 'public' : 'testnet'}/tx/${hash}`;

// Pedidos: cobros que el terminal deja listos para pagar también con el QR. El id del pedido es
// el mismo id del cobro, así que se pague con la tarjeta o con el QR se cobra una sola vez.
const pedidos = new Map(); // id -> { monto, concepto, creado, cancelado, pagadoPor }
const PEDIDO_VIGENCIA_MS = 5 * 60 * 1000;
const MONEDA = process.env.MONEDA ?? 'XLM de testnet';
const NOMBRE_COMERCIO = process.env.COMERCIO_NOMBRE ?? 'Comercio de prueba';
function pedidoVigente(id) {
  const pedido = pedidos.get(id);
  if (!pedido || pedido.cancelado || Date.now() - pedido.creado > PEDIDO_VIGENCIA_MS) return null;
  return pedido;
}
// Los motivos del cobro van sin tildes para la pantalla del terminal; en la página se dicen bien.
function motivoParaPagina(motivo = '') {
  if (motivo.startsWith('supera el limite diario')) return 'Con este pago superas tu límite diario.';
  if (motivo.startsWith('la red rechazo')) return 'No hay saldo o permiso suficiente en tu cuenta.';
  if (motivo.startsWith('monto mayor')) return 'El monto supera el máximo por pago.';
  return motivo || 'No se pudo cobrar.';
}

async function procesarCobro({ uid, monto }) {
  uid = tarjetas.normalizar(uid);
  monto = String(monto ?? '');
  const valor = Number(monto);
  if (!uid || !/^\d+(\.\d{1,7})?$/.test(monto) || !(valor > 0)) {
    return [400, { ok: false, motivo: 'datos incompletos' }];
  }
  if (valor > MONTO_MAXIMO) return [400, { ok: false, motivo: `monto mayor a ${MONTO_MAXIMO}` }];

  const tarjeta = tarjetas.buscar(uid);
  if (!tarjeta) return [404, { ok: false, motivo: 'tarjeta no registrada', uid }];
  if (gastado(uid) + valor > LIMITE_DIARIO) {
    return [402, { ok: false, motivo: `supera el limite diario (${LIMITE_DIARIO})` }];
  }

  let hash;
  try {
    hash = await enCola(() => cobrar(toki, tarjeta.cuenta, COMERCIO, monto));
  } catch (error) {
    // Sin permiso suficiente, permiso vencido o sin saldo: la red no deja pasar el cobro.
    console.error('cobro rechazado:', error.message);
    return [402, { ok: false, motivo: 'la red rechazo el cobro (saldo o permiso)' }];
  }
  gastoDelDia.set(uid, { dia: hoy(), total: gastado(uid) + valor });
  const [restante, saldoCliente] = await Promise.all([
    permiso(tarjeta.cuenta, toki.publicKey()),
    saldo(tarjeta.cuenta, toki.publicKey()),
  ]);
  return [200, {
    ok: true,
    hash,
    recibo: guardarRecibo(hash),
    monto,
    permisoRestante: deUnidades(restante),
    saldoCliente: deUnidades(saldoCliente),
    hoyRestante: String(LIMITE_DIARIO - gastado(uid)),
  }];
}

// Los cobros hechos se guardan también en disco: si el servidor se reinicia y el terminal vuelve a
// preguntar por un cobro que no pudo confirmar, recibe el resultado guardado y no se cobra otra vez.
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
  if (!id) return procesarCobro(pedido);
  if (cobrosHechos[id]) {
    console.log(`cobro ${id} ya estaba hecho: devuelvo la respuesta guardada`);
    return [200, cobrosHechos[id]];
  }
  if (!cobrosPorId.has(id)) {
    const promesa = procesarCobro(pedido);
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

function responder(res, estado, cuerpo) {
  res.writeHead(estado, { 'content-type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
}

async function leerJson(req) {
  let texto = '';
  for await (const parte of req) texto += parte;
  return JSON.parse(texto || '{}');
}

const autorizado = (req, cabecera, token) => !token || req.headers[cabecera] === token;

http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/salud') {
      return responder(res, 200, { ok: true, red: RED, token: TOKEN, comercio: COMERCIO, tarjetas: tarjetas.cantidad() });
    }

    const recibo = req.method === 'GET' && req.url.match(/^\/r\/([0-9a-f]{8})$/i);
    if (recibo) {
      const hash = recibos[recibo[1].toLowerCase()];
      if (!hash) return responder(res, 404, { ok: false, motivo: 'recibo no encontrado' });
      res.writeHead(302, { location: enlaceExplorador(hash) });
      return res.end();
    }

    // ---- Pago con QR ----
    // El terminal registra el cobro pendiente para que se pueda pagar desde el celular.
    if (req.method === 'POST' && req.url === '/pedidos') {
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
    const cancelacion = req.method === 'POST' && req.url.match(/^\/pedidos\/([\w-]{3,64})\/cancelar$/);
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

    // La página que abre el QR en el celular del cliente.
    const pagina = req.method === 'GET' && req.url.match(/^\/p\/([\w-]{3,64})$/);
    if (pagina) {
      const id = pagina[1];
      const pedido = pedidoVigente(id);
      const aviso = cobrosHechos[id]
        ? 'Este cobro ya está pagado.'
        : pedido ? '' : 'Este cobro ya no está disponible. Pide en la caja que lo generen de nuevo.';
      res.writeHead(aviso ? 410 : 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(paginaPago({ id, ...pedido, moneda: MONEDA, comercio: NOMBRE_COMERCIO, aviso }));
    }

    // El cliente paga desde la página: código de cuenta y PIN. Se cobra de la misma cuenta que su
    // tarjeta, con el mismo permiso de gasto y el mismo límite diario.
    const pagoQr = req.method === 'POST' && req.url.match(/^\/p\/([\w-]{3,64})\/pagar$/);
    if (pagoQr) {
      const id = pagoQr[1];
      const pedido = pedidoVigente(id);
      if (!pedido) {
        const motivo = cobrosHechos[id] ? 'Este cobro ya está pagado.' : 'Este cobro ya no está disponible.';
        return responder(res, 410, { ok: false, motivo });
      }
      const { codigo, pin } = await leerJson(req);
      const acceso = tarjetas.entrar(codigo, pin);
      if (acceso.error) return responder(res, 401, { ok: false, motivo: acceso.error });
      // Si otra persona ya lo está pagando (con su tarjeta o desde otro celular), no se le muestra
      // a esta el resultado de aquella.
      if ((cobrosHechos[id] || cobrosPorId.has(id)) && pedido.pagadoPor !== acceso.uid) {
        return responder(res, 409, { ok: false, motivo: 'Este cobro ya se está pagando.' });
      }
      pedido.pagadoPor = acceso.uid;
      const inicio = Date.now();
      const [estado, cuerpo] = await cobroUnaVez({ id, uid: acceso.uid, monto: pedido.monto, concepto: pedido.concepto });
      if (estado !== 200) pedido.pagadoPor = undefined;
      console.log(`${new Date().toISOString()} cobro por QR ${id} ${acceso.uid} ${pedido.monto}${pedido.concepto ? ` [${pedido.concepto}]` : ''} -> ${estado} ${cuerpo.hash ?? cuerpo.motivo} (${Date.now() - inicio} ms)`);
      return responder(res, estado, estado === 200 ? cuerpo : { ok: false, motivo: motivoParaPagina(cuerpo.motivo) });
    }

    // Consulta de un cobro por su id, sin cobrar: la usa el terminal cuando no le llegó la respuesta.
    const consulta = req.method === 'GET' && req.url.match(/^\/cobros\/([\w-]{3,64})$/);
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

    if (req.method === 'POST' && req.url === '/cobros') {
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

    // PIN nuevo para pagar desde el celular. El PIN se devuelve una sola vez.
    if (req.method === 'POST' && req.url === '/tarjetas/pin') {
      if (!ADMIN_TOKEN || !autorizado(req, 'x-admin-token', ADMIN_TOKEN)) {
        return responder(res, 401, { ok: false, motivo: 'no autorizado' });
      }
      const { uid } = await leerJson(req);
      const acceso = tarjetas.nuevoPin(uid);
      if (!acceso) return responder(res, 404, { ok: false, motivo: 'tarjeta no registrada' });
      return responder(res, 200, { ok: true, ...acceso });
    }

    if (req.url === '/tarjetas') {
      if (!ADMIN_TOKEN || !autorizado(req, 'x-admin-token', ADMIN_TOKEN)) {
        return responder(res, 401, { ok: false, motivo: 'no autorizado' });
      }
      if (req.method === 'GET') return responder(res, 200, { ok: true, tarjetas: tarjetas.listar() });
      if (req.method === 'POST') {
        const { uid, cuenta } = await leerJson(req);
        if (!tarjetas.normalizar(uid)) return responder(res, 400, { ok: false, motivo: 'falta uid' });
        const registro = await enCola(() => tarjetas.registrar(uid, cuenta, toki.publicKey()));
        console.log(`tarjeta ${registro.uid} -> ${registro.cuenta}`);
        return responder(res, 200, { ok: true, ...registro });
      }
    }

    responder(res, 404, { ok: false, motivo: 'no existe' });
  } catch (error) {
    console.error(error);
    responder(res, 500, { ok: false, motivo: 'error del servidor' });
  }
}).listen(PUERTO, () => {
  console.log(`Toki escuchando en :${PUERTO} · red ${RED} · token ${TOKEN} · comercio ${COMERCIO} · ${tarjetas.cantidad()} tarjetas`);
});
