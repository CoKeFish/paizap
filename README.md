# Toki

**Paga con un toque.** Toki es una tarjeta NFC y un terminal de bajo costo que cobran en dólares
digitales sobre [Stellar](https://stellar.org). Quien paga acerca la tarjeta y el comercio o la
máquina cobra en segundos, sin celular, sin efectivo y sin cambio. El dueño de la cuenta pone un
tope de gasto que la red hace cumplir.

> Estado: en desarrollo, sobre Stellar testnet. Esta página describe el diseño del producto; la
> [hoja de ruta](#hoja-de-ruta) muestra qué está construido.

## El problema

En Bolivia el QR ya es la forma normal de pagar: en 2025 se hicieron 891 millones de pagos con QR y
casi la mitad (49,7 %) fueron por menos de Bs 50 ([Asoban vía Red Uno](https://www.reduno.com.bo/economia/bolivia-consolida-el-uso-del-qr-891-millones-de-transacciones-movieron-us-51-293-millones-en-2025-202621211959)).
Pero el QR deja casos afuera:

- **Quien no tiene celular o cuenta bancaria** no puede pagar con QR.
- **Quien paga por otro** no puede ponerle un límite ni ver en qué se gasta.
- **Una máquina sin nadie atendiendo** necesita pantalla e integración con un banco para cobrar con
  QR.

Además, el QR cobra en bolivianos, y el boliviano flota desde junio de 2026
([Correo del Sur](https://correodelsur.com/economia/20260626/el-banco-central-de-bolivia-establece-en-bs-9-73-el-nuevo-tipo-de-cambio-flexible.html)).
Los dólares digitales ya son parte de la vida de muchas familias: las transacciones con activos
virtuales pasaron de USD 46,5 millones en el primer semestre de 2024 a USD 294 millones en el de
2025 ([Los Tiempos](https://www.lostiempos.com/actualidad/economia/20260726/falta-dolares-banca-migra-criptomonedas-norma-del-bcb)).

## Cómo funciona

1. El comercio o el dueño de la máquina instala un terminal Toki.
2. El dueño de la cuenta carga saldo en dólares digitales y autoriza a Toki a cobrar hasta un tope.
3. Quien paga acerca la tarjeta al terminal. Nada más: no hay PIN ni app que abrir.
4. El comercio recibe el pago al instante en Stellar.

### Dos modos de terminal

| Modo | Cómo se cobra | Ejemplos |
|---|---|---|
| **Caja** | El vendedor escribe el monto en el teclado y el cliente acerca la tarjeta | Tienda, cafetería, kiosco |
| **Autoservicio** | Precio fijo configurado en el terminal; al pagar, el relé activa la máquina | Expendedora, dispensador de agua, lavandería, torniquete |

El modo autoservicio no necesita teclado ni a nadie atendiendo.

## Por qué Toki

| Frente a | Toki |
|---|---|
| Efectivo | Sin monedas ni cambio, y cada pago queda registrado |
| QR o billetera móvil | Quien paga no necesita celular, datos ni cuenta bancaria propia |
| Datáfono | Un terminal de menos de USD 40 en componentes, sin comisión bancaria |
| Tarjeta NFC común | La tarjeta no se puede clonar, y Toki nunca puede cobrar más del tope autorizado |

## Quién firma los pagos

Una tarjeta NFC no puede firmar transacciones de Stellar, así que Toki usa un **permiso de gasto**
(*allowance*) del contrato del token:

- La cuenta es del usuario y la controla su billetera. Toki nunca tiene esa llave.
- Al recargar, el dueño de la cuenta firma un permiso: «Toki puede sacar de esta cuenta hasta este
  monto, hasta este vencimiento». El permiso queda registrado en Stellar, se va consumiendo con cada
  pago y se renueva en la siguiente recarga.
- En cada pago, el servidor de Toki verifica la tarjeta y mueve el monto al comercio usando ese
  permiso. Toki firma, pero **la red no le deja pasar del tope** ni cobrar después del vencimiento.
- La plata se queda en la cuenta del usuario hasta que paga: Toki no la guarda.

El permiso es un total hasta un vencimiento, no un límite por día, y no restringe a quién se paga.
Por eso el diseño tiene dos etapas:

1. **Demo (hackathon):** quien gasta es la cuenta del servidor de Toki. El límite diario y la lista
   de comercios los controla el servidor; el tope total lo garantiza la red.
2. **Producto:** quien gasta es un **contrato de Toki en Soroban** que solo paga a comercios
   registrados y aplica el límite diario de cada tarjeta en la red. Aunque alguien robara una llave
   del servidor, no podría mandar la plata a otro lado ni pasar del límite.

## Seguridad

- **Tarjetas que no se clonan.** Usamos NTAG 424 DNA: en cada toque la tarjeta genera un código
  autenticado con una llave secreta (AES) y un contador. El servidor lo verifica y rechaza cualquier
  contador que no sea mayor que el último, así que copiar la tarjeta o repetir un código no sirve.
- **Solo terminales registrados cobran.** Si alguien leyera la tarjeta a escondidas con un celular,
  obtendría a lo sumo un código para un pago, y no podría usarlo: el servidor solo acepta cobros de
  terminales autenticados de comercios registrados, y siempre dentro del límite.
- **Tope garantizado por la red.** Lo máximo que se puede gastar es lo que el dueño de la cuenta
  autorizó, y Stellar lo hace cumplir.
- **Bloqueo de una tarjeta** desde el celular, al instante en el servidor de Toki. Para cortar todo
  en la red, el dueño deja el permiso en cero.

## Arquitectura

```
 Tarjeta NFC          Terminal Toki               Servidor Toki              Stellar
 (NTAG 424 DNA)  ──►  ESP32 + lector NFC   ──►   verifica la tarjeta   ──►  dólares digitales
                      pantalla, teclado           y el límite,               de la cuenta del
                      relé para máquinas          cobra con el permiso       usuario a la del
                      Wi-Fi o 4G                  de gasto                   comercio

 App del dueño de la cuenta: recarga, límite, permiso de gasto y bloqueo de la tarjeta
```

- **Terminal:** ESP32-S3, lector NFC PN532, pantalla OLED y buzzer. En modo caja suma un teclado
  para el monto; en modo autoservicio, un relé que activa la máquina. Componentes por menos de
  USD 40. Se conecta por Wi-Fi, o con un módulo 4G donde no hay Wi-Fi.
- **Cobro:** cada pago tarda entre 5 y 10 segundos de punta a punta, incluida la confirmación en la
  red. Toki paga las comisiones y patrocina las reservas de las cuentas, así que ni el usuario ni el
  comercio necesitan XLM. El servidor usa varias cuentas de envío en paralelo para que muchos
  terminales cobren a la vez.
- **Red y activo:** Stellar. La demo usa USDC de Circle en testnet (emisor
  `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`). En producción Toki también cobra en
  **USDT0**, el USDT de Tether en Stellar, que es el dólar digital más usado en Bolivia; hoy existe
  solo en mainnet (`USDT0:GATISXX6BZ6NC7IKQBY37CJD4SOZL3CYZJWXEDG6JVIY4WBS6KXJHN6Q`). Los dos
  tienen contrato de token (SAC), así que el cobro con permiso de gasto es el mismo código: el activo
  es configuración. El comercio necesita una cuenta habilitada para recibir ese activo.
- **Errores que el terminal muestra:** saldo insuficiente, permiso vencido o agotado, límite
  alcanzado, tarjeta bloqueada y sin conexión.
- **Cuentas y recarga:** planeamos usar [Pollar](https://pollar.xyz), un SDK de billeteras
  embebidas con login social, para que el usuario no maneje frases semilla.

## Hoja de ruta

- [ ] Servidor: cobro en USDC sobre Stellar testnet con permiso de gasto
- [ ] Firmware del terminal: modo caja (monto con teclado) y modo autoservicio (precio fijo y relé)
- [ ] Verificación de tarjetas NTAG 424 DNA con contador
- [ ] Límite por tarjeta y bloqueo
- [ ] App del dueño de la cuenta: recarga y permiso de gasto (con Pollar)
- [ ] Contrato de Toki en Soroban: comercios permitidos y límite diario en la red
- [ ] Piloto con un primer cliente

---

Toki participa en la **National Startups Hackathon by Stellar** 2026.
