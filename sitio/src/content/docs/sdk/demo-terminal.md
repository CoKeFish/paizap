---
title: "Demo: un terminal en un aparato real"
description: Un terminal de demostración, hecho con el SDK, lee una tarjeta NFC y firma el cobro él mismo.
sidebar:
  label: "Demo: el terminal"
---

El primer aparato hecho con el SDK es un terminal de cobro que [Paizap](../../) armó como
demostración: quien paga acerca una tarjeta NFC y el terminal **firma el cobro él mismo** y lo
envía a Stellar. Ningún servidor firma por él.

Muestra lo que se puede construir con el SDK. En la [demo](../../demo/) hay un simulador para ver
el mismo cobro en un torniquete, un dispensador y una caja, sin tener el aparato.

## Qué es

Un microcontrolador ESP32-S3 con un lector NFC, una pantalla, un teclado y un relé.

- **En una caja,** el vendedor escribe el monto y el cliente acerca la tarjeta.
- **En una máquina,** el precio es fijo y, al cobrar, el relé la activa.

La plata sale de la cuenta del dueño de la tarjeta. Ese dueño firmó antes un **tope de gasto**: un
permiso para cobrarle hasta cierto monto, que la red hace cumplir.

## Qué hace el terminal con el SDK

1. Lee la tarjeta y le pregunta al servidor de la demo de qué cuenta es.
2. Le pide a la red la hora y la secuencia de su cuenta.
3. Arma el `transfer_from` del permiso de gasto y lo simula.
4. Comprueba que el costo no pase de su tope, firma y envía.
5. Espera la confirmación de la red y recién entonces da el pago por aprobado.

Es lo que explica [Llamar al contrato del token](../guias/contrato-de-token/).

## Un cobro, en el monitor serie

Esto imprimió el terminal en un cobro de 1,5, en testnet:

```text
--- Tarjeta leída ---
Nodo soroban-testnet.stellar.org: conexion segura abierta en 2115 ms
Nodo: getHealth -> 200, 205 bytes, 2523 ms
Nodo: getLedgerEntries -> 200, 310 bytes, 204 ms
Nodo: simulateTransaction -> 200, 3841 bytes, 313 ms
Cobro firmado por el terminal: tx 9a0b9c10a2e2bf430e0782f347be0da91bca52d1b5ba5c85b4d80a04f325285a (comision hasta 13907 stroops)
Nodo: sendTransaction -> 200, 188 bytes, 293 ms
Nodo: getTransaction -> 200, 328 bytes, 232 ms
Nodo: getTransaction -> 200, 328 bytes, 224 ms
Nodo: getTransaction -> 200, 6143 bytes, 552 ms (cortada)
Cobro confirmado por la red en 7350 ms
```

La transacción está en la red:
[9a0b9c10…f325285a](https://stellar.expert/explorer/testnet/tx/9a0b9c10a2e2bf430e0782f347be0da91bca52d1b5ba5c85b4d80a04f325285a).

Fue el primero de seis cobros firmados por el terminal en testnet, tres de ellos con tarjeta
física. El último con tarjeta es
[6f2127eb…ffcd3f46](https://stellar.expert/explorer/testnet/tx/6f2127ebd08855e3b83446a301e966da843d5f2ae21cae5bb7edba8dffcd3f46).

## Lo que se midió

| Qué | Resultado |
|---|---|
| De la tarjeta al «aprobado», con la conexión al nodo sin abrir | 9,4 s |
| Lo mismo, con la conexión ya abierta | unos 7 s |
| Quién firmó, leído de la red | La cuenta del terminal. Una sola firma. |
| Comisión que cobró la red | 9.110 stroops |
| Terminal sin autorización en la red | La red rechazó el cobro |
| Lo que el SDK le sumó al firmware | 23,5 KB de flash |

## Cómo se autoriza al terminal

La llave del terminal se agrega como firmante de la cuenta que tiene los permisos de gasto. Con
eso el terminal puede firmar los cobros. No puede cambiar los firmantes de la cuenta.

## Lo que acompaña al terminal

La demo trae además lo que usan las personas:

- **Una billetera** para el dueño de la tarjeta, en web y Android: recarga, firma su tope de
  gasto, vincula tarjetas, las bloquea y ve sus pagos.
- **Un panel** para el comercio, con las ventas del día a medida que llegan.
- **Pago con QR:** el terminal muestra un código y se paga desde el celular.

## El código

Todo está en el [repositorio de Paizap](https://github.com/CoKeFish/paizap):

| Carpeta | Qué hay |
|---|---|
| `hardware/` | La electrónica y el firmware del terminal. |
| `servidor/` | El servidor de la demo: de qué cuenta es cada tarjeta, límites y recibos. |
| `app/` | La billetera y el panel. |
