---
title: Hoja de ruta
description: Qué hace el SDK hoy y qué sigue.
---

## Hoy

Probado en el primer microcontrolador, un ESP32-S3, contra Stellar testnet:

- Direcciones (`G…`, `C…`, `S…`) y montos sin coma flotante.
- Pago de XLM, con memo.
- `transfer` y `transfer_from` en el contrato del token de XLM, con simulación y tope de comisión.
- La autorización de la llamada, armada por el aparato.
- La dirección del contrato del token, calculada en el aparato.
- Detección de pagos por eventos, con monto y memo.
- Cliente del nodo para el primer microcontrolador, el ESP32: conexión segura con certificado
  comprobado y conexión reutilizada.
- Dos ejemplos: un pago con su confirmación, y un aparato autónomo que cobra, ve llegar el pago y
  paga.
- Un terminal con tarjeta NFC, la demo de Paizap, que firma sus cobros con el SDK.

Comprobado en el PC:

- 23 de 23 comprobaciones; 16 comparan byte a byte con el SDK oficial de JavaScript.
- El pago de un activo emitido (USDC) y la dirección de su contrato.
- El pedido de pago SEP-7.

## Lo que sigue

Del 23 de noviembre al 22 de diciembre de 2026:

| Semana | Qué | Meta |
|---|---|---|
| 1 (23 al 29 nov) | Publicar la librería en los registros de Arduino y PlatformIO, con su primera versión numerada. | Versión 0.1 instalable desde los dos registros. |
| 2 (30 nov al 6 dic) | Llevar el mismo núcleo a un segundo microcontrolador, el RP2040 con su chip de Wi-Fi. | El mismo ejemplo de pago corre en 2 microcontroladores. |
| 3 (7 al 13 dic) | Los estándares de Stellar que faltan: [SEP-29](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0029.md) (comprobar si la cuenta de destino exige memo antes de pagar), las cuentas multiplexadas de [SEP-23](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0023.md) y más funciones de [SEP-41](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md): `balance`, `approve` y `allowance`. | Cada estándar, con su comprobación contra el SDK oficial de JavaScript. |
| 4 (14 al 22 dic) | Una funcionalidad nueva: el dispositivo paga en USDC de testnet con una llamada al contrato del token. Enviar la postulación a Stellar Instawards, por medio del capítulo local de embajadores. | Ejemplo publicado y probado en testnet, con su transacción enlazada. Postulación enviada. |

Dos cosas que estaban en este plan ya están publicadas: la [guía de inicio](../inicio-rapido/) y el
[ejemplo que cobra con número de pedido](https://github.com/CoKeFish/stellar-mcu-sdk/tree/main/examples/esp32_standalone_device).

- **Costo del mes:** el tiempo de los dos y el hardware para probar el segundo microcontrolador:
  una placa con RP2040 y Wi-Fi cuesta [USD 6](https://www.raspberrypi.com/news/raspberry-pi-pico-w-your-6-iot-platform/).
- **Con qué se financia lo que sigue:** [Stellar Instawards](https://stellar.org/blog/ecosystem/introducing-the-stellar-ambassador-program),
  premios de hasta USD 15.000 para experimentar y hacer prototipos, que se piden por medio de los
  capítulos de embajadores de Stellar.
- **Clientes que buscamos:** integradores y fabricantes de dispositivos IoT que cobran:
  torniquetes, dispensadores de agua, máquinas expendedoras y lavanderías.
- **Regla para seguir:** librería funcionando en 2 microcontroladores y postulación enviada.

## Más adelante

- **Una entrada única al SDK:** iniciar, pedir un cobro, vigilarlo y pagar en pocas llamadas, sin
  armar las consultas a mano.
- **La red como parte de lo que aporta cada familia,** para que el mismo programa corra en otro
  microcontrolador cambiando solo esa parte.
- **STM32 con módulo de red,** y con eso redes 4G.
- **Nodo de respaldo,** para seguir cobrando si un proveedor se cae.
- **Errores con su causa:** mostrar «sin saldo» o «vencida» en vez de «falló».
- **Estado que sobrevive a un corte de luz,** para saber qué pasó con un pago que quedó a medias.
- **QR como módulo opcional,** para mostrar el pedido sin buscar otra librería.
- **Soporte para un chip seguro,** que guarde la llave del aparato.
- **Llamadas a cualquier contrato,** con argumentos simples.
- **Comisión pagada por otra cuenta,** para que el aparato no necesite XLM.

## Cómo seguirlo

El código y los avances están en el [repositorio](https://github.com/CoKeFish/stellar-mcu-sdk). Si
construyes un aparato que cobra, abre un issue ahí y cuenta qué necesitas.
