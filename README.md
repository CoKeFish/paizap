# Toki

**Paga con un toque.** Toki es un terminal de pago con tarjeta NFC que cobra en dólares digitales
sobre [Stellar](https://stellar.org). El cliente acerca su tarjeta y el comercio recibe el pago en
segundos. Sin celular, sin efectivo, sin cambio.

> Estado: en desarrollo, sobre Stellar testnet. Esta página describe el diseño del producto; la
> [hoja de ruta](#hoja-de-ruta) muestra qué está construido.

## El problema

Los pagos chicos del día a día en Bolivia siguen siendo en efectivo: hay que dar cambio, contar
billetes y cuidar la caja. El QR exige que el cliente tenga un celular con batería y datos, y es
lento en una fila. Niños, adultos mayores y quien no tiene smartphone quedan fuera. Un datáfono y
las comisiones de tarjeta no le salen a un comercio pequeño. Y con la escasez de dólares, no hay una
forma simple de cobrar y guardar valor en una moneda estable.

## Cómo funciona

1. El comercio instala un terminal Toki y entrega tarjetas a sus clientes.
2. El dueño de la cuenta (el cliente, o sus papás si es un niño) carga saldo en USDC y autoriza a
   Toki a gastar hasta un tope, por ejemplo 100 USDC durante una semana.
3. El cliente acerca su tarjeta al terminal. Nada más: no hay PIN ni app que abrir.
4. Toki cobra en USDC sobre Stellar y el comercio lo recibe al instante.

### Dos modos de terminal

| Modo | Cómo se cobra | Ejemplos |
|---|---|---|
| **Caja** | El comercio escribe el monto en el teclado y el cliente acerca la tarjeta | Cafetería, tienda, puesto de mercado |
| **Autoservicio** | Precio fijo configurado en el terminal; al pagar, el relé activa la máquina | Expendedora, lavandería, dispensador de agua, torniquete |

El modo autoservicio no necesita teclado ni a nadie atendiendo.

## Por qué Toki

| Frente a | Toki |
|---|---|
| Efectivo | Sin billetes, sin cambio, sin caja que cuidar |
| Pago con QR | El cliente no necesita celular: basta acercar la tarjeta, como una tarjeta de bus |
| Datáfono | Un terminal de bajo costo, sin comisión bancaria por pago |
| Tarjeta NFC común | La tarjeta no se puede clonar y Toki nunca puede gastar más del tope autorizado |

## Quién firma los pagos

Una tarjeta NFC no puede firmar transacciones de Stellar, así que Toki usa un **permiso de gasto**
(*allowance*) del contrato del token USDC:

- El dueño de la cuenta firma una sola vez un permiso: «Toki puede sacar de mi cuenta hasta este
  monto, hasta esta fecha». El permiso queda registrado en Stellar.
- En cada pago, el servidor de Toki verifica la tarjeta y mueve el monto desde la cuenta del
  cliente a la del comercio usando ese permiso. Toki firma, pero **la red no le deja pasar del
  tope** ni usarlo después de la fecha.
- La plata no sale de la cuenta del cliente hasta que paga: Toki no la guarda.
- **Bloquear una tarjeta** es dejar el permiso en cero. Desde ese momento nadie puede cobrar con
  ella, ni siquiera Toki.

El tope del permiso es un total hasta una fecha, no un límite por día. Toki agrega encima un
**límite diario** por tarjeta, que controla su servidor: un niño puede tener 100 USDC autorizados
para la semana y gastar como máximo 15 por día. Llevar ese límite diario también a la red, con las
políticas de límite de gasto de una cuenta inteligente, está en la hoja de ruta.

## Seguridad

- **Tarjetas que no se clonan.** Usamos NTAG 424 DNA: en cada toque la tarjeta genera un código
  firmado distinto, y el servidor lo verifica. Copiar la tarjeta no sirve para pagar.
- **Tope garantizado por la red.** Lo máximo que se puede gastar con una tarjeta es lo que su dueño
  autorizó, y Stellar lo hace cumplir.
- **Bloqueo inmediato** desde el celular si la tarjeta se pierde.

## Dónde sirve

- Cafeterías de colegios y universidades
- Puestos de mercado y tiendas de barrio
- Transporte
- Máquinas de autoservicio: expendedoras, lavanderías, dispensadores

## Arquitectura

```
 Tarjeta NFC          Terminal Toki                Servidor Toki             Stellar
 (NTAG 424 DNA)  ──►  ESP32 + lector NFC   ──►    verifica la tarjeta   ──►  USDC de la cuenta
                      pantalla, teclado           y el límite diario,        del cliente a la
                      relé para máquinas          cobra con el permiso       del comercio
                      Wi-Fi o 4G                  de gasto

 App del usuario: registro, recarga, permiso de gasto y bloqueo de la tarjeta (con Pollar)
```

- **Terminal:** ESP32-S3, lector NFC PN532, pantalla OLED y buzzer. En modo caja suma un teclado
  matricial para el monto; en modo autoservicio, un relé que activa la máquina. Se
  conecta por Wi-Fi; donde no hay Wi-Fi, con un módulo 4G o el punto de acceso del celular del
  comercio. El cliente no necesita datos, el terminal sí.
- **Red:** Stellar, con USDC.
- **Cobro:** permiso de gasto (`approve` / `transfer_from`) del contrato del token en Stellar.
- **Registro y recarga:** [Pollar](https://pollar.xyz), con login social y comisiones pagadas por la
  app. El usuario no maneja frases semilla ni tiene que comprar XLM.

## Hoja de ruta

- [ ] Firmware del terminal: modo caja (monto con teclado) y modo autoservicio (precio fijo y relé)
- [ ] Servidor: cobro en USDC sobre Stellar testnet con permiso de gasto
- [ ] Verificación de tarjetas NTAG 424 DNA
- [ ] Límite diario por tarjeta y bloqueo
- [ ] Registro y recarga con Pollar
- [ ] Límite diario en la red con una cuenta inteligente
- [ ] PIN opcional por tarjeta, para quien quiera una capa extra
- [ ] Piloto con un primer comercio

---

Toki participa en la **National Startups Hackathon by Stellar** 2026.
