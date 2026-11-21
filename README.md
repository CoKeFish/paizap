# Toki

**El recreo sin efectivo ni celular.** Toki es una tarjeta NFC para que los alumnos paguen en el
kiosco del colegio con saldo en dólares digitales que cargan sus papás, sobre
[Stellar](https://stellar.org). El alumno acerca la tarjeta y el kiosco cobra en segundos. Los papás
ponen el límite y ven cada compra.

> Estado: en desarrollo, sobre Stellar testnet. Esta página describe el diseño del producto; la
> [hoja de ruta](#hoja-de-ruta) muestra qué está construido.

## El problema

En Bolivia el QR ya es la forma normal de pagar: en 2025 se hicieron 891 millones de pagos con QR y
la mitad fueron por menos de Bs 50 ([Asoban vía Red Uno](https://www.reduno.com.bo/economia/bolivia-consolida-el-uso-del-qr-891-millones-de-transacciones-movieron-us-51-293-millones-en-2025-202621211959)).
Pero el QR necesita un celular y una cuenta, y en el colegio un alumno no tiene ninguna de las dos:

- **Sin celular.** Desde la gestión 2026 está prohibido usar el celular en las aulas
  ([Resolución Ministerial 001/2026, Los Tiempos](https://www.lostiempos.com/actualidad/pais/20260201/escolares-vuelvan-clases-celulares-inclusion-curriculo-regionalizado)).
- **Sin cuenta.** Las cuentas para menores son recientes, para 13 a 17 años y abiertas junto con
  los padres ([BancoSol, FinDev Gateway](https://www.findevgateway.org/es/noticias/bolivia-bancosol-lanza-cuenta-de-ahorros-100-digital-para-menores-de-13-17-anos-dentro-de)).
  Un niño de primaria no puede pagar con QR.

Así que el recreo sigue en efectivo: los papás dan monedas sin saber en qué se gastan, el kiosco
tiene que dar cambio con una fila de niños esperando, y la plata se pierde o se gasta en lo que no
debía.

A la vez, las familias bolivianas buscan ahorrar en dólares: las transacciones con activos
virtuales crecieron más de 630% entre el primer semestre de 2024 y el de 2025, impulsadas sobre
todo por los hogares, según el Banco Central de Bolivia
([Los Tiempos](https://www.lostiempos.com/actualidad/economia/20260726/falta-dolares-banca-migra-criptomonedas-norma-del-bcb)).

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

- Los papás firman una sola vez un permiso: «Toki puede sacar de esta cuenta hasta este monto, hasta
  este vencimiento». El permiso queda registrado en Stellar.
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
  firmado con un contador. El servidor verifica la firma y rechaza cualquier contador que no sea
  mayor que el último, así que copiar o repetir un código no sirve para pagar.
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
- **Cobro:** cada pago se confirma en la red en unos 5 segundos. La transacción la paga Toki; el
  alumno y el kiosco no necesitan XLM.
- **Red:** Stellar, con USDC. El kiosco necesita una cuenta habilitada para recibir USDC.
- **Cuentas y recarga:** [Pollar](https://pollar.xyz), con login social y comisiones pagadas por la
  app. Los papás no manejan frases semilla ni compran XLM.

## Hoja de ruta

- [ ] Servidor: cobro en USDC sobre Stellar testnet con permiso de gasto
- [ ] Firmware del terminal: modo caja (monto con teclado) y modo autoservicio (precio fijo y relé)
- [ ] Verificación de tarjetas NTAG 424 DNA con contador
- [ ] Límite diario por tarjeta y bloqueo
- [ ] App de los papás con Pollar: cuenta, recarga y permiso de gasto
- [ ] Contrato de Toki en Soroban: kioscos permitidos y límite diario en la red
- [ ] Piloto en un colegio de Santa Cruz

---

Toki participa en la **National Startups Hackathon by Stellar** 2026.
