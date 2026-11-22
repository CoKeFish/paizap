# Electrónica del terminal Paizap

Prototipo armado en protoboard con módulos comerciales, sin placa propia. Sirve para los dos modos
del terminal: **caja** (teclado para el monto) y **autoservicio** (relé que activa la máquina).

```
                 ┌──────────────────────────┐
  Tarjeta  )))   │  Lector NFC (PN532)      │── SPI ──┐
  NTAG 424 DNA   └──────────────────────────┘         │
                                                ┌─────┴───────────────┐
  Pantalla (OLED o LCD) ──────── I2C ───────────┤                     │
  Teclado 4x4 ─────────────── 8 pines ──────────┤   ESP32-S3          │── Wi-Fi ──► Servidor Paizap ──► Stellar
  Buzzer ─────────────────────── GPIO ──────────┤   o ESP32 clásico   │
  LED verde / LED rojo ──────── GPIO ───────────┤                     │
  Relé 1 canal ──────────────── GPIO ───────────┤                     │
        └── contactos NO/COM: la máquina        └─────────┬───────────┘
                                                          │ USB 5 V (cargador o power bank)
```

## Piezas

La primera opción es la recomendada; las alternativas también funcionan con el firmware: solo
cambia una línea en `firmware/src/config.h`.

| Pieza | Recomendada | Alternativas que sirven | Cant. |
|---|---|---|---|
| Placa | ESP32-S3 DevKitC-1 (N16R8 o N8R2) | ESP32 clásico DevKit V1 / WROOM-32 (30 o 38 pines) | 1 |
| Lector NFC | PN532 V3 (interruptores SPI/I2C/UART) | RC522 / MFRC522 | 1 |
| Tarjetas | NTAG 424 DNA | NTAG213/215 para pruebas (no tienen criptografía) | 5 + 3 |
| Pantalla I2C | OLED 0.96" 128×64 SSD1306 | OLED 1.3" SH1106 · LCD 16×2 con módulo I2C | 1 |
| Teclado | Membrana 4×4 | Membrana 4×3 (sin punto decimal) | 1 |
| Buzzer | Activo de 3 V | Activo de 5 V · pasivo · módulo buzzer | 1 |
| Relé | 1 canal con optoacoplador, 3.3 V, selector H/L | 5 V con jumper H/L · 5 V sin jumper · 2 canales | 1 |
| LEDs | Verde ×3, rojo ×1, 5 mm, con resistencias de 220 a 330 Ω | Cualquier color; resistencias de 150 a 1 kΩ | 4 |
| Montaje | 2 protoboards de 830 puntos | 1 protoboard y cables hembra-hembra a la placa | 2 |
| Cables | Dupont macho-macho, macho-hembra y hembra-hembra | — | 1 paquete c/u |
| Energía | Cable USB **de datos** y cargador o power bank de 5 V / 1 A | — | 1 |

**Qué no sirve:**
- Una ESP32-C3 o S3 SuperMini: tienen muy pocos pines para el teclado.
- Un ESP8266, porque no tiene pines suficientes, ni un Arduino Uno, porque no tiene Wi-Fi.
- Tarjetas MIFARE Classic como tarjeta de pago, porque se clonan. Sí sirven para pruebas.
- Cables USB "solo carga".

**Lector RC522 o PN532:** los dos leen la NTAG 424 DNA. El PN532 tiene mejor alcance y más
documentación. El RC522 es más barato y está en todas partes, pero solo acepta 3.3 V: conectarlo
a 5 V lo daña.

**Carcasa:** el modelo para imprimir en 3D, con sus medidas y el armado, está en
[`carcasa/`](carcasa/README.md).

**Para después, no para el prototipo:** módulo 4G (SIM7600 o A7670) donde no hay Wi-Fi y una
placa propia (PCB) que reemplace la protoboard.

## Configurar el firmware según las piezas

En `firmware/src/config.h`:

| Si conseguiste… | Cambia |
|---|---|
| RC522 en vez de PN532 | `#define LECTOR LECTOR_RC522` |
| Ningún lector (demo con el botón BOOT de la placa) | `#define LECTOR LECTOR_BOTON` |
| OLED 1.3" | `#define PANTALLA PANTALLA_SH1106` |
| LCD 16×2 I2C | `#define PANTALLA PANTALLA_LCD1602` y, si no se ve texto, `LCD_DIRECCION 0x3F` |
| Buzzer pasivo (no suena o suena "clic") | `#define BUZZER_PASIVO 1` |
| Relé que se queda activado al arrancar | `#define RELE_ACTIVO_BAJO 1` |
| Teclado 4×3 | `#define TECLADO_4X3 1` |

La placa se elige con el entorno de PlatformIO: `s3` o `esp32`. Los pines cambian solos según el
chip.

Si una OLED o un LCD no muestra nada, el monitor serie lista al arrancar las direcciones I2C que
encontró: la OLED es 0x3C y el LCD, 0x27 o 0x3F.

## Conexiones

### ESP32-S3 DevKitC-1

Se evitan los pines de arranque (0, 3, 45, 46), los del USB (19, 20), los de la PSRAM octal
(35, 36, 37) y los del puerto serie (43, 44).

| Pieza | Pin de la pieza | ESP32-S3 |
|---|---|---|
| Pantalla I2C (cualquiera) | VCC · GND · SDA · SCL | 3V3 (el LCD: 5V) · GND · **8** · **9** |
| PN532 o RC522 (SPI) | VCC · GND · SCK · MISO · MOSI · SS (en el RC522: SDA) | 3V3 · GND · **12** · **13** · **11** · **10** |
| Solo RC522 | RST | **14** |
| Teclado | Filas R1 R2 R3 R4 (los 4 cables de la izquierda) | **4 · 5 · 6 · 7** |
| Teclado | Columnas C1 C2 C3 C4 (los de la derecha; el 4×3 tiene 3) | **15 · 16 · 17 · 18** |
| Buzzer | + (pata larga) · − | **21** · GND |
| LED verde (pago OK) | ánodo (pata larga) → resistencia → cátodo a GND | **41** |
| LED rojo (error) | ánodo → resistencia → cátodo a GND | **42** |
| Relé | VCC · GND · IN | 3V3 o 5V según el relé · GND · **2** |

### ESP32 clásico (DevKit V1)

Se evitan los pines de la flash (6 a 11), los de solo entrada (34 a 39) y los del puerto serie
(1, 3).

| Pieza | Pin de la pieza | ESP32 |
|---|---|---|
| Pantalla I2C | VCC · GND · SDA · SCL | 3V3 (el LCD: VIN) · GND · **21** · **22** |
| PN532 o RC522 (SPI) | VCC · GND · SCK · MISO · MOSI · SS | 3V3 · GND · **18** · **19** · **23** · **5** |
| Solo RC522 | RST | **4** |
| Teclado | Filas R1 R2 R3 R4 | **32 · 33 · 25 · 26** |
| Teclado | Columnas C1 C2 C3 C4 | **27 · 14 · 13 · 15** |
| Buzzer | + · − | **17** · GND |
| LED verde · LED rojo | ánodo → resistencia → GND | **2** (también el LED azul de la placa) · **12** |
| Relé | VCC · GND · IN | 3V3 o VIN según el relé · GND · **16** |

En el ESP32 clásico, el LED rojo va en el pin 12. Ese pin tiene que estar en bajo al arrancar, y
el LED con su resistencia a GND lo deja así. No conectes ahí nada que lo lleve a 3.3 V.

### Notas de montaje

- **Interruptores del PN532:** para SPI, el 1 en OFF (0) y el 2 en ON (1). Vienen de fábrica en
  I2C.
- **Relé:** el de 3.3 V va a 3V3. El de 5 V va a 5V/VIN; si tiene jumper H/L, ponlo en H. El
  contacto COM va a 3V3 y el NO, a un LED con su resistencia que hace de "máquina" en la demo.
- **Alimentación:** en la ESP32-S3 de doble USB, conecta el cable al puerto **COM/UART** (el del
  CH340): por ahí salen el monitor serie y los 5 V al pin `5V`. Si un relé de 5 V no hace clic,
  mide 5 V entre `5V` y `GND`.
- **Placa ancha:** la ESP32-S3 y algunas ESP32 cubren una protoboard entera. Pon dos protoboards
  juntas con la placa a caballo entre ellas, o conecta la placa con cables hembra-hembra.

**Teclado:** las teclas y los modos (caja y productos) están en [Modos](#modos). En el teclado
4×3, que no tiene letras, `*` sin nada escrito cambia de modo.

## Cómo lee la tarjeta

El terminal no guarda claves ni verifica la tarjeta: lee la URL que la NTAG 424 DNA genera en cada
toque (SUN: un contador y una firma CMAC distintos cada vez) y se la manda al servidor junto con el
monto. El servidor tiene las claves, comprueba la firma y que el contador haya subido, y cobra en
Stellar con el permiso de gasto. Así, una copia de una lectura anterior no sirve.

Las NTAG 424 DNA vienen de fábrica sin la URL configurada. Se configuran una sola vez con un
celular con NFC (por ejemplo con NXP TagWriter) o desde el propio terminal.

**Estado actual:** el terminal ya manda el UID y la URL al servidor, pero el servidor todavía
identifica la tarjeta solo por su UID y no verifica la firma. Con eso ya cobra con cualquier
tarjeta o tag de 13,56 MHz (MIFARE, NTAG21x, NTAG 424 DNA); la protección contra copias llega con
la verificación SUN.

## Firmware

`firmware/` tiene el programa del terminal. Lee la tarjeta, le pide el cobro al
[servidor](../servidor/README.md) por Wi-Fi y, si se aprueba, muestra el pago, pita, enciende el
LED verde, activa el relé un segundo y deja en pantalla un **QR de recibo** que abre la
transacción en el explorador de Stellar. Si no se aprueba, muestra el motivo. El mismo cobro
también se puede **pagar con QR** desde el celular, sin la tarjeta.

### Modos

| Modo | Cómo se usa | Para |
|---|---|---|
| **Caja** | Se escribe el monto en el teclado (`D` es el punto, `*` borra) y `#` cobra | Tienda, cafetería |
| **Productos** | La pantalla lista los productos con su precio y las teclas `1` a `9` eligen uno | Máquina expendedora |
| **Precio fijo** | Sin teclado: cada tarjeta que se acerca paga el mismo monto | Torniquete, dispensador, lavadora |

- La tecla `B` alterna entre caja y productos, y el terminal recuerda el modo aunque se apague.
- `A` o `*` cancelan mientras espera la tarjeta. Cualquier tecla cierra el QR del recibo.
- Los productos se definen en `PRODUCTOS`, en `config.h`. La pantalla OLED muestra los 5 primeros.
- El precio fijo se activa al compilar con la variable `PAIZAP_PRECIO_FIJO` (por ejemplo `1.50`).
  En ese modo, después de cada pago el terminal espera a que retiren la tarjeta, para no cobrarla
  dos veces.

### Pagar con QR

Mientras espera la tarjeta, la pantalla muestra el monto junto a un QR. El cliente elige: acerca
la tarjeta o escanea el QR con la cámara del celular.

- El QR abre una página del servidor con el monto. Ahí el cliente escribe el código de su cuenta
  y su PIN, y paga de la misma cuenta de su tarjeta.
- El terminal consulta al servidor cada 2 segundos. Cuando el pago entra, hace lo mismo que con
  la tarjeta: aviso, relé y recibo.
- El cobro tiene un solo identificador para los dos caminos, así que no se puede pagar dos veces.
- Al cancelar (`A` o `*`), el terminal le avisa al servidor y ese QR deja de servir. Si nadie paga
  en 4 minutos, el terminal cancela solo; en precio fijo saca un QR nuevo.
- Si el servidor no responde al preparar el cobro, la pantalla pide solo la tarjeta.

### Recibo con QR

Después de un pago aprobado, la pantalla muestra durante 15 segundos (`RECIBO_MS`) un QR con un
enlace corto del servidor, que redirige a la transacción en el explorador de Stellar. En los
128×64 puntos de la OLED cabe un enlace de hasta 53 letras; por eso el enlace es corto y no el
del explorador completo.

### Si se cae la conexión

Un cobro tarda unos segundos, y si el Wi-Fi se cae en ese momento el terminal no sabe si el
servidor alcanzó a cobrar. Por eso:

- Cada cobro lleva un identificador fijo. El terminal reintenta con el mismo identificador,
  esperando a que vuelva el Wi-Fi, y el servidor devuelve el mismo resultado sin cobrar dos veces.
- Si aun así no hay respuesta, la pantalla dice «Sin confirmar», no «Rechazado», y el terminal
  sigue consultando ese cobro. Si se había cobrado, termina el pago: aviso, relé y recibo.
- Se pueden configurar dos redes Wi-Fi: el terminal usa la que esté disponible.
- Al encender, el terminal intenta conectarse hasta tres veces, porque el primer escaneo de redes
  a veces no encuentra ninguna.

### Consumo

El lector NFC y el Wi-Fi comparten el regulador de 3.3 V de la placa. Con la antena del lector
siempre encendida y el Wi-Fi a máxima potencia, el voltaje cae y la conexión falla: la placa deja
de ver redes o se desconecta a mitad de un cobro. El firmware lo evita así:

- La antena del PN532 solo se enciende un instante en cada lectura, cada 150 ms.
- El Wi-Fi transmite a 8.5 dBm (`WIFI_POTENCIA` en `config.h`), que alcanza a unos metros del
  router.

### Probar y diagnosticar

Al arrancar, el terminal dice por el monitor serie (115200 baudios) qué pantalla y qué lector
encontró, a qué red se conectó y si el servidor responde, y sigue funcionando sin las piezas que
falten. En reposo, acercar una tarjeta solo muestra su UID, sin cobrar: así se prueba el lector y
se sabe el UID de una tarjeta nueva para registrarla.

| Comando | Qué hace |
|---|---|
| `12.50` | Pide un cobro por ese monto, como si se escribiera en el teclado |
| `k 2`, `k B`, `k 1D50#` | Aprieta esas teclas, para probar sin teclado |
| `a` | Cancela |
| `w` | Dice a qué Wi-Fi está conectado y lista las redes que ve (solo ve las de 2.4 GHz) |
| `s` | Comprueba que el servidor responda |
| `l` | Vuelve a buscar el lector, para comprobar un cable corregido sin reiniciar |
| `q texto` | Dibuja un QR de prueba con ese texto |

Cada tecla del teclado se anuncia como `Tecla: X`, para comprobar su cableado.

### Variables al compilar

La red y el servidor se pasan al compilar con variables de entorno (el equipo las tiene en
Doppler). Sin servidor, el terminal queda en modo prueba: recorre el flujo sin cobrar.

| Variable | Para |
|---|---|
| `PAIZAP_WIFI_SSID`, `PAIZAP_WIFI_CLAVE` | Red Wi-Fi |
| `PAIZAP_WIFI_SSID2`, `PAIZAP_WIFI_CLAVE2` | Segunda red, opcional |
| `PAIZAP_SERVIDOR_URL` | Dirección del servidor, por ejemplo `http://bore.pub:<puerto>` |
| `TERMINAL_TOKEN` | Clave del terminal ante el servidor |
| `PAIZAP_PRECIO_FIJO` | Activa el modo de precio fijo con ese monto |
| `PAIZAP_FIRMA_TERMINAL` | El terminal firma el cobro él mismo: es lo que viene por defecto (ver «Cobro firmado por el terminal»). Con `0`, le pide el cobro al servidor de la demo |
| `PAIZAP_COMERCIO` | Cuenta del comercio de este terminal; con ella, solo cobra para esa cuenta |
| `PAIZAP_TERMINAL_SECRET` | Llave del terminal (`S...`). Vacía: el terminal crea la suya y la guarda |
| `PAIZAP_TOKEN` | Contrato del token con el que cobra (`C...`). Vacío: XLM de la red |

### Cobro firmado por el terminal (SDK)

El terminal guarda una llave, arma el `transfer_from` del permiso de gasto, lo firma y lo manda
directo a un nodo de Stellar. Es lo que hace por defecto. Para quien usa el terminal se ve así:
monto, tarjeta, aviso, relé y recibo.

| Paso | Quién |
|---|---|
| Decir de qué cuenta es la tarjeta, y revisar bloqueo y límite diario | Servidor (`POST /cobros/preparar`) |
| Pedirle a la red la hora, la secuencia y los recursos del cobro | Terminal, al nodo |
| Armar la transacción y su autorización, firmarla y enviarla | Terminal |
| Esperar a que la red la confirme | Terminal, al nodo |
| Comprobar ese cobro en la red, anotarlo y dar el recibo | Servidor (`POST /cobros/registrar`) |

- **El código** está en `firmware/src/sdk/` (núcleo en C sin nada del chip, y el cliente del nodo)
  y en `firmware/src/firma.cpp`. La firma Ed25519 es de Monocypher (`firmware/lib/monocypher`).
- **La llave del terminal** tiene que estar autorizada en la red: se agrega como firmante de la
  cuenta que tiene los permisos de gasto, con `servidor/src/autorizar-terminal.mjs`. Sin esa
  autorización la red rechaza el cobro. No puede cambiar los firmantes de esa cuenta, pero para
  la red su firma vale para cualquier pago o llamada a un contrato en nombre de ella, no solo
  para este cobro: ver «Lo que esa llave puede hacer de más» en
  [`servidor/`](../servidor/README.md).
- **La cuenta del terminal** paga la comisión de cada cobro (unos 9 000 stroops en testnet). El
  terminal la dice al arrancar y con la orden `c` del monitor serie.
- **Límites que pone el terminal:** solo cobra para `PAIZAP_COMERCIO`, solo con su token, y no firma
  si la comisión pasa de 0.1 XLM (`COMISION_MAXIMA` en `config.h`). Son límites del firmware: la
  red no los impone, así que protegen de un error o de un servidor que pida otra cosa, no de
  quien saque la llave del terminal.
- **Si no llega la confirmación**, el terminal dice «Sin confirmar» y sigue preguntándole a la
  red. La transacción vale 90 segundos: o entra en ese plazo, o no entra nunca.
- **El pago con QR** es otro camino: quien paga lo hace desde su celular, en la página de la demo.
- **El nodo** es `soroban-testnet.stellar.org` (`STELLAR_RPC_HOST` en `config.h`). El terminal
  comprueba su certificado contra la raíz de `firmware/src/sdk/root_ca.h`; otro proveedor puede
  necesitar otra raíz.

Medido en la ESP32-S3: el SDK suma 23,5 KB de flash; abrir la conexión con el nodo tarda unos 2 s
la primera vez; de la tarjeta al «aprobado» pasan de 7 a 10 s (el pago en la red se confirma en 3 a 6 s).

| Entorno | Para |
|---|---|
| `esp32` | ESP32 clásico real |
| `s3` | ESP32-S3 real |
| `sim-esp32`, `sim-s3` | Simulador Wokwi: un botón hace de tarjeta; los circuitos están en `sim/esp32` y `sim/s3` |

### Compilar sin instalar nada (Docker)

```bash
cd hardware/firmware
docker build -t paizap-pio .
docker run --rm -v "$PWD":/work -v paizap-pio-cache:/root/.platformio paizap-pio run            # todos
docker run --rm -v "$PWD":/work -v paizap-pio-cache:/root/.platformio paizap-pio run -e esp32   # uno
```

### Grabar la placa

Docker no ve el USB en Windows, así que la placa se graba con `esptool` (un `pip install esptool`
en un entorno virtual de Python basta). Usa la imagen única que deja la compilación:

```bash
python -m esptool --chip esp32s3 --port COM10 --before no_reset write_flash 0x0 .pio/build/s3/firmware.merged.bin
```

- El puerto sale en el Administrador de dispositivos («USB Serial Device (COMx)»). Para un ESP32
  clásico: `--chip esp32` y `.pio/build/esp32/firmware.merged.bin`, sin `--before no_reset`.
- **ESP32-S3 por su USB nativo:** con el firmware de Paizap ya grabado, `esptool` reinicia la placa
  solo y no hace falta `--before no_reset` ni tocar botones. La primera vez (o si la placa trae
  otro programa) hay que ponerla en modo de grabación a mano: mantén **BOOT**, aprieta y suelta
  **RST**, suelta BOOT; después de grabar, aprieta **RST** una vez para que arranque.
- El monitor serie sale por ese mismo USB a 115200 baudios. Al abrir el puerto, desactiva DTR y
  RTS, o la placa se reinicia.

### Simular

[Wokwi](https://wokwi.com) simula la placa, la pantalla, el teclado, el buzzer, los LEDs y el
relé, y hasta da Wi-Fi con internet (red `Wokwi-GUEST`). **No tiene el PN532**: en los entornos
`sim-*` un botón verde hace de tarjeta.

- **Local, sin cuentas (QEMU):** el emulador de ESP32 de Espressif corre el firmware del entorno
  `sim-esp32` en tu PC. No tiene pantalla ni teclado: todo pasa por el monitor serie. La prueba
  escribe un monto, acerca una tarjeta de prueba y comprueba que el relé se active y el pago
  termine:

  ```bash
  docker run --rm -v "$PWD":/work -v paizap-pio-cache:/root/.platformio paizap-pio run -e sim-esp32
  docker run --rm -v "$PWD":/work --entrypoint python paizap-pio sim/qemu/probar.py
  ```

- **Prueba automática con pantalla (Wokwi, Docker):** `sim/<placa>/cobro.test.yaml` escribe un
  monto, aprieta el botón de la tarjeta, comprueba que el relé se active y se apague, y guarda
  capturas de la pantalla (`1-monto.png`, `2-acerque.png`, `3-pago-ok.png`). Necesita un token de
  https://wokwi.com/dashboard/ci; el equipo lo tiene en Doppler (proyecto `paizap`, config `dev`):

  ```bash
  doppler run --project paizap --config dev -- docker run --rm -e WOKWI_CLI_TOKEN -v "$PWD":/work     --entrypoint wokwi-cli paizap-pio sim/esp32 --scenario cobro.test.yaml --timeout 60000
  ```

- **En VS Code, para jugar con el circuito:** instala la extensión *Wokwi for VS Code*, pide la
  licencia gratuita (`F1` → *Wokwi: Request a new License*), compila `sim-esp32` y abre
  `sim/esp32/diagram.json`.

La simulación prueba el firmware y el cableado lógico; no prueba la parte eléctrica (consumo,
voltajes, alcance de la antena). Eso se valida con la placa real.
