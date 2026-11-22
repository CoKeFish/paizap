// Pruebas del servidor contra Stellar testnet (sin terminal). Cada una mira la red, no solo la
// respuesta del servidor.
//   SERVIDOR_URL=http://localhost:8090 node src/pruebas.mjs
import { aUnidades, deUnidades, saldo } from './stellar.mjs';

const URL_SERVIDOR = process.env.SERVIDOR_URL ?? 'http://localhost:8090';
const COMERCIO = process.env.COMERCIO_PUBLIC;
let fallas = 0;

async function post(ruta, cuerpo, cabeceras = {}) {
  const r = await fetch(`${URL_SERVIDOR}${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
  });
  return [r.status, await r.json()];
}
const cobro = (cuerpo) => post('/cobros', cuerpo, { 'x-terminal-token': process.env.TERMINAL_TOKEN ?? '' });

function comprobar(nombre, condicion, detalle = '') {
  console.log(`${condicion ? '✓' : '✗'} ${nombre}${detalle ? ` · ${detalle}` : ''}`);
  if (!condicion) fallas++;
}

const uidAzar = () => Array.from({ length: 7 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(':').toUpperCase();

// 1. Tarjeta desconocida: no cobra y devuelve su UID para registrarla.
const desconocida = uidAzar();
{
  const [estado, cuerpo] = await cobro({ id: `p-${Date.now()}-a`, uid: desconocida, monto: '1' });
  comprobar('tarjeta desconocida se rechaza con su UID', estado === 404 && cuerpo.uid === desconocida, cuerpo.motivo);
}

// 2. Registrarla crea un cliente nuevo en testnet con su permiso de gasto, y le da un código de
//    cuenta y un PIN para pagar desde el celular.
let acceso;
{
  const [estado, cuerpo] = await post('/tarjetas', { uid: desconocida }, { 'x-admin-token': process.env.ADMIN_TOKEN ?? '' });
  comprobar('registrar tarjeta crea cliente con permiso', estado === 200 && cuerpo.nueva && cuerpo.cuenta?.startsWith('G'), cuerpo.cuenta);
  comprobar('el registro entrega código de cuenta y PIN', /^\d{6}$/.test(cuerpo.codigo) && /^\d{4}$/.test(cuerpo.pin));
  acceso = { codigo: cuerpo.codigo, pin: cuerpo.pin };
}

// 3. Cobro con la tarjeta recién registrada, enviado dos veces con el mismo id (reintento del
//    terminal): una sola transacción y el comercio recibe el monto una sola vez.
{
  const antes = await saldo(COMERCIO);
  const id = `p-${Date.now()}-b`;
  const [[e1, c1], [e2, c2]] = await Promise.all([
    cobro({ id, uid: desconocida, monto: '0.75' }),
    cobro({ id, uid: desconocida, monto: '0.75' }),
  ]);
  const despues = await saldo(COMERCIO);
  comprobar('cobro con la tarjeta nueva', e1 === 200 && c1.ok, c1.hash ?? c1.motivo);
  comprobar('reintento con el mismo id no cobra dos veces', e2 === 200 && c2.hash === c1.hash && despues - antes === aUnidades('0.75'),
    `comercio +${deUnidades(despues - antes)}`);

  // 3b. El terminal puede consultar un cobro sin volver a cobrar (cuando no le llegó la respuesta).
  const cabeceras = { 'x-terminal-token': process.env.TERMINAL_TOKEN ?? '' };
  const consulta = await fetch(`${URL_SERVIDOR}/cobros/${id}`, { headers: cabeceras });
  const hecho = await consulta.json();
  const inexistente = await fetch(`${URL_SERVIDOR}/cobros/no-existe-${Date.now()}`, { headers: cabeceras });
  const despuesConsulta = await saldo(COMERCIO);
  comprobar('consultar un cobro hecho devuelve su resultado sin cobrar', consulta.status === 200 && hecho.hash === c1.hash && despuesConsulta === despues);
  comprobar('consultar un cobro que nunca llegó responde 404', inexistente.status === 404);

  // 3c. El enlace corto del QR lleva al recibo: con la web instalada, al recibo de Toki; sin
  //     ella, a la transacción en el explorador.
  const recibo = await fetch(`${URL_SERVIDOR}/r/${c1.recibo}`, { redirect: 'manual' });
  const destino = recibo.headers.get('location') ?? '';
  comprobar('el enlace corto del QR lleva al recibo',
    recibo.status === 302 && (destino.endsWith(`/tx/${c1.hash}`) || destino.endsWith(`/recibo/${c1.recibo}`)), destino);
}

// 3d. Pago con QR: el terminal deja el pedido, el cliente abre la página y paga con código y PIN.
{
  const terminal = { 'x-terminal-token': process.env.TERMINAL_TOKEN ?? '' };
  const id = `p-${Date.now()}-qr`;
  const [ePedido] = await post('/pedidos', { id, monto: '0.40', concepto: 'Cafe' }, terminal);
  const pagina = await fetch(`${URL_SERVIDOR}/p/${id}`);
  const html = await pagina.text();
  comprobar('el pedido abre una página de pago con el monto', ePedido === 200 && pagina.status === 200 && html.includes('0.40') && html.includes('Cafe'));

  const antes = await saldo(COMERCIO);
  const pinMalo = acceso.pin === '0000' ? '1111' : '0000';
  const [eMalo, cMalo] = await post(`/p/${id}/pagar`, { codigo: acceso.codigo, pin: pinMalo });
  comprobar('un PIN incorrecto no paga', eMalo === 401 && !cMalo.hash, cMalo.motivo);

  const [ePago, cPago] = await post(`/p/${id}/pagar`, acceso);
  const despues = await saldo(COMERCIO);
  comprobar('pagar con el QR cobra de la cuenta de la tarjeta', ePago === 200 && cPago.ok && despues - antes === aUnidades('0.40'),
    `${cPago.hash ?? cPago.motivo} · comercio +${deUnidades(despues - antes)}`);

  // El terminal, que pregunta cada dos segundos, se entera de que ya está pagado.
  const consulta = await fetch(`${URL_SERVIDOR}/cobros/${id}`, { headers: terminal });
  const hecho = await consulta.json();
  comprobar('el terminal se entera del pago con QR', consulta.status === 200 && hecho.ok && hecho.hash === cPago.hash && Boolean(hecho.recibo));

  // La tarjeta acercada después al mismo cobro no paga otra vez: el terminal recibe el mismo resultado.
  const [eTarjeta, cTarjeta] = await cobro({ id, uid: desconocida, monto: '0.40' });
  const final = await saldo(COMERCIO);
  comprobar('el mismo pedido no se cobra dos veces (QR y luego tarjeta)', eTarjeta === 200 && cTarjeta.hash === cPago.hash && final === despues);

  const yaPagada = await fetch(`${URL_SERVIDOR}/p/${id}`);
  const [eCancelarPagado] = await post(`/pedidos/${id}/cancelar`, {}, terminal);
  comprobar('la página de un cobro ya pagado no deja pagar de nuevo', yaPagada.status === 410 && eCancelarPagado === 409);

  // Un pedido cancelado por el terminal ya no se puede pagar.
  const id2 = `p-${Date.now()}-cancelado`;
  await post('/pedidos', { id: id2, monto: '0.30' }, terminal);
  const [eCancelar] = await post(`/pedidos/${id2}/cancelar`, {}, terminal);
  const [eTarde, cTarde] = await post(`/p/${id2}/pagar`, acceso);
  comprobar('un pedido cancelado no se puede pagar', eCancelar === 200 && eTarde === 410 && !cTarde.hash, cTarde.motivo);

  // Sin la clave del terminal nadie deja pedidos.
  const [eSinClave] = await post('/pedidos', { id: `p-${Date.now()}-x`, monto: '1' }, { 'x-terminal-token': 'otra' });
  comprobar('solo el terminal deja pedidos', !process.env.TERMINAL_TOKEN || eSinClave === 401);
}

// 4. El límite diario frena el cobro antes de llegar a la red.
{
  const [estado, cuerpo] = await cobro({ id: `p-${Date.now()}-c`, uid: desconocida, monto: '99' });
  comprobar('límite diario rechaza montos altos', estado === 402 && !cuerpo.hash, cuerpo.motivo);
}

console.log(fallas ? `PRUEBAS FALLIDAS: ${fallas}` : 'TODAS LAS PRUEBAS OK');
process.exit(fallas ? 1 : 0);
