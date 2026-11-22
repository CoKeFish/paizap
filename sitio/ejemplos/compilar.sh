#!/usr/bin/env bash
# Compila los ejemplos de la documentación contra el código de Stellar MCU SDK, para ESP32-S3 y
# ESP32. No graba nada en la placa: solo comprueba que compilan con el SDK tal como está.
#
#   ./compilar.sh <carpeta del repositorio stellar-mcu-sdk>
#
# Usa la imagen de Docker `toki-pio` (PlatformIO), la misma del firmware del terminal.
set -euo pipefail

sdk="$(cd "${1:?falta la carpeta del repositorio stellar-mcu-sdk}" && pwd)"
aqui="$(cd "$(dirname "$0")" && pwd)"
trabajo="$(mktemp -d)"
trap 'rm -rf "$trabajo"' EXIT

for ejemplo in pay_and_confirm payment_notifier; do
  proyecto="$trabajo/$ejemplo"
  mkdir -p "$proyecto/src" "$proyecto/lib/sdk"
  cp "$aqui/$ejemplo/main.cpp" "$proyecto/src/"
  # El SDK entra como una librería del proyecto: el núcleo, el cliente del nodo y Monocypher.
  cp "$sdk"/src/stellar_mcu.[ch] "$sdk"/platforms/esp32-arduino/* "$sdk"/third_party/monocypher/*.[ch] "$proyecto/lib/sdk/"
  cat > "$proyecto/platformio.ini" <<'INI'
[env]
platform = espressif32@6.9.0
framework = arduino

[env:s3]
board = esp32-s3-devkitc-1
build_flags = -DARDUINO_USB_CDC_ON_BOOT=1

[env:esp32]
board = esp32dev
INI
  echo "== $ejemplo"
  MSYS_NO_PATHCONV=1 docker run --rm -v "$(cygpath -w "$proyecto" 2>/dev/null || echo "$proyecto"):/work" \
    -v toki-pio-cache:/root/.platformio toki-pio run 2>&1 | grep -E " error |Error|RAM:|Flash:|SUCCESS|FAILED" || true
done
