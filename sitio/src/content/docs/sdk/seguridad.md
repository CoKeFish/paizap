---
title: Seguridad
description: Qué protege la firma, en qué confía el aparato y cómo se acota lo que puede salir mal.
---

Un aparato que cobra y paga solo tiene que cuidarse de dos cosas: de quien le responde por la red
y de quien lo tiene en la mano.

## Lo que la firma protege

La firma del aparato cubre **la red, el destino, el monto y la secuencia**. Por eso un nodo, por
más que mienta, **no puede**:

- mover fondos de la cuenta del aparato,
- cambiar el destino o el monto de un pago,
- reusar una firma en otra red.

En la prueba, lo que firmó la placa coincidió byte a byte con lo que arma el SDK oficial.

## En qué confía el aparato

El aparato confía en dos cosas:

1. **Que habla con el nodo que tiene configurado.** Lo garantiza la conexión segura: el cliente
   comprueba el certificado del nodo contra una raíz guardada en la placa.
2. **Que ese nodo dice la verdad** sobre la cuenta, la simulación, el estado de una transacción y
   los eventos.

## Si el nodo miente

| Si el nodo… | Qué pasaría | Cómo se acota |
|---|---|---|
| Dice que llegó un pago que no llegó | Se entrega sin cobrar | Para montos altos, pedir que dos proveedores coincidan |
| Devuelve un evento de otro token con el mismo nombre | Se aceptaría un token falso | Filtrar siempre por la dirección del contrato, calculada en el aparato |
| Repite un evento viejo | Un pago cerraría dos ventas | Recordar el último evento visto y mirar solo desde el ledger del pedido |
| Pide una comisión inflada | Se pierde plata en comisiones | Tope de comisión en el aparato |
| Propone una autorización distinta | Se firmarían llamadas no pedidas | La autorización la arma el aparato |
| Dice que el pago falló cuando sí entró | Riesgo de pagar dos veces | Reenviar la misma transacción: solo una puede entrar |
| No responde | El pago no sale | Tratarlo como «sin confirmar», nunca como «pagado» |

## Lo que hace el aparato y nadie más

- **Guarda la llave y firma.** Si firmara otro, ya habría un servidor en el medio.
- **Arma la transacción completa.** Firma lo que él construyó, nunca algo que le entregan.
- **Comprueba destino, activo, monto y red.** Son las cuatro cosas que definen un pago.
- **Pone los topes** de comisión y de monto.

## Vigencia corta

Cada transacción vale uno o dos minutos. Eso resuelve el caso más incómodo, el pago «sin
confirmar»: o entra esa transacción, o vence y no entra nunca. Mientras esté vigente se puede
reenviar sin riesgo, porque la red acepta una sola transacción por cada secuencia de la cuenta.

## Topes en el aparato

Los topes son la defensa que no depende de nadie más. Si alguien toma el aparato o le miente por
la red, acotan lo que se puede perder.

- **Tope de comisión:** el aparato no firma si le piden más. El terminal de la demo lo trae.
- **Monto máximo por pago,** y un total por día.
- **Lista de destinos:** el aparato solo le paga a las cuentas que conoce. El terminal de la demo
  solo cobra para la cuenta de su comercio.

## La llave

La llave vive en la placa. Para cuidarla, ver [La llave del aparato](../guias/llave/#cuidar-la-llave).

Una firma Ed25519 no usa números aleatorios: el generador aleatorio solo hace falta una vez, al
crear la llave.
