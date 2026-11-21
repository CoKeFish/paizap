# Toki

**El recreo sin efectivo ni celular.** Toki es una tarjeta NFC para que los alumnos paguen en el
kiosco del colegio con saldo en dólares digitales que cargan sus papás, sobre
[Stellar](https://stellar.org). El alumno acerca la tarjeta y el kiosco cobra en segundos. Los papás
ponen el límite y ven cada compra.

> Estado: en desarrollo, sobre Stellar testnet. Esta página describe el diseño del producto; la
> [hoja de ruta](#hoja-de-ruta) muestra qué está construido.

## La idea

Toki resuelve un caso que el QR no cubre: **quien paga no es quien gasta**, y quien gasta no tiene
o no usa celular. Quien paga carga saldo en dólares, pone un límite y ve cada compra; quien gasta
solo acerca una tarjeta. Empezamos por el colegio, donde ese caso es diario:

| Quien paga | Quien gasta | Dónde |
|---|---|---|
| **Los papás** | **El alumno, en el recreo** | **El kiosco y las máquinas del colegio (primer mercado)** |
| El hijo que migró | Sus papás o abuelos en Bolivia | La tienda del barrio |
| Una organización de ayuda | Una familia damnificada | Almacenes registrados |

## El problema

En Bolivia el QR ya es la forma normal de pagar: en 2025 se hicieron 891 millones de pagos con QR y
casi la mitad (49,7 %) fueron por menos de Bs 50 ([Asoban vía Red Uno](https://www.reduno.com.bo/economia/bolivia-consolida-el-uso-del-qr-891-millones-de-transacciones-movieron-us-51-293-millones-en-2025-202621211959)).
Pero el QR necesita un celular y una cuenta, y en el colegio un alumno no tiene ninguna de las dos:

- **Sin celular.** Un niño de primaria normalmente no tiene celular propio, y desde la gestión
  2026 el celular está prohibido en las aulas
  ([Resolución Ministerial 001/2026, Los Tiempos](https://www.lostiempos.com/actualidad/pais/20260201/escolares-vuelvan-clases-celulares-inclusion-curriculo-regionalizado)).
- **Sin cuenta.** Un menor necesita que sus padres le abran una cuenta, y las opciones digitales
  son nuevas: por ejemplo, BancoSol lanzó una cuenta para chicos de 13 a 17 años dentro de su
  billetera QR ([FinDev Gateway](https://www.findevgateway.org/es/noticias/bolivia-bancosol-lanza-cuenta-de-ahorros-100-digital-para-menores-de-13-17-anos-dentro-de)).

Así que el recreo sigue en efectivo: los papás dan monedas sin saber en qué se gastan, el kiosco
tiene que dar cambio con una fila de niños esperando, y la plata se pierde o se gasta en lo que no
debía.

A la vez, los dólares digitales ya son parte de la vida de muchas familias: desde que el Banco
Central de Bolivia los permitió en junio de 2024, las transacciones con activos virtuales pasaron
de USD 46,5 millones en el primer semestre de 2024 a USD 294 millones en el de 2025, impulsadas
sobre todo por los hogares
([Los Tiempos](https://www.lostiempos.com/actualidad/economia/20260726/falta-dolares-banca-migra-criptomonedas-norma-del-bcb)).

Pagar el recreo con saldo prepago y control de los papás no es una idea nueva: es un mercado que
ya existe en la región. OrderEAT, por ejemplo, funciona en más de 600 colegios de Latinoamérica y
levantó USD 2 millones para duplicar su alcance
([Forbes Argentina](https://www.forbesargentina.com/negocios/la-plataforma-uruguaya-ordereat-cerro-una-ronda-us2-millones-buscara-duplicar-sus-colegios-18-meses-foco-mexico-n98097/amp)).
Esas soluciones no operan en Bolivia, guardan ellas el dinero de las familias y lo manejan en
moneda local. Toki deja el saldo en dólares y en la cuenta de la familia, en un país donde el
boliviano flota desde junio de 2026
([Correo del Sur](https://correodelsur.com/economia/20260626/el-banco-central-de-bolivia-establece-en-bs-9-73-el-nuevo-tipo-de-cambio-flexible.html)).

## Cómo funciona

1. El colegio o el kiosco instala un terminal Toki.
2. Los papás crean la cuenta del alumno desde su celular, cargan saldo en dólares digitales (USDC)
   y fijan un límite diario.
3. En el recreo, el kiosco escribe el monto y el alumno acerca su tarjeta. Nada más.
4. El kiosco recibe el pago al instante en Stellar, y los papás ven la compra en su celular.

### Dos modos de terminal

| Modo | Cómo se cobra | Ejemplos |
|---|---|---|
| **Caja** | El kiosco escribe el monto en el teclado y el alumno acerca la tarjeta | Kiosco del colegio, cafetería, tienda |
| **Autoservicio** | Precio fijo configurado en el terminal; al pagar, el relé activa la máquina | Expendedora, dispensador de agua, fotocopiadora, torniquete |

El modo autoservicio no necesita teclado ni a nadie atendiendo.

**Por qué un terminal propio:** queda fijo en el mostrador y el alumno lo usa solo, sin exigirle al
kiosquero un celular con NFC ni que lo suelte para cobrar; y en las máquinas no hay nadie que
cobre. El terminal cuesta menos de USD 40 en componentes.

## Por qué Toki

| Frente a | Toki |
|---|---|
| Efectivo | Sin monedas, sin cambio; los papás saben en qué se gasta y ponen el límite |
| QR o billetera móvil | El alumno no necesita celular ni cuenta bancaria propia |
| Tarjeta de débito | Sirve para niños de cualquier edad y no exige un datáfono bancario en el kiosco |
| Tarjeta NFC común | La tarjeta no se puede clonar, y Toki nunca puede gastar más de lo que autorizaron los papás |

## Quién firma los pagos

Una tarjeta NFC no puede firmar transacciones de Stellar, así que Toki usa un **permiso de gasto**
(*allowance*) del contrato del token USDC:

- La cuenta del alumno es de la familia y la controla la billetera de los papás. Toki nunca tiene
  esa llave.
- Al recargar, los papás firman un permiso: «Toki puede sacar de esta cuenta hasta este monto,
  hasta este vencimiento». El permiso queda registrado en Stellar, se va consumiendo con cada pago
  y se renueva en la siguiente recarga (por ejemplo, cada semana).
- En cada pago, el servidor de Toki verifica la tarjeta y mueve el monto de la cuenta del alumno a
  la del kiosco usando ese permiso. Toki firma, pero **la red no le deja pasar del tope** ni cobrar
  después del vencimiento.
- La plata se queda en la cuenta de la familia hasta que el alumno paga: Toki no la guarda.

El permiso es un total hasta un vencimiento, no un límite por día, y no restringe a quién se paga.
Por eso el diseño tiene dos etapas:

1. **Demo (hackathon):** quien gasta es la cuenta del servidor de Toki. El límite diario y la lista
   de kioscos los controla el servidor; el tope total lo garantiza la red.
2. **Producto:** quien gasta es un **contrato de Toki en Soroban** que solo paga a kioscos
   registrados y aplica el límite diario de cada tarjeta en la red. Aunque alguien robara una llave
   del servidor, no podría mandar la plata a otro lado ni pasar del límite.

## Seguridad

- **Tarjetas que no se clonan.** Usamos NTAG 424 DNA: en cada toque la tarjeta genera un código
  autenticado con una llave secreta (AES) y un contador. El servidor lo verifica y rechaza cualquier
  contador que no sea mayor que el último, así que copiar la tarjeta o repetir un código no sirve.
- **Solo terminales registrados cobran.** Si alguien leyera la tarjeta a escondidas con un celular,
  obtendría a lo sumo un código para un pago, y no podría usarlo: el servidor solo acepta cobros de
  terminales autenticados de kioscos registrados, y siempre dentro del límite diario.
- **Tope garantizado por la red.** Lo máximo que se puede gastar es lo que los papás autorizaron, y
  Stellar lo hace cumplir.
- **Bloqueo de una tarjeta** desde el celular, al instante en el servidor de Toki. Para cortar todo
  en la red, los papás dejan el permiso en cero.

## Arquitectura

```
 Tarjeta NFC          Terminal Toki               Servidor Toki              Stellar
 (NTAG 424 DNA)  ──►  ESP32 + lector NFC   ──►   verifica la tarjeta   ──►  USDC de la cuenta
                      pantalla, teclado           y el límite diario,        del alumno a la
                      relé para máquinas          cobra con el permiso       del kiosco
                      Wi-Fi o 4G                  de gasto

 App de los papás: cuenta del alumno, recarga, límite, permiso de gasto y bloqueo (con Pollar)
```

- **Terminal:** ESP32-S3, lector NFC PN532, pantalla OLED y buzzer. En modo caja suma un teclado
  para el monto; en modo autoservicio, un relé que activa la máquina. Componentes por menos de
  USD 40. Se conecta por Wi-Fi, o con un módulo 4G donde no hay Wi-Fi.
- **Cobro:** cada pago tarda entre 5 y 10 segundos de punta a punta, incluida la confirmación en la
  red. Toki paga las comisiones y patrocina las reservas de las cuentas, así que ni la familia ni
  el kiosco necesitan XLM. El servidor usa varias cuentas de envío en paralelo para que muchos
  terminales cobren a la vez en la hora pico del recreo.
- **Red y activo:** Stellar. La demo usa USDC de Circle en testnet (emisor
  `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`). En producción Toki también cobra en
  **USDT0**, el USDT de Tether en Stellar, que es el dólar digital que ya usan las familias
  bolivianas; hoy existe solo en mainnet (`USDT0:GATISXX6BZ6NC7IKQBY37CJD4SOZL3CYZJWXEDG6JVIY4WBS6KXJHN6Q`).
  Los dos tienen contrato de token (SAC), así que el cobro con permiso de gasto es el mismo código:
  el activo es configuración. El kiosco necesita una cuenta habilitada para recibir ese activo.
- **Errores que el terminal muestra:** saldo insuficiente, permiso vencido o agotado, límite
  diario alcanzado, tarjeta bloqueada y sin conexión.
- **Cuentas y recarga:** planeamos usar [Pollar](https://pollar.xyz), un SDK de billeteras
  embebidas con login social, para que los papás no manejen frases semilla.

## Hoja de ruta

- [ ] Servidor: cobro en USDC sobre Stellar testnet con permiso de gasto
- [ ] Firmware del terminal: modo caja (monto con teclado) y modo autoservicio (precio fijo y relé)
- [ ] Verificación de tarjetas NTAG 424 DNA con contador
- [ ] Límite diario por tarjeta y bloqueo
- [ ] App de los papás: cuenta, recarga y permiso de gasto (con Pollar)
- [ ] Contrato de Toki en Soroban: kioscos permitidos y límite diario en la red
- [ ] Piloto en un colegio de Santa Cruz

---

Toki participa en la **National Startups Hackathon by Stellar** 2026.
