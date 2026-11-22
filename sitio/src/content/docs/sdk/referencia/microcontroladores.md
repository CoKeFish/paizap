---
title: Microcontroladores
description: En qué microcontroladores corre el SDK hoy y qué aporta cada familia.
---

El núcleo es el mismo en todos los microcontroladores. Lo que cambia es lo que aporta cada
familia: la red, el guardado de la llave y la firma.

## Hoy

| Microcontrolador | Estado |
|---|---|
| **ESP32-S3** | Probado. Es el del terminal de la demo y donde se tomaron las [medidas](../medidas/). |
| **ESP32** | Mismo código y misma plataforma que el ESP32-S3. |

El ejemplo compila para los dos con PlatformIO (`espressif32@6.9.0`, Arduino).

## Los siguientes

| Familia | Qué prueba |
|---|---|
| **RP2040 y RP2350** | Segunda familia: que el núcleo no depende del chip. |
| **STM32** con módulo de red | Tercera familia, y el camino a redes 4G. |

## Qué aporta cada familia

| | ESP32 / ESP32-S3 | RP2040 / RP2350 | STM32 con módulo |
|---|---|---|---|
| **Red** | Wi-Fi propio con mbedTLS | Wi-Fi con un radio aparte, lwIP y mbedTLS, que trae el pico-sdk | Módulo Wi-Fi o 4G que entrega HTTPS |
| **Guardado** | NVS | Flash externa | Flash interna |
| **Llave** | NVS, que se puede cifrar con una llave grabada en el chip | En RP2350, memoria de un solo uso protegida | Flash interna con protección de lectura |
| **Firma** | Monocypher | Monocypher | Monocypher |

## Llevarlo a otro microcontrolador

El núcleo no incluye ningún archivo del chip. Para un microcontrolador nuevo hacen falta tres cosas:

1. **SHA-256 y firma Ed25519,** para llenar el `stl_crypto`. Monocypher compila en cualquier
   microcontrolador; el SHA-256 puede venir del chip o de una librería.
2. **Una consulta HTTPS** al nodo que deje la respuesta en un búfer: lo que hace `stellar_rpc.cpp`
   en el ESP32.
3. **Dónde guardar la llave** y un generador aleatorio para crearla.

El núcleo compila también en un PC: ahí corren las pruebas, sin microcontrolador.
