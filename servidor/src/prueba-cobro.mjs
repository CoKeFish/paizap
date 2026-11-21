// Prueba del cobro sin terminal: pide un cobro al servidor y comprueba en Stellar que el saldo
// del comercio subió exactamente ese monto.
//   SERVIDOR_URL=http://localhost:8080 node src/prueba-cobro.mjs 1.25
import { aUnidades, deUnidades, saldo } from './stellar.mjs';

const URL_SERVIDOR = process.env.SERVIDOR_URL ?? 'http://localhost:8080';
const UID = process.env.TARJETA_DEMO ?? '04:A1:B2:C3:D4:E5:F6';
const MONTO = process.argv[2] ?? '1.25';
const COMERCIO = process.env.COMERCIO_PUBLIC;

const antes = await saldo(COMERCIO);
const respuesta = await fetch(`${URL_SERVIDOR}/cobros`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-terminal-token': process.env.TERMINAL_TOKEN ?? '' },
  body: JSON.stringify({ uid: UID, monto: MONTO }),
});
const cuerpo = await respuesta.json();
console.log(respuesta.status, cuerpo);
const despues = await saldo(COMERCIO);
const diferencia = despues - antes;
console.log(`Comercio: ${deUnidades(antes)} -> ${deUnidades(despues)} (+${deUnidades(diferencia)})`);
if (!cuerpo.ok || diferencia !== aUnidades(MONTO)) {
  console.log('PRUEBA FALLIDA');
  process.exit(1);
}
console.log(`PRUEBA OK · https://stellar.expert/explorer/testnet/tx/${cuerpo.hash}`);
