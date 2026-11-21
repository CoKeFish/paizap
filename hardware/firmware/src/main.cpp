// Toki: firmware del terminal.
//
// Flujo (modo caja): escribe el monto, # para cobrar, acerca la tarjeta. El terminal lee la
// tarjeta y le pide el cobro al servidor de Toki, que cobra en Stellar con el permiso de gasto;
// según la respuesta muestra el pago, pita y activa el relé (modo autoservicio).
// Sin servidor configurado queda en modo prueba: recorre el mismo flujo sin cobrar, para probar
// cada pieza (pantalla, teclado, buzzer, LEDs, relé y lector).
//
// Las piezas se eligen en config.h; la red y el servidor, al compilar (red_desde_entorno.py).

#include <Arduino.h>
#include <Wire.h>
#include <Keypad.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "config.h"
#include "lector.h"
#include "pantalla.h"

#if TECLADO_4X3
constexpr byte COLUMNAS = 3;
char teclas[4][COLUMNAS] = {{'1', '2', '3'}, {'4', '5', '6'}, {'7', '8', '9'}, {'*', '0', '#'}};
#else
constexpr byte COLUMNAS = 4;
char teclas[4][COLUMNAS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'},
};
#endif
// A: cancelar · *: borrar · D: punto decimal · #: cobrar

byte filas[4], columnas[4];
Keypad *teclado;

enum class Estado { Monto, EsperandoTarjeta };
Estado estado = Estado::Monto;
String monto;
bool lectorOk = false;  // el lector respondió al arrancar

// ---- Salidas ----

void bip(uint16_t frecuencia, uint16_t ms) {
#if BUZZER_PASIVO
  tone(PIN_BUZZER, frecuencia, ms);
  delay(ms);
#else
  (void)frecuencia;
  digitalWrite(PIN_BUZZER, HIGH);
  delay(ms);
  digitalWrite(PIN_BUZZER, LOW);
#endif
}

void pitido(bool ok) {
  if (ok) {
    bip(1800, 80);
    delay(40);
    bip(2400, 120);
  } else {
    bip(400, 400);
  }
}

void rele(bool encendido) {
  digitalWrite(PIN_RELE, encendido != (bool)RELE_ACTIVO_BAJO);
  Serial.println(encendido ? "Relé ON" : "Relé OFF");
}

void pantallaMonto() {
  pantalla::mostrar("Toki | Monto (USDC)", monto.isEmpty() ? "0" : monto, "# cobrar  * borrar");
}

void escanearI2C() {
  Serial.print("I2C encontrados:");
  for (uint8_t dir = 1; dir < 127; dir++) {
    Wire.beginTransmission(dir);
    if (Wire.endTransmission() == 0) Serial.printf(" 0x%02X", dir);
  }
  Serial.println(" (OLED: 0x3C · LCD: 0x27 o 0x3F)");
}

// Lista las redes que ve la placa. El ESP32 solo ve redes de 2.4 GHz: si la tuya no aparece
// aquí, es de 5 GHz y no sirve. También se pide con "w" en el monitor serie.
void listarRedes() {
  WiFi.mode(WIFI_STA);
  int n = WiFi.scanNetworks();
  Serial.printf("Redes de 2.4 GHz visibles: %d\n", n < 0 ? 0 : n);
  for (int i = 0; i < n; i++) {
    Serial.printf("  [%s] canal %d, %d dBm%s\n", WiFi.SSID(i).c_str(), (int)WiFi.channel(i), (int)WiFi.RSSI(i),
                  WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? ", abierta" : "");
  }
  WiFi.scanDelete();
  Serial.println("Fin de la lista de redes");
}

void conectarWifi() {
  const char *ssid = strlen(WIFI_SSID) ? WIFI_SSID : (TOKI_SIM_ACTIVO ? "Wokwi-GUEST" : "");
  if (strlen(SERVIDOR_URL) == 0 || strlen(ssid) == 0) {
    Serial.println("Sin servidor configurado: modo prueba, no cobra");
    return;
  }
  pantalla::mostrar("Toki | Wi-Fi", "...", ssid);
  Serial.printf("Conectando a %s", ssid);
  if (TOKI_SIM_ACTIVO) {
    WiFi.begin(ssid, "", 6);  // Wokwi: canal 6, sin clave
  } else {
    WiFi.begin(ssid, WIFI_CLAVE);
  }
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) {
    delay(250);
    Serial.print('.');
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf(" Wi-Fi OK, IP %s. Servidor %s\n", WiFi.localIP().toString().c_str(), SERVIDOR_URL);
  } else {
    Serial.println(" ERROR: sin Wi-Fi (revisa WIFI_SSID y WIFI_CLAVE)");
    WiFi.disconnect();
    delay(200);
    listarRedes();
  }
}

// ---- Programa ----

// Respuesta del servidor: {"ok":true,"hash":"...",...} o {"ok":false,"motivo":"..."}
String campoJson(const String &json, const char *campo) {
  String clave = String("\"") + campo + "\":\"";
  int i = json.indexOf(clave);
  if (i < 0) return "";
  i += clave.length();
  return json.substring(i, json.indexOf('"', i));
}

struct Resultado {
  bool ok;
  String detalle;  // hash de la transacción o motivo del rechazo
};

// Un POST al servidor; devuelve el código HTTP (<= 0 si no hubo respuesta).
int enviarCobro(const String &cuerpo, String &respuesta) {
  String url = String(SERVIDOR_URL) + "/cobros";
  WiFiClientSecure seguro;
  seguro.setInsecure();  // MVP: sin verificar el certificado del servidor
  WiFiClient plano;
  HTTPClient http;
  if (url.startsWith("https")) {
    http.begin(seguro, url);
  } else {
    http.begin(plano, url);
  }
  http.setTimeout(20000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Terminal-Token", TERMINAL_TOKEN);
  int codigo = http.POST(cuerpo);
  respuesta = codigo > 0 ? http.getString() : "";
  http.end();
  return codigo;
}

// Pide el cobro al servidor de Toki, que cobra en Stellar con el permiso de gasto.
// Cada cobro lleva un id: si la respuesta se pierde y el terminal reintenta, el servidor
// devuelve el mismo resultado y no cobra dos veces.
Resultado pedirCobro(const Tarjeta &t) {
  if (strlen(SERVIDOR_URL) == 0) return {true, "(sin servidor: modo prueba)"};
  if (WiFi.status() != WL_CONNECTED) return {false, "sin Wi-Fi"};

  String id = String((uint32_t)ESP.getEfuseMac(), HEX) + "-" + String(esp_random(), HEX);
  String cuerpo = "{\"id\":\"" + id + "\",\"uid\":\"" + t.uid + "\",\"monto\":\"" + monto + "\",\"sun\":\"" + t.url + "\"}";
  String respuesta;
  int codigo = 0;
  for (int intento = 1; intento <= 3 && codigo <= 0; intento++) {
    if (intento > 1) Serial.printf("Sin respuesta, reintento %d (cobro %s)\n", intento, id.c_str());
    codigo = enviarCobro(cuerpo, respuesta);
  }

  Serial.printf("Servidor: %d %s\n", codigo, respuesta.c_str());
  if (codigo <= 0) return {false, "servidor no responde"};
  if (respuesta.indexOf("\"ok\":true") >= 0) return {true, campoJson(respuesta, "hash")};
  if (codigo == 404 && !campoJson(respuesta, "uid").isEmpty()) {
    // Tarjeta nueva: se muestra su UID para registrarla (servidor/src/registrar-tarjeta.mjs).
    Serial.printf("Tarjeta no registrada. Registrar con: node src/registrar-tarjeta.mjs %s\n", t.uid.c_str());
    return {false, "No registrada " + t.uid};
  }
  String motivo = campoJson(respuesta, "motivo");
  return {false, motivo.isEmpty() ? "error " + String(codigo) : motivo};
}

void cobrar(const Tarjeta &t) {
  Serial.println("--- Tarjeta leída ---");
  Serial.printf("Monto: %s USDC\n", monto.c_str());
  Serial.printf("UID:   %s\n", t.uid.c_str());
  Serial.printf("SUN:   %s\n", t.url.isEmpty() ? "(sin URL: no es NTAG 424 DNA o no está configurada)" : t.url.c_str());

  pantalla::mostrar("Toki | Cobrando " + monto, "...", "Procesando en Stellar");
  Resultado r = pedirCobro(t);

  if (!r.ok) {
    Serial.printf("Pago rechazado: %s\n", r.detalle.c_str());
    digitalWrite(PIN_LED_ERROR, HIGH);
    bool noRegistrada = r.detalle.startsWith("No registrada ");
    pantalla::mostrar(noRegistrada ? "Toki | No registrada" : "Toki | Rechazado", "NO",
                      noRegistrada ? "UID " + t.uid : r.detalle.substring(0, 21));
    pitido(false);
    delay(noRegistrada ? 6000 : 2500);  // tiempo para anotar el UID
    digitalWrite(PIN_LED_ERROR, LOW);
    monto = "";
    estado = Estado::Monto;
    pantallaMonto();
    return;
  }

  Serial.printf("Pago aprobado: %s\n", r.detalle.c_str());
  digitalWrite(PIN_LED_OK, HIGH);
  pantalla::mostrar("Toki | Pago", "OK " + monto, "tx " + r.detalle.substring(0, 18));
  pitido(true);

  // Autoservicio: un pulso al relé activa la máquina.
  rele(true);
  delay(1000);
  rele(false);
  delay(1000);
  digitalWrite(PIN_LED_OK, LOW);

  Serial.println("Pago OK");
  monto = "";
  estado = Estado::Monto;
  pantallaMonto();
}

void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(PIN_RELE, OUTPUT);
  rele(false);
  pinMode(PIN_LED_OK, OUTPUT);
  pinMode(PIN_LED_ERROR, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  for (byte i = 0; i < 4; i++) {
    filas[i] = PINES_FILAS[i];
    columnas[i] = PINES_COLUMNAS[i];
  }
  teclado = new Keypad(makeKeymap(teclas), filas, columnas, 4, COLUMNAS);

  Wire.begin(PIN_SDA, PIN_SCL);
  escanearI2C();
  if (!pantalla::iniciar()) Serial.println("ERROR: no encuentro la pantalla (revisa SDA, SCL, VCC, GND)");
  pantalla::mostrar("Toki | Prueba", "Hola", "Probando piezas...");
  pitido(true);

  Serial.printf("Lector: %s\n", lector::nombre());
  lectorOk = lector::iniciar();
  if (lectorOk) {
    Serial.println("Lector OK: acerca una tarjeta para ver su UID");
  } else {
    Serial.println("ERROR: no encuentro el lector (revisa cables y que el PN532 esté en modo SPI)");
    digitalWrite(PIN_LED_ERROR, HIGH);
    pantalla::mostrar("Toki | Error", "Lector?", "Revisa cables/SPI");
    pitido(false);
    delay(3000);
    digitalWrite(PIN_LED_ERROR, LOW);
  }
#if LECTOR == LECTOR_BOTON
  Serial.println("Sin lector: el botón hace de tarjeta (o escribe 't')");
#endif

  conectarWifi();
  pantallaMonto();
  Serial.println("Listo. Escribe el monto en el teclado o aquí (ej. 12.50 + Enter)");
}

// El monto también se puede escribir por el monitor serie (útil sin teclado y en las pruebas
// automáticas del simulador): "12.50" + Enter pide la tarjeta, "a" cancela.
String lineaSerie;
bool leerLineaSerie(String &linea) {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      linea = lineaSerie;
      lineaSerie = "";
      linea.trim();
      return !linea.isEmpty();
    }
    if (lineaSerie.length() < 48) lineaSerie += c;
  }
  return false;
}

void pedirTarjeta() {
  if (monto.endsWith(".")) monto.remove(monto.length() - 1);
  estado = Estado::EsperandoTarjeta;
  pantalla::mostrar("Toki | Cobrar " + monto, "Acerque", "la tarjeta");
  Serial.printf("Cobrar %s USDC: acerque la tarjeta\n", monto.c_str());
}

void cancelar() {
  monto = "";
  estado = Estado::Monto;
  Serial.println("Cancelado");
  pantallaMonto();
}

void loop() {
  String linea;
  if (leerLineaSerie(linea)) {
    if (linea.equalsIgnoreCase("a")) {
      cancelar();
    } else if (linea.equalsIgnoreCase("w")) {
      if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("Wi-Fi conectado a [%s], IP %s, %d dBm\n", WiFi.SSID().c_str(),
                      WiFi.localIP().toString().c_str(), (int)WiFi.RSSI());
      } else {
        Serial.println("Wi-Fi sin conectar");
      }
      listarRedes();
    } else if (linea.equalsIgnoreCase("l")) {
      // Vuelve a buscar el lector: sirve después de corregir un cable, sin reiniciar la placa.
      lectorOk = lector::iniciar();
      Serial.printf("Lector %s: %s\n", lector::nombre(),
                    lectorOk ? "OK, acerca una tarjeta" : "NO responde (revisa cables e interruptores)");
#if LECTOR == LECTOR_BOTON
    } else if ((linea.equalsIgnoreCase("t") || linea.startsWith("t ")) && estado == Estado::EsperandoTarjeta) {
      lector::simularToque(linea.substring(1));  // "t" o "t <UID>": acercar una tarjeta de prueba
#endif
    } else if (estado == Estado::Monto && linea.toFloat() > 0) {
      monto = linea;
      pedirTarjeta();
    } else {
      Serial.println("Escribe un monto (ej. 12.50), 'a' para cancelar o 'w' para ver las redes Wi-Fi");
    }
  }

  char tecla = teclado->getKey();

  if (estado == Estado::Monto && tecla) {
    if (isdigit(tecla) && monto.length() < 7) {
      monto += tecla;
    } else if (tecla == 'D' && monto.indexOf('.') < 0) {
      monto += monto.isEmpty() ? "0." : ".";
    } else if (tecla == '*' && !monto.isEmpty()) {
      monto.remove(monto.length() - 1);
    } else if (tecla == 'A') {
      monto = "";
    } else if (tecla == '#' && !monto.isEmpty() && monto.toFloat() > 0) {
      pedirTarjeta();
      return;
    }
    bip(3000, 15);
    pantallaMonto();
    return;
  }

  if (estado == Estado::EsperandoTarjeta) {
    // Cancelar: A en el teclado 4x4, * en el 4x3.
    if (tecla == 'A' || (TECLADO_4X3 && tecla == '*')) {
      cancelar();
      return;
    }
    Tarjeta t;
    if (lector::leer(t)) cobrar(t);
  }

  // En reposo (sin monto escrito), una tarjeta acercada solo se identifica: no cobra. Sirve para
  // probar el lector y para saber el UID de una tarjeta nueva antes de registrarla.
  static uint32_t ultimaConsulta = 0, ultimaVista = 0;
  static String ultimoUid;
  if (lectorOk && estado == Estado::Monto && monto.isEmpty() && millis() - ultimaConsulta > 500) {
    ultimaConsulta = millis();
    Tarjeta t;
    if (lector::leer(t)) {
      // Una tarjeta que sigue apoyada no se anuncia de nuevo.
      if (t.uid != ultimoUid || millis() - ultimaVista > 1500) {
        Serial.printf("Tarjeta detectada (sin cobro): UID %s%s\n", t.uid.c_str(),
                      t.url.isEmpty() ? "" : " (NTAG 424 DNA con URL)");
        bip(2400, 30);
      }
      ultimoUid = t.uid;
      ultimaVista = millis();
    }
  }

  delay(10);
}
