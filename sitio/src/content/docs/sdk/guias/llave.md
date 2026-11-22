---
title: La llave del aparato
description: Crear la llave en la placa, guardarla, conocer su cuenta y darle fondos.
---

Un aparato que paga o firma necesita su propia llave. De la llave sale su cuenta de Stellar. La
llave se queda en la placa: el SDK firma con ella y nunca la manda a ningún lado.

Un aparato que solo [confirma pagos](../confirmar/) no necesita llave.

## Crear la llave en la placa

La llave es una semilla de 32 bytes. Lo mejor es que nazca en la placa, con el generador aleatorio
del chip, y que nunca pase por un PC:

```cpp
// The device's key: created once with the chip's random generator and stored.
Preferences store;
store.begin("stellar-mcu", false);
if (store.getBytes("seed", g_seed, 32) != 32) {
  esp_fill_random(g_seed, 32);  // with Wi-Fi on, the chip delivers true randomness
  store.putBytes("seed", g_seed, 32);
}
store.end();
```

En la ESP32, crea la llave **después de conectar el Wi-Fi**: con el radio encendido el generador
del chip entrega aleatoriedad real.

## De la llave a la cuenta

La llave pública se calcula desde la semilla, y la cuenta es esa llave pública escrita como `G…`:

```cpp
uint8_t copy[32], key[64];
memcpy(copy, g_seed, 32);  // Monocypher wipes the seed it receives
crypto_ed25519_key_pair(key, g_public, copy);
crypto_wipe(key, sizeof key);

char account[57];
stl_addr_encode(STL_ADDR_ACCOUNT, g_public, account);  // G...
```

## Usar una llave creada fuera

Si la llave se crea al fabricar el aparato, se carga desde su texto `S…`:

```cpp
if (!stl_addr_decode("S...", STL_ADDR_SEED, g_seed)) {
  // not a valid key
}
```

`stl_addr_decode` comprueba el formato y la verificación del texto: una letra cambiada lo
invalida.

## Darle fondos a la cuenta

La cuenta existe en la red recién cuando recibe fondos. Hasta entonces, leerla con
`getLedgerEntries` no devuelve nada.

- **En testnet,** friendbot la crea con 10.000 XLM de prueba:
  `https://friendbot.stellar.org/?addr=<cuenta>`.
- **En mainnet,** la crea un primer pago en XLM desde otra cuenta.

El aparato paga con su cuenta la comisión de cada transacción que envía: 100 stroops por un pago
común y algo más por una llamada a contrato.

## Cuidar la llave

- **Bórrala de la memoria de trabajo** cuando termines de usarla. Monocypher trae `crypto_wipe`
  para eso.
- **Grabar la placa con una imagen completa borra lo guardado,** y con eso la llave. Para
  actualizar el programa sin perderla, graba solo la aplicación.
- **Pon topes en el aparato:** un monto máximo por pago y un tope de comisión. Acotan lo que se
  puede perder si alguien toma el aparato. Ver [Seguridad](../../seguridad/).
- **En la ESP32,** el guardado se puede cifrar con una llave grabada en el propio chip
  ([NVS encryption](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/storage/nvs_encryption.html)).
