#!/bin/sh
# Builds the Stellar MCU SDK core as WebAssembly for the Paizap web simulator (browser and Node).
# This is an adaptation for the demo: the SDK itself targets microcontrollers.
# Needs Emscripten (emcc) and a checkout of the SDK:
#   SDK_DIR=/path/to/stellar-mcu-sdk sh build.sh
# It leaves stellar_mcu.mjs next to this script: a single file with the WebAssembly inside.
set -e
SDK="${SDK_DIR:-../stellar-mcu-sdk}"
HERE="$(dirname "$0")"
emcc -O2 -std=c99 -Wall \
  -I"$SDK/src" -I"$SDK/third_party/monocypher" -I"$HERE" \
  "$HERE/bridge.c" "$HERE/sha256.c" "$SDK/src/stellar_mcu.c" \
  "$SDK/third_party/monocypher/monocypher.c" "$SDK/third_party/monocypher/monocypher-ed25519.c" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sSINGLE_FILE=1 -sENVIRONMENT=web,node \
  -sEXPORTED_RUNTIME_METHODS=ccall -sALLOW_MEMORY_GROWTH=0 \
  -o "$HERE/stellar_mcu.mjs"
ls -l "$HERE/stellar_mcu.mjs"
