---
title: Cómo está hecho
description: Un núcleo en C que no depende del chip, y lo que aporta cada microcontrolador.
---

El SDK tiene dos partes: un **núcleo** que es igual en todos los microcontroladores y **lo que
aporta cada microcontrolador**. El núcleo sabe de Stellar; cada microcontrolador aporta la red, la
criptografía y el guardado de la llave.

```text
  Tu programa
       │
       ▼
  Núcleo (C99)                      Lo que aporta el microcontrolador
  ───────────────────────────       ─────────────────────────────────
  direcciones y montos              SHA-256
  transacciones y firma      ◄────  firma Ed25519
  consultas y eventos               guardar la llave
  pedido de pago (SEP-7)            una consulta HTTPS al nodo
       │                                    │
       └────────────────────────────────────┘
                        ▼
              Nodo de Stellar RPC
```

| Carpeta del repositorio | Contenido |
|---|---|
| `src/` | El núcleo: `stellar_mcu.h` y `stellar_mcu.c` |
| `platforms/esp32-arduino/` | El cliente del nodo para el primer microcontrolador, el ESP32 con Arduino |
| `third_party/monocypher/` | La firma Ed25519 |
| `examples/` | Los ejemplos, sobre el primer microcontrolador |
| `tests/` | Las pruebas en el PC contra el SDK oficial de JavaScript |

## El núcleo

Está en `stellar_mcu.h` y `stellar_mcu.c`: C99, sin memoria dinámica y sin incluir nada del chip.
Hace cinco cosas:

- **Direcciones y montos.** Lee y escribe cuentas (`G…`), contratos (`C…`) y llaves (`S…`) con su
  verificación, y pasa montos de texto a unidades sin coma flotante.
- **Transacciones.** Arma el pago o la llamada al contrato del token en el formato que recibe la
  red (XDR), sobre un búfer que le das tú.
- **Firma.** Calcula lo que hay que firmar y agrega la firma a la transacción.
- **Consultas y eventos.** Arma lo que se le pregunta al nodo y lee lo que responde: el estado de
  una cuenta y los eventos de pago.
- **Pedido de pago.** Arma el pedido SEP-7 que entienden las billeteras.

Ocupa 3,4 KB de flash y no reserva RAM fija. Todo lo que necesita se lo pasas tú en cada llamada:
los búferes son tuyos y tienen tamaño fijo. Ver la [referencia del núcleo](../referencia/nucleo/).

## Lo que aporta el microcontrolador

El núcleo no sabe hacer criptografía ni hablar por la red. La criptografía se la pide al microcontrolador
con dos funciones:

```c
typedef struct {
  void (*sha256)(const uint8_t *data, size_t n, uint8_t out[32]);
  void (*sign)(const uint8_t seed[32], const uint8_t public_key[32],
               const uint8_t *message, size_t n, uint8_t signature[64]);
} stl_crypto;
```

En el ESP32, el SHA-256 lo da el acelerador del chip (mbedTLS) y la firma Ed25519,
[Monocypher](https://monocypher.org), que ocupa 18 KB. Un programa que solo lee de la red, como el
de [confirmar un pago](../guias/confirmar/), no necesita la firma.

## El cliente del nodo

`platforms/esp32-arduino/stellar_rpc.cpp` es la parte de red del primer microcontrolador, el ESP32: hace **una consulta por
HTTPS** a un nodo de [Stellar RPC](https://developers.stellar.org/docs/data/apis/rpc) y deja la
respuesta en un búfer.

- **Comprueba con quién habla.** Verifica el certificado del nodo contra la raíz guardada en
  `root_ca.h`.
- **Reutiliza la conexión.** Abrirla tarda de 2 a 4 segundos; con ella abierta, cada consulta
  tarda unos 0,3 segundos. Si se cae, la reabre y repite la consulta.
- **Corta lo que no cabe.** Una respuesta más grande que el búfer se lee completa pero se guarda
  solo lo que cabe, y `stellar_rpc::truncated()` lo avisa.

Ver la [referencia del cliente del nodo](../referencia/nodo/).

## Decisiones que se notan al usarlo

- **El aparato firma lo que él construyó.** Nunca firma una transacción que le entrega el nodo.
  Hasta la autorización de una llamada a contrato la arma el aparato.
- **La hora la da la red.** La vigencia de una transacción se calcula con la hora de cierre del
  último ledger: el microcontrolador no necesita reloj ni servidor de hora.
- **Vigencia corta y reintento seguro.** Cada transacción vale uno o dos minutos. Reenviar la
  misma no paga dos veces: o entra esa, o vence y no entra nunca.
- **El contrato del token se calcula en el aparato.** Así los pagos se filtran por la dirección
  correcta y no por un nombre que cualquiera puede copiar.
