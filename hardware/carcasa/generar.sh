#!/bin/sh
# Genera los STL y las vistas con OpenSCAD en Docker (no hay que instalar nada).
#   sh generar.sh
set -e
cd "$(dirname "$0")"
mkdir -p stl img
DIR="$(pwd -W 2>/dev/null || pwd)"
MSYS_NO_PATHCONV=1 docker run --rm -v "$DIR:/work" -w /work openscad/openscad:dev sh -c '
  set -e
  for p in base tapa barras tapa_y_barras todo prueba; do
    openscad --backend=manifold -D "pieza=\"$p\"" -o stl/$p.stl paizap_carcasa.scad 2>&1 | grep -E "WARNING|ERROR" || true
  done
  V="--imgsize=1500,1100 --colorscheme=Tomorrow --autocenter --viewall"
  vista() { # nombre, pieza, cámara
    openscad $V -D "pieza=\"$2\"" --camera=$3 -o img/$1.png paizap_carcasa.scad >/dev/null 2>&1 || echo "FALLO la vista $1"
  }
  vista conjunto      conjunto 0,0,0,58,0,25,0
  vista atras         conjunto 0,0,0,65,0,205,0
  vista corte         corte    0,0,0,80,0,270,0
  vista tapa_interior tapa     0,0,0,40,0,20,0
  vista base          base     0,0,0,45,0,200,0
'
ls -l stl img
