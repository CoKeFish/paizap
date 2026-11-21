# Une bootloader + tabla de particiones + app en una sola imagen que Wokwi puede cargar
# (.pio/build/<env>/firmware.merged.bin). Script tomado de la documentación de Wokwi.
Import("env")
from os.path import join


def merge_firmware(source, target, env):
    board = env.BoardConfig()
    merged = join(env.subst("$BUILD_DIR"), "firmware.merged.bin")
    esptool = join(env.PioPlatform().get_package_dir("tool-esptoolpy"), "esptool.py")
    images = [(offset, env.subst(path)) for offset, path in env.get("FLASH_EXTRA_IMAGES", [])]
    images.append((env.subst("$ESP32_APP_OFFSET"), str(target[0])))
    cmd = [
        '"$PYTHONEXE"', '"%s"' % esptool,
        "--chip", board.get("build.mcu", "esp32"),
        "merge_bin", "-o", '"%s"' % merged,
        "--flash_mode", board.get("build.flash_mode", "dio"),
        "--flash_size", board.get("upload.flash_size", "4MB"),
    ]
    for offset, path in images:
        cmd += [offset if isinstance(offset, str) else hex(offset), '"%s"' % path]
    env.Execute(env.VerboseAction(" ".join(cmd), "Uniendo imágenes en %s" % merged))


env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", merge_firmware)
