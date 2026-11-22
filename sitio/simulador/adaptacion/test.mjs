// Test of the JavaScript board in Node: it creates a key, asks for test funds, pays on testnet with
// the C core (WebAssembly) and checks the payment in the network's events.
//   node test.mjs [destination account]
import { createDevice } from './device.mjs';

// Test account that only receives.
const DESTINATION = process.argv[2] ?? 'GDJBOTBQNWREAVDUUS5XN7EJRRMUFLBNMFEJXSEHUHLYZDFEI2BL747I';

const device = await createDevice({ onEvent: (step, data) => console.log(' ·', step, JSON.stringify(data)) });
console.log('Device account:', device.account);

const funds = await device.requestTestFunds();
console.log('Balance:', funds.balance, 'XLM');
console.log('Payment request (SEP-7):', device.paymentRequest('2.5', 4242));

const payment = await device.pay({ destination: DESTINATION, amount: '1', order: 4242 });
console.log('Payment confirmed:', payment.link);
console.log(`Signing took ${payment.signMs.toFixed(2)} ms; end to end, ${payment.totalMs} ms`);

const seen = await device.findPayment({ destination: DESTINATION, fromLedger: payment.fromLedger, hash: payment.hash });
if (!seen) {
  console.log('The payment was confirmed, but it did not show up in this node\'s events.');
  process.exit(1);
}
console.log(`Payment seen on the network: ${seen.amount} XLM, order ${seen.order}`);
