// Web adaptation for the Paizap simulator: the same C core that runs on the board, compiled to
// WebAssembly. Here the "board" is JavaScript: it provides the network (fetch to the RPC node) and
// the random numbers for the key. The core builds, signs and reads exactly as on a microcontroller.
//
// Every function returns text in a fixed buffer, so JavaScript can read it without allocating.
// An empty string means an error.
#include <emscripten/emscripten.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "monocypher-ed25519.h"
#include "monocypher.h"
#include "sha256.h"
#include "stellar_mcu.h"

static uint8_t g_seed[32], g_public[32], g_network_id[32], g_contract[32];
static uint8_t g_envelope[2048];
static char g_out[4096], g_hash_hex[65];

static void sign(const uint8_t seed[32], const uint8_t public_key[32], const uint8_t *message, size_t n,
                 uint8_t signature[64]) {
  uint8_t key[64];  // Monocypher stores the secret key as seed + public key
  memcpy(key, seed, 32);
  memcpy(key + 32, public_key, 32);
  crypto_ed25519_sign(signature, key, message, n);
  crypto_wipe(key, sizeof key);
}

static const stl_crypto CRYPTO = {stl_sha256, sign};

static const char *empty(void) {
  g_out[0] = 0;
  return g_out;
}

// Loads the device key (32 bytes provided by JavaScript) and the network it will sign for.
// Returns the device's G... account.
EMSCRIPTEN_KEEPALIVE const char *device_init(const uint8_t *seed, const char *network) {
  uint8_t copy[32], key[64];
  memcpy(g_seed, seed, 32);
  memcpy(copy, seed, 32);  // Monocypher wipes the seed it receives
  crypto_ed25519_key_pair(key, g_public, copy);
  crypto_wipe(key, sizeof key);
  stl_sha256((const uint8_t *)network, strlen(network), g_network_id);
  stl_asset xlm = {true, "", {0}};
  stl_asset_contract(&CRYPTO, g_network_id, &xlm, g_contract);
  if (!stl_addr_encode(STL_ADDR_ACCOUNT, g_public, g_out)) return empty();
  return g_out;
}

// Key to ask the node for an account's data (getLedgerEntries). No account: the device's own.
EMSCRIPTEN_KEEPALIVE const char *device_account_key(const char *account) {
  uint8_t data[32], key[40];
  if (account && account[0]) {
    if (!stl_addr_decode(account, STL_ADDR_ACCOUNT, data)) return empty();
  } else {
    memcpy(data, g_public, 32);
  }
  stl_account_key(key, data);
  if (!stl_b64_encode(key, 40, g_out, sizeof g_out)) return empty();
  return g_out;
}

// Reads the node's answer about an account. Returns "balance sequence": the balance as text with
// decimals and the sequence number as an integer.
EMSCRIPTEN_KEEPALIVE const char *device_read_account(const char *xdr_b64) {
  uint8_t entry[256];
  int64_t balance = 0, sequence = 0;
  char balance_text[32];
  int n = stl_b64_decode(xdr_b64, strlen(xdr_b64), entry, sizeof entry);
  if (n <= 0 || !stl_account_parse(entry, (size_t)n, &balance, &sequence)) return empty();
  stl_amount_format(balance, balance_text, sizeof balance_text);
  snprintf(g_out, sizeof g_out, "%s %lld", balance_text, (long long)sequence);
  return g_out;
}

// Builds and signs an XLM payment. `sequence` is the account's current one (the core uses the next).
// Returns the envelope in base64, ready for sendTransaction; the id is left in device_hash().
EMSCRIPTEN_KEEPALIVE const char *device_pay(const char *destination, const char *amount, const char *sequence,
                                            double valid_until, int has_memo, double memo) {
  uint8_t to[32], hash[32];
  int64_t units = 0;
  if (!stl_addr_decode(destination, STL_ADDR_ACCOUNT, to)) return empty();
  if (!stl_amount_parse(amount, &units) || units <= 0) return empty();

  stl_tx t;
  memset(&t, 0, sizeof t);
  memcpy(t.source, g_public, 32);
  t.fee = 100;
  t.sequence = strtoll(sequence, NULL, 10) + 1;
  t.valid_until = (uint64_t)valid_until;
  t.has_memo = has_memo != 0;
  t.memo = (uint64_t)memo;

  stl_xdr x;
  stl_tx_begin(&x, g_envelope, sizeof g_envelope, g_network_id);
  stl_tx_payment(&x, &t, to, NULL, units);
  stl_tx_sign(&x, &CRYPTO, g_seed, g_public, hash);
  if (x.overflow || !stl_b64_encode(stl_tx_envelope(&x), stl_tx_envelope_len(&x), g_out, sizeof g_out)) return empty();
  for (int i = 0; i < 32; i++) sprintf(g_hash_hex + 2 * i, "%02x", hash[i]);
  return g_out;
}

EMSCRIPTEN_KEEPALIVE const char *device_hash(void) { return g_hash_hex; }

// What is needed to ask the node for the payments that reached an account (getEvents):
// "contract transfer_topic destination_topic". No account: the device's own.
EMSCRIPTEN_KEEPALIVE const char *device_payment_filter(const char *destination) {
  uint8_t to[32], buf[64];
  char contract[57], transfer_topic[32], destination_topic[72];
  if (destination && destination[0]) {
    if (!stl_addr_decode(destination, STL_ADDR_ACCOUNT, to)) return empty();
  } else {
    memcpy(to, g_public, 32);
  }
  stl_addr_encode(STL_ADDR_CONTRACT, g_contract, contract);
  size_t n = stl_scval_symbol(buf, sizeof buf, "transfer");
  stl_b64_encode(buf, n, transfer_topic, sizeof transfer_topic);
  n = stl_scval_account(buf, to);
  stl_b64_encode(buf, n, destination_topic, sizeof destination_topic);
  snprintf(g_out, sizeof g_out, "%s %s %s", contract, transfer_topic, destination_topic);
  return g_out;
}

// Reads the value of a payment event. Returns "amount order"; the order is "-" when there is none.
EMSCRIPTEN_KEEPALIVE const char *device_read_payment(const char *value_b64) {
  uint8_t raw[200];
  int64_t amount = 0;
  bool has_memo = false;
  uint64_t memo = 0;
  char amount_text[32];
  int n = stl_b64_decode(value_b64, strlen(value_b64), raw, sizeof raw);
  if (n <= 0 || !stl_event_amount(raw, (size_t)n, &amount, &has_memo, &memo)) return empty();
  stl_amount_format(amount, amount_text, sizeof amount_text);
  if (has_memo) snprintf(g_out, sizeof g_out, "%s %llu", amount_text, (unsigned long long)memo);
  else snprintf(g_out, sizeof g_out, "%s -", amount_text);
  return g_out;
}

// Payment request (SEP-7) towards the device's account, to show it as a QR code.
EMSCRIPTEN_KEEPALIVE const char *device_payment_request(const char *amount, int has_memo, double memo) {
  int64_t units = 0;
  if (!stl_amount_parse(amount, &units) || units <= 0) return empty();
  if (!stl_sep7_pay(g_out, sizeof g_out, g_public, units, NULL, has_memo != 0, (uint64_t)memo)) return empty();
  return g_out;
}
