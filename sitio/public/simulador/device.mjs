// The "board" in JavaScript, for the browser and for Node.
// It provides what a real board provides: the network (here, fetch to the RPC node) and the
// random numbers for the key. Everything else is done by the C core compiled to WebAssembly:
// addresses, building and signing the transaction, and reading the network's answer.
import createModule from './stellar_mcu.mjs';

export const TESTNET = 'Test SDF Network ; September 2015';
export const TESTNET_RPC = 'https://soroban-testnet.stellar.org';
const EXPLORER = 'https://stellar.expert/explorer/testnet/tx/';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export async function createDevice({ seed, network = TESTNET, rpcUrl = TESTNET_RPC, onEvent = () => {} } = {}) {
  const module = await createModule();
  const core = (name, types, values) => module.ccall(name, 'string', types, values);

  // The device key: 32 random bytes, created here. They never leave the device.
  seed ??= globalThis.crypto.getRandomValues(new Uint8Array(32));
  const account = core('device_init', ['array', 'string'], [seed, network]);
  if (!account) throw new Error('the core could not create the account');

  async function rpc(method, params) {
    const start = Date.now();
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }),
    });
    const body = await response.json();
    onEvent('rpc', { method, ms: Date.now() - start });
    if (body.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
    return body.result;
  }

  // Latest ledger and its close time: that time sets the validity window, with no clock on board.
  async function networkState() {
    const r = await rpc('getHealth');
    return { ledger: Number(r.latestLedger), closeTime: Number(r.latestLedgerCloseTime) };
  }

  // Balance and sequence number of an account, or null if it does not exist on the network yet.
  async function readAccount(other = '') {
    const key = core('device_account_key', ['string'], [other]);
    if (!key) throw new Error('invalid account');
    const r = await rpc('getLedgerEntries', { keys: [key] });
    const xdr = r.entries?.[0]?.xdr;
    if (!xdr) return null;
    const text = core('device_read_account', ['string'], [xdr]);
    if (!text) return null;
    const [balance, sequence] = text.split(' ');
    return { balance, sequence };
  }

  // Test funds for the device's account (testnet only).
  async function requestTestFunds() {
    const r = await fetch('https://friendbot.stellar.org/?addr=' + account);
    if (!r.ok && r.status !== 400) throw new Error('friendbot answered ' + r.status);
    for (let i = 0; i < 20; i++) {
      const state = await readAccount();
      if (state) return state;
      await sleep(1500);
    }
    throw new Error('the account did not show up on the network');
  }

  // Builds, signs and sends an XLM payment, and waits for the network to confirm it.
  async function pay({ destination, amount, order = null, validFor = 120 }) {
    const start = Date.now();
    const own = await readAccount();
    if (!own) throw new Error('the device account has no funds');
    const { ledger, closeTime } = await networkState();

    const before = performance.now();
    const envelope = core('device_pay', ['string', 'string', 'string', 'number', 'number', 'number'],
      [destination, String(amount), own.sequence, closeTime + validFor, order === null ? 0 : 1, order ?? 0]);
    if (!envelope) throw new Error('the core could not build the payment (check the destination and the amount)');
    const signMs = performance.now() - before;
    const hash = core('device_hash', [], []);
    onEvent('signed', { hash, signMs, bytes: Math.floor((envelope.length * 3) / 4) });

    const sent = await rpc('sendTransaction', { transaction: envelope });
    if (sent.status !== 'PENDING' && sent.status !== 'DUPLICATE') {
      throw new Error('the network did not accept the transaction: ' + (sent.status ?? '') + ' ' + (sent.errorResultXdr ?? ''));
    }
    onEvent('sent', { hash });
    for (let query = 0; query < 30; query++) {
      await sleep(1000);
      const r = await rpc('getTransaction', { hash });
      if (r.status === 'SUCCESS') {
        const result = { hash, link: EXPLORER + hash, ledger: Number(r.ledger), fromLedger: ledger, signMs, totalMs: Date.now() - start };
        onEvent('confirmed', result);
        return result;
      }
      if (r.status === 'FAILED') throw new Error('the network rejected the payment');
    }
    throw new Error('the network did not confirm the payment in time');
  }

  // Looks in the network's events for the payment towards `destination` (none: towards the device).
  // With `hash` it returns that payment; without it, the first one found from that ledger on.
  async function findPayment({ destination = '', fromLedger, hash = null, attempts = 12 }) {
    const filter = core('device_payment_filter', ['string'], [destination]);
    if (!filter) throw new Error('invalid account');
    const [contract, transferTopic, destinationTopic] = filter.split(' ');
    for (let i = 0; i < attempts; i++) {
      const r = await rpc('getEvents', {
        startLedger: fromLedger,
        filters: [{ type: 'contract', contractIds: [contract], topics: [[transferTopic, '*', destinationTopic, '**']] }],
        pagination: { limit: 10 },
      });
      for (const event of r.events ?? []) {
        if (hash && event.txHash !== hash) continue;
        const text = core('device_read_payment', ['string'], [event.value]);
        if (!text) continue;
        const [amount, order] = text.split(' ');
        const payment = { amount, order: order === '-' ? null : Number(order), hash: event.txHash, ledger: Number(event.ledger) };
        onEvent('payment_seen', payment);
        return payment;
      }
      await sleep(1500);
    }
    return null;
  }

  // Payment request (SEP-7) towards the device, to show it as a QR code.
  const paymentRequest = (amount, order = null) =>
    core('device_payment_request', ['string', 'number', 'number'], [String(amount), order === null ? 0 : 1, order ?? 0]);

  return { account, networkState, readAccount, requestTestFunds, pay, findPayment, paymentRequest };
}
