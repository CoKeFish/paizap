# Electrónica del terminal Toki

Prototipo armado en protoboard con módulos comerciales, sin placa propia. Sirve para los dos modos
del terminal: **caja** (teclado para el monto) y **autoservicio** (relé que activa la máquina).

```
                 ┌──────────────────────────┐
  Tarjeta  )))   │  Lector NFC (PN532)      │── SPI ──┐
  NTAG 424 DNA   └──────────────────────────┘         │
                                                ┌─────┴───────────────┐
  Pantalla (OLED o LCD) ──────── I2C ───────────┤                     │
  Teclado 4x4 ─────────────── 8 pines ──────────┤   ESP32-S3          │── Wi-Fi ──► Servidor Toki ──► Stellar
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

**Para después, no para el prototipo:** módulo 4G (SIM7600 o A7670) donde no hay Wi-Fi, carcasa
impresa en 3D y una placa propia (PCB) que reemplace la protoboard.

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

**Teclado del modo caja:** dígitos para el monto, `D` punto decimal, `*` borrar, `A` cancelar y
`#` cobrar. En el 4×3, `*` borra y, en la pantalla de cobro, cancela.

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

`firmware/` tiene el programa del terminal: escribe un monto, presiona `#`, acerca la tarjeta y
el terminal le pide el cobro al [servidor](../servidor/README.md). Si se aprueba, muestra el pago,
pita, enciende el LED verde y activa el relé un segundo; si no, muestra el motivo. Por el monitor
serie (115200 baudios) imprime el UID, la URL SUN de la tarjeta y la respuesta del servidor.

Sirve también para probar el hardware pieza por pieza: al arrancar dice qué pantalla y qué lector
encontró, y sigue funcionando sin los que falten. En reposo, acercar una tarjeta solo muestra su
UID por el monitor serie, sin cobrar: así se prueba el lector y se sabe el UID de una tarjeta
nueva para registrarla.

El monto también se puede escribir en el monitor serie (`12.50` + Enter; `a` cancela). Sirve para
probar una placa sin teclado y para las pruebas automáticas del simulador. Con `w`, la placa dice
a qué Wi-Fi está conectada y lista las redes que ve: solo ve las de 2.4 GHz, así que si tu red no
aparece ahí, no le sirve. Con `l` vuelve a buscar el lector, para comprobar un cable corregido
sin reiniciar.

La red y el servidor se pasan al compilar con las variables `TOKI_WIFI_SSID`, `TOKI_WIFI_CLAVE`,
`TOKI_SERVIDOR_URL` y `TERMINAL_TOKEN` (el equipo las tiene en Doppler). Sin ellas, el terminal
queda en modo prueba y no cobra.

| Entorno | Para |
|---|---|
| `esp32` | ESP32 clásico real |
| `s3` | ESP32-S3 real |
| `sim-esp32`, `sim-s3` | Simulador Wokwi: un botón hace de tarjeta; los circuitos están en `sim/esp32` y `sim/s3` |

### Compilar sin instalar nada (Docker)

```bash
cd hardware/firmware
docker build -t toki-pio .
docker run --rm -v "$PWD":/work -v toki-pio-cache:/root/.platformio toki-pio run            # todos
docker run --rm -v "$PWD":/work -v toki-pio-cache:/root/.platformio toki-pio run -e esp32   # uno
```

### Grabar la placa

Docker no ve el USB en Windows, así que la placa se graba con `esptool` (un `pip install esptool`
en un entorno virtual de Python basta). Usa la imagen única que deja la compilación:

```bash
python -m esptool --chip esp32s3 --port COM10 --before no_reset write_flash 0x0 .pio/build/s3/firmware.merged.bin
```

- El puerto sale en el Administrador de dispositivos («USB Serial Device (COMx)»). Para un ESP32
  clásico: `--chip esp32` y `.pio/build/esp32/firmware.merged.bin`, sin `--before no_reset`.
- **ESP32-S3 por su USB nativo:** con el firmware de Toki ya grabado, `esptool` reinicia la placa
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
  docker run --rm -v "$PWD":/work -v toki-pio-cache:/root/.platformio toki-pio run -e sim-esp32
  docker run --rm -v "$PWD":/work --entrypoint python toki-pio sim/qemu/probar.py
  ```

- **Prueba automática con pantalla (Wokwi, Docker):** `sim/<placa>/cobro.test.yaml` escribe un
  monto, aprieta el botón de la tarjeta, comprueba que el relé se active y se apague, y guarda
  capturas de la pantalla (`1-monto.png`, `2-acerque.png`, `3-pago-ok.png`). Necesita un token de
  https://wokwi.com/dashboard/ci; el equipo lo tiene en Doppler (proyecto `toki`, config `dev`):

  ```bash
  doppler run --project toki --config dev -- docker run --rm -e WOKWI_CLI_TOKEN -v "$PWD":/work     --entrypoint wokwi-cli toki-pio sim/esp32 --scenario cobro.test.yaml --timeout 60000
  ```

- **En VS Code, para jugar con el circuito:** instala la extensión *Wokwi for VS Code*, pide la
  licencia gratuita (`F1` → *Wokwi: Request a new License*), compila `sim-esp32` y abre
  `sim/esp32/diagram.json`.

La simulación prueba el firmware y el cableado lógico; no prueba la parte eléctrica (consumo,
voltajes, alcance de la antena). Eso se valida con la placa real.
