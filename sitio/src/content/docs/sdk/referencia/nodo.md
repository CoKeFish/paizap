---
title: Cliente del nodo
description: La parte de red para ESP32, una consulta por HTTPS a un nodo de Stellar RPC.
---

`platforms/esp32-arduino/stellar_rpc.h` y `stellar_rpc.cpp` son la parte de red para ESP32 y
ESP32-S3 con Arduino. Hacen una consulta JSON-RPC por HTTPS a un nodo de
[Stellar RPC](https://developers.stellar.org/docs/data/apis/rpc) y dejan la respuesta en un búfer.

## Funciones

```cpp
namespace stellar_rpc {
bool call(const char *method, const char *paramsJson);
const char *body();
bool truncated();
char *params();
size_t paramsCap();
void close();
}
```

| Función | Qué hace |
|---|---|
| `call` | Hace la consulta. `paramsJson` es el JSON de los parámetros, o `nullptr` si el método no lleva. Devuelve `false` si no hubo una respuesta válida del nodo. |
| `body` | La respuesta de la última consulta. |
| `truncated` | `true` si la respuesta no cupo entera en el búfer. |
| `params`, `paramsCap` | Un búfer de 3 KB para armar los parámetros de la consulta siguiente, y su tamaño. |
| `close` | Cierra la conexión y libera su memoria, unos 50 KB. |

El uso es siempre el mismo: armar los parámetros, llamar y leer la respuesta con las funciones de
JSON del núcleo.

```cpp
snprintf(stellar_rpc::params(), stellar_rpc::paramsCap(), "{\"hash\":\"%s\"}", hash_hex);
if (stellar_rpc::call("getTransaction", stellar_rpc::params())) {
  size_t n = 0;
  const char *status = stl_json_string(stellar_rpc::body(), "status", &n);
}
```

Al abrir la conexión, el cliente deja una línea en el monitor serie:

```text
Node soroban-testnet.stellar.org: secure connection open in 2115 ms
```

## Configuración

El nodo se elige al compilar. Sin nada, es el de testnet:

```ini
build_flags = -DSTELLAR_RPC_HOST=\"mi-nodo.example.com\"
```

El cliente comprueba el certificado del nodo contra la raíz guardada en `root_ca.h`. La que viene
es «USERTrust RSA Certification Authority», la del nodo de testnet de la Stellar Development
Foundation. Otro proveedor puede necesitar otra raíz.

Para mainnet hace falta un proveedor de nodos: la lista está en
[RPC Providers](https://developers.stellar.org/docs/data/apis/rpc/providers).

## La conexión

| Qué | Medida en un ESP32-S3 |
|---|---|
| Abrir la conexión segura | 2,1 a 3,7 segundos |
| Una consulta con la conexión ya abierta | 0,2 a 0,5 segundos |
| Memoria mientras la conexión está abierta | 49 KB, con un pico de 64 KB al abrirla |

El cliente deja la conexión abierta entre consultas. Si se cayó, la reabre y repite la consulta
una vez. Llama a `stellar_rpc::close()` cuando el aparato no vaya a consultar por un rato y
necesite esa memoria.

## Los métodos que usa el SDK

Son seis. El tamaño es el del cuerpo de la respuesta.

| Método | Para qué | Respuesta |
|---|---|---|
| `getHealth` | El último ledger y su hora de cierre | 205 bytes |
| `getLedgerEntries` | La secuencia y el saldo de una cuenta | 310 a 382 bytes |
| `simulateTransaction` | Los recursos de una llamada a contrato | 2,3 KB para un `transfer` |
| `sendTransaction` | Enviar la transacción firmada | 188 bytes |
| `getTransaction` | Saber si entró | 328 bytes si todavía no está; 2,9 KB un pago; 9,3 KB un `transfer` |
| `getEvents` | Los pagos que llegaron | 0,8 KB un evento; 1,4 KB dos |

La respuesta de `getTransaction` de una llamada a contrato no cabe en el búfer de 6 KB. No hace
falta: el campo `status` viene al principio.

:::caution[No uses getLatestLedger]
Su respuesta pesa unos 600 KB. `getHealth` trae el último ledger y su hora en 205 bytes.
:::
