#include "lector.h"
#include "config.h"
#include <SPI.h>

static String hex(const uint8_t *datos, uint8_t largo) {
  String s;
  for (uint8_t i = 0; i < largo; i++) {
    if (i) s += ':';
    if (datos[i] < 0x10) s += '0';
    s += String(datos[i], HEX);
  }
  s.toUpperCase();
  return s;
}

// Extrae la URL de un mensaje NDEF con un registro URI corto: D1 01 <largo> 'U' <prefijo> <uri...>
static String urlDeNdef(const uint8_t *ndef, uint16_t largo) {
  if (largo < 5 || ndef[0] != 0xD1 || ndef[3] != 'U') return "";
  static const char *prefijos[] = {"", "http://www.", "https://www.", "http://", "https://"};
  String url = ndef[4] < 5 ? prefijos[ndef[4]] : "";
  for (uint16_t i = 5; i < 4 + ndef[2] && i < largo; i++) url += (char)ndef[i];
  return url;
}

#if LECTOR == LECTOR_BOTON

const char *lector::nombre() { return "boton (sin lector)"; }

bool lector::iniciar() {
  pinMode(PIN_BOTON_TARJETA, INPUT_PULLUP);
  return true;
}

static bool toquePendiente = false;
static String uidPendiente;
void lector::simularToque(String uid) {
  uid.trim();
  uidPendiente = uid;
  toquePendiente = true;
}

bool lector::leer(Tarjeta &t) {
  // Cuenta solo el paso de suelto a presionado: un botón trabado (o un pin que se lee siempre
  // en bajo) no dispara pagos ni bloquea el terminal.
  static bool estabaPresionado = true;
  bool presionado = digitalRead(PIN_BOTON_TARJETA) == LOW;
  bool flanco = presionado && !estabaPresionado;
  estabaPresionado = presionado;

  if (toquePendiente) {
    toquePendiente = false;
  } else if (!flanco) {
    return false;
  }
  static uint32_t contador = 1;
  char url[96];
  snprintf(url, sizeof url, "toki.app/t?p=SIMULADA%08lX&c=%08lX", (unsigned long)contador,
           (unsigned long)(contador * 2654435761UL));
  contador++;
  t.uid = uidPendiente.isEmpty() ? "04:A1:B2:C3:D4:E5:F6" : uidPendiente;
  uidPendiente = "";
  t.url = url;
  return true;
}

#elif LECTOR == LECTOR_PN532

#include <Adafruit_PN532.h>
static Adafruit_PN532 nfc(PIN_SS, &SPI);

const char *lector::nombre() { return "PN532"; }

bool lector::iniciar() {
  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_SS);
  nfc.begin();
  uint32_t version = nfc.getFirmwareVersion();
  if (!version) return false;
  Serial.printf("PN532 firmware %lu.%lu\n", (version >> 16) & 0xFF, (version >> 8) & 0xFF);
  nfc.SAMConfig();
  // Sin esto el PN532 se queda buscando una tarjeta sin parar, con la antena siempre encendida.
  nfc.setPassiveActivationRetries(2);
  return true;
}

// Apaga la antena del lector. El PN532 la vuelve a encender solo en la siguiente lectura.
// Encendida todo el tiempo gasta unos 100 mA, que junto con el Wi-Fi es más de lo que entrega con
// holgura el regulador de 3.3 V de la placa: el Wi-Fi empieza a fallar.
static void apagarAntena() {
  uint8_t apagar[] = {PN532_COMMAND_RFCONFIGURATION, 0x01, 0x00};
  nfc.sendCommandCheckAck(apagar, sizeof apagar, 50);
}

// Manda un APDU y devuelve true si la tarjeta responde 90 00.
static bool apdu(uint8_t *cmd, uint8_t largoCmd, uint8_t *resp, uint8_t &largoResp) {
  uint8_t cap = largoResp;
  if (!nfc.inDataExchange(cmd, largoCmd, resp, &cap)) return false;
  if (cap < 2 || resp[cap - 2] != 0x90 || resp[cap - 1] != 0x00) return false;
  largoResp = cap - 2;
  return true;
}

// NTAG 424 DNA: seleccionar la aplicación NDEF, el archivo E104 y leerlo por partes.
static String leerUrlNdef() {
  uint8_t resp[64];
  uint8_t largo;

  uint8_t selApp[] = {0x00, 0xA4, 0x04, 0x00, 0x07, 0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01, 0x00};
  largo = sizeof resp;
  if (!apdu(selApp, sizeof selApp, resp, largo)) return "";

  uint8_t selArchivo[] = {0x00, 0xA4, 0x00, 0x0C, 0x02, 0xE1, 0x04};
  largo = sizeof resp;
  if (!apdu(selArchivo, sizeof selArchivo, resp, largo)) return "";

  uint8_t leerLargo[] = {0x00, 0xB0, 0x00, 0x00, 0x02};
  largo = sizeof resp;
  if (!apdu(leerLargo, sizeof leerLargo, resp, largo) || largo < 2) return "";
  uint16_t nlen = (resp[0] << 8) | resp[1];
  if (nlen == 0 || nlen > 250) return "";

  uint8_t ndef[256];
  uint16_t leidos = 0;
  while (leidos < nlen) {
    uint16_t offset = 2 + leidos;
    uint8_t parte = min<uint16_t>(32, nlen - leidos);  // la librería usa un búfer de 64 bytes
    uint8_t leer[] = {0x00, 0xB0, (uint8_t)(offset >> 8), (uint8_t)offset, parte};
    largo = sizeof resp;
    if (!apdu(leer, sizeof leer, resp, largo) || largo == 0) return "";
    memcpy(ndef + leidos, resp, largo);
    leidos += largo;
  }
  return urlDeNdef(ndef, nlen);
}

bool lector::leer(Tarjeta &t) {
  uint8_t uid[7];
  uint8_t largoUid = 0;
  // Una lectura cada 150 ms como mucho: la antena queda apagada la mayor parte del tiempo.
  static uint32_t ultimaLectura = 0;
  if (millis() - ultimaLectura < 150) return false;
  ultimaLectura = millis();

  bool hayTarjeta = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &largoUid, 100);
  if (hayTarjeta) {
    t.uid = hex(uid, largoUid);
    t.url = leerUrlNdef();  // vacía si la tarjeta no es ISO 14443-4 (p. ej. NTAG213/215)
  }
  apagarAntena();
  return hayTarjeta;
}

#elif LECTOR == LECTOR_RC522

#include <MFRC522_NTAG424DNA.h>
static MFRC522_NTAG424DNA rc522(PIN_SS, PIN_RST_RC522);

const char *lector::nombre() { return "RC522"; }

bool lector::iniciar() {
  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_SS);
  rc522.PCD_Init();
  byte version = rc522.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("RC522 version 0x%02X\n", version);
  return version != 0x00 && version != 0xFF;
}

static String leerUrlNdef() {
  if (rc522.DNA_Plain_ISOSelectFile_Application() != MFRC522_NTAG424DNA::DNA_STATUS_OK) return "";
  uint8_t datos[256];
  uint16_t largo = sizeof datos;
  if (rc522.DNA_Plain_ISOReadBinary(MFRC522_NTAG424DNA::DNA_FILE_NDEF, sizeof datos, 0, datos, &largo) !=
      MFRC522_NTAG424DNA::DNA_STATUS_OK || largo < 2) {
    return "";
  }
  uint16_t nlen = (datos[0] << 8) | datos[1];
  return urlDeNdef(datos + 2, min<uint16_t>(nlen, largo - 2));
}

bool lector::leer(Tarjeta &t) {
  if (!rc522.PICC_IsNewCardPresent() || !rc522.PICC_ReadCardSerial()) return false;
  t.uid = hex(rc522.uid.uidByte, rc522.uid.size);
  // La librería solo habla con NTAG 424 DNA; en otras tarjetas la URL queda vacía.
  t.url = rc522.uid.sak == 0x20 ? leerUrlNdef() : "";
  rc522.PICC_HaltA();
  return true;
}

#else
#error "LECTOR no válido: usa LECTOR_PN532, LECTOR_RC522 o LECTOR_BOTON (ver config.h)"
#endif
