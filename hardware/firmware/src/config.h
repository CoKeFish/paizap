// Configuración del terminal: elige aquí las piezas que conseguiste.
// También se puede cambiar sin tocar el código, con build_flags en platformio.ini
// (por ejemplo -DPANTALLA=PANTALLA_LCD1602).
#pragma once

// ---- Lector de tarjetas ----
#define LECTOR_PN532 1  // PN532 por SPI (recomendado)
#define LECTOR_RC522 2  // RC522 / MFRC522 por SPI
#define LECTOR_BOTON 3  // sin lector: el botón BOOT de la placa hace de tarjeta (demo)

// ---- Pantalla (todas por I2C) ----
#define PANTALLA_SSD1306 1  // OLED 0.96" 128x64
#define PANTALLA_SH1106 2   // OLED 1.3" 128x64
#define PANTALLA_LCD1602 3  // LCD 16x2 con módulo I2C (PCF8574)

#ifndef LECTOR
#define LECTOR LECTOR_PN532
#endif

#ifndef PANTALLA
#define PANTALLA PANTALLA_SSD1306
#endif

// Dirección I2C del LCD: 0x27 o 0x3F. Al arrancar, el monitor serie lista las direcciones encontradas.
#ifndef LCD_DIRECCION
#define LCD_DIRECCION 0x27
#endif

// Buzzer activo (suena con voltaje) o pasivo (necesita frecuencia). 1 = pasivo.
#ifndef BUZZER_PASIVO
#define BUZZER_PASIVO 0
#endif

// Relé: la mayoría se activan con nivel alto. Los de 5 V sin jumper H/L suelen activarse con nivel bajo.
#ifndef RELE_ACTIVO_BAJO
#define RELE_ACTIVO_BAJO 0
#endif

// Teclado 4x4 (con A-D) o 4x3 (sin letras: no hay punto decimal; * vacío cancela).
#ifndef TECLADO_4X3
#define TECLADO_4X3 0
#endif

// ---- Red y servidor ----
// Vienen de variables de entorno al compilar (ver red_desde_entorno.py): TOKI_WIFI_SSID,
// TOKI_WIFI_CLAVE, TOKI_SERVIDOR_URL y TERMINAL_TOKEN. Sin servidor, el terminal no cobra
// (solo muestra la tarjeta). En el simulador, la red es Wokwi-GUEST.
#if __has_include("toki_red.h")
#include "toki_red.h"
#endif
#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif
#ifndef WIFI_CLAVE
#define WIFI_CLAVE ""
#endif
#ifndef SERVIDOR_URL
#define SERVIDOR_URL ""
#endif
#ifndef TERMINAL_TOKEN
#define TERMINAL_TOKEN ""
#endif

#ifdef TOKI_SIM
#define TOKI_SIM_ACTIVO 1
#else
#define TOKI_SIM_ACTIVO 0
#endif

// El simulador no tiene PN532 ni buzzer activo.
#ifdef TOKI_SIM
#undef LECTOR
#define LECTOR LECTOR_BOTON
#undef BUZZER_PASIVO
#define BUZZER_PASIVO 1
#endif

// ---- Pines según el chip (ver hardware/README.md) ----
#include <Arduino.h>

#if CONFIG_IDF_TARGET_ESP32S3
// ESP32-S3 DevKitC-1. Evita 0/3/45/46 (arranque), 19/20 (USB), 35-37 (PSRAM octal), 43/44 (serie).
constexpr uint8_t PIN_SDA = 8, PIN_SCL = 9;
constexpr uint8_t PIN_SCK = 12, PIN_MISO = 13, PIN_MOSI = 11, PIN_SS = 10, PIN_RST_RC522 = 14;
constexpr uint8_t PINES_FILAS[4] = {4, 5, 6, 7};
constexpr uint8_t PINES_COLUMNAS[4] = {15, 16, 17, 18};
constexpr uint8_t PIN_BUZZER = 21, PIN_RELE = 2, PIN_LED_OK = 41, PIN_LED_ERROR = 42;
#ifdef TOKI_SIM
constexpr uint8_t PIN_BOTON_TARJETA = 1;  // botón verde del diagrama de Wokwi
#else
constexpr uint8_t PIN_BOTON_TARJETA = 0;  // botón BOOT de la placa
#endif

#elif CONFIG_IDF_TARGET_ESP32
// ESP32 clásico (DevKit V1 / WROOM-32, 30 o 38 pines). Evita 6-11 (flash), 34-39 (solo entrada), 1/3 (serie).
constexpr uint8_t PIN_SDA = 21, PIN_SCL = 22;
constexpr uint8_t PIN_SCK = 18, PIN_MISO = 19, PIN_MOSI = 23, PIN_SS = 5, PIN_RST_RC522 = 4;
constexpr uint8_t PINES_FILAS[4] = {32, 33, 25, 26};
constexpr uint8_t PINES_COLUMNAS[4] = {27, 14, 13, 15};
constexpr uint8_t PIN_BUZZER = 17, PIN_RELE = 16, PIN_LED_OK = 2, PIN_LED_ERROR = 12;
constexpr uint8_t PIN_BOTON_TARJETA = 0;  // botón BOOT de la placa

#else
#error "Chip no soportado: usa un ESP32 clásico o un ESP32-S3 (el C3 no tiene pines suficientes con teclado)"
#endif
