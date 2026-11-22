// Crea en testnet las cuentas de la demo y el permiso de gasto del cliente.
// Imprime (stdout) un JSON con las variables para guardar en Doppler (proyecto paizap, config dev).
//
//   paizap    paga las comisiones y cobra con el permiso de gasto
//   comercio  recibe los pagos
//   cliente   dueño del saldo; firma una vez el permiso de gasto (en la app real, con Pollar)
import { Keypair, TOKEN, aprobar, deUnidades, fondearTestnet, ledgerActual, permiso, saldo } from './stellar.mjs';

const PERMISO = process.env.PERMISO_MONTO ?? '100';
const DIAS = Number(process.env.PERMISO_DIAS ?? 7);
const TARJETA_DEMO = process.env.TARJETA_DEMO ?? '04:A1:B2:C3:D4:E5:F6'; // la del simulador

const log = (...m) => console.error(...m);
const cargar = (variable) => (process.env[variable] ? Keypair.fromSecret(process.env[variable]) : Keypair.random());
const paizap = cargar('PAIZAP_SECRET');
const comercio = cargar('COMERCIO_SECRET');
const cliente = cargar('CLIENTE_SECRET');

log(`Token: ${TOKEN}`);
for (const [nombre, kp] of Object.entries({ paizap, comercio, cliente })) {
  await fondearTestnet(kp.publicKey());
  log(`${nombre.padEnd(9)} ${kp.publicKey()}`);
}

const vence = (await ledgerActual()) + Math.round((DIAS * 86400) / 5);
const hash = await aprobar(cliente, paizap.publicKey(), PERMISO, vence);
log(`Permiso de gasto: ${PERMISO} hasta el ledger ${vence} (~${DIAS} días). Tx ${hash}`);
log(`Saldo del cliente: ${deUnidades(await saldo(cliente.publicKey()))}`);
log(`Permiso vigente:   ${deUnidades(await permiso(cliente.publicKey(), paizap.publicKey()))}`);

console.log(JSON.stringify({
  PAIZAP_SECRET: paizap.secret(),
  COMERCIO_SECRET: comercio.secret(),
  COMERCIO_PUBLIC: comercio.publicKey(),
  CLIENTE_SECRET: cliente.secret(),
  TARJETAS: JSON.stringify({ [TARJETA_DEMO]: cliente.publicKey() }),
}));
