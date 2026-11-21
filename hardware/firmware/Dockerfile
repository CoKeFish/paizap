# Compila y simula el firmware sin instalar nada en el equipo.
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends libglib2.0-0 libpixman-1-0 libsdl2-2.0-0 libslirp0 libgcrypt20 xz-utils \
 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir platformio==6.1.18
# Wokwi CLI (simulador con pantalla y teclado; necesita token)
ADD --chmod=755 https://github.com/wokwi/wokwi-cli/releases/download/v0.29.1/wokwi-cli-linuxstatic-x64 /usr/local/bin/wokwi-cli
# QEMU de Espressif (emulador local del ESP32; solo monitor serie)
ADD https://github.com/espressif/qemu/releases/download/esp-develop-9.2.2-20260417/qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-x86_64-linux-gnu.tar.xz /tmp/qemu.tar.xz
RUN tar -xJf /tmp/qemu.tar.xz -C /opt && rm /tmp/qemu.tar.xz && ln -s /opt/qemu/bin/qemu-system-xtensa /usr/local/bin/
WORKDIR /work
ENTRYPOINT ["pio"]
