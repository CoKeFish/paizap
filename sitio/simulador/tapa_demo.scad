// La tapa del terminal con una ventana de pantalla mucho más grande. Solo para la demo web:
// la carcasa que se imprime lleva la ventana chica de la OLED real.
use <toki_carcasa.scad>
difference() {
  tapa_ensamblada();
  // Ventana de 64 x 32 mm, centrada donde va la pantalla. El corte se lleva también los
  // soportes de la OLED chica, que quedarían a la vista.
  translate([0, 0, 20.5]) rotate([10, 0, 0]) translate([43 - 32, 151.4 - 16, -14]) cube([64, 32, 24]);
}
