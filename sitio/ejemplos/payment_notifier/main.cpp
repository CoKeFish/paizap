// Example: an ESP32 that notices the payments it receives.
//
// It watches one account on the Stellar testnet and reports, on the serial monitor, every XLM
// payment that arrives, with its amount and its order number (memo). It is the base of a coin
// box, a dispenser or a till: when the expected payment arrives, the device does its thing.
//
// The board holds no key in this example: it only reads from the network.
//
// To use it: set your Wi-Fi network and the account to watch, flash the board and open the serial
// monitor. Then pay that account from any testnet wallet.
#include <Arduino.h>
#include <WiFi.h>
#include <mbedtls/sha256.h>

#include "stellar_mcu.h"
#include "stellar_rpc.h"

// ---------------------------------------------------------------- what you have to set
static const char WIFI_SSID[] = "your-network";
static const char WIFI_PASSWORD[] = "your-password";
// Account to watch: it has to exist on testnet. This one is a test account; replace it with yours.
static const char ACCOUNT[] = "GDJBOTBQNWREAVDUUS5XN7EJRRMUFLBNMFEJXSEHUHLYZDFEI2BL747I";

static const char NETWORK[] = "Test SDF Network ; September 2015";
static const uint32_t POLL_MS = 3000;  // how often the node is asked

// ---------------------------------------------------------------- what the board provides
// This example does not sign: of what the board provides, it only uses SHA-256.
static void board_sha256(const uint8_t *data, size_t n, uint8_t out[32]) { mbedtls_sha256_ret(data, n, out, 0); }
static const stl_crypto CRYPTO = {board_sha256, nullptr};

static uint8_t g_account[32];
static char g_contract[57];           // the token contract being watched, as C... text
static char g_topic_transfer[32];     // the event name, "transfer", the way the node expects it
static char g_topic_destination[72];  // the receiving account, the way the node expects it
static int64_t g_from_ledger = 0;     // payments are looked for from this ledger on
static char g_last_event[40] = "";    // the last event already reported, so none is counted twice

// What the device does when it gets paid: here it only says so; in a machine, it drives the relay.
static void on_payment(int64_t amount, bool has_order, uint64_t order) {
  char text[24];
  stl_amount_format(amount, text, sizeof text);
  if (has_order) Serial.printf("Payment received: %s XLM, order %llu\n", text, (unsigned long long)order);
  else Serial.printf("Payment received: %s XLM\n", text);
}

// A text field of one event, without running into the next event.
static const char *event_field(const char *event, const char *end, const char *key, size_t *n) {
  const char *p = stl_json_string(event, key, n);
  return p && (!end || p < end) ? p : nullptr;
}

// Asks the node for the "transfer" events towards the account since the watched ledger.
static void check_payments() {
  snprintf(stellar_rpc::params(), stellar_rpc::paramsCap(),
           "{\"startLedger\":%lld,\"filters\":[{\"type\":\"contract\",\"contractIds\":[\"%s\"],"
           "\"topics\":[[\"%s\",\"*\",\"%s\",\"**\"]]}],\"pagination\":{\"limit\":10}}",
           (long long)g_from_ledger, g_contract, g_topic_transfer, g_topic_destination);
  if (!stellar_rpc::call("getEvents", stellar_rpc::params())) return;

  // Each event starts with {"type": ; they are walked one by one.
  const char *event = strstr(stellar_rpc::body(), "{\"type\":");
  while (event) {
    const char *next = strstr(event + 8, "{\"type\":");

    size_t n = 0;
    const char *id = event_field(event, next, "id", &n);
    // Event ids grow over time: one that is not greater than the last was already reported.
    if (id && n < sizeof g_last_event && strncmp(id, g_last_event, n) > 0) {
      size_t len = 0;
      const char *value = event_field(event, next, "value", &len);
      uint8_t raw[160];
      int64_t amount = 0;
      bool has_order = false;
      uint64_t order = 0;
      int bytes = value ? stl_b64_decode(value, len, raw, sizeof raw) : -1;
      if (bytes > 0 && stl_event_amount(raw, (size_t)bytes, &amount, &has_order, &order)) {
        on_payment(amount, has_order, order);
      }
      memcpy(g_last_event, id, n);
      g_last_event[n] = 0;
    }
    event = next;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("\nStellar MCU SDK: payment notifier");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  if (!stl_addr_decode(ACCOUNT, STL_ADDR_ACCOUNT, g_account)) {
    Serial.println("ACCOUNT is not a valid account");
    return;
  }

  // The token contract is computed on the board, from the network and the asset. Filtering by
  // that address keeps a fake token with the same name out.
  uint8_t network_id[32], contract[32], buf[64];
  board_sha256((const uint8_t *)NETWORK, strlen(NETWORK), network_id);
  stl_asset xlm = {true, "", {0}};
  stl_asset_contract(&CRYPTO, network_id, &xlm, contract);
  stl_addr_encode(STL_ADDR_CONTRACT, contract, g_contract);

  // The two topics of the filter: the event name and the receiving account.
  size_t n = stl_scval_symbol(buf, sizeof buf, "transfer");
  stl_b64_encode(buf, n, g_topic_transfer, sizeof g_topic_transfer);
  n = stl_scval_account(buf, g_account);
  stl_b64_encode(buf, n, g_topic_destination, sizeof g_topic_destination);

  // Watch from the current ledger: earlier payments do not count.
  while (!stellar_rpc::call("getHealth", nullptr) || !stl_json_int(stellar_rpc::body(), "latestLedger", &g_from_ledger)) {
    delay(2000);
  }
  Serial.printf("Watching payments to %s from ledger %lld\n", ACCOUNT, (long long)g_from_ledger);
}

void loop() {
  if (g_from_ledger) check_payments();
  delay(POLL_MS);
}
