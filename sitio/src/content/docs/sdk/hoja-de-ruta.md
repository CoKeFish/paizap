---
title: Hoja de ruta
description: Qué hace el SDK hoy y qué sigue.
---

## Hoy

Probado en un ESP32-S3 contra Stellar testnet:

- Direcciones (`G…`, `C…`, `S…`) y montos sin coma flotante.
- Pago de XLM o de un activo emitido, con memo.
- `transfer` y `transfer_from` en el contrato del token, con simulación y tope de comisión.
- La autorización de la llamada, armada por el aparato.
- La dirección del contrato del token, calculada en el aparato.
- Detección de pagos por eventos, con monto y memo.
- Pedido de pago SEP-7.
- Cliente del nodo para ESP32: conexión segura con certificado comprobado y conexión reutilizada.
- 23 de 23 comprobaciones en el PC; 16 comparan byte a byte con el SDK oficial de JavaScript.
- Dos ejemplos: un pago con su confirmación, y un aparato autónomo que cobra, ve llegar el pago y
  paga.
- Un terminal con tarjeta NFC, la demo de Paizap, que firma sus cobros con el SDK.

## Lo que sigue

Del 23 de noviembre al 22 de diciembre de 2026:

| Semana | Qué | Meta |
|---|---|---|
| 1 (23 al 29 nov) | Dejar la librería lista para un tercero: guía de inicio y los dos ejemplos. | Una persona ajena al equipo compila un ejemplo y paga en testnet siguiendo solo la guía. |
| 2 (30 nov al 6 dic) | Llevar el mismo núcleo a un segundo microcontrolador, el RP2040 con su chip de Wi-Fi. Empezar la postulación a Stellar Instawards. | El mismo ejemplo de pago corre en 2 microcontroladores. |
| 3 (7 al 13 dic) | Una característica nueva: el cobro con número de pedido. El aparato espera el pago de otra persona y lo reconoce por su memo. | Ejemplo publicado y probado en testnet. |
| 4 (14 al 22 dic) | Enviar la postulación a Stellar Instawards y compartir la librería con desarrolladores de Stellar. | Postulación enviada; 3 desarrolladores externos la compilan y dejan sus comentarios en el repositorio. |

## Más adelante

- **Una entrada única al SDK:** iniciar, pedir un cobro, vigilarlo y pagar en pocas llamadas, sin
  armar las consultas a mano.
- **La red como parte del adaptador de cada familia,** para que el mismo programa corra en otro
  microcontrolador cambiando solo el adaptador.
- **STM32 con módulo de red,** y con eso redes 4G.
- **Nodo de respaldo,** para seguir cobrando si un proveedor se cae.
- **Errores con su causa:** mostrar «sin saldo» o «vencida» en vez de «falló».
- **Estado que sobrevive a un corte de luz,** para saber qué pasó con un pago que quedó a medias.
- **QR como módulo opcional,** para mostrar el pedido sin buscar otra librería.
- **La llave en un chip seguro,** para que no se pueda leer de la memoria del microcontrolador.
- **Llamadas a cualquier contrato,** con argumentos simples.
- **Comisión pagada por otra cuenta,** para que el aparato no necesite XLM.

## Cómo seguirlo

El código y los avances están en el [repositorio](https://github.com/CoKeFish/stellar-mcu-sdk). Si
construyes un aparato que cobra, abre un issue ahí y cuenta qué necesitas.
