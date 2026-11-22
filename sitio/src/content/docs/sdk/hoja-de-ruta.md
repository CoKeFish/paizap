---
title: Hoja de ruta
description: Qué hace el SDK hoy y qué sigue.
---

## Hoy

Probado en una ESP32-S3 contra Stellar testnet:

- Direcciones (`G…`, `C…`, `S…`) y montos sin coma flotante.
- Pago de XLM o de un activo emitido, con memo.
- `transfer` y `transfer_from` en el contrato del token, con simulación y tope de comisión.
- La autorización de la llamada, armada por el aparato.
- La dirección del contrato del token, calculada en el aparato.
- Detección de pagos por eventos, con monto y memo.
- Pedido de pago SEP-7.
- Cliente del nodo para ESP32: conexión segura con certificado comprobado y conexión reutilizada.
- Comparación contra el SDK oficial de JavaScript: 20 de 20 iguales, byte a byte.
- Un terminal con tarjeta NFC, el de Paizap, que firma sus cobros con el SDK.

## Lo que sigue

| Qué | Para qué |
|---|---|
| **Un segundo ejemplo: un avisador de pagos** | El punto de partida de una alcancía o un dispensador. |
| **Una segunda familia de placas** | Mostrar que el núcleo no depende del chip. |
| **Detección de un pago por su número de pedido** | Cobrar con QR y saber cuál pago es de cuál venta. |
| **Una entrada única al SDK** | Iniciar, pedir un cobro, vigilarlo y pagar en pocas llamadas, sin armar las consultas a mano. |
| **La red como parte del adaptador de cada placa** | Que el mismo programa corra en otra placa cambiando solo el adaptador. |
| **Nodo de respaldo** | Seguir cobrando si un proveedor se cae. |
| **Errores con su causa** | Mostrar «sin saldo» o «vencida» en vez de «falló». |
| **Estado que sobrevive a un corte de luz** | Saber qué pasó con un pago que quedó a medias. |
| **QR como módulo opcional** | Mostrar el pedido sin buscar otra librería. |

## Más adelante

- **STM32 con módulo de red,** y con eso redes 4G.
- **La llave en un chip seguro,** para que no se pueda leer de la memoria de la placa.
- **Llamadas a cualquier contrato,** con argumentos simples.
- **Comisión pagada por otra cuenta,** para que el aparato no necesite XLM.

## Cómo seguirlo

El código y los avances están en el [repositorio](https://github.com/CoKeFish/stellar-mcu-sdk). Si
construyes un aparato que cobra, abre un issue ahí y cuenta qué necesitas.
