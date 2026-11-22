---
title: Cobrar con un pedido
description: Armar el pedido de pago que entienden las billeteras y mostrarlo como QR.
---

Para cobrar, el aparato arma un **pedido de pago**: a quién, cuánto, en qué activo y con qué memo.
El pedido es un texto en el formato [SEP-7](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md),
que las billeteras de Stellar saben leer. Se muestra como un código QR; quien paga lo escanea y
confirma en su billetera.

## Armar el pedido

```cpp
uint8_t destination[32];  // the merchant's account
int64_t units;
char request[256];

stl_addr_decode("GAPT3IMGXHKXAKM4NLWM6FA7EJMCZYQH6BNBWFEB7F7R7K24KXCPBMDY", STL_ADDR_ACCOUNT, destination);
stl_amount_parse("2.5", &units);
size_t n = stl_sep7_pay(request, sizeof request, destination, units, NULL, true, 77);
```

`request` queda así, con 121 letras:

```text
web+stellar:pay?destination=GAPT3IMGXHKXAKM4NLWM6FA7EJMCZYQH6BNBWFEB7F7R7K24KXCPBMDY&amount=2.5&memo=77&memo_type=MEMO_ID
```

| Parámetro | Qué es |
|---|---|
| `destination` | La cuenta que cobra. |
| `amount` | En unidades mínimas; `stl_amount_parse` lo pasa desde el texto. |
| `a` | El activo: `NULL` para XLM. Con un `stl_asset`, el pedido lleva el código y el emisor. |
| `has_memo`, `memo` | El número de este cobro. |

La función devuelve el largo del texto, o 0 si no cupo en el búfer. El pedido está entre las
comprobaciones del PC. Un pedido ocupa entre 95 y 209
letras, según lleve activo y memo.

## Un memo por cobro

Pon en cada pedido un memo distinto: un contador que se guarda en el microcontrolador alcanza. Cuando llega
un pago con ese memo, es el de esa venta, aunque otro cliente pague el mismo monto en el mismo
momento. Ver [Confirmar un pago](../confirmar/).

## Mostrarlo como QR

El SDK arma el texto; el QR lo dibuja una librería de QR sobre tu pantalla. En el terminal de la
demo de Paizap se usa [ricmoo/QRCode](https://github.com/ricmoo/QRCode).

Cuanto más largo el texto, más grande el QR. En una pantalla OLED de 128 × 64 conviene mostrar
un enlace corto que lleve al pedido: es lo que hace el terminal de la demo.

## Después de mostrarlo

Anota el ledger en que creaste el pedido (`latestLedger` de `getHealth`) y empieza a vigilar los
pagos desde ahí. El cobro termina de una de dos formas:

- **Llega el pago** con el memo del pedido y el monto correcto: se entrega.
- **Pasa el tiempo** que le diste al cobro: se cancela y, si alguien vuelve a pedirlo, se arma un
  pedido nuevo con otro memo.
