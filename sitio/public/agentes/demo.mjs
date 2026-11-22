// El terminal simulado de Paizap, sin navegador: el mismo cobro de la página, en Node 18 o más
// nuevo. Baja este archivo junto a device.mjs y stellar_mcu.mjs y ejecútalo:
//
//   node demo.mjs [monto en XLM]
//
// Qué hace, en Stellar testnet y con cuentas que crea al vuelo (no usa fondos de nadie más):
//   1. Crea la llave del aparato y la de una tarjeta de prueba, y les pide fondos a friendbot.
//   2. El aparato arma un pedido de pago con un número de pedido.
//   3. La tarjeta de prueba paga ese pedido.
//   4. El aparato busca el pago en los eventos de la red y lo comprueba él mismo.
//   5. El aparato devuelve el pago: arma la transacción, la firma y la envía.
//
// Las transacciones las arma y firma el núcleo de Stellar MCU SDK, compilado para correr aquí.
// Es un simulador: el aparato real es una placa con lector de tarjetas. Cada paso sale en una
// línea de texto y la última línea es un resumen en JSON.
import { createDevice } from './device.mjs';

const monto = process.argv[2] ?? '1.5';
if (!/^\d{1,3}(\.\d{1,7})?$/.test(monto) || !(Number(monto) > 0) || Number(monto) > 100) {
  console.error('El monto va de 0.01 a 100, con punto decimal. Ejemplo: node demo.mjs 2.5');
  process.exit(2);
}
const pedido = 1000 + Math.floor(Math.random() * 9000);
const decir = (texto) => console.log(texto);

try {
  const [aparato, tarjeta] = await Promise.all([createDevice(), createDevice()]);
  decir(`Aparato: cuenta ${aparato.account}`);
  decir(`Tarjeta de prueba: cuenta ${tarjeta.account}`);
  await Promise.all([aparato.requestTestFunds(), tarjeta.requestTestFunds()]);
  decir('Las dos cuentas tienen fondos de prueba.');

  const red = await aparato.networkState();
  const solicitud = aparato.paymentRequest(monto, pedido);
  decir(`El aparato cobra ${monto} XLM, pedido ${pedido}. Pedido de pago: ${solicitud}`);

  const pago = await tarjeta.pay({ destination: aparato.account, amount: monto, order: pedido });
  decir(`La tarjeta pagó. Firmado en ${pago.signMs.toFixed(2)} ms, confirmado en ${(pago.totalMs / 1000).toFixed(1)} s: ${pago.link}`);

  // El aparato no conoce la transacción: busca, desde que armó el pedido, un pago con ese número.
  // Los pagos de otro pedido (o la carga inicial de la cuenta) se dejan atrás.
  let visto = null;
  for (let desde = red.ledger, intento = 0; intento < 10 && !visto; intento++) {
    const pagoVisto = await aparato.findPayment({ fromLedger: desde, attempts: 3 });
    if (pagoVisto && pagoVisto.order === pedido && Number(pagoVisto.amount) >= Number(monto)) visto = pagoVisto;
    else if (pagoVisto) desde = pagoVisto.ledger + 1;
  }
  if (!visto) throw new Error('el aparato no encontró el pago en los eventos de la red');
  decir(`El aparato vio el pago en la red: ${visto.amount} XLM, pedido ${visto.order}. Cobro aprobado.`);

  const devolucion = await aparato.pay({ destination: tarjeta.account, amount: monto, order: pedido });
  decir(`El aparato devolvió el pago. Firmado en ${devolucion.signMs.toFixed(2)} ms, confirmado en ${(devolucion.totalMs / 1000).toFixed(1)} s: ${devolucion.link}`);

  decir(JSON.stringify({
    ok: true,
    red: 'Stellar testnet',
    simulador: true,
    cuentaAparato: aparato.account,
    cuentaTarjeta: tarjeta.account,
    monto,
    pedido,
    solicitud,
    pago: { hash: pago.hash, enlace: pago.link, firmaMs: pago.signMs, totalMs: pago.totalMs },
    vistoPorElAparato: visto,
    devolucion: { hash: devolucion.hash, enlace: devolucion.link, firmaMs: devolucion.signMs, totalMs: devolucion.totalMs },
  }));
} catch (error) {
  decir(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
}
