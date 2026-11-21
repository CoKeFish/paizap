// Pruebas de lo que usa la app (web y celular), contra Stellar testnet. Recorre lo que hace un
// dueño nuevo: abre sesión con su cuenta, la activa, firma el permiso de gasto, vincula una
// tarjeta y paga; después la bloquea y le pone límite. Al final mira el panel del comercio.
//   SERVIDOR_URL=http://localhost:8090 node src/pruebas-app.mjs
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { PASSPHRASE, aUnidades, deUnidades, permiso, saldo } from './stellar.mjs';

const URL_SERVIDOR = process.env.SERVIDOR_URL ?? 'http://localhost:8090';
const TERMINAL = { 'x-terminal-token': process.env.TERMINAL_TOKEN ?? '' };
let fallas = 0;

function comprobar(nombre, condicion, detalle = '') {
  console.log(`${condicion ? '✓' : '✗'} ${nombre}${detalle ? ` · ${detalle}` : ''}`);
  if (!condicion) fallas++;
}

async function pedir(metodo, ruta, { cuerpo, cabeceras = {} } = {}) {
  const r = await fetch(`${URL_SERVIDOR}${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...cabeceras },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return [r.status, await r.json()];
}

/** Abre sesión firmando el reto con la llave de la cuenta, como hace la app. */
async function abrirSesion(llave) {
  const [, { reto }] = await pedir('GET', `/api/sesion/reto?cuenta=${llave.publicKey()}`);
  const tx = TransactionBuilder.fromXDR(reto, PASSPHRASE);
  tx.sign(llave);
  const [estado, sesion] = await pedir('POST', '/api/sesion', { cuerpo: { reto: tx.toXDR() } });
  return { estado, ...sesion, cabeceras: { authorization: `Bearer ${sesion.token}` } };
}

const uidAzar = () => Array.from({ length: 7 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(':').toUpperCase();
const cobro = (uid, monto, concepto = '') =>
  pedir('POST', '/cobros', { cuerpo: { id: `a-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, uid, monto, concepto }, cabeceras: TERMINAL });

const [, info] = await pedir('GET', '/api/info');
comprobar('info del servidor', info.ok && info.toki?.startsWith('G') && info.moneda, `${info.red} · ${info.moneda}`);

// 1. Sesión: la firma de la cuenta abre la sesión; sin firma o con la firma de otro, no.
const dueno = Keypair.random();
const sesion = await abrirSesion(dueno);
comprobar('la cuenta abre sesión firmando el reto', sesion.estado === 200 && sesion.cuenta === dueno.publicKey() && sesion.rol === 'dueno');
{
  const [, { reto }] = await pedir('GET', `/api/sesion/reto?cuenta=${dueno.publicKey()}`);
  const [sinFirma] = await pedir('POST', '/api/sesion', { cuerpo: { reto } });
  const ajena = TransactionBuilder.fromXDR(reto, PASSPHRASE);
  ajena.sign(Keypair.random());
  const [firmaAjena] = await pedir('POST', '/api/sesion', { cuerpo: { reto: ajena.toXDR() } });
  const [sinSesion] = await pedir('GET', '/api/cuenta');
  comprobar('sin la firma de la cuenta no hay sesión', sinFirma === 401 && firmaAjena === 401 && sinSesion === 401);
}

// 2. Cuenta nueva: no existe en la red hasta la primera recarga de prueba.
{
  const [, antes] = await pedir('GET', '/api/cuenta', sesion);
  const [estado, recarga] = await pedir('POST', '/api/cuenta/recarga', sesion);
  const [, despues] = await pedir('GET', '/api/cuenta', sesion);
  comprobar('la primera recarga crea la cuenta en testnet', !antes.existe && estado === 200 && recarga.creada && despues.existe && Number(despues.saldo) > 0,
    `saldo ${despues.saldo}`);
}

// 3. Permiso de gasto: el servidor lo arma, la llave del dueño lo firma y la red lo registra.
{
  const [estado, preparado] = await pedir('POST', '/api/permiso/preparar', { ...sesion, cuerpo: { monto: '25', dias: 7 } });
  comprobar('el servidor arma el permiso de gasto', estado === 200 && preparado.xdr && preparado.gastador === info.toki);
  const saldoAntes = await saldo(dueno.publicKey(), info.toki);
  const tx = TransactionBuilder.fromXDR(preparado.xdr, PASSPHRASE);
  tx.sign(dueno);
  const [enviado, resultado] = await pedir('POST', '/api/permiso', { ...sesion, cuerpo: { xdr: tx.toXDR() } });
  const enLaRed = await permiso(dueno.publicKey(), info.toki);
  comprobar('el permiso firmado queda en la red', enviado === 200 && enLaRed === aUnidades('25'), resultado.hash ?? resultado.motivo);
  const saldoDespues = await saldo(dueno.publicKey(), info.toki);
  comprobar('Toki paga la comisión del permiso', saldoDespues === saldoAntes, `saldo del dueño ${deUnidades(saldoDespues)}`);
  const [, cuenta] = await pedir('GET', '/api/cuenta', sesion);
  comprobar('la app ve el permiso y su vencimiento', cuenta.permiso.restante === '25' && cuenta.permiso.firmado === '25' && Boolean(cuenta.permiso.vence?.fecha),
    `vence ${cuenta.permiso.vence?.fecha}`);

  // Otra cuenta no puede usar el servidor para mandar el permiso de esta.
  const intruso = await abrirSesion(Keypair.random());
  const [ajeno] = await pedir('POST', '/api/permiso', { ...intruso, cuerpo: { xdr: tx.toXDR() } });
  comprobar('el servidor no manda un permiso de otra cuenta', ajeno === 400);
}

// 4. Tarjeta nueva: el terminal la ve, la app la ofrece y el dueño la vincula.
const uid = uidAzar();
{
  const [rechazo] = await cobro(uid, '1');
  const [, nuevas] = await pedir('GET', '/api/tarjetas/nuevas', sesion);
  comprobar('la tarjeta sin dueño aparece para vincular', rechazo === 404 && nuevas.tarjetas.some((t) => t.uid === uid));
  const [estado, vinculada] = await pedir('POST', '/api/tarjetas', { ...sesion, cuerpo: { uid, nombre: 'Recreo' } });
  comprobar('el dueño vincula la tarjeta', estado === 200 && vinculada.tarjeta.uid === uid && vinculada.tarjeta.nombre === 'Recreo');
  const intruso = await abrirSesion(Keypair.random());
  const [robo] = await pedir('POST', '/api/tarjetas', { ...intruso, cuerpo: { uid } });
  const [cambioAjeno] = await pedir('PATCH', `/api/tarjetas/${uid}`, { ...intruso, cuerpo: { bloqueada: true } });
  comprobar('otra cuenta no puede quedarse con la tarjeta ni cambiarla', robo === 409 && cambioAjeno === 404);
}

// 5. Pago con la tarjeta: sale del permiso firmado en la app y aparece en los movimientos.
{
  const [estado, pago] = await cobro(uid, '1.50', 'Gaseosa');
  const restante = await permiso(dueno.publicKey(), info.toki);
  comprobar('la tarjeta paga con el permiso del dueño', estado === 200 && pago.ok && restante === aUnidades('23.5'), pago.hash ?? pago.motivo);
  const [, cuenta] = await pedir('GET', '/api/cuenta', sesion);
  const ultimo = cuenta.movimientos.find((m) => m.tipo === 'cobro');
  comprobar('el pago aparece en los movimientos del dueño', ultimo?.ok && ultimo.monto === '1.50' && ultimo.concepto === 'Gaseosa' && cuenta.tarjetas[0].gastadoHoy === '1.5');
  const [, recibo] = await pedir('GET', `/api/recibos/${pago.recibo}`);
  comprobar('el recibo tiene monto, producto y transacción', recibo.monto === '1.50' && recibo.concepto === 'Gaseosa' && recibo.hash === pago.hash);
}

// 6. Bloqueo y límite diario, decididos por el dueño.
{
  await pedir('PATCH', `/api/tarjetas/${uid}`, { ...sesion, cuerpo: { bloqueada: true } });
  const [bloqueado, motivo] = await cobro(uid, '1');
  await pedir('PATCH', `/api/tarjetas/${uid}`, { ...sesion, cuerpo: { bloqueada: false, limiteDiario: 2 } });
  const [sobreLimite, motivoLimite] = await cobro(uid, '1');
  const [dentro] = await cobro(uid, '0.50');
  comprobar('una tarjeta bloqueada no paga', bloqueado === 403, motivo.motivo);
  comprobar('el límite diario del dueño se respeta', sobreLimite === 402 && dentro === 200, motivoLimite.motivo);
}

// 7. Recarga de prueba con la cuenta ya creada: llega el monto fijo.
{
  await new Promise((listo) => setTimeout(listo, 15500)); // el servidor pide unos segundos entre recargas
  const antes = await saldo(dueno.publicKey(), info.toki);
  const [estado, recarga] = await pedir('POST', '/api/cuenta/recarga', sesion);
  const despues = await saldo(dueno.publicKey(), info.toki);
  comprobar('la recarga de prueba llega a la cuenta', estado === 200 && despues - antes === aUnidades(info.recargaPrueba), `+${deUnidades(despues - antes)}`);
}

// 8. Panel del comercio: solo lo ve la cuenta del comercio.
{
  const [ajeno] = await pedir('GET', '/api/panel', sesion);
  comprobar('el dueño de una tarjeta no ve las ventas del comercio', ajeno === 403);
  if (process.env.COMERCIO_SECRET) {
    const comercio = await abrirSesion(Keypair.fromSecret(process.env.COMERCIO_SECRET));
    const [estado, panel] = await pedir('GET', '/api/panel', comercio);
    const venta = panel.cobros?.find((c) => c.uid === uid && c.ok && c.concepto === 'Gaseosa');
    comprobar('el comercio ve la venta en su panel', comercio.rol === 'comercio' && estado === 200 && Boolean(venta) && Number(panel.hoy.total) >= 2,
      `hoy ${panel.hoy?.total} en ${panel.hoy?.aprobados} cobros`);
    comprobar('el panel separa las ventas por producto', panel.hoy.porConcepto.some((p) => p.concepto === 'Gaseosa'));
  } else {
    console.log('- sin COMERCIO_SECRET: no se prueba el panel del comercio');
  }
}

// 9. El dueño desvincula la tarjeta: deja de pagar.
{
  const [estado] = await pedir('DELETE', `/api/tarjetas/${uid}`, sesion);
  const [despues] = await cobro(uid, '0.10');
  comprobar('una tarjeta desvinculada deja de pagar', estado === 200 && despues === 404);
}

console.log(fallas ? `PRUEBAS FALLIDAS: ${fallas}` : 'TODAS LAS PRUEBAS OK');
process.exit(fallas ? 1 : 0);
