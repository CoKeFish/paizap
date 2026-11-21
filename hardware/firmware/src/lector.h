#pragma once
#include <Arduino.h>

struct Tarjeta {
  String uid;
  String url;  // URL SUN de la NTAG 424 DNA (cambia en cada toque); vacía en otras tarjetas
};

namespace lector {
const char *nombre();
bool iniciar();               // false si no encuentra el lector
bool leer(Tarjeta &tarjeta);  // no bloquea más de ~100 ms
void simularToque(String uid = "");  // solo LECTOR_BOTON: la próxima lectura devuelve esa tarjeta
}  // namespace lector
