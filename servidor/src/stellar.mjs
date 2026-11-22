// Acceso a Stellar: el contrato del token (SAC) con su permiso de gasto (approve / transfer_from).
import {
  Account,
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
const SEGUNDOS_POR_LEDGER = 5;

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

async function transaccion(fuente, operacion, segundos = 60) {
  const cuenta = await rpcServer.getAccount(fuente);
  return new TransactionBuilder(cuenta, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(operacion)
    .setTimeout(segundos)
    .build();
}

/** Manda una transacción ya firmada y espera a que la red la confirme; devuelve el hash. */
async function enviar(tx, nombre) {
  const enviada = await rpcServer.sendTransaction(tx);
  if (enviada.status === 'ERROR') throw new Error(`la red rechazó la transacción (${nombre})`);
  const resultado = await rpcServer.pollTransaction(enviada.hash, { attempts: 30 });
  if (resultado.status !== 'SUCCESS') throw new Error(`transacción ${nombre} terminó en ${resultado.status}`);
  return enviada.hash;
}

/** Invoca el contrato del token firmando con `firmante`; devuelve el hash. */
async function invocar(firmante, metodo, ...args) {
  const tx = await transaccion(firmante.publicKey(), token.call(metodo, ...args));
  const preparada = await rpcServer.prepareTransaction(tx);
  preparada.sign(firmante);
  return enviar(preparada, metodo);
}

/** Lee del contrato sin firmar ni pagar (simulación; la secuencia de la cuenta no importa). */
async function leer(fuente, metodo, ...args) {
  const tx = new TransactionBuilder(new Account(fuente, '0'), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(token.call(metodo, ...args))
    .setTimeout(60)
    .build();
  const sim = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return scValToNative(sim.result.retval);
}

export const saldo = (cuenta, fuente = cuenta) => leer(fuente, 'balance', direccion(cuenta));
export const permiso = (dueno, gastador, fuente = gastador) =>
  leer(fuente, 'allowance', direccion(dueno), direccion(gastador));

/** Código del token para mostrar ("USDC"); el contrato del XLM nativo responde "native". */
export async function simbolo(fuente) {
  const codigo = await leer(fuente, 'symbol');
  return codigo === 'native' ? 'XLM' : String(codigo);
}

/** El dueño autoriza a `gastador` a sacar hasta `monto` hasta el ledger `vence`. */
export const aprobar = (dueno, gastador, monto, vence) =>
  invocar(dueno, 'approve', direccion(dueno.publicKey()), direccion(gastador), i128(aUnidades(monto)), u32(vence));

/** Paizap mueve `monto` de la cuenta del cliente a la del comercio usando el permiso de gasto. */
export const cobrar = (toki, cliente, comercio, monto) =>
  invocar(toki, 'transfer_from', direccion(toki.publicKey()), direccion(cliente), direccion(comercio), i128(aUnidades(monto)));

/** Envío directo del token desde la cuenta de `desde` (la recarga de prueba en testnet). */
export const transferir = (desde, hacia, monto) =>
  invocar(desde, 'transfer', direccion(desde.publicKey()), direccion(hacia), i128(aUnidades(monto)));

export async function ledgerActual() {
  return (await rpcServer.getLatestLedger()).sequence;
}

/** Ledger en el que vence un permiso que dura `dias` a partir de ahora. */
export async function ledgerEnDias(dias) {
  return (await ledgerActual()) + Math.round((dias * 86400) / SEGUNDOS_POR_LEDGER);
}

export async function cuentaExiste(cuenta) {
  try {
    await rpcServer.getAccount(cuenta);
    return true;
  } catch {
    return false;
  }
}

export async function fondearTestnet(cuenta) {
  const respuesta = await fetch(`https://friendbot.stellar.org/?addr=${cuenta}`);
  if (!respuesta.ok && respuesta.status !== 400) throw new Error(`friendbot respondió ${respuesta.status}`);
}

// ---- Permiso de gasto firmado por el dueño desde la app ----
// La llave del dueño nunca llega al servidor. El servidor arma el `approve`, la app comprueba qué
// dice, lo firma en el celular y lo devuelve; el servidor solo lo manda a la red.

/** Arma el `approve` del dueño, listo para firmar. Devuelve la transacción en XDR, sin firma. */
export async function prepararAprobacion(dueno, gastador, monto, vence) {
  const operacion = token.call('approve', direccion(dueno), direccion(gastador), i128(aUnidades(monto)), u32(vence));
  const preparada = await rpcServer.prepareTransaction(await transaccion(dueno, operacion, 300));
  return preparada.toXDR();
}

/**
 * Lee una transacción firmada por el dueño. Si es exactamente un `approve` de este token, devuelve
 * { tx, dueno, gastador, monto, vence }; si es cualquier otra cosa, null (y no se manda).
 */
export function leerAprobacion(xdrFirmado) {
  const tx = TransactionBuilder.fromXDR(xdrFirmado, PASSPHRASE);
  if (tx.innerTransaction || tx.operations.length !== 1) return null;
  const [operacion] = tx.operations;
  if (operacion.type !== 'invokeHostFunction' || operacion.func.type !== 'hostFunctionTypeInvokeContract') return null;
  const llamada = operacion.func.invokeContract;
  if (Address.fromScAddress(llamada.contractAddress).toString() !== TOKEN) return null;
  if (llamada.functionName.toString() !== 'approve' || llamada.args.length !== 4) return null;
  const [dueno, gastador, monto, vence] = llamada.args.map((valor) => scValToNative(valor));
  if (tx.source !== dueno) return null;
  return { tx, dueno, gastador, monto: deUnidades(monto), vence: Number(vence) };
}

/**
 * Manda a la red una transacción ya firmada por su dueño. Con `patrocinador`, Paizap paga la
 * comisión (fee bump): el dueño no necesita XLM para firmar su permiso.
 */
export async function enviarFirmada(tx, patrocinador) {
  if (!patrocinador) return enviar(tx, 'approve');
  const conComision = TransactionBuilder.buildFeeBumpTransaction(patrocinador, tx.fee, tx, PASSPHRASE);
  conComision.sign(patrocinador);
  return enviar(conComision, 'approve');
}

/**
 * Cuándo vence el permiso de gasto. El contrato del token lo guarda junto al monto en una entrada
 * temporal del ledger. Devuelve { ledger, fecha } o null si no hay permiso vigente.
 */
export async function vencimientoPermiso(dueno, gastador) {
  // La clave de la entrada: Allowance { from, spender }.
  const clave = nativeToScVal([
    nativeToScVal('Allowance', { type: 'symbol' }),
    nativeToScVal(
      { from: new Address(dueno), spender: new Address(gastador) },
      { type: { from: ['symbol', 'address'], spender: ['symbol', 'address'] } },
    ),
  ]);
  let entrada;
  try {
    entrada = await rpcServer.getContractData(TOKEN, clave, rpc.Durability.Temporary);
  } catch {
    return null; // nunca hubo permiso, o ya venció y la red borró la entrada
  }
  const ledger = Number(scValToNative(entrada.val.contractData.val).live_until_ledger);
  const actual = await ledgerActual();
  if (!ledger || ledger < actual) return null;
  return { ledger, fecha: new Date(Date.now() + (ledger - actual) * SEGUNDOS_POR_LEDGER * 1000).toISOString() };
}

export { Keypair };
