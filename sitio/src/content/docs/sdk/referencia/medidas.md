---
title: Medidas
description: Cuánto ocupa el SDK y cuánto tarda, medido en un ESP32-S3 contra Stellar testnet.
---

Todo lo de esta página se midió en el ESP32-S3 del terminal de la demo, el 21 de noviembre de 2026.

**Condiciones:** ESP32-S3 (N16R8, 240 MHz) con Arduino-ESP32 2.0.17. Wi-Fi de 2,4 GHz con señal de
−48 a −52 dBm. Nodo `soroban-testnet.stellar.org`. Dos corridas completas.

## Lo que hizo el microcontrolador solo

| Paso | Resultado |
|---|---|
| Comparación con el SDK oficial de JavaScript 17.4.0 | 18 de 18 iguales, byte a byte. Hoy las pruebas del PC hacen 20 comparaciones, las 20 iguales |
| Crear su llave y guardarla | Con el generador aleatorio del chip |
| Pago de XLM con memo | Armar y firmar: 7,1 ms. De enviar a confirmado: 6,2 s y 2,8 s |
| Detectar ese pago con `getEvents` | Una consulta, 0,3 s. Monto y memo correctos |
| `transfer` en el contrato del token | Simular: 0,3 s y 1,2 s. Armar y firmar: 7,2 ms. De enviar a confirmado: 6,1 s y 3,2 s |
| Autorización de la llamada | La que armó el microcontrolador fue idéntica a la que propuso el nodo |
| Hora para la vigencia | Tomada del nodo: el microcontrolador no usó reloj propio |

Las transacciones de la prueba, en testnet:
[pago 1](https://stellar.expert/explorer/testnet/tx/ca284b2c462693e4b2b6cbf0169b1732d9f165d4fdfa5efa0cf512975c0d0569),
[transfer 1](https://stellar.expert/explorer/testnet/tx/65894777de6cc74e886a70964700e123918b67fce4538dfe64441eda9fee8e06),
[pago 2](https://stellar.expert/explorer/testnet/tx/0c2f862416b1ad1e19855512033d39a71be66a0f94dd97529ca59a0f799e15bc),
[transfer 2](https://stellar.expert/explorer/testnet/tx/2d689ac7811820db81f3e4bb7213a17f77960ec609c34a068d7f080a32003666).

## Tamaño en flash

| Parte | Flash | RAM fija |
|---|---|---|
| **Núcleo completo** | **3.352 bytes** | 0 |
| · direcciones | 520 | |
| · base64 | 362 | |
| · escritor XDR | 160 | |
| · transacciones: pago, `transfer`, autorización, firma, contrato del activo | 903 | |
| · consultas y eventos | 693 | |
| · JSON | 291 | |
| · pedido de pago y montos | 423 | |
| **Firma Ed25519** (Monocypher, con SHA-512) | **18.296 bytes** | 0 |

A eso se suma lo que ya trae cualquier programa con Wi-Fi y HTTPS en este microcontrolador: unos 840 KB de
flash y 43 KB de RAM.

## Criptografía

| Operación | Monocypher 4.0.2 | libsodium |
|---|---|---|
| Llave pública desde la semilla | 6,2 ms | 5,4 ms |
| Firmar | 6,5 ms | 6,9 ms |
| Verificar una firma | 19,3 ms | 16,0 ms |
| Flash que ocupa | **18,3 KB** | 121 KB |

Las dos dan la misma firma. Armar y firmar un pago completo tarda 7 ms y usa 1,6 KB de pila.

## Memoria

| Momento | RAM libre | Qué consumió |
|---|---|---|
| Arranque | 276 KB | |
| Con Wi-Fi conectado | 223 KB | Wi-Fi: 53 KB |
| Con la conexión segura abierta | 174 KB | Conexión: 49 KB, con un pico de 64 KB al abrirla |

La tarea que hizo todo usó entre 4,5 y 5,8 KB de pila.

## Red

| Qué | Medida |
|---|---|
| Conectar al Wi-Fi | 2,4 s y 7,0 s |
| Abrir la conexión segura | 2,1 s, 2,7 s y 3,7 s |
| Una consulta con la conexión ya abierta | 0,2 a 0,5 s |

El tamaño de cada respuesta está en [Cliente del nodo](../nodo/#los-métodos-que-usa-el-sdk).

## Comisiones

| Transacción | Lo que cobró la red |
|---|---|
| Pago común | 100 stroops |
| `transfer` en el contrato del token | 6.942 stroops |
| `transfer_from` del terminal de la demo | 9.110 stroops |

Un stroop es una diezmillonésima de XLM.
