"""Prueba local del firmware en QEMU (emulador del ESP32 de Espressif), sin hardware ni cuentas.

Arranca el firmware del entorno sim-esp32, escribe un monto por el monitor serie, acerca una
tarjeta de prueba ("t") y comprueba que el terminal active el relé y termine el pago.
QEMU no emula la pantalla, el teclado ni el buzzer: eso se ve en Wokwi o en la placa real.

Uso (desde hardware/firmware):
  docker run --rm -v "$PWD":/work --entrypoint python paizap-pio sim/qemu/probar.py
"""
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path

BUILD = Path(".pio/build/sim-esp32")
FLASH = BUILD / "flash-qemu.bin"
TAMANO_FLASH = 4 * 1024 * 1024

PASOS = [
    # (esperar este texto, luego escribir esto)
    ("Listo.", "12.50\n"),
    ("Cobrar 12.50 XLM: acerque la tarjeta", "t\n"),
    ("Monto: 12.50 XLM", None),
    ("Relé ON", None),
    ("Relé OFF", None),
    ("Pago OK", None),
]


def imagen_flash():
    merged = (BUILD / "firmware.merged.bin").read_bytes()
    FLASH.write_bytes(merged + b"\xff" * (TAMANO_FLASH - len(merged)))


def main():
    if not (BUILD / "firmware.merged.bin").exists():
        sys.exit("Falta compilar: pio run -e sim-esp32")
    imagen_flash()
    qemu = subprocess.Popen(
        ["qemu-system-xtensa", "-nographic", "-machine", "esp32",
         "-drive", f"file={FLASH},if=mtd,format=raw",
         "-global", "driver=timer.esp32.timg,property=wdt_disable,value=true"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    lineas = queue.Queue()

    def leer():
        for linea in iter(qemu.stdout.readline, b""):
            texto = linea.decode(errors="replace").rstrip()
            print("  │ " + texto, flush=True)
            lineas.put(texto)

    threading.Thread(target=leer, daemon=True).start()
    ok = True
    try:
        for esperado, escribir in PASOS:
            limite = time.time() + 60
            while True:
                try:
                    if esperado in lineas.get(timeout=max(0.1, limite - time.time())):
                        break
                except queue.Empty:
                    pass
                if time.time() > limite:
                    print(f"FALLÓ: no apareció «{esperado}»")
                    ok = False
                    break
            if not ok:
                break
            print(f"✓ {esperado}")
            if escribir:
                time.sleep(0.3)
                qemu.stdin.write(escribir.encode())
                qemu.stdin.flush()
    finally:
        qemu.kill()
    print("PRUEBA OK" if ok else "PRUEBA FALLIDA")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
