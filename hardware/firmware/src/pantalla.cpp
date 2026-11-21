#include "pantalla.h"
#include "config.h"
#include <Wire.h>

// Si la pantalla no responde en el bus I2C, el terminal sigue sin ella (todo sale por el monitor
// serie) en vez de perder segundos en cada dibujo.
static bool presente = false;

static bool responde(uint8_t direccion) {
  Wire.beginTransmission(direccion);
  return Wire.endTransmission() == 0;
}

#if PANTALLA == PANTALLA_LCD1602

#include <LiquidCrystal_I2C.h>
static LiquidCrystal_I2C lcd(LCD_DIRECCION, 16, 2);

bool pantalla::iniciar() {
  if (!(presente = responde(LCD_DIRECCION))) return false;
  lcd.init();
  lcd.backlight();
  return true;
}

// 16x2: arriba el título, abajo el dato y la ayuda en la misma línea.
void pantalla::mostrar(const String &titulo, const String &grande, const String &abajo) {
  if (!presente) return;
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(titulo.substring(0, 16));
  lcd.setCursor(0, 1);
  String linea = grande.isEmpty() ? abajo : (abajo.isEmpty() ? grande : grande + " " + abajo);
  lcd.print(linea.substring(0, 16));
}

// En 16x2 no cabe la lista: solo dice qué teclas sirven.
void pantalla::lista(const String &titulo, const String renglones[], uint8_t cantidad) {
  (void)renglones;
  if (!presente) return;
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(titulo.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print("Teclas 1 a " + String(cantidad));
}

// Una pantalla de letras no puede dibujar un QR.
bool pantalla::qr(const String &, const String &, const String &, const String &) { return false; }

#elif PANTALLA == PANTALLA_SSD1306 || PANTALLA == PANTALLA_SH1106

#include <Adafruit_GFX.h>
#include <qrcode.h>
#if PANTALLA == PANTALLA_SH1106
#include <Adafruit_SH110X.h>
static Adafruit_SH1106G oled(128, 64, &Wire, -1);
#define BLANCO SH110X_WHITE
#define NEGRO SH110X_BLACK
#else
#include <Adafruit_SSD1306.h>
static Adafruit_SSD1306 oled(128, 64, &Wire, -1);
#define BLANCO SSD1306_WHITE
#define NEGRO SSD1306_BLACK
#endif

bool pantalla::iniciar() {
  if (!(presente = responde(0x3C))) return false;
#if PANTALLA == PANTALLA_SH1106
  return oled.begin(0x3C, true);
#else
  return oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
#endif
}

void pantalla::mostrar(const String &titulo, const String &grande, const String &abajo) {
  if (!presente) return;
  oled.clearDisplay();
  oled.setTextColor(BLANCO);
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.println(titulo);
  oled.drawFastHLine(0, 11, 128, BLANCO);
  oled.setTextSize(2);
  oled.setCursor(0, 20);
  oled.println(grande);
  oled.setTextSize(1);
  oled.setCursor(0, 48);
  oled.println(abajo);
  oled.display();
}

void pantalla::lista(const String &titulo, const String renglones[], uint8_t cantidad) {
  if (!presente) return;
  oled.clearDisplay();
  oled.setTextColor(BLANCO);
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.println(titulo);
  oled.drawFastHLine(0, 11, 128, BLANCO);
  for (uint8_t i = 0; i < cantidad && i < 5; i++) {
    oled.setCursor(0, 15 + i * 10);
    oled.print(renglones[i]);
  }
  oled.display();
}

// Versión de QR (1 a 3) más pequeña en la que cabe el texto con corrección baja; 0 si no cabe.
// Hasta la versión 3 cada módulo ocupa 2x2 puntos en los 64 de alto; más allá quedaría de 1 punto
// y un celular ya no lo lee.
static uint8_t versionQr(const String &texto) {
  static const uint8_t capAlfanumerico[] = {25, 47, 77};
  static const uint8_t capBytes[] = {17, 32, 53};
  bool alfanumerico = true;
  for (unsigned int i = 0; i < texto.length(); i++) {
    char c = texto[i];
    if (!(isdigit(c) || (c >= 'A' && c <= 'Z') || strchr(" $%*+-./:", c))) alfanumerico = false;
  }
  const uint8_t *capacidad = alfanumerico ? capAlfanumerico : capBytes;
  for (uint8_t version = 1; version <= 3; version++) {
    if (texto.length() <= capacidad[version - 1]) return version;
  }
  return 0;
}

bool pantalla::qr(const String &texto, const String &linea1, const String &linea2, const String &linea3) {
  uint8_t version = versionQr(texto);
  if (!presente || version == 0) return false;

  QRCode codigo;
  uint8_t datos[qrcode_getBufferSize(version)];
  qrcode_initText(&codigo, datos, version, ECC_LOW, texto.c_str());

  // Cuadro claro de 64x64 a la izquierda con el código en oscuro, y al menos un módulo de borde.
  uint8_t escala = 64 / (codigo.size + 2);
  uint8_t margen = (64 - codigo.size * escala) / 2;
  oled.clearDisplay();
  oled.fillRect(0, 0, 64, 64, BLANCO);
  for (uint8_t y = 0; y < codigo.size; y++) {
    for (uint8_t x = 0; x < codigo.size; x++) {
      if (qrcode_getModule(&codigo, x, y)) {
        oled.fillRect(margen + x * escala, margen + y * escala, escala, escala, NEGRO);
      }
    }
  }

  oled.setTextColor(BLANCO);
  oled.setTextSize(1);
  const String *lineas[] = {&linea1, &linea2, &linea3};
  for (uint8_t i = 0; i < 3; i++) {
    oled.setCursor(68, 8 + i * 20);
    oled.print(lineas[i]->substring(0, 10));
  }
  oled.display();
  return true;
}

#else
#error "PANTALLA no válida: usa PANTALLA_SSD1306, PANTALLA_SH1106 o PANTALLA_LCD1602 (ver config.h)"
#endif
