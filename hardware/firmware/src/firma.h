// Cobro firmado por el terminal: con el SDK, el terminal guarda una llave, arma el
// `transfer_from` del permiso de gasto, lo firma y lo manda él mismo a Stellar. El servidor ya no
// firma ese cobro: solo dice de qué cuenta es la tarjeta y guarda el recibo.
//
// La llave del terminal tiene que estar autorizada en la red: es un firmante de la cuenta que
// tiene el permiso de gasto (servidor/src/autorizar-terminal.mjs). La transacción la paga la
// cuenta propia del terminal y la operación se hace en nombre de la cuenta con el permiso.
// Para la red esa firma vale para cualquier pago o llamada en nombre de esa cuenta: el comercio
// fijo y el tope de comisión de este archivo son controles del firmware, no de la red.
#pragma once
#include <Arduino.h>

namespace firma {

enum class Estado { Aprobado, Rechazado, SinConfirmar };

struct Cobro {
  Estado estado;
  String hash;     // identificador de la transacción, si llegó a firmarse
  String motivo;   // por qué se rechazó
  uint64_t vence;  // hora Unix hasta la que la transacción puede entrar a la red
};

// Carga la llave del terminal (la de la compilación o la guardada) o crea una nueva.
bool iniciar();
const char *cuenta();  // la cuenta G... del terminal, para autorizarla y darle fondos

// Cobra `monto` de la cuenta `cliente` a `comercio`, usando el permiso de gasto de `gastador`.
// `tokenServidor` es el contrato con el que cobra el servidor: si no es el del terminal, no cobra.
Cobro cobrar(const String &cliente, const String &comercio, const String &gastador, const String &tokenServidor,
             const String &monto);

// Vuelve a preguntar por un cobro que quedó sin confirmar. Si la transacción no entró y su
// vigencia ya pasó, no va a entrar nunca: Rechazado.
Estado consultar(const String &hash, uint64_t vence);

}  // namespace firma
