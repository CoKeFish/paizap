#pragma once
#include <Arduino.h>

namespace pantalla {
bool iniciar();
// titulo: línea pequeña de arriba · grande: el dato principal · abajo: ayuda o detalle
void mostrar(const String &titulo, const String &grande = "", const String &abajo = "");
// Renglones bajo un título (menú de productos). La OLED muestra hasta 5, de 21 letras cada uno.
void lista(const String &titulo, const String renglones[], uint8_t cantidad);
// Código QR a la izquierda y hasta tres renglones cortos (10 letras) a la derecha.
// Caben enlaces cortos: hasta 77 letras si son solo mayúsculas, números y $%*+-./: o 53 si no.
// Devuelve false si el texto no cabe o la pantalla no puede dibujarlo.
bool qr(const String &texto, const String &linea1 = "", const String &linea2 = "", const String &linea3 = "");
}  // namespace pantalla
