# Recorta la captura que deja retrato.mjs y la guarda liviana para la portada.
#   python recortar_retrato.py aparato-crudo.png ../public/aparato.webp
# Deja el aparato y la tarjeta enteros, y la sombra del piso como un óvalo suave, sin bordes rectos.
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

entrada, salida = sys.argv[1], sys.argv[2]
MARGEN = 90

imagen = Image.open(entrada).convert('RGBA')
solido = imagen.getchannel('A').point(lambda v: 255 if v > 245 else 0)
x0, y0, x1, y1 = solido.getbbox()
imagen = imagen.crop((max(x0 - MARGEN, 0), max(y0 - MARGEN, 0), min(x1 + MARGEN, imagen.width), min(y1 + MARGEN, imagen.height)))

ancho, alto = imagen.size
alfa = imagen.getchannel('A')
# Lo sólido, con su borde suavizado, se queda entero.
solido = alfa.point(lambda v: 255 if v > 245 else 0).filter(ImageFilter.MaxFilter(7))
ovalo = Image.new('L', (ancho, alto), 0)
ImageDraw.Draw(ovalo).ellipse((ancho * 0.20, alto * 0.30, ancho * 0.80, alto * 0.86), fill=150)
ovalo = ovalo.filter(ImageFilter.GaussianBlur(ancho * 0.07))
imagen.putalpha(ImageChops.lighter(ImageChops.multiply(alfa, ovalo), ImageChops.multiply(alfa, solido)))

imagen.thumbnail((1280, 1280), Image.LANCZOS)
imagen.save(salida, quality=88, method=6)
print(salida, imagen.size)
