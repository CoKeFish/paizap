#pragma once
#include <Arduino.h>

namespace pantalla {
bool iniciar();
// titulo: línea pequeña de arriba · grande: el dato principal · abajo: ayuda o detalle
void mostrar(const String &titulo, const String &grande = "", const String &abajo = "");
}  // namespace pantalla
