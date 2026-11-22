#include "firma.h"

#include <Preferences.h>
#include <mbedtls/sha256.h>

#include "config.h"
#include "monocypher-ed25519.h"
#include "monocypher.h"
#include "sdk/stellar_mcu.h"
#include "sdk/stellar_rpc.h"

namespace {

const uint32_t VIGENCIA_S = 90;  // la transacción entra a la red en este plazo o no entra nunca

uint8_t semilla[32], publica[32], idRed[32], contratoToken[32];
char cuentaTexto[57] = "", contratoTexto[57] = "";
bool lista = false;
uint8_t sobre[2048], recursos[1024];
char b64[2800];

void sha256(const uint8_t *datos, size_t n, uint8_t salida[32]) { mbedtls_sha256_ret(datos, n, salida, 0); }

void firmarEd25519(const uint8_t s[32], const uint8_t p[32], const uint8_t *mensaje, size_t n, uint8_t firma[64]) {
  uint8_t llave[64];  // Monocypher guarda la llave secreta como semilla + llave pública
  memcpy(llave, s, 32);
  memcpy(llave + 32, p, 32);
  crypto_ed25519_sign(firma, llave, mensaje, n);
  crypto_wipe(llave, sizeof llave);
}

const stl_crypto CRIPTO = {sha256, firmarEd25519};

// La hora de cierre del último ledger: con ella se pone la vigencia, sin reloj propio.
bool horaDeLaRed(int64_t *cierre) {
  return stellar_rpc::call("getHealth", nullptr) && stl_json_int(stellar_rpc::body(), "latestLedgerCloseTime", cierre);
}

// Secuencia de la cuenta del terminal. `existe` queda en false si la cuenta no está en la red.
bool leerSecuencia(int64_t *secuencia, bool *existe) {
  uint8_t clave[40], entrada[200];
  char claveB64[64];
  stl_account_key(clave, publica);
  stl_b64_encode(clave, 40, claveB64, sizeof claveB64);
  snprintf(stellar_rpc::params(), stellar_rpc::paramsCap(), "{\"keys\":[\"%s\"]}", claveB64);
  *existe = true;
  if (!stellar_rpc::call("getLedgerEntries", stellar_rpc::params())) return false;
  size_t n = 0;
  const char *xdr = stl_json_string(stellar_rpc::body(), "xdr", &n);
  int64_t saldo = 0;
  int bytes = xdr ? stl_b64_decode(xdr, n, entrada, sizeof entrada) : -1;
  if (bytes <= 0 || !stl_account_parse(entrada, (size_t)bytes, &saldo, secuencia)) {
    *existe = false;
    return false;
  }
  return true;
}

enum class Tx { Confirmada, Fallida, NoEsta, SinRespuesta };

Tx estadoTx(const char *hashHex) {
  snprintf(stellar_rpc::params(), stellar_rpc::paramsCap(), "{\"hash\":\"%s\"}", hashHex);
  if (!stellar_rpc::call("getTransaction", stellar_rpc::params())) return Tx::SinRespuesta;
  size_t n = 0;
  const char *estado = stl_json_string(stellar_rpc::body(), "status", &n);
  if (!estado) return Tx::SinRespuesta;
  if (!strncmp(estado, "SUCCESS", 7)) return Tx::Confirmada;
  if (!strncmp(estado, "FAILED", 6)) return Tx::Fallida;
  return Tx::NoEsta;
}

bool sobreABase64(const stl_xdr &x) {
  return !x.overflow && stl_b64_encode(stl_tx_envelope(&x), stl_tx_envelope_len(&x), b64, sizeof b64) > 0;
}

}  // namespace

namespace firma {

bool iniciar() {
  lista = false;
  sha256((const uint8_t *)RED_STELLAR, strlen(RED_STELLAR), idRed);

  // El token con el que cobra el terminal: el configurado o, si no hay, el XLM de esa red.
  if (strlen(TOKEN_CONTRATO)) {
    if (!stl_addr_decode(TOKEN_CONTRATO, STL_ADDR_CONTRACT, contratoToken)) {
      Serial.println("ERROR: TOKI_TOKEN no es una direccion de contrato valida");
      return false;
    }
  } else {
    stl_asset xlm = {true, "", {0}};
    stl_asset_contract(&CRIPTO, idRed, &xlm, contratoToken);
  }
  stl_addr_encode(STL_ADDR_CONTRACT, contratoToken, contratoTexto);

  // La llave: la que vino al compilar o la guardada; si no hay ninguna, se crea aquí. La que se
  // crea aquí se pierde si se graba la placa con la imagen completa (borra lo guardado).
  if (strlen(TERMINAL_SEMILLA)) {
    if (!stl_addr_decode(TERMINAL_SEMILLA, STL_ADDR_SEED, semilla)) {
      Serial.println("ERROR: TOKI_TERMINAL_SECRET no es una llave valida");
      return false;
    }
  } else {
    Preferences guardado;
    guardado.begin("toki-llave", false);
    if (guardado.isKey("semilla") && guardado.getBytes("semilla", semilla, 32) == 32) {
      Serial.println("Llave del terminal: la guardada");
    } else {
      esp_fill_random(semilla, 32);  // con el Wi-Fi encendido el chip da aleatoriedad real
      guardado.putBytes("semilla", semilla, 32);
      Serial.println("Llave del terminal: creada ahora (hay que autorizarla, ver abajo)");
    }
    guardado.end();
  }
  uint8_t copia[32], llave[64];
  memcpy(copia, semilla, 32);  // Monocypher borra la semilla que recibe
  crypto_ed25519_key_pair(llave, publica, copia);
  crypto_wipe(llave, sizeof llave);
  stl_addr_encode(STL_ADDR_ACCOUNT, publica, cuentaTexto);
  lista = true;
  return true;
}

const char *cuenta() { return cuentaTexto; }

Cobro cobrar(const String &cliente, const String &comercio, const String &gastador, const String &tokenServidor,
             const String &monto) {
  Cobro c = {Estado::Rechazado, "", "", 0};
  auto rechazar = [&c](const char *motivo) {
    c.estado = Estado::Rechazado;
    c.motivo = motivo;
    return c;
  };
  if (!lista) return rechazar("terminal sin llave");

  uint8_t deCliente[32], aComercio[32], delGastador[32];
  int64_t unidades = 0;
  if (!stl_addr_decode(cliente.c_str(), STL_ADDR_ACCOUNT, deCliente) ||
      !stl_addr_decode(comercio.c_str(), STL_ADDR_ACCOUNT, aComercio) ||
      !stl_addr_decode(gastador.c_str(), STL_ADDR_ACCOUNT, delGastador)) {
    return rechazar("cuentas del cobro");
  }
  if (!stl_amount_parse(monto.c_str(), &unidades) || unidades <= 0) return rechazar("monto invalido");
  // El terminal cobra para su comercio y con su token: no acepta que el servidor le cambie ninguno.
  if (strlen(COMERCIO_CUENTA) && comercio != COMERCIO_CUENTA) return rechazar("comercio distinto");
  if (!tokenServidor.isEmpty() && tokenServidor != contratoTexto) return rechazar("token distinto");

  uint32_t inicio = millis();
  int64_t cierre = 0, secuencia = 0;
  bool existe = true;
  if (!horaDeLaRed(&cierre)) return rechazar("sin conexion al nodo");
  if (!leerSecuencia(&secuencia, &existe)) return rechazar(existe ? "sin conexion al nodo" : "terminal sin fondos");

  stl_token_call llamada = {contratoToken, "transfer_from", {delGastador, deCliente, aComercio}, 3, unidades};
  stl_tx t;
  memset(&t, 0, sizeof t);
  memcpy(t.source, publica, 32);  // el terminal paga la comisión con su propia cuenta
  t.fee = 100;
  t.sequence = secuencia + 1;
  t.valid_until = (uint64_t)cierre + VIGENCIA_S;
  t.has_op_source = memcmp(delGastador, publica, 32) != 0;  // cobra en nombre de quien tiene el permiso
  memcpy(t.op_source, delGastador, 32);
  c.vence = t.valid_until;

  // 1. Simular: el nodo dice si el cobro pasaría y cuántos recursos necesita.
  stl_xdr x;
  size_t n = 0;
  stl_tx_begin(&x, sobre, sizeof sobre, idRed);
  stl_tx_token_call(&x, &t, &llamada, NULL, 0);
  stl_tx_unsigned(&x);
  if (!sobreABase64(x)) return rechazar("error interno");
  snprintf(stellar_rpc::params(), stellar_rpc::paramsCap(), "{\"transaction\":\"%s\"}", b64);
  if (!stellar_rpc::call("simulateTransaction", stellar_rpc::params())) return rechazar("sin conexion al nodo");
  const char *respuesta = stellar_rpc::body();
  int64_t comisionRecursos = 0;
  const char *datos = stl_json_string(respuesta, "transactionData", &n);
  if (strstr(respuesta, "\"error\"") || !datos || !stl_json_int(respuesta, "minResourceFee", &comisionRecursos)) {
    // Sin permiso suficiente, permiso vencido o sin saldo: la red no deja pasar el cobro.
    Serial.printf("Simulacion rechazada: %.500s\n", respuesta);
    return rechazar("la red rechazo el cobro (saldo o permiso)");
  }
  if (stellar_rpc::truncated() || strstr(respuesta, "restorePreamble")) return rechazar("respuesta del nodo");
  int nRecursos = stl_b64_decode(datos, n, recursos, sizeof recursos);
  if (nRecursos <= 0) return rechazar("respuesta del nodo");
  if (comisionRecursos > COMISION_MAXIMA) return rechazar("comision sobre el tope");

  // 2. Armar con esos recursos, firmar y enviar. La autorización de la llamada la arma el
  //    terminal: no usa la que propone el nodo.
  uint8_t hash[32];
  char hashHex[65];
  t.fee = 100 + (uint32_t)comisionRecursos;
  stl_tx_begin(&x, sobre, sizeof sobre, idRed);
  stl_tx_token_call(&x, &t, &llamada, recursos, (size_t)nRecursos);
  stl_tx_sign(&x, &CRIPTO, semilla, publica, hash);
  if (!sobreABase64(x)) return rechazar("error interno");
  for (int i = 0; i < 32; i++) sprintf(hashHex + 2 * i, "%02x", hash[i]);
  c.hash = hashHex;
  Serial.printf("Cobro firmado por el terminal: tx %s (comision hasta %u stroops)\n", hashHex, (unsigned)t.fee);

  // Reenviar la misma transacción es seguro: la red la acepta una sola vez.
  for (int intento = 0; intento < 4; intento++) {
    snprintf(stellar_rpc::params(), stellar_rpc::paramsCap(), "{\"transaction\":\"%s\"}", b64);
    if (!stellar_rpc::call("sendTransaction", stellar_rpc::params())) {
      delay(1000);
      continue;  // sin respuesta: puede haber llegado igual; se sabrá al consultar
    }
    const char *estado = stl_json_string(stellar_rpc::body(), "status", &n);
    if (estado && (!strncmp(estado, "PENDING", 7) || !strncmp(estado, "DUPLICATE", 9))) break;
    if (estado && !strncmp(estado, "TRY_AGAIN_LATER", 15)) {
      delay(1500);
      continue;
    }
    Serial.printf("Envio rechazado: %.500s\n", stellar_rpc::body());
    return rechazar("la red rechazo el cobro");
  }

  // 3. Esperar a que la red la confirme.
  c.estado = Estado::SinConfirmar;
  for (int consulta = 0; consulta < 25; consulta++) {
    delay(1000);
    Tx estado = estadoTx(hashHex);
    if (estado == Tx::Confirmada) {
      c.estado = Estado::Aprobado;
      Serial.printf("Cobro confirmado por la red en %u ms\n", (unsigned)(millis() - inicio));
      return c;
    }
    if (estado == Tx::Fallida) return rechazar("la red rechazo el cobro");
  }
  return c;
}

Estado consultar(const String &hash, uint64_t vence) {
  Tx estado = estadoTx(hash.c_str());
  if (estado == Tx::Confirmada) return Estado::Aprobado;
  if (estado == Tx::Fallida) return Estado::Rechazado;
  if (estado == Tx::NoEsta) {
    int64_t cierre = 0;
    if (horaDeLaRed(&cierre) && (uint64_t)cierre > vence + 10) return Estado::Rechazado;  // venció sin entrar
  }
  return Estado::SinConfirmar;
}

}  // namespace firma
