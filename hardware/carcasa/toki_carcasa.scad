// Carcasa del terminal Toki
// Pantalla OLED 0.96", lector PN532, teclado de membrana 4x4 y ESP32-S3, con espacio para los cables.
// Medidas en mm. Si una pieza tuya mide distinto, cambia su parámetro y vuelve a generar (ver README.md).
//
// Ejes: X de izquierda a derecha, Y del frente (bajo) al fondo (alto), Z hacia arriba.
// La tapa va inclinada; lo que se monta en ella se ubica con (u, v): u = X, v = distancia desde el
// borde del frente medida sobre la tapa.

/* [Qué generar] */
pieza = "conjunto"; // [conjunto, corte, base, tapa, barras, tapa_y_barras, todo, prueba]

/* [Caja] */
ancho = 86;          // exterior, de lado a lado
largo = 172;         // exterior, del frente al fondo
alto_frente = 20.5;  // altura de la pared del frente (sin la tapa)
angulo = 10;         // inclinación de la tapa
pared = 1.6;
piso = 1.6;
tapa = 2.0;
radio = 6;           // esquinas redondeadas
holgura = 0.4;       // juego entre el faldón de la tapa y la base, por lado
nervio = 0.25;       // nervios del faldón: dan el ajuste a presión y se pueden lijar
faldon_alto = 6;
faldon_grosor = 1.6;

/* [ESP32-S3: va boca abajo, con los pines hacia arriba y el USB hacia el fondo] */
esp_ancho = 27.94;
esp_largo = 57.15;
esp_topes_extra = [62.74, 70]; // otros largos de placa: sus topes quedan listos; el que estorbe se corta
esp_juego = 0.5;
esp_base = 2.5;       // altura de la plataforma (deja pasar el enchufe USB sin rozar la mesa)
esp_bajo_placa = 3.3; // cuánto sobresalen los componentes (blindaje y conectores USB)
usb_ancho = 26;
usb_alto = 8.8;
puente_max = 4;       // ningún techo plano supera este ancho: los huecos de las paredes terminan a 45°

/* [Pantalla OLED 0.96" de 4 pines] */
oled_ancho = 27.3;
oled_alto = 27.8;
oled_juego = 0.5;
oled_centro_activo = 12.4; // del borde de los pines al centro de la zona que enciende
oled_vidrio = 1.6;         // cuánto sobresale el vidrio de la placa
oled_placa = 1.6;
ventana = [25, 14.5];

/* [Lector PN532 (Elechouse V3)] */
pn_lado = 42.7;       // lado mayor; el marco es cuadrado para que entre en cualquier sentido
pn_juego = 0.5;
pn_separacion = 3.5;  // aire entre la tapa y la placa (para los componentes o las soldaduras)
pn_placa = 1.6;

/* [Teclado de membrana 4x4] */
tec_ancho = 69;
tec_alto = 77;
ranura = [24, 3.5];   // por aquí entra la cinta con su conector

/* [Sujeción] */
guia = 1.2;
poste_d = 5.0;        // 5 mm o más: el poste se imprime con relleno y no solo con perímetros
barra_ancho = 7.8;
barra_grosor = 2.4;
grabado = 0.6;
marca = "";          // texto grabado sobre la pantalla. Vacío = sin texto: las letras dejan islas y tiras
                     // muy finas en la primera capa, que se despegan de la cama

/* [Oculto] */
$fn = 48;
e = 0.01;
xc = ancho / 2;
S = largo / cos(angulo); // largo de la tapa medido sobre su pendiente
function zP(y) = alto_frente + y * tan(angulo); // altura del plano donde apoya la tapa

// Posiciones sobre la tapa (v)
tec_v0 = 9;                                   // borde inferior del teclado
pn_m = pn_lado + 2 * pn_juego;                // marco del lector
pn_v0 = tec_v0 + tec_alto + 3;
pn_vc = pn_v0 + pn_m / 2;
pn_h = pn_separacion + pn_placa;              // de la tapa al dorso de la placa
oled_mw = oled_ancho + 2 * oled_juego;        // marco de la pantalla
oled_mh = oled_alto + 2 * oled_juego;
oled_v0 = pn_v0 + pn_m + 2 * guia + 0.4;
oled_vc = oled_v0 + oled_mh / 2;
oled_h = oled_vidrio + oled_placa;
oled_v_pines = oled_v0 + oled_mh - oled_juego; // borde de la placa donde van los pines
ventana_vc = oled_v_pines - oled_centro_activo;
marca_v = oled_v_pines + 4.6;

oled_sep = oled_mw + 2 * guia + poste_d + 2.4; // distancia entre postes
pn_sep = pn_m + 2 * guia + poste_d + 2.4;
oled_pie = 2.0;                                // patas de la barra: libran los componentes del dorso
pn_pie = 3.5;
oled_poste = oled_h + oled_pie + barra_grosor + 3;
pn_poste = pn_h + pn_pie + barra_grosor + 3;
pn_barra_v = pn_vc - 8; // la barra del lector va corrida hacia el frente: deja libres los cables de la ESP32

// ---------- Formas básicas ----------

module contorno(d = 0) {
  r = max(radio - d, 0.5);
  translate([d + r, d + r]) offset(r = r) square([ancho - 2 * d - 2 * r, largo - 2 * d - 2 * r]);
}

module prisma(d = 0, extra = 0) {
  translate([0, 0, -5 - extra]) linear_extrude(zP(largo) + 40 + 2 * extra) contorno(d);
}

// Coloca algo en el sistema de la tapa: w = 0 es su cara interior, w = tapa la exterior.
module en_tapa() {
  translate([0, 0, alto_frente]) rotate([angulo, 0, 0]) children();
}

module losa(w0, w1) {
  en_tapa() translate([-20, -40, w0]) cube([ancho + 40, S + 80, w1 - w0]);
}

module rect_r(a, b, r) {
  offset(r = r) square([a - 2 * r, b - 2 * r], center = true);
}

// ---------- Base ----------

module base() {
  difference() {
    union() {
      difference() {
        hull() {
          linear_extrude(e) contorno(0.8);
          translate([0, 0, 0.8]) linear_extrude(zP(largo) + 5) contorno(0);
        }
        translate([0, 0, piso]) linear_extrude(zP(largo) + 10) contorno(pared);
      }
      cuna_esp();
    }
    losa(0, 100); // corte inclinado: la tapa apoya en este plano
    ventana_usb();
    pasacables();
    muesca_abrir();
  }
}

module cuna_esp() {
  w = esp_ancho + 2 * esp_juego;
  largos = concat([esp_largo], esp_topes_extra);
  lmax = max(largos) + 0.6;
  cp = 1.6;
  hp = esp_bajo_placa + 1.6 + 0.6; // la pared llega justo por encima de la placa
  y1 = largo - pared;
  translate([xc - w / 2 - cp, y1 - lmax - cp, piso - e]) {
    cube([w + 2 * cp, lmax + cp + 2 * e, esp_base + e]);
    difference() {
      cube([w + 2 * cp, lmax + cp + 2 * e, esp_base + hp]);
      translate([cp, cp, esp_base]) cube([w, lmax + 1, hp + 1]);
      translate([-1, cp + lmax - 38, esp_base + 2]) cube([w + 2 * cp + 2, 16, hp]); // para sacar la placa
    }
  }
  // Topes del extremo de la antena: uno por cada largo de placa. Son delgados para poder cortarlos.
  for (l = largos) if (l + 0.6 < lmax - 0.1)
    translate([xc - 4, y1 - l - 0.5 - 1, piso + esp_base - e]) cube([8, 1, hp]);
}

// Hueco de a x b en una pared vertical, con techo a 45° para que se imprima sin puente ni soportes.
module hueco_pared(a, b) {
  s = (a - puente_max) / 2;
  offset(r = 1) offset(delta = -1)
    polygon([[-a / 2, 0], [a / 2, 0], [a / 2, b], [a / 2 - s, b + s], [-a / 2 + s, b + s], [-a / 2, b]]);
}

module ventana_usb() {
  translate([xc, largo + 1, piso]) rotate([90, 0, 0]) linear_extrude(pared + 1 + e) hueco_pared(usb_ancho, usb_alto);
}

module pasacables() {
  translate([ancho - 17, largo + 1, 13]) rotate([90, 0, 0]) linear_extrude(pared + 2) hueco_pared(13, 4);
}

module muesca_abrir() {
  en_tapa() translate([xc - 8, S - 5, -1.4]) cube([16, 10, 1.4 + e]);
}

// ---------- Tapa ----------

module tapa_ensamblada() {
  difference() {
    union() {
      placa();
      faldon();
      en_tapa() { soportes_oled(); soportes_lector(); }
    }
    en_tapa() { ventana_oled(); alivio_oled(); ranura_teclado(); grabados(); }
  }
}

module placa() {
  c = 0.8; // chaflán del borde exterior: 0.6 de ancho para que, con la inclinación, no pase de 45°
  intersection() { prisma(0); losa(0, tapa - c); }
  hull() {
    intersection() { prisma(0); losa(tapa - c - e, tapa - c); }
    intersection() { prisma(0.6); losa(tapa - e, tapa); }
  }
}

module faldon() {
  d = pared + holgura;
  intersection() {
    union() {
      difference() { prisma(d); prisma(d + faldon_grosor, 2); }
      nervios(d);
    }
    losa(-faldon_alto + 1.5, e);
  }
  intersection() { // el borde de entrada es más delgado para que encaje fácil
    difference() { prisma(d + 0.4); prisma(d + faldon_grosor, 2); }
    losa(-faldon_alto, -faldon_alto + 1.5 + e);
  }
}

// Nervios verticales en la cara exterior del faldón, dos por lado.
module nervios(d) {
  r = 1.5;
  translate([0, 0, -5]) linear_extrude(zP(largo) + 40) {
    for (y = [0.25, 0.75] * largo) {
      translate([d + r - nervio, y]) circle(r);
      translate([ancho - d - r + nervio, y]) circle(r);
    }
    for (x = [xc - 22, xc + 22]) {
      translate([x, d + r - nervio]) circle(r);
      translate([x, largo - d - r + nervio]) circle(r);
    }
  }
}

// Guías en L en las cuatro esquinas de una placa de a x b centrada en (uc, vc).
module esquinas(uc, vc, a, b, h, pata = 6) {
  for (sx = [-1, 1], sy = [-1, 1]) translate([uc + sx * a / 2, vc + sy * b / 2, -h]) scale([sx, sy, 1])
    difference() {
      translate([-pata, -pata, 0]) cube([pata + guia, pata + guia, h + e]);
      translate([-pata - 1, -pata - 1, -1]) cube([pata + 1, pata + 1, h + 3]);
    }
}

// Dos postes a los lados; la barra de sujeción entra a presión en ellos.
module postes(uc, vc, sep, alto) {
  for (s = [-1, 1]) translate([uc + s * sep / 2, vc, e]) rotate([180, 0, 0]) {
    cylinder(d1 = poste_d + 3, d2 = poste_d, h = 1.5);
    cylinder(d = poste_d, h = alto - 1);
    translate([0, 0, alto - 1]) cylinder(d1 = poste_d, d2 = poste_d - 1.2, h = 1);
  }
}

module soportes_oled() {
  esquinas(xc, oled_vc, oled_mw, oled_mh, oled_h - 0.2);
  postes(xc, oled_vc, oled_sep, oled_poste);
}

module soportes_lector() {
  esquinas(xc, pn_vc, pn_m, pn_m, pn_h - 0.2);
  for (sx = [-1, 1], sy = [-1, 1]) // apoyos: dejan la placa separada de la tapa
    translate([xc + sx * (pn_m / 2 - 2.5) - 2.5, pn_vc + sy * (pn_m / 2 - 2.5) - 2.5, -pn_separacion])
      cube([5, 5, pn_separacion + e]);
  postes(xc, pn_barra_v, pn_sep, pn_poste);
}

module ventana_oled() {
  ch = 1.0;
  hull() {
    translate([xc, ventana_vc, -1]) linear_extrude(tapa - ch + 1) rect_r(ventana[0], ventana[1], 1);
    translate([xc, ventana_vc, tapa - e]) linear_extrude(2 * e) rect_r(ventana[0] + 2 * ch, ventana[1] + 2 * ch, 1 + ch);
  }
}

// Rebaje para las puntas soldadas de los pines de la pantalla.
module alivio_oled() {
  translate([xc - 8, oled_v_pines - 4, -e]) cube([16, 4.6, 1.0]);
}

module ranura_teclado() {
  ch = 0.5;
  translate([xc - ranura[0] / 2, tec_v0 - 3, -1]) cube([ranura[0], ranura[1], tapa + 2]);
  hull() {
    translate([xc - ranura[0] / 2, tec_v0 - 3, tapa - ch]) cube([ranura[0], ranura[1], e]);
    translate([xc - ranura[0] / 2 - ch, tec_v0 - 3 - ch, tapa]) cube([ranura[0] + 2 * ch, ranura[1] + 2 * ch, e]);
  }
}

module grabados() {
  translate([0, 0, tapa - grabado]) linear_extrude(grabado + 1) {
    if (marca != "")
      translate([xc, marca_v]) text(marca, size = 5.5, font = "DejaVu Sans:style=Bold", halign = "center", valign = "center");
    translate([xc - 8, pn_vc]) ondas();
  }
}

module ondas() {
  circle(d = 3.4);
  for (r = [6.5, 11, 15.5]) intersection() {
    difference() { circle(r + 0.8); circle(r - 0.8); }
    polygon([[0, 0], [40 * cos(38), 40 * sin(38)], [40 * cos(38), -40 * sin(38)]]);
  }
}

// La tapa acostada con la cara exterior sobre la cama, lista para imprimir sin soportes.
module tapa_imprimir() {
  translate([0, S, tapa]) rotate([180, 0, 0]) rotate([-angulo, 0, 0]) translate([0, 0, -alto_frente]) tapa_ensamblada();
}

// ---------- Barras de sujeción ----------

module barra(sep, pies, pie_alto) {
  L = sep + poste_d + 6.4;
  difference() {
    union() {
      hull() for (s = [-1, 1]) translate([s * (L - barra_ancho) / 2, 0, 0]) {
        cylinder(d1 = barra_ancho - 0.8, d2 = barra_ancho, h = 0.4);
        translate([0, 0, 0.4]) cylinder(d = barra_ancho, h = barra_grosor - 0.4);
      }
      for (s = [-1, 1]) translate([s * pies - 1.5, -barra_ancho / 2, barra_grosor - e]) cube([3, barra_ancho, pie_alto + e]);
    }
    for (s = [-1, 1]) {
      translate([s * sep / 2, 0, -1]) cylinder(d = poste_d - 0.1, h = barra_grosor + 2);
      translate([s * sep / 2, 0, -e]) cylinder(d1 = poste_d + 0.7, d2 = poste_d - 0.1, h = 0.4);
      translate([s * sep / 2, 0, -1]) scale([s, 1, 1]) translate([0, -0.5, 0]) cube([L, 1, barra_grosor + 2]);
    }
  }
}

module barra_oled() { barra(oled_sep, oled_ancho / 2 - 2.6, oled_pie); }
module barra_lector() { barra(pn_sep, pn_lado / 2 - 2.4, pn_pie); }

// ---------- Maqueta de las piezas electrónicas (solo para ver cómo queda) ----------

module maqueta() {
  y1 = largo - pared;
  z0 = piso + esp_base;
  zp = z0 + esp_bajo_placa;
  color("darkgreen") translate([xc - esp_ancho / 2, y1 - esp_largo, zp]) cube([esp_ancho, esp_largo, 1.6]);
  color("silver") {
    for (s = [-1, 1]) translate([xc + s * 6.2 - 4.5, y1 - 7.3, z0]) cube([9, 7.3, 3.2]);
    translate([xc - 9, y1 - esp_largo + 6, z0]) cube([18, 19, 3.2]);
  }
  color([0.15, 0.15, 0.15]) for (s = [-1, 1]) // pines con sus conectores Dupont
    translate([xc + s * 12.7 - 1.27, y1 - esp_largo + 0.6, zp + 1.6]) cube([2.54, 55.9, 16.5]);
  en_tapa() {
    color("royalblue") translate([xc - oled_ancho / 2, oled_v_pines - oled_alto, -oled_h]) cube([oled_ancho, oled_alto, oled_placa]);
    color([0.05, 0.05, 0.05]) translate([xc - 13.35, oled_v_pines - 4.8 - 19.3, -oled_vidrio]) cube([26.7, 19.3, oled_vidrio]);
    color([0.15, 0.15, 0.15]) translate([xc - 5.1, oled_v_pines - 2.6, -oled_h - 16.5]) cube([10.2, 2.54, 16.5]);
    color("firebrick") translate([xc - 42.7 / 2, pn_vc - 40.4 / 2, -pn_h]) cube([42.7, 40.4, pn_placa]);
    color([0.15, 0.15, 0.15]) translate([xc - 10.2, pn_vc - 40.4 / 2 + 0.3, -pn_h - 16.5]) cube([20.3, 2.54, 16.5]);
    color("orange") {
      translate([xc, oled_vc, -oled_h - oled_pie - barra_grosor]) barra_oled();
      translate([xc, pn_barra_v, -pn_h - pn_pie - barra_grosor]) barra_lector();
    }
    color([0.12, 0.13, 0.18]) translate([xc - tec_ancho / 2, tec_v0, tapa]) cube([tec_ancho, tec_alto, 0.9]);
    color([0.75, 0.78, 0.85]) for (i = [0:3], j = [0:3])
      translate([xc - tec_ancho / 2 + 6.5 + i * 15, tec_v0 + 9 + j * 16, tapa + 0.9]) cube([11, 11, 0.15]);
  }
}

// ---------- Salida ----------

if (pieza == "base") base();
else if (pieza == "tapa") tapa_imprimir();
else if (pieza == "barras") {
  translate([35, 5, 0]) barra_oled();
  translate([35, 15, 0]) barra_lector();
}
else if (pieza == "tapa_y_barras") { // la tapa y las dos barras en una sola impresión
  tapa_imprimir();
  translate([ancho + 12, 40, 0]) rotate([0, 0, 90]) barra_oled();
  translate([ancho + 12, 110, 0]) rotate([0, 0, 90]) barra_lector();
}
else if (pieza == "todo") { // base, tapa y barras en una sola impresión
  base();
  translate([ancho + 26, 0, 0]) { // separadas para que quepa el borde de adherencia de cada una
    tapa_imprimir();
    translate([ancho + 12, 40, 0]) rotate([0, 0, 90]) barra_oled();
    translate([ancho + 12, 110, 0]) rotate([0, 0, 90]) barra_lector();
  }
}
else if (pieza == "prueba") { // solo la zona de la pantalla y su barra, para comprobar el ajuste antes de imprimir la tapa
  intersection() {
    tapa_imprimir();
    translate([xc - 27, S - oled_v0 - oled_mh - 4, -1]) cube([54, oled_mh + 8, 40]);
  }
  translate([xc, S - oled_v0 - oled_mh - 14, 0]) barra_oled();
}
else if (pieza == "nada") {}
else if (pieza == "corte")
  difference() {
    union() { base(); tapa_ensamblada(); maqueta(); }
    translate([-1, -10, -10]) cube([xc + 1, largo + 20, 200]);
  }
else {
  base();
  tapa_ensamblada();
  maqueta();
}
