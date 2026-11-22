# Saca del logo todos los recursos de marca: logo para la web, favicon, íconos de Android y
# pantallas de arranque. Cuando haya un logo mejor (más grande o en vector exportado a PNG), se
# reemplaza `logo-original.png` y se corre de nuevo:
#
#   python marca/generar.py        (desde app/; necesita Pillow: pip install pillow)
#
# El logo original es un cuadro azul de esquinas redondeadas sobre blanco. Aquí se lleva el azul
# hasta los bordes («a sangre»), para poder ponerlo sobre cualquier superficie azul noche sin que
# se note el recorte, y de esa versión salen los demás tamaños.
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
APP = AQUI.parent
PUBLICO = APP / 'public'
RES = APP / 'android' / 'app' / 'src' / 'main' / 'res'

NOCHE = (0, 11, 37)  # #000B25, el azul del logo
ESCALA = 4           # las máscaras se dibujan en grande y se reducen, para bordes suaves


def mascara_redondeada(lado, radio):
    grande = Image.new('L', (lado * ESCALA, lado * ESCALA), 0)
    ImageDraw.Draw(grande).rounded_rectangle([0, 0, lado * ESCALA - 1, lado * ESCALA - 1], radio * ESCALA, fill=255)
    return grande.resize((lado, lado), Image.LANCZOS)


def mascara_circular(lado):
    grande = Image.new('L', (lado * ESCALA, lado * ESCALA), 0)
    ImageDraw.Draw(grande).ellipse([0, 0, lado * ESCALA - 1, lado * ESCALA - 1], fill=255)
    return grande.resize((lado, lado), Image.LANCZOS)


# ---- 1. El logo a sangre ----
original = Image.open(AQUI / 'logo-original.png').convert('RGB')
lado = min(original.size)
original = original.crop((0, 0, lado, lado))

# El blanco de las cuatro esquinas (y su borde difuminado) pasa a azul: se rellena desde cada
# esquina todo lo claro que esté conectado con ella. Las letras blancas no se tocan, porque el
# azul del cuadro las separa de las esquinas.
sangre = original.copy()
for esquina in [(0, 0), (lado - 1, 0), (0, lado - 1), (lado - 1, lado - 1)]:
    if sum(sangre.getpixel(esquina)) > 300:
        ImageDraw.floodfill(sangre, esquina, NOCHE, thresh=600)

# El azul del original no es parejo (viene con ruido y con un borde más claro en las orillas). Se
# deja exacto: todo lo que es casi azul noche pasa a azul noche, y también el marco de la orilla.
# Así el logo se funde con cualquier superficie de ese color y no se le ve el contorno.
pixeles = sangre.load()
orilla = 6
for y in range(lado):
    for x in range(lado):
        r, g, b = pixeles[x, y]
        en_la_orilla = x < orilla or y < orilla or x >= lado - orilla or y >= lado - orilla
        if en_la_orilla or max(abs(r - NOCHE[0]), abs(g - NOCHE[1]), abs(b - NOCHE[2])) <= 22:
            pixeles[x, y] = NOCHE

# El dibujo (letras y arcos): lo claro sobre el azul.
dibujo = sangre.convert('L').point(lambda v: 255 if v > 110 else 0)
x1, y1, x2, y2 = dibujo.getbbox()
centro = lado / 2
# Qué tan lejos del centro llega el dibujo, como fracción del lado (para que entre en un círculo).
alcance = max(
    ((x - centro) ** 2 + (y - centro) ** 2) ** 0.5
    for y in range(y1, y2) for x in range(x1, x2) if dibujo.getpixel((x, y))
) / lado
print(f'logo {lado}px · dibujo {x1},{y1}–{x2},{y2} · alcance {alcance:.3f}')


def sobre_azul(ancho, alto, fraccion):
    """Lienzo azul de ancho×alto con el logo a sangre centrado, de lado = fraccion × el lado menor."""
    lienzo = Image.new('RGB', (ancho, alto), NOCHE)
    tam = round(min(ancho, alto) * fraccion)
    lienzo.paste(sangre.resize((tam, tam), Image.LANCZOS), ((ancho - tam) // 2, (alto - tam) // 2))
    return lienzo


def con_mascara(imagen, mascara):
    salida = imagen.convert('RGBA')
    salida.putalpha(mascara)
    return salida


# ---- 2. Web ----
PUBLICO.mkdir(exist_ok=True)
sangre.resize((512, 512), Image.LANCZOS).save(PUBLICO / 'logo.png', optimize=True)
# Solo el dibujo, con un poco de aire: para la franja azul de arriba de cada pantalla.
aire = round(lado * 0.035)
sangre.crop((x1 - aire, y1 - aire, x2 + aire, y2 + aire)).save(PUBLICO / 'logo-franja.png', optimize=True)
# El ícono con las esquinas redondeadas (para fondos que no son azules) y el favicon.
con_mascara(sangre.resize((256, 256), Image.LANCZOS), mascara_redondeada(256, 56)).save(PUBLICO / 'icono.png', optimize=True)
con_mascara(sangre.resize((64, 64), Image.LANCZOS), mascara_redondeada(64, 14)).save(PUBLICO / 'favicon.png', optimize=True)

# ---- 3. Íconos de Android ----
# En el ícono adaptable el sistema recorta un círculo o un cuadro redondeado de 72 de los 108 dp;
# lo que seguro se ve es un círculo de 66 dp. El dibujo se achica hasta entrar ahí.
fraccion_adaptable = min(1.0, (66 / 108 / 2) / alcance * 0.96)
fraccion_redonda = min(1.0, 0.5 / alcance * 0.90)
for densidad, base in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    carpeta = RES / f'mipmap-{densidad}'
    con_mascara(sangre.resize((base, base), Image.LANCZOS), mascara_redondeada(base, round(base * 0.22))).save(carpeta / 'ic_launcher.png', optimize=True)
    con_mascara(sobre_azul(base, base, fraccion_redonda), mascara_circular(base)).save(carpeta / 'ic_launcher_round.png', optimize=True)
    primer_plano = round(base * 108 / 48)
    sobre_azul(primer_plano, primer_plano, fraccion_adaptable).save(carpeta / 'ic_launcher_foreground.png', optimize=True)

# ---- 4. Pantalla de arranque ----
for archivo in sorted(RES.glob('drawable*/splash.png')):
    ancho, alto = Image.open(archivo).size
    sobre_azul(ancho, alto, 0.62).save(archivo, optimize=True)

print(f'adaptable {fraccion_adaptable:.2f} · redonda {fraccion_redonda:.2f} · listo')
