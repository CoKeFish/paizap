---
title: Llamar al contrato del token
description: transfer y transfer_from desde el aparato, con simulación, tope de comisión y autorización propia.
---

Los activos de Stellar tienen un contrato de token con la interfaz
[SEP-41](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md). Llamarlo
desde el aparato sirve para dos cosas:

- **`transfer`**: pagar de una cuenta a otra con el mismo código para cualquier activo.
- **`transfer_from`**: cobrar de una cuenta que antes dio un **permiso de gasto**. Es lo que hace
  el [terminal de Paizap](../../demo-terminal/): cobra de la cuenta del dueño de la tarjeta, hasta
  el tope que ese dueño firmó.

Una llamada a contrato tiene un paso más que un pago común: antes de firmar se **simula**, para
saber qué recursos de la red necesita.

## La llamada

```cpp
// transfer_from(spender, from, to, amount)
stl_token_call call = {contract, "transfer_from", {spender, customer, merchant}, 3, units};

// transfer(from, to, amount)
stl_token_call payment = {contract, "transfer", {payer, destination}, 2, units};
```

Las cuentas (`G…`, como 32 bytes) van en el orden de los argumentos de la función, y el monto al
final.

## 1. Simular

Se arma la transacción sin recursos y sin firma, y se le pide al nodo que la simule:

```cpp
stl_xdr x;
stl_tx_begin(&x, envelope, sizeof envelope, network_id);
stl_tx_token_call(&x, &t, &call, NULL, 0);
stl_tx_unsigned(&x);
stl_b64_encode(stl_tx_envelope(&x), stl_tx_envelope_len(&x), b64, sizeof b64);
snprintf(stellar_rpc::params(), stellar_rpc::paramsCap(), "{\"transaction\":\"%s\"}", b64);
stellar_rpc::call("simulateTransaction", stellar_rpc::params());
```

De la respuesta salen dos cosas: los recursos (`transactionData`) y lo que cuestan
(`minResourceFee`).

```cpp
const char *response = stellar_rpc::body();
int64_t resource_fee = 0;
size_t n = 0;
const char *data = stl_json_string(response, "transactionData", &n);
if (strstr(response, "\"error\"") || !data || !stl_json_int(response, "minResourceFee", &resource_fee)) {
  // The network would not let the call through: no balance, no allowance or an expired one.
}
int data_len = stl_b64_decode(data, n, soroban_data, sizeof soroban_data);
```

Si la simulación trae un error, la llamada no pasaría: no hace falta firmar ni enviar nada.

## 2. El tope de comisión

El aparato no acepta cualquier costo. Compara lo que pide el nodo con un tope propio y, si lo
supera, no firma:

```cpp
if (resource_fee > MAX_FEE) {
  // do not sign
}
t.fee = 100 + (uint32_t)resource_fee;
```

Así un nodo que miente no puede gastar la cuenta en comisiones. En la prueba, el nodo pidió 11.717
stroops de recursos para un `transfer` y la red cobró al final 6.942.

## 3. Armar con los recursos, firmar y enviar

```cpp
uint8_t hash[32];
stl_tx_begin(&x, envelope, sizeof envelope, network_id);
stl_tx_token_call(&x, &t, &call, soroban_data, (size_t)data_len);
stl_tx_sign(&x, &CRYPTO, seed, public_key, hash);
```

Desde aquí es igual que un pago: se envía con `sendTransaction` y se espera con `getTransaction`.
Ver [Pagar](../pagar/#3-enviar).

Una llamada firmada ocupa más que un pago: reserva 2 KB para el sobre y 1 KB para los recursos.

## La autorización la arma el aparato

Una llamada a contrato lleva una autorización que dice qué se permite hacer. El nodo propone una
al simular, pero el aparato **no la usa**: `stl_tx_token_call` arma la suya con la misma llamada
que va a firmar. Así el nodo no puede agregar llamadas que nadie pidió.

En la prueba, la autorización que armó la placa fue idéntica a la que propuso el nodo.

## Cobrar en nombre de otra cuenta

En el cobro con permiso de gasto puede haber dos cuentas del lado de quien cobra: la del aparato,
que firma y paga la comisión, y la que tiene el permiso. La operación se hace en nombre de la
segunda:

```cpp
memcpy(t.source, public_key, 32);    // the device pays the fee with its own account
t.has_op_source = true;              // and acts on behalf of the account that holds the allowance
memcpy(t.op_source, spender, 32);
```

Para que la red acepte esa firma, la llave del aparato tiene que estar registrada como firmante
de esa cuenta.

## Dónde verlo completo

El terminal de Paizap hace este recorrido en cada cobro con tarjeta. Su código está en
`hardware/firmware/src/firma.cpp`, en el [repositorio de Paizap](https://github.com/CoKeFish/paizap).
