#!/usr/bin/env bash
# Trae a la documentación los ejemplos de Stellar MCU SDK, tal como están en su repositorio.
# La documentación solo muestra código que existe ahí: estas copias no se editan a mano.
#
#   ./copiar.sh <carpeta del repositorio stellar-mcu-sdk>
#
# Los ejemplos se compilan en el repositorio del SDK, con el proyecto de cada uno:
#   pio run -d examples/esp32_pay_and_confirm -e s3
set -euo pipefail

sdk="$(cd "${1:?falta la carpeta del repositorio stellar-mcu-sdk}" && pwd)"
aqui="$(cd "$(dirname "$0")" && pwd)"

# Carpeta de aquí = ejemplo de allá.
copiar() {
  local destino="$aqui/$1/main.cpp" origen="$sdk/examples/$2/src/main.cpp"
  mkdir -p "$aqui/$1"
  if [ -f "$destino" ] && cmp -s "$origen" "$destino"; then
    echo "$1: igual que $2"
  else
    cp "$origen" "$destino"
    echo "$1: actualizado desde $2"
  fi
}

copiar pay_and_confirm esp32_pay_and_confirm
copiar standalone_device esp32_standalone_device
