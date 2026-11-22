// La pantalla del teléfono de quien paga: la billetera de Paizap, muy resumida.
// Primero muestra cómo se crea la cuenta (la llave y la cuenta en la red); después, el saldo y lo
// último que pasó. Se dibuja en un lienzo y ese lienzo es la textura de la pantalla en el modelo.
// Todo va grande y con poco texto: en el modelo la pantalla se ve chica.

export const ANCHO = 720;
export const ALTO = 1480;
const NOCHE = '#000b25';
const NOCHE_ALTA = '#0d1a3d';
const RAYO = '#ffcd00';
const VERDE = '#3dff9a';
const TENUE = '#a7b2cf';
const MARCA = '"Barlow Condensed", "Barlow", system-ui, sans-serif';
const LETRA = '"Barlow", system-ui, sans-serif';

function texto(ctx, t, x, y, puntos, opciones = {}) {
  ctx.fillStyle = opciones.color ?? '#fff';
  ctx.font = opciones.marca ? `italic 800 ${puntos}px ${MARCA}` : `${opciones.grueso ? 700 : 500} ${puntos}px ${LETRA}`;
  ctx.textAlign = opciones.alinear ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(t, x, y);
}

function caja(ctx, x, y, ancho, alto, radio, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, alto, radio);
  ctx.fill();
}

// Arriba: el nombre, como en el logo.
function marca(ctx) {
  texto(ctx, 'PAI', 60, 190, 120, { marca: true });
  const ancho = ctx.measureText('PAI').width;
  texto(ctx, 'ZAP', 60 + ancho, 190, 120, { marca: true, color: RAYO });
}

// Un paso de la creación de la cuenta: hecho, en curso o pendiente.
function paso(ctx, y, rotulo, estado) {
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(110, y - 28, 44, 0, Math.PI * 2);
  if (estado === 'hecho') {
    ctx.fillStyle = VERDE;
    ctx.fill();
    ctx.strokeStyle = NOCHE;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(88, y - 28);
    ctx.lineTo(104, y - 10);
    ctx.lineTo(134, y - 48);
    ctx.stroke();
  } else {
    ctx.strokeStyle = estado === 'en curso' ? RAYO : '#3a4a78';
    ctx.stroke();
  }
  texto(ctx, rotulo, 190, y, 74, { grueso: true, color: estado === 'pendiente' ? TENUE : '#fff' });
}

/** Dibuja lo que muestra el teléfono según el estado del simulador. */
export function dibujarTelefono(ctx, estado) {
  ctx.fillStyle = '#05070d'; // el marco
  ctx.fillRect(0, 0, ANCHO, ALTO);
  caja(ctx, 14, 14, ANCHO - 28, ALTO - 28, 70, NOCHE);
  marca(ctx);
  const { cuenta } = estado;

  // Todavía no hay cuenta: la invitación a crearla.
  if (estado.fase === 'preparando' || estado.fase === 'sin-cuenta' || estado.fase === 'error') {
    texto(ctx, 'Tu billetera', 60, 330, 66, { color: TENUE });
    texto(ctx, 'Crea tu', 60, 620, 170, { marca: true });
    texto(ctx, 'cuenta', 60, 790, 170, { marca: true });
    const cargando = estado.fase === 'preparando';
    caja(ctx, 60, 1060, ANCHO - 120, 220, 44, cargando ? '#3a4a78' : RAYO);
    texto(ctx, cargando ? 'CARGANDO' : estado.fase === 'error' ? 'REINTENTAR' : 'CREAR CUENTA', ANCHO / 2, 1208, 104, {
      marca: true,
      alinear: 'center',
      color: NOCHE,
    });
    return;
  }

  // Creando: los pasos, uno debajo del otro, y al final el saldo con que queda.
  if (estado.fase === 'creando') {
    texto(ctx, 'Creando', 60, 420, 130, { marca: true });
    texto(ctx, 'tu cuenta', 60, 550, 130, { marca: true });
    paso(ctx, 780, 'Tu llave', cuenta.llave ? 'hecho' : 'en curso');
    paso(ctx, 940, 'Tu cuenta', cuenta.abierta ? 'hecho' : cuenta.llave ? 'en curso' : 'pendiente');
    if (cuenta.abierta) {
      caja(ctx, 60, 1080, ANCHO - 120, 280, 44, NOCHE_ALTA);
      texto(ctx, 'Saldo', 100, 1170, 60, { color: TENUE });
      texto(ctx, cuenta.saldo, 100, 1310, 130, { marca: true });
      texto(ctx, 'XLM', ANCHO - 100, 1310, 70, { marca: true, alinear: 'right', color: RAYO });
    }
    return;
  }

  // La cuenta ya existe: el saldo, la tarjeta y lo último que pasó.
  texto(ctx, 'Saldo', 60, 350, 66, { color: TENUE });
  texto(ctx, cuenta.saldo ?? '…', 60, 530, 170, { marca: true });
  texto(ctx, 'XLM de prueba', 60, 620, 62, { color: RAYO, grueso: true });

  caja(ctx, 60, 720, ANCHO - 120, 200, 44, NOCHE_ALTA);
  texto(ctx, 'Tarjeta', 100, 845, 72, { grueso: true });
  texto(ctx, 'Activa', ANCHO - 100, 845, 66, { alinear: 'right', color: VERDE, grueso: true });
  ctx.beginPath();
  ctx.arc(ANCHO - 100 - ctx.measureText('Activa').width - 44, 822, 20, 0, Math.PI * 2);
  ctx.fill();

  texto(ctx, 'Último movimiento', 60, 1070, 58, { color: TENUE });
  if (estado.tarjetaPagando) {
    texto(ctx, 'Pagando…', 60, 1200, 110, { marca: true, color: RAYO });
  } else if (estado.movimiento) {
    const pago = estado.movimiento.tipo === 'pago';
    texto(ctx, pago ? 'Pagaste' : 'Te devolvieron', 60, 1180, 84, { grueso: true });
    texto(ctx, `${pago ? '−' : '+'}${estado.movimiento.monto} XLM`, 60, 1320, 130, { marca: true, color: pago ? '#fff' : VERDE });
  } else {
    texto(ctx, 'Todavía ninguno', 60, 1180, 80, { grueso: true, color: '#6d7aa3' });
  }
}
