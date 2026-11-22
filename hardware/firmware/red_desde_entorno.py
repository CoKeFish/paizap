# Pasa la red Wi-Fi y el servidor al firmware desde variables de entorno, al compilar:
#   TOKI_WIFI_SSID, TOKI_WIFI_CLAVE, TOKI_SERVIDOR_URL, TERMINAL_TOKEN
# Genera .pio/build/<entorno>/gen/toki_red.h (fuera del repo: .pio/ está en .gitignore), así los
# nombres y claves con espacios o símbolos llegan intactos y nunca quedan en el código.
# Variables vacías = modo prueba: el terminal no cobra.
Import("env")
import json
import os

gen = os.path.join(env.subst("$PROJECT_BUILD_DIR"), env.subst("$PIOENV"), "gen")
os.makedirs(gen, exist_ok=True)


def cadena_c(variable):
    # json.dumps escapa comillas y barras igual que un literal de C.
    return json.dumps(os.environ.get(variable, ""), ensure_ascii=False)


contenido = (
    "// Generado por red_desde_entorno.py en cada compilación. No editar.\n"
    "#define WIFI_SSID " + cadena_c("TOKI_WIFI_SSID") + "\n"
    "#define WIFI_CLAVE " + cadena_c("TOKI_WIFI_CLAVE") + "\n"
    "#define WIFI_SSID2 " + cadena_c("TOKI_WIFI_SSID2") + "\n"
    "#define WIFI_CLAVE2 " + cadena_c("TOKI_WIFI_CLAVE2") + "\n"
    "#define SERVIDOR_URL " + cadena_c("TOKI_SERVIDOR_URL") + "\n"
    "#define TERMINAL_TOKEN " + cadena_c("TERMINAL_TOKEN") + "\n"
    "#define PRECIO_FIJO " + cadena_c("TOKI_PRECIO_FIJO") + "\n"
    # Cobro firmado por el terminal (SDK): ver firma.h
    "#define FIRMA_TERMINAL " + ("1" if os.environ.get("TOKI_FIRMA_TERMINAL") == "1" else "0") + "\n"
    "#define COMERCIO_CUENTA " + cadena_c("TOKI_COMERCIO") + "\n"
    "#define TOKEN_CONTRATO " + cadena_c("TOKI_TOKEN") + "\n"
    "#define TERMINAL_SEMILLA " + cadena_c("TOKI_TERMINAL_SECRET") + "\n"
)

ruta = os.path.join(gen, "toki_red.h")
anterior = open(ruta, encoding="utf-8").read() if os.path.exists(ruta) else None
if anterior != contenido:  # no tocar el archivo si no cambió: evita recompilar de más
    with open(ruta, "w", encoding="utf-8") as archivo:
        archivo.write(contenido)

env.Append(CPPPATH=[gen])
print("Red: %s · servidor: %s · modo: %s" % (
    os.environ.get("TOKI_WIFI_SSID") or "(sin Wi-Fi)",
    os.environ.get("TOKI_SERVIDOR_URL") or "(sin servidor: modo prueba)",
    ("autoservicio a " + os.environ["TOKI_PRECIO_FIJO"]) if os.environ.get("TOKI_PRECIO_FIJO") else "caja",
))
print("Cobro: lo firma " + ("el terminal (SDK)" if os.environ.get("TOKI_FIRMA_TERMINAL") == "1" else "el servidor"))
