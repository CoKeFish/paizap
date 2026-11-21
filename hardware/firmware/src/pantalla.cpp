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

#elif PANTALLA == PANTALLA_SSD1306 || PANTALLA == PANTALLA_SH1106

#include <Adafruit_GFX.h>
#if PANTALLA == PANTALLA_SH1106
#include <Adafruit_SH110X.h>
static Adafruit_SH1106G oled(128, 64, &Wire, -1);
#define BLANCO SH110X_WHITE
#else
#include <Adafruit_SSD1306.h>
static Adafruit_SSD1306 oled(128, 64, &Wire, -1);
#define BLANCO SSD1306_WHITE
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

#else
#error "PANTALLA no válida: usa PANTALLA_SSD1306, PANTALLA_SH1106 o PANTALLA_LCD1602 (ver config.h)"
#endif
