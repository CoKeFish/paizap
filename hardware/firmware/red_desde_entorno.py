# Pasa la red Wi-Fi y el servidor al firmware desde variables de entorno, al compilar:
#   PAIZAP_WIFI_SSID, PAIZAP_WIFI_CLAVE, PAIZAP_SERVIDOR_URL, TERMINAL_TOKEN
# Genera .pio/build/<entorno>/gen/paizap_red.h (fuera del repo: .pio/ está en .gitignore), así los
# nombres y claves con espacios o símbolos llegan intactos y nunca quedan en el código.
# Variables vacías = modo prueba: el terminal no cobra.
Import("env")
import json
import os

gen = os.path.join(env.subst("$PROJECT_BUILD_DIR"), env.subst("$PIOENV"), "gen")

# Quién firma el cobro. Por defecto, el terminal, con Stellar MCU SDK. PAIZAP_FIRMA_TERMINAL=0 lo
# deja en el servidor de la demo. En la simulación (entornos sim-*) no hay nodo de Stellar, así
# que ahí el valor por defecto es 0.
firma_terminal = os.environ.get("PAIZAP_FIRMA_TERMINAL")
if firma_terminal not in ("0", "1"):
    firma_terminal = "0" if env.subst("$PIOENV").startswith("sim") else "1"
os.makedirs(gen, exist_ok=True)


def cadena_c(variable):
    # json.dumps escapa comillas y barras igual que un literal de C.
    return json.dumps(os.environ.get(variable, ""), ensure_ascii=False)


contenido = (
    "// Generado por red_desde_entorno.py en cada compilación. No editar.\n"
    "#define WIFI_SSID " + cadena_c("PAIZAP_WIFI_SSID") + "\n"
    "#define WIFI_CLAVE " + cadena_c("PAIZAP_WIFI_CLAVE") + "\n"
    "#define WIFI_SSID2 " + cadena_c("PAIZAP_WIFI_SSID2") + "\n"
    "#define WIFI_CLAVE2 " + cadena_c("PAIZAP_WIFI_CLAVE2") + "\n"
    "#define SERVIDOR_URL " + cadena_c("PAIZAP_SERVIDOR_URL") + "\n"
    "#define TERMINAL_TOKEN " + cadena_c("TERMINAL_TOKEN") + "\n"
    "#define PRECIO_FIJO " + cadena_c("PAIZAP_PRECIO_FIJO") + "\n"
    # Cobro firmado por el terminal (SDK): ver firma.h
    "#define FIRMA_TERMINAL " + firma_terminal + "\n"
    "#define COMERCIO_CUENTA " + cadena_c("PAIZAP_COMERCIO") + "\n"
    "#define TOKEN_CONTRATO " + cadena_c("PAIZAP_TOKEN") + "\n"
    "#define TERMINAL_SEMILLA " + cadena_c("PAIZAP_TERMINAL_SECRET") + "\n"
)

ruta = os.path.join(gen, "paizap_red.h")
anterior = open(ruta, encoding="utf-8").read() if os.path.exists(ruta) else None
if anterior != contenido:  # no tocar el archivo si no cambió: evita recompilar de más
    with open(ruta, "w", encoding="utf-8") as archivo:
        archivo.write(contenido)

env.Append(CPPPATH=[gen])
print("Red: %s · servidor: %s · modo: %s" % (
    os.environ.get("PAIZAP_WIFI_SSID") or "(sin Wi-Fi)",
    os.environ.get("PAIZAP_SERVIDOR_URL") or "(sin servidor: modo prueba)",
    ("autoservicio a " + os.environ["PAIZAP_PRECIO_FIJO"]) if os.environ.get("PAIZAP_PRECIO_FIJO") else "caja",
))
print("Cobro: lo firma " + ("el terminal (SDK)" if firma_terminal == "1" else "el servidor de la demo"))
