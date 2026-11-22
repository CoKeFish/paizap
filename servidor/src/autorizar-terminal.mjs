// Autoriza a un terminal a cobrar con su propia llave (cobro firmado por el terminal, con el SDK).
//
// Deja la llave del terminal como firmante de la cuenta de Paizap, que es la que tiene los permisos
// de gasto de los clientes. Así el terminal puede hacer el `transfer_from` en nombre de esa cuenta,
// sin que los clientes tengan que aprobar nada nuevo. Los pesos quedan así:
//   llave de Paizap    peso 2: sigue pudiendo todo, también cambiar firmantes;
//   llave del terminal peso 1: alcanza los umbrales bajo y medio (1), no el alto (2).
// Ojo con lo que eso permite: la firma del terminal sola vale para cualquier pago o llamada a un
// contrato en nombre de la cuenta de Paizap, no solo para el cobro que arma el firmware. Puede usar
// el permiso de gasto de cualquier cliente hacia cualquier destino y mover el saldo de la cuenta.
// Lo que no puede es cambiar firmantes ni umbrales. El comercio fijo y el límite diario los
// revisan el firmware y el servidor, no la red: quien saque la llave del terminal se los salta.
// Sirve para un prototipo con un terminal a la vista; si un terminal se pierde, se le quita la
// firma con «quitar».
// En testnet, además le da fondos a la cuenta del terminal, que paga la comisión de sus cobros.
//
//   node src/autorizar-terminal.mjs <cuenta G del terminal>          autoriza
//   node src/autorizar-terminal.mjs <cuenta G del terminal> quitar   le quita la firma
//
// La cuenta del terminal la dice el propio terminal al arrancar y con la orden «c» del monitor
// serie. Necesita PAIZAP_SECRET (doppler run --project paizap --config dev -- ...).
import { BASE_FEE, Keypair, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { PASSPHRASE, RED, cuentaExiste, fondearTestnet, rpcServer } from './stellar.mjs';

const [terminal, orden] = process.argv.slice(2);
if (!terminal || !StrKey.isValidEd25519PublicKey(terminal) || (orden && orden !== 'quitar')) {
  console.error('Uso: node src/autorizar-terminal.mjs <cuenta G del terminal> [quitar]');
  process.exit(1);
}
if (!process.env.PAIZAP_SECRET) {
  console.error('Falta PAIZAP_SECRET. Corre con: doppler run --project paizap --config dev -- ...');
  process.exit(1);
}
const paizap = Keypair.fromSecret(process.env.PAIZAP_SECRET);
const quitar = orden === 'quitar';

if (!quitar && !(await cuentaExiste(terminal))) {
  if (RED === 'mainnet') {
    console.error('La cuenta del terminal no existe: hay que crearla y darle XLM para las comisiones.');
    process.exit(1);
  }
  await fondearTestnet(terminal);
  console.log(`Cuenta del terminal creada con fondos de prueba: ${terminal}`);
}

const opciones = quitar
  ? { signer: { ed25519PublicKey: terminal, weight: 0 } }
  : {
    masterWeight: 2, lowThreshold: 1, medThreshold: 1, highThreshold: 2,
    signer: { ed25519PublicKey: terminal, weight: 1 },
  };
const cuenta = await rpcServer.getAccount(paizap.publicKey());
const tx = new TransactionBuilder(cuenta, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
  .addOperation(Operation.setOptions(opciones))
  .setTimeout(60)
  .build();
tx.sign(paizap);
const enviada = await rpcServer.sendTransaction(tx);
if (enviada.status === 'ERROR') {
  console.error('La red rechazó el cambio de firmantes.');
  process.exit(1);
}
const resultado = await rpcServer.pollTransaction(enviada.hash, { attempts: 30 });
if (resultado.status !== 'SUCCESS') {
  console.error(`El cambio de firmantes terminó en ${resultado.status}.`);
  process.exit(1);
}
console.log(quitar
  ? `El terminal ${terminal} ya no puede cobrar en nombre de ${paizap.publicKey()}.`
  : `El terminal ${terminal} ya puede cobrar en nombre de ${paizap.publicKey()}.`);
console.log(`Transacción: ${enviada.hash}`);
