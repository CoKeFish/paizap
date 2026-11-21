// Acceso a Stellar: el contrato del token (SAC) con su permiso de gasto (approve / transfer_from).
import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk';

export const RED = process.env.STELLAR_RED ?? 'testnet';
export const PASSPHRASE = RED === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
export const rpcServer = new rpc.Server(process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org');

// Token con el que se cobra. Por defecto el XLM nativo de testnet (su contrato SAC); para cobrar
// en USDC basta con poner aquí el contrato SAC de USDC.
export const TOKEN = process.env.TOKEN_CONTRACT || Asset.native().contractId(PASSPHRASE);
const token = new Contract(TOKEN);
const DECIMALES = 7n;
const ESCALA = 10n ** DECIMALES;

/** "12.50" -> 125000000n (unidades mínimas del token). */
export function aUnidades(monto) {
  const texto = String(monto).trim();
  if (!/^\d+(\.\d{1,7})?$/.test(texto)) throw new Error(`monto inválido: ${monto}`);
  const [entero, decimales = ''] = texto.split('.');
  return BigInt(entero) * ESCALA + BigInt(decimales.padEnd(Number(DECIMALES), '0'));
}

/** 125000000n -> "12.5" */
export function deUnidades(unidades) {
  const n = BigInt(unidades);
  const resto = (n % ESCALA).toString().padStart(Number(DECIMALES), '0').replace(/0+$/, '');
  return resto ? `${n / ESCALA}.${resto}` : `${n / ESCALA}`;
}

const direccion = (cuenta) => new Address(cuenta).toScVal();
const i128 = (valor) => nativeToScVal(valor, { type: 'i128' });
const u32 = (valor) => nativeToScVal(valor, { type: 'u32' });

async function transaccion(fuente, operacion) {
  const cuenta = await rpcServer.getAccount(fuente);
  return new TransactionBuilder(cuenta, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(operacion)
    .setTimeout(60)
    .build();
}

/** Invoca el contrato del token firmando con `firmante`; devuelve el hash. */
async function invocar(firmante, metodo, ...args) {
  const tx = await transaccion(firmante.publicKey(), token.call(metodo, ...args));
  const preparada = await rpcServer.prepareTransaction(tx);
  preparada.sign(firmante);
  const enviada = await rpcServer.sendTransaction(preparada);
  if (enviada.status === 'ERROR') throw new Error(`la red rechazó la transacción (${metodo})`);
  const resultado = await rpcServer.pollTransaction(enviada.hash, { attempts: 30 });
  if (resultado.status !== 'SUCCESS') throw new Error(`transacción ${metodo} terminó en ${resultado.status}`);
  return enviada.hash;
}

/** Lee del contrato sin firmar ni pagar (simulación). */
async function leer(fuente, metodo, ...args) {
  const sim = await rpcServer.simulateTransaction(await transaccion(fuente, token.call(metodo, ...args)));
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return scValToNative(sim.result.retval);
}

export const saldo = (cuenta, fuente = cuenta) => leer(fuente, 'balance', direccion(cuenta));
export const permiso = (dueno, gastador, fuente = gastador) =>
  leer(fuente, 'allowance', direccion(dueno), direccion(gastador));

/** El dueño autoriza a `gastador` a sacar hasta `monto` hasta el ledger `vence`. */
export const aprobar = (dueno, gastador, monto, vence) =>
  invocar(dueno, 'approve', direccion(dueno.publicKey()), direccion(gastador), i128(aUnidades(monto)), u32(vence));

/** Toki mueve `monto` de la cuenta del cliente a la del comercio usando el permiso de gasto. */
export const cobrar = (toki, cliente, comercio, monto) =>
  invocar(toki, 'transfer_from', direccion(toki.publicKey()), direccion(cliente), direccion(comercio), i128(aUnidades(monto)));

export async function ledgerActual() {
  return (await rpcServer.getLatestLedger()).sequence;
}

export async function fondearTestnet(cuenta) {
  const respuesta = await fetch(`https://friendbot.stellar.org/?addr=${cuenta}`);
  if (!respuesta.ok && respuesta.status !== 400) throw new Error(`friendbot respondió ${respuesta.status}`);
}

export { Keypair };
