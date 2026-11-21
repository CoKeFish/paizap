# Toki

**Paga con un toque.** Toki es un terminal de pago con tarjeta NFC que cobra en dólares digitales
sobre [Stellar](https://stellar.org). El cliente acerca su tarjeta, escribe su PIN y el comercio
recibe el pago en segundos. Sin celular, sin efectivo, sin cambio.

> Estado: en desarrollo, sobre Stellar testnet.

## El problema

Los pagos chicos del día a día en Bolivia siguen siendo en efectivo: hay que dar cambio, contar
billetes y cuidar la caja. El QR exige que el cliente tenga un celular con batería y datos, y es
lento en una fila. Niños, adultos mayores y quien no tiene smartphone quedan fuera. Un datáfono y
las comisiones de tarjeta no le salen a un comercio pequeño. Y con la escasez de dólares, no hay una
forma simple de cobrar y guardar valor en una moneda estable.

## Cómo funciona

1. El comercio instala un terminal Toki y entrega tarjetas a sus clientes.
2. El cliente recarga saldo desde su celular o se lo recarga alguien más, como sus papás.
3. Para pagar, acerca la tarjeta al terminal y escribe su PIN.
4. El pago se liquida en USDC sobre Stellar y el comercio lo recibe al instante.
5. Si el terminal controla una máquina, un torniquete o una puerta, la activa al confirmarse el
   pago.

## Por qué Toki

| Frente a | Toki |
|---|---|
| Efectivo | Sin billetes, sin cambio, sin caja que cuidar |
| Pago con QR | El cliente no necesita celular: basta acercar la tarjeta, tan rápido como una tarjeta de bus |
| Datáfono | El terminal cuesta una fracción y no hay comisión bancaria |
| Tarjeta NFC común | La tarjeta no se puede clonar y tiene límite de gasto |

## Seguridad

- **Tarjetas que no se clonan.** Usamos NTAG 424 DNA: en cada toque la tarjeta genera un código
  firmado distinto, así que copiarla no sirve para pagar.
- **PIN en el terminal** para cada pago.
- **Límite de gasto diario** por tarjeta, programado en la cuenta del usuario en Stellar.
- **Bloqueo inmediato** desde el celular si la tarjeta se pierde. El saldo queda a salvo.

## Dónde sirve

- Cafeterías de colegios y universidades
- Puestos de mercado y tiendas de barrio
- Transporte
- Máquinas de autoservicio: expendedoras, lavanderías, dispensadores

## Arquitectura

```
 Tarjeta NFC          Terminal Toki                Backend               Stellar
 (NTAG 424 DNA)  ──►  ESP32 + lector NFC   ──►   verifica la tarjeta  ──►  pago en USDC
                      pantalla, teclado PIN      y el límite              a la cuenta
                      relé para máquinas                                  del comercio

 App del usuario: registro, recarga y bloqueo de la tarjeta (con Pollar)
```

- **Terminal:** ESP32-S3, lector NFC PN532, pantalla OLED, teclado matricial, relé y buzzer.
- **Red:** Stellar, con USDC. El terminal puede aceptar cualquier dólar digital de Stellar.
- **Cuentas:** cuentas inteligentes de Stellar con límite de gasto por tarjeta.
- **Registro y recarga:** [Pollar](https://pollar.xyz), con login social y comisiones pagadas por la
  app. El usuario no maneja frases semilla ni tiene que comprar XLM.

## Hoja de ruta

- [ ] Firmware del terminal: lectura de tarjeta, PIN, pantalla y relé
- [ ] Verificación de tarjetas NTAG 424 DNA
- [ ] Cobro en USDC sobre Stellar testnet
- [ ] Límite de gasto diario y bloqueo de tarjeta
- [ ] Registro y recarga con Pollar
- [ ] Piloto con un primer comercio

---

Toki participa en la **National Startups Hackathon by Stellar** 2026.
