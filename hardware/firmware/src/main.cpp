// Paizap: firmware del terminal.
//
// Flujo (modo caja): escribe el monto, # para cobrar, acerca la tarjeta. El terminal lee la
// tarjeta y le pide el cobro al servidor de Paizap, que cobra en Stellar con el permiso de gasto;
// según la respuesta muestra el pago, pita y activa el relé (modo autoservicio).
// Sin servidor configurado queda en modo prueba: recorre el mismo flujo sin cobrar, para probar
// cada pieza (pantalla, teclado, buzzer, LEDs, relé y lector).
//
// Las piezas se eligen en config.h; la red y el servidor, al compilar (red_desde_entorno.py).

#include <Arduino.h>
#include <Wire.h>
#include <Keypad.h>
#include <Preferences.h>
#include <WiFiMulti.h>
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

// Con precio fijo el terminal trabaja en autoservicio: no usa teclado, cobra ese monto a cada
// tarjeta que se acerca y activa el relé. Sin precio fijo es modo caja: el monto se escribe.
const bool AUTOSERVICIO = strlen(PRECIO_FIJO) > 0;

// El teclado tiene dos modos, que se alternan con la tecla B (en el teclado 4x3, con * sin nada
// escrito): caja, para escribir el monto, y productos, para elegir uno de la lista como en una
// máquina expendedora. El modo se recuerda aunque se apague el terminal.
enum class Modo : uint8_t { Caja = 0, Productos = 1 };
Modo modo = Modo::Caja;
const Producto productos[] = PRODUCTOS;
const uint8_t N_PRODUCTOS = sizeof(productos) / sizeof(productos[0]);
String concepto;  // producto elegido; vacío en modo caja
Preferences memoria;
WiFiMulti redes;           // las redes Wi-Fi configuradas (hasta dos)
bool variasRedes = false;  // false en el simulador, que usa una red fija

// El cobro que se está esperando. Su id se fija al empezar a esperar y es el mismo para pagar con
// la tarjeta o escaneando el QR: lo que llegue primero paga, y se cobra una sola vez.
String cobroId;
bool pedidoListo = false;   // el servidor ya tiene el cobro: se puede pagar con el QR
uint32_t esperaDesde = 0;   // cuándo se empezó a esperar el pago
const uint32_t ESPERA_MAXIMA_MS = 4UL * 60 * 1000;  // el servidor guarda el pedido 5 minutos

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
  pantalla::mostrar("Paizap: Monto (USDC)", monto.isEmpty() ? "0" : monto, "# cobrar  * borrar");
}

// Pantalla de reposo: en modo caja, el monto; en modo productos, la lista con sus precios.
void pantallaReposo() {
  if (modo == Modo::Caja) {
    pantallaMonto();
    return;
  }
  String renglones[5];
  uint8_t cantidad = min<uint8_t>(N_PRODUCTOS, 5);
  for (uint8_t i = 0; i < cantidad; i++) {
    char renglon[22];  // 21 letras por renglón: tecla, nombre y precio a la derecha
    snprintf(renglon, sizeof renglon, "%d %-13.13s %5s", i + 1, productos[i].nombre, productos[i].precio);
    renglones[i] = renglon;
  }
  pantalla::lista("Paizap: Productos", renglones, cantidad);
}

void soltarPedido();
void prepararCobro();

// Vuelve al reposo: en modo caja, a escribir el monto; en modo productos, a la lista; en
// autoservicio, a esperar el siguiente pago con el precio fijo.
void volverAlInicio() {
  soltarPedido();  // si quedó un cobro ofrecido por QR, ya no se espera: se retira del servidor
  concepto = "";
  if (AUTOSERVICIO) {
    monto = PRECIO_FIJO;
    Serial.printf("Autoservicio: %s USDC, acerque la tarjeta\n", monto.c_str());
    prepararCobro();
  } else {
    monto = "";
    estado = Estado::Monto;
    pantallaReposo();
  }
}

// En autoservicio, después de un cobro espera a que retiren la tarjeta: una tarjeta que se queda
// apoyada en el lector no debe pagar dos veces.
void esperarRetiro() {
  if (!AUTOSERVICIO) return;
  pantalla::mostrar("Paizap: Listo", "Retire", "la tarjeta");
  uint32_t ultimaVez = millis();
  Tarjeta t;
  while (millis() - ultimaVez < 1200) {
    if (lector::leer(t)) ultimaVez = millis();
    delay(50);
  }
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
  pantalla::mostrar("Paizap: Wi-Fi", "...", ssid);
  Serial.printf("Conectando a %s", ssid);
  // Si la conexión se cae, queda anotado el motivo en el monitor serie.
  WiFi.onEvent([](WiFiEvent_t evento, WiFiEventInfo_t info) {
    if (evento == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
      Serial.printf("Wi-Fi desconectado (motivo %d)\n", (int)info.wifi_sta_disconnected.reason);
    }
  });
  if (TOKI_SIM_ACTIVO) {
    WiFi.begin(ssid, "", 6);  // Wokwi: canal 6, sin clave
    for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) {
      delay(250);
      Serial.print('.');
    }
  } else {
    // Menos potencia de transmisión = picos de consumo más bajos. A pocos metros del router sobra.
    WiFi.mode(WIFI_STA);
    WiFi.setTxPower(WIFI_POTENCIA);
    // Con dos redes configuradas, el terminal usa la que esté disponible y tenga mejor señal.
    redes.addAP(WIFI_SSID, WIFI_CLAVE);
    if (strlen(WIFI_SSID2)) redes.addAP(WIFI_SSID2, WIFI_CLAVE2);
    variasRedes = true;
    // El primer escaneo después de encender la radio a veces no encuentra las redes: se insiste.
    for (int intento = 0; intento < 3 && redes.run(8000) != WL_CONNECTED; intento++) {
      Serial.print('.');
      delay(700);
    }
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf(" Wi-Fi OK, red [%s], IP %s. Servidor %s\n", WiFi.SSID().c_str(),
                  WiFi.localIP().toString().c_str(), SERVIDOR_URL);
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
  String recibo;   // código corto del recibo, para el QR
};

// Una petición al servidor de Paizap. Con cuerpo es un POST; sin cuerpo, un GET.
// Devuelve el código HTTP (<= 0 si no hubo respuesta).
int pedirHttp(const String &ruta, const String &cuerpo, String &respuesta, uint16_t esperaMs) {
  String url = String(SERVIDOR_URL) + ruta;
  WiFiClientSecure seguro;
  seguro.setInsecure();  // MVP: sin verificar el certificado del servidor
  WiFiClient plano;
  HTTPClient http;
  if (url.startsWith("https")) {
    http.begin(seguro, url);
  } else {
    http.begin(plano, url);
  }
  http.setTimeout(esperaMs);
  http.addHeader("X-Terminal-Token", TERMINAL_TOKEN);
  int codigo;
  if (cuerpo.isEmpty()) {
    codigo = http.GET();
  } else {
    http.addHeader("Content-Type", "application/json");
    codigo = http.POST(cuerpo);
  }
  respuesta = codigo > 0 ? http.getString() : "";
  http.end();
  return codigo;
}

// Espera hasta `ms` a que el Wi-Fi esté conectado. Si se cayó, busca de nuevo entre las redes
// configuradas: si una desapareció, se conecta a la otra.
bool esperarWifi(uint32_t ms) {
  if (WiFi.status() == WL_CONNECTED) return true;
  if (variasRedes) {
    redes.run(ms);
  } else {
    WiFi.reconnect();
    uint32_t inicio = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - inicio < ms) delay(100);
  }
  return WiFi.status() == WL_CONNECTED;
}

// Al arrancar, comprueba que el servidor responda: si el terminal quedó en una red desde la que
// no lo alcanza, se sabe antes del primer cobro.
void comprobarServidor() {
  if (strlen(SERVIDOR_URL) == 0 || WiFi.status() != WL_CONNECTED) return;
  String respuesta;
  int codigo = pedirHttp("/salud", "", respuesta, 6000);
  if (codigo == 200) {
    Serial.println("Servidor OK");
  } else {
    Serial.printf("ERROR: el servidor no responde en %s (codigo %d). ¿Está en la misma red?\n", SERVIDOR_URL, codigo);
    pantalla::mostrar("Paizap: Error", "Servidor?", "No responde");
    pitido(false);
    delay(3000);
  }
}

// En reposo, si el Wi-Fi se cayó, el terminal lo dice y busca red de nuevo.
void vigilarWifi() {
  static uint32_t ultimo = 0;
  if (strlen(SERVIDOR_URL) == 0 || WiFi.status() == WL_CONNECTED || millis() - ultimo < 15000) return;
  ultimo = millis();
  Serial.println("Wi-Fi caido: buscando red...");
  pantalla::mostrar("Paizap: Sin Wi-Fi", "...", "Buscando red");
  if (esperarWifi(8000)) {
    Serial.printf("Wi-Fi de vuelta: red [%s], IP %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
    comprobarServidor();  // puede ser otra red: ¿desde aquí se alcanza el servidor?
  }
  volverAlInicio();
}

// Un cobro que el terminal mandó pero no pudo confirmar: la conexión se cayó antes de recibir la
// respuesta. Puede que el servidor sí haya cobrado, así que el terminal sigue preguntando por ese
// cobro hasta saber qué pasó (ver resolverPendiente).
struct {
  bool activo = false;
  String id, monto, concepto;
} pendiente;

// Retira del servidor el cobro que estaba ofrecido por QR, para que nadie lo pague cuando el
// terminal ya no lo espera. Si justo lo estaban pagando, queda pendiente de confirmar.
void soltarPedido() {
  if (!pedidoListo) return;
  pedidoListo = false;
  String respuesta;
  int codigo = pedirHttp("/pedidos/" + cobroId + "/cancelar", "{}", respuesta, 4000);
  if (codigo == 409 && !pendiente.activo) {
    pendiente.activo = true;
    pendiente.id = cobroId;
    pendiente.monto = monto;
    pendiente.concepto = concepto;
    Serial.println("Ese cobro ya se estaba pagando con QR: se confirma en un momento");
  }
}

// Empieza a esperar el pago de `monto`. Le da un id al cobro y lo registra en el servidor, para
// que además de la tarjeta se pueda pagar escaneando el QR de la pantalla. Sin conexión no hay
// QR: queda solo la tarjeta.
void prepararCobro() {
  cobroId = String((uint32_t)ESP.getEfuseMac(), HEX) + "-" + String(esp_random(), HEX);
  pedidoListo = false;
  esperaDesde = millis();
  estado = Estado::EsperandoTarjeta;

  // Primero el aviso de siempre, para que se pueda acercar la tarjeta mientras se prepara el QR.
  if (concepto.isEmpty()) {
    pantalla::mostrar("Paizap: Cobrar " + monto, "Acerque", "la tarjeta");
  } else {
    pantalla::mostrar("Paizap: " + concepto.substring(0, 13), monto, "Acerque la tarjeta");
  }
  if (strlen(SERVIDOR_URL) == 0 || WiFi.status() != WL_CONNECTED) return;

  String respuesta;
  String cuerpo = "{\"id\":\"" + cobroId + "\",\"monto\":\"" + monto + "\",\"concepto\":\"" + concepto + "\"}";
  pedidoListo = pedirHttp("/pedidos", cuerpo, respuesta, 5000) == 200;
  if (!pedidoListo) return;

  // Con QR: el código a la izquierda y, a la derecha, qué se cobra y cómo se paga.
  String enlace = String(SERVIDOR_URL) + "/p/" + cobroId;
  if (pantalla::qr(enlace, concepto.isEmpty() ? String("Total") : concepto, monto, "Tarjeta/QR")) {
    Serial.printf("QR de pago: %s\n", enlace.c_str());
  }
}

// Pide el cobro al servidor de Paizap, que cobra en Stellar con el permiso de gasto.
// Cada cobro lleva un id fijo. Si la respuesta se pierde, el terminal no sabe si se cobró:
// reintenta con el mismo id, esperando a que vuelva el Wi-Fi, y el servidor devuelve el mismo
// resultado sin cobrar dos veces.
Resultado pedirCobro(const Tarjeta &t) {
  if (strlen(SERVIDOR_URL) == 0) return {true, "(sin servidor: modo prueba)"};
  if (!esperarWifi(5000)) return {false, "sin Wi-Fi"};  // todavía no se mandó nada: no se cobra

  String id = cobroId;  // el mismo id del pedido ofrecido por QR: tarjeta o QR, se cobra una vez
  String cuerpo = "{\"id\":\"" + id + "\",\"uid\":\"" + t.uid + "\",\"monto\":\"" + monto + "\",\"sun\":\"" + t.url +
                  "\",\"concepto\":\"" + concepto + "\"}";
  String respuesta;
  int codigo = 0;
  for (int intento = 1; intento <= 5 && codigo <= 0; intento++) {
    if (intento > 1) {
      Serial.printf("Sin respuesta (error %d, Wi-Fi %s): reintento %d del cobro %s\n", codigo,
                    WiFi.status() == WL_CONNECTED ? "conectado" : "caido", intento, id.c_str());
      pantalla::mostrar("Paizap: Sin conexion", "...", "Confirmando el cobro");
      esperarWifi(10000);
      delay(1000);
    }
    codigo = pedirHttp("/cobros", cuerpo, respuesta, 20000);
  }

  Serial.printf("Servidor: %d %s\n", codigo, respuesta.c_str());
  if (codigo <= 0) {
    // No es un rechazo: no se sabe si el servidor alcanzó a cobrar.
    pendiente.activo = true;
    pendiente.id = id;
    pendiente.monto = monto;
    pendiente.concepto = concepto;
    return {false, "Sin confirmar"};
  }
  if (respuesta.indexOf("\"ok\":true") >= 0) {
    return {true, campoJson(respuesta, "hash"), campoJson(respuesta, "recibo")};
  }
  if (codigo == 404 && !campoJson(respuesta, "uid").isEmpty()) {
    // Tarjeta nueva: se muestra su UID para registrarla (servidor/src/registrar-tarjeta.mjs).
    Serial.printf("Tarjeta no registrada. Registrar con: node src/registrar-tarjeta.mjs %s\n", t.uid.c_str());
    return {false, "No registrada " + t.uid};
  }
  String motivo = campoJson(respuesta, "motivo");
  return {false, motivo.isEmpty() ? "error " + String(codigo) : motivo};
}

// Recibo: un QR con un enlace corto del servidor que lleva a la transacción en el explorador de
// Stellar. Se queda unos segundos; cualquier tecla (o un comando por el monitor serie) lo cierra.
void mostrarRecibo(const String &codigo) {
  if (codigo.isEmpty() || RECIBO_MS == 0) return;
  String enlace = String(SERVIDOR_URL) + "/r/" + codigo;
  if (!pantalla::qr(enlace, concepto.isEmpty() ? String("Pago OK") : concepto, "OK " + monto, "Escanea")) return;
  Serial.printf("Recibo: %s\n", enlace.c_str());
  uint32_t inicio = millis();
  while (millis() - inicio < RECIBO_MS) {
    if (teclado->getKey() || Serial.available()) break;
    delay(20);
  }
}

void pagoAprobado(const Resultado &r);

void cobrar(const Tarjeta &t) {
  Serial.println("--- Tarjeta leída ---");
  Serial.printf("Monto: %s USDC\n", monto.c_str());
  Serial.printf("UID:   %s\n", t.uid.c_str());
  Serial.printf("SUN:   %s\n", t.url.isEmpty() ? "(sin URL: no es NTAG 424 DNA o no está configurada)" : t.url.c_str());

  pantalla::mostrar("Paizap: Cobro " + monto, "...", "Procesando en Stellar");
  Resultado r = pedirCobro(t);
  if (r.ok) {
    pagoAprobado(r);
    return;
  }

  bool noRegistrada = r.detalle.startsWith("No registrada ");
  bool sinConfirmar = r.detalle == "Sin confirmar";
  digitalWrite(PIN_LED_ERROR, HIGH);
  if (sinConfirmar) {
    Serial.printf("Pago SIN CONFIRMAR (cobro %s): no llegó la respuesta; el terminal sigue preguntando\n",
                  pendiente.id.c_str());
    pantalla::mostrar("Paizap: Sin confirmar", "?", "Espere, reintentando");
  } else {
    Serial.printf("Pago rechazado: %s\n", r.detalle.c_str());
    pantalla::mostrar(noRegistrada ? "Paizap: No registrada" : "Paizap: Rechazado", "NO",
                      noRegistrada ? "UID " + t.uid : r.detalle.substring(0, 21));
  }
  pitido(false);
  delay(noRegistrada ? 6000 : (sinConfirmar ? 4000 : 2500));  // tiempo para anotar el UID
  digitalWrite(PIN_LED_ERROR, LOW);
  esperarRetiro();
  volverAlInicio();
}

// Con conexión, vuelve a preguntar por el cobro que quedó sin confirmar. Solo consulta, no cobra
// de nuevo: si el servidor lo había cobrado, el terminal termina el pago (aviso, relé y recibo);
// si nunca le llegó, no hay nada que entregar.
void resolverPendiente() {
  static uint32_t ultimoIntento = 0;
  if (!pendiente.activo || millis() - ultimoIntento < 5000) return;
  ultimoIntento = millis();
  if (!esperarWifi(0)) return;

  String respuesta;
  int codigo = pedirHttp("/cobros/" + pendiente.id, "", respuesta, 10000);
  if (codigo <= 0) return;
  pendiente.activo = false;
  Serial.printf("Cobro pendiente %s resuelto: %d %s\n", pendiente.id.c_str(), codigo, respuesta.c_str());
  if (codigo == 200 && respuesta.indexOf("\"ok\":true") >= 0) {
    monto = pendiente.monto;
    concepto = pendiente.concepto;
    pagoAprobado({true, campoJson(respuesta, "hash"), campoJson(respuesta, "recibo")});
  } else {
    Serial.println("El cobro pendiente no se hizo: no hay nada que entregar");
    volverAlInicio();
  }
}

// Mientras espera el pago, le pregunta al servidor si ya lo pagaron escaneando el QR.
void revisarPagoQr() {
  static uint32_t ultima = 0;
  if (!pedidoListo || millis() - ultima < 2000 || WiFi.status() != WL_CONNECTED) return;
  ultima = millis();
  String respuesta;
  int codigo = pedirHttp("/cobros/" + cobroId, "", respuesta, 4000);
  if (codigo == 200 && respuesta.indexOf("\"ok\":true") >= 0) {
    Serial.println("Pagado con QR");
    pagoAprobado({true, campoJson(respuesta, "hash"), campoJson(respuesta, "recibo")});
  }
}

// Lo que pasa cuando un pago queda aprobado: aviso, relé y recibo.
void pagoAprobado(const Resultado &r) {
  pedidoListo = false;  // ya está pagado: no queda nada que retirar del servidor
  Serial.printf("Pago aprobado: %s\n", r.detalle.c_str());
  digitalWrite(PIN_LED_OK, HIGH);
  pantalla::mostrar(concepto.isEmpty() ? String("Paizap: Pago") : "Paizap: " + concepto.substring(0, 13), "OK " + monto,
                    "tx " + r.detalle.substring(0, 18));
  pitido(true);

  // Autoservicio: un pulso al relé activa la máquina.
  rele(true);
  delay(RELE_MS);
  rele(false);
  delay(1000);
  digitalWrite(PIN_LED_OK, LOW);

  Serial.println("Pago OK");
  mostrarRecibo(r.recibo);
  esperarRetiro();
  volverAlInicio();
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
  pantalla::mostrar("Paizap: Prueba", "Hola", "Probando piezas...");
  pitido(true);

  Serial.printf("Lector: %s\n", lector::nombre());
  lectorOk = lector::iniciar();
  if (lectorOk) {
    Serial.println("Lector OK: acerca una tarjeta para ver su UID");
  } else {
    Serial.println("ERROR: no encuentro el lector (revisa cables y que el PN532 esté en modo SPI)");
    digitalWrite(PIN_LED_ERROR, HIGH);
    pantalla::mostrar("Paizap: Error", "Lector?", "Revisa cables/SPI");
    pitido(false);
    delay(3000);
    digitalWrite(PIN_LED_ERROR, LOW);
  }
#if LECTOR == LECTOR_BOTON
  Serial.println("Sin lector: el botón hace de tarjeta (o escribe 't')");
#endif

  conectarWifi();
  comprobarServidor();
  memoria.begin("toki", false);
  modo = memoria.getUChar("modo", 0) == 1 ? Modo::Productos : Modo::Caja;
  if (AUTOSERVICIO) {
    Serial.printf("Listo. Autoservicio: cobra %s a cada tarjeta que se acerque\n", PRECIO_FIJO);
  } else {
    Serial.printf("Listo. Modo %s (la tecla B lo cambia). Monto por aquí: 12.50 + Enter; teclas: k 2\n",
                  modo == Modo::Caja ? "caja" : "productos");
  }
  volverAlInicio();
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
    if (lineaSerie.length() < 96) lineaSerie += c;
  }
  return false;
}

void pedirTarjeta() {
  if (monto.endsWith(".")) monto.remove(monto.length() - 1);
  Serial.printf("Cobrar %s USDC: acerque la tarjeta\n", monto.c_str());
  prepararCobro();
}

void cancelar() {
  Serial.println("Cancelado");
  volverAlInicio();
}

void elegirProducto(uint8_t i) {
  concepto = productos[i].nombre;
  monto = productos[i].precio;
  Serial.printf("Producto %d (%s): cobrar %s USDC, acerque la tarjeta\n", i + 1, concepto.c_str(), monto.c_str());
  prepararCobro();
}

void cambiarModo() {
  modo = modo == Modo::Caja ? Modo::Productos : Modo::Caja;
  memoria.putUChar("modo", (uint8_t)modo);
  Serial.printf("Modo: %s\n", modo == Modo::Caja ? "caja" : "productos");
  bip(2400, 40);
  volverAlInicio();
}

// Una tecla del teclado, o del monitor serie con "k <teclas>".
//   Esperando la tarjeta: A o * cancelan.
//   En reposo: B cambia de modo (en el teclado 4x3, * sin nada escrito).
//   Modo productos: 1 a 9 eligen el producto.
//   Modo caja: dígitos, D punto decimal, * borrar, A limpiar, # cobrar.
void procesarTecla(char tecla) {
  if (AUTOSERVICIO) return;  // con precio fijo el teclado no se usa

  if (estado == Estado::EsperandoTarjeta) {
    if (tecla == 'A' || tecla == '*') cancelar();
    return;
  }

  if (tecla == 'B' || (TECLADO_4X3 && tecla == '*' && monto.isEmpty())) {
    cambiarModo();
    return;
  }

  if (modo == Modo::Productos) {
    if (tecla >= '1' && tecla <= '9' && tecla - '1' < N_PRODUCTOS) {
      bip(3000, 15);
      elegirProducto(tecla - '1');
    }
    return;
  }

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
    } else if (linea.equalsIgnoreCase("s")) {
      if (WiFi.status() != WL_CONNECTED) Serial.println("Sin Wi-Fi: no puedo probar el servidor");
      comprobarServidor();
    } else if (linea.equalsIgnoreCase("l")) {
      // Vuelve a buscar el lector: sirve después de corregir un cable, sin reiniciar la placa.
      lectorOk = lector::iniciar();
      Serial.printf("Lector %s: %s\n", lector::nombre(),
                    lectorOk ? "OK, acerca una tarjeta" : "NO responde (revisa cables e interruptores)");
    } else if (linea.startsWith("q ") || linea.startsWith("Q ")) {
      // Dibuja un QR de prueba con ese texto: "q https://stellar.org"
      String texto = linea.substring(2);
      bool dibujado = pantalla::qr(texto, "Paizap", "QR de", "prueba");
      Serial.printf("QR %s: %s\n", dibujado ? "en pantalla" : "NO cabe (o no hay pantalla)", texto.c_str());
    } else if (linea.startsWith("k ") || linea.startsWith("K ")) {
      // Teclas por el monitor serie, para probar sin teclado: "k B", "k 2", "k 1D50#".
      for (unsigned int i = 2; i < linea.length(); i++) {
        if (linea[i] != ' ') procesarTecla(toupper(linea[i]));
      }
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

  // Con el terminal libre: vigila el Wi-Fi y, si quedó un cobro sin confirmar, pregunta por él.
  if (AUTOSERVICIO || (estado == Estado::Monto && monto.isEmpty())) {
    vigilarWifi();
    resolverPendiente();
  }

  char tecla = teclado->getKey();
  if (tecla) {
    Serial.printf("Tecla: %c\n", tecla);  // para comprobar el cableado del teclado
    procesarTecla(tecla);
    return;
  }

  if (estado == Estado::EsperandoTarjeta) {
    Tarjeta t;
    if (lector::leer(t)) {
      cobrar(t);
      return;
    }
    revisarPagoQr();
    // Un cobro que nadie paga no se queda ofrecido para siempre: en caja se cancela y con precio
    // fijo se renueva (el QR lleva a un cobro nuevo).
    if (estado == Estado::EsperandoTarjeta && millis() - esperaDesde > ESPERA_MAXIMA_MS) {
      if (AUTOSERVICIO) {
        volverAlInicio();
      } else {
        cancelar();
      }
    }
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
