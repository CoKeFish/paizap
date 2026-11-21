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

// 2. Registrarla crea un cliente nuevo en testnet con su permiso de gasto.
{
  const [estado, cuerpo] = await post('/tarjetas', { uid: desconocida }, { 'x-admin-token': process.env.ADMIN_TOKEN ?? '' });
  comprobar('registrar tarjeta crea cliente con permiso', estado === 200 && cuerpo.nueva && cuerpo.cuenta?.startsWith('G'), cuerpo.cuenta);
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

  // 3c. El recibo corto redirige a la transacción en el explorador.
  const recibo = await fetch(`${URL_SERVIDOR}/r/${c1.recibo}`, { redirect: 'manual' });
  comprobar('el recibo redirige a la transacción en el explorador',
    recibo.status === 302 && recibo.headers.get('location')?.endsWith(`/tx/${c1.hash}`), recibo.headers.get('location'));
}

// 4. El límite diario frena el cobro antes de llegar a la red.
{
  const [estado, cuerpo] = await cobro({ id: `p-${Date.now()}-c`, uid: desconocida, monto: '99' });
  comprobar('límite diario rechaza montos altos', estado === 402 && !cuerpo.hash, cuerpo.motivo);
}

console.log(fallas ? `PRUEBAS FALLIDAS: ${fallas}` : 'TODAS LAS PRUEBAS OK');
process.exit(fallas ? 1 : 0);
