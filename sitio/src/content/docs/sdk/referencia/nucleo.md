---
title: Núcleo
description: Cada función de stellar_mcu.h, con lo que recibe y lo que devuelve.
---

El núcleo está en `src/stellar_mcu.h` y `src/stellar_mcu.c`. Es C99, se puede incluir desde C++ y
no reserva memoria: todos los búferes los pasas tú.

Las direcciones y las llaves se manejan como **32 bytes**; el texto (`G…`, `C…`, `S…`) solo
aparece al leerlas o mostrarlas.

## Lo que aporta el microcontrolador

```c
typedef struct {
  void (*sha256)(const uint8_t *data, size_t n, uint8_t out[32]);
  void (*sign)(const uint8_t seed[32], const uint8_t public_key[32],
               const uint8_t *message, size_t n, uint8_t signature[64]);
} stl_crypto;
```

Las funciones que necesitan criptografía reciben un `stl_crypto`. `sign` hace una firma Ed25519;
un programa que no firma puede dejarla en `NULL`.

## Direcciones

```c
#define STL_ADDR_ACCOUNT  0x30  // G...
#define STL_ADDR_SEED     0x90  // S...
#define STL_ADDR_CONTRACT 0x10  // C...

bool stl_addr_encode(uint8_t type, const uint8_t data[32], char out[57]);
bool stl_addr_decode(const char *text, uint8_t type, uint8_t data[32]);
```

| Función | Qué hace |
|---|---|
| `stl_addr_encode` | Escribe los 32 bytes como texto de 56 letras, con su verificación. `out` necesita 57 bytes. |
| `stl_addr_decode` | Lee el texto. Devuelve `false` si no tiene 56 letras, si no es del `type` pedido o si la verificación no coincide. |

## Montos

```c
bool   stl_amount_parse(const char *text, int64_t *units);
size_t stl_amount_format(int64_t units, char *out, size_t cap);
```

Un monto son unidades mínimas: 1 son 10.000.000 unidades (7 decimales).

| Función | Qué hace |
|---|---|
| `stl_amount_parse` | `"12.5"` → `125000000`. Sin coma flotante. Acepta dígitos y un punto, hasta 7 decimales; cualquier otra cosa devuelve `false`. |
| `stl_amount_format` | `125000000` → `"12.5"`, sin ceros de más. Devuelve el largo, o 0 si no cupo. |

## Activos

```c
typedef struct {
  bool native;        // true = XLM
  char code[13];      // up to 12 characters
  uint8_t issuer[32];
} stl_asset;

void stl_asset_contract(const stl_crypto *c, const uint8_t network_id[32],
                        const stl_asset *a, uint8_t contract[32]);
```

`stl_asset_contract` calcula la dirección del contrato del token de un activo en una red.
`network_id` es el SHA-256 del nombre de la red. Donde una función recibe un `stl_asset *`, `NULL`
significa XLM.

## Transacciones

```c
typedef struct {
  uint8_t source[32];    // the account that pays the fee and provides the sequence number
  uint32_t fee;          // total, in stroops
  int64_t sequence;      // the account's sequence number plus one
  uint64_t valid_until;  // Unix time; 0 = no limit
  bool has_memo;
  uint64_t memo;         // numeric memo
  bool has_op_source;    // the operation is made on behalf of another account
  uint8_t op_source[32];
} stl_tx;

typedef struct {
  const uint8_t *contract;     // 32 bytes
  const char *function;        // "transfer" or "transfer_from"
  const uint8_t *accounts[3];  // in the order of the arguments
  uint8_t n_accounts;
  int64_t amount;
} stl_token_call;
```

```c
void stl_tx_begin(stl_xdr *x, uint8_t *buf, size_t cap, const uint8_t network_id[32]);
void stl_tx_payment(stl_xdr *x, const stl_tx *t, const uint8_t destination[32],
                    const stl_asset *a, int64_t amount);
void stl_tx_token_call(stl_xdr *x, const stl_tx *t, const stl_token_call *call,
                       const uint8_t *soroban_data, size_t soroban_data_len);
void stl_token_auth(stl_xdr *x, const stl_token_call *call);
void stl_tx_sign(stl_xdr *x, const stl_crypto *c, const uint8_t seed[32],
                 const uint8_t public_key[32], uint8_t hash[32]);
void stl_tx_unsigned(stl_xdr *x);
const uint8_t *stl_tx_envelope(const stl_xdr *x);
size_t         stl_tx_envelope_len(const stl_xdr *x);
```

| Función | Qué hace |
|---|---|
| `stl_tx_begin` | Prepara el búfer para una transacción de esa red. Siempre va primero. |
| `stl_tx_payment` | Escribe un pago de `amount` a `destination`. `a` es el activo; `NULL` es XLM. |
| `stl_tx_token_call` | Escribe una llamada al contrato del token. Con `soroban_data` en `NULL` arma la transacción que se manda a simular; con los datos que devolvió la simulación, la que se firma. |
| `stl_token_auth` | Escribe la autorización que necesita esa llamada, para compararla con la que propone el nodo. `stl_tx_token_call` ya la incluye. |
| `stl_tx_sign` | Firma la transacción y le agrega la firma. Deja en `hash` el identificador de la transacción. |
| `stl_tx_unsigned` | Cierra la transacción sin firmas. Es la que se manda a simular. |
| `stl_tx_envelope`, `stl_tx_envelope_len` | Dónde empieza el sobre listo para enviar y cuántos bytes tiene. Se manda en base64. |

El orden es siempre el mismo: `stl_tx_begin`, después `stl_tx_payment` o `stl_tx_token_call`, y al
final `stl_tx_sign` o `stl_tx_unsigned`.

Si el búfer queda chico, la transacción no se escribe entera y el campo `overflow` del `stl_xdr`
queda en `true`: compruébalo antes de enviar.

| Transacción | Bytes del sobre |
|---|---|
| Pago firmado | 224 |
| `transfer` firmado | 668 |
| `transfer_from` firmado | reserva 2 KB |

## Consultas al nodo

```c
size_t stl_account_key(uint8_t out[40], const uint8_t account[32]);
bool   stl_account_parse(const uint8_t *in, size_t n, int64_t *balance, int64_t *sequence);
size_t stl_scval_symbol(uint8_t *out, size_t cap, const char *symbol);
size_t stl_scval_account(uint8_t out[44], const uint8_t account[32]);
bool   stl_event_amount(const uint8_t *value, size_t n, int64_t *amount,
                        bool *has_memo, uint64_t *memo);
```

| Función | Qué hace |
|---|---|
| `stl_account_key` | La clave con la que se pide una cuenta en `getLedgerEntries`. Se manda en base64. |
| `stl_account_parse` | Lee de la respuesta el saldo en XLM (en unidades mínimas) y la secuencia de la cuenta. |
| `stl_scval_symbol` | Un nombre, como `transfer`, en el formato de los filtros de `getEvents`. |
| `stl_scval_account` | Una cuenta en el formato de los filtros de `getEvents`. |
| `stl_event_amount` | Lee el monto de un evento `transfer`, en sus dos formatos. Si el evento trae memo, lo deja en `memo` y pone `has_memo` en `true`. |

## base64

```c
size_t stl_b64_encode(const uint8_t *in, size_t n, char *out, size_t cap);
int    stl_b64_decode(const char *in, size_t n, uint8_t *out, size_t cap);
```

El nodo manda y recibe los datos en base64. `stl_b64_encode` devuelve el largo del texto, o 0 si
no cupo. `stl_b64_decode` devuelve cuántos bytes salieron, o −1 si el texto no es válido o no cupo.

## JSON

```c
const char *stl_json_string(const char *json, const char *key, size_t *n);
bool        stl_json_int(const char *json, const char *key, int64_t *value);
```

Buscan la primera vez que aparece `"key":` en un texto ya recibido.

| Función | Qué hace |
|---|---|
| `stl_json_string` | Devuelve dónde empieza el texto de ese campo y deja su largo en `n`. `NULL` si no está o no es un texto. |
| `stl_json_int` | Lee un número, venga con comillas o sin ellas. |

Para leer un campo de un elemento de una lista, como un evento, pasa el texto desde donde empieza
ese elemento.

## Pedido de pago

```c
size_t stl_sep7_pay(char *out, size_t cap, const uint8_t destination[32], int64_t amount,
                    const stl_asset *a, bool has_memo, uint64_t memo);
```

Arma el pedido SEP-7 `web+stellar:pay?…`. Devuelve el largo del texto, o 0 si no cupo. Ver
[Cobrar con un pedido](../../guias/cobrar/).
