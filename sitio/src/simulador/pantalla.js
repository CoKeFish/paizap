// La pantalla del aparato de la demo. El terminal que se imprime lleva una OLED chica, de
// 128 × 64 puntos; en la demo web la pantalla es más grande (el doble de puntos por lado) para
// que se lea bien en el modelo 3D. Mantiene el mismo aspecto: un solo color sobre negro, un
// título arriba y lo importante en grande.
// Se dibuja en un lienzo y ese lienzo es la textura de la pantalla en el modelo.
import QRCode from 'qrcode';

export const ANCHO = 1024;
export const ALTO = 512;
const U = 4; // un punto de la pantalla son 4 del lienzo: 256 × 128 puntos
const TINTA = '#e9f7ff';
const TENUE = '#8fb4c9';
const AVISO = '#ffcd00';
const LETRA = '"Cascadia Mono", "SF Mono", Consolas, "Liberation Mono", ui-monospace, monospace';

function texto(ctx, t, x, y, puntos, opciones = {}) {
  ctx.fillStyle = opciones.color ?? TINTA;
  ctx.font = `${opciones.grueso ? '700' : '500'} ${puntos * U}px ${LETRA}`;
  ctx.textAlign = opciones.alinear ?? 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(t, x * U, y * U);
}

// Arriba: el nombre a la izquierda y qué está haciendo a la derecha.
function cabecera(ctx, que) {
  texto(ctx, 'Paizap', 6, 4, 11, { grueso: true });
  texto(ctx, que, 250, 5, 10, { alinear: 'right', color: TENUE });
  ctx.fillStyle = TENUE;
  ctx.fillRect(6 * U, 19 * U, (256 - 12) * U, 2);
}

// El QR del cobro, a la izquierda, sobre fondo claro para que se pueda leer.
function qr(ctx, contenido) {
  const matriz = QRCode.create(contenido, { errorCorrectionLevel: 'L' }).modules;
  const lado = matriz.size;
  const hueco = 96 * U; // alto disponible
  const punto = Math.floor(hueco / (lado + 2));
  const tam = punto * lado;
  const x0 = 8 * U;
  const y0 = 26 * U + (hueco - tam) / 2;
  ctx.fillStyle = TINTA;
  ctx.fillRect(x0 - punto, y0 - punto, tam + 2 * punto, tam + 2 * punto);
  ctx.fillStyle = '#000';
  for (let fila = 0; fila < lado; fila++) {
    for (let columna = 0; columna < lado; columna++) {
      if (matriz.data[fila * lado + columna]) ctx.fillRect(x0 + columna * punto, y0 + fila * punto, punto, punto);
    }
  }
}

/** Dibuja lo que muestra el aparato según el estado del simulador. */
export function dibujarPantalla(ctx, estado) {
  ctx.fillStyle = '#02040a';
  ctx.fillRect(0, 0, ANCHO, ALTO);

  if (estado.fase === 'apagado') {
    texto(ctx, 'Apagado', 128, 54, 14, { alinear: 'center', color: '#3a5566' });
    return;
  }

  if (estado.fase === 'encendiendo') {
    cabecera(ctx, 'iniciando');
    texto(ctx, 'Creando la llave', 6, 36, 16, { grueso: true });
    texto(ctx, 'y pidiendo fondos de prueba...', 6, 62, 11, { color: TENUE });
    return;
  }

  if (estado.fase === 'error') {
    cabecera(ctx, 'error');
    texto(ctx, 'Sin conexion', 6, 40, 20, { grueso: true });
    texto(ctx, 'Vuelva a encender el aparato', 6, 76, 11, { color: TENUE });
    return;
  }

  if (estado.devolviendo) {
    cabecera(ctx, 'devolviendo');
    texto(ctx, 'Devolviendo el pago', 6, 40, 17, { grueso: true });
    texto(ctx, 'El aparato firma y envia...', 6, 72, 11, { color: TENUE });
    return;
  }

  if (estado.fase === 'esperando' && estado.cobro) {
    cabecera(ctx, estado.tarjetaPagando ? 'cobrando' : 'esperando pago');
    qr(ctx, estado.cobro.solicitud);
    texto(ctx, 'Total', 116, 28, 11, { color: TENUE });
    texto(ctx, estado.cobro.monto, 116, 42, 30, { grueso: true });
    texto(ctx, 'XLM', 250, 62, 11, { alinear: 'right', color: TENUE });
    texto(ctx, `Cobro ${estado.cobro.numero}`, 116, 84, 11);
    texto(ctx, estado.tarjetaPagando ? 'Pago en camino...' : 'Tarjeta o QR', 116, 104, 11, { color: AVISO });
    return;
  }

  if (estado.fase === 'esperando') {
    cabecera(ctx, 'cobrar');
    texto(ctx, 'Preparando el cobro...', 6, 52, 14);
    return;
  }

  if (estado.fase === 'aprobado' && estado.ultimoPago) {
    const devuelto = Boolean(estado.ultimoPago.devolucion);
    cabecera(ctx, devuelto ? 'devuelto' : 'aprobado');
    texto(ctx, devuelto ? 'Pago devuelto' : 'Pago aprobado', 6, 30, 18, { grueso: true, color: devuelto ? TINTA : '#7dffb8' });
    texto(ctx, estado.ultimoPago.monto, 6, 58, 34, { grueso: true });
    texto(ctx, 'XLM', 250, 82, 11, { alinear: 'right', color: TENUE });
    texto(ctx, `Cobro ${estado.ultimoPago.numero}, ${devuelto ? 'de vuelta en la tarjeta' : 'visto en la red'}`, 6, 106, 11, { color: TENUE });
    return;
  }

  // Listo: se escribe el monto, como en el modo caja del terminal.
  cabecera(ctx, 'cobrar');
  texto(ctx, 'Monto', 6, 28, 11, { color: TENUE });
  texto(ctx, estado.monto || '0', 250, 36, 44, { grueso: true, alinear: 'right' });
  texto(ctx, 'XLM', 250, 86, 11, { alinear: 'right', color: TENUE });
  texto(ctx, '# cobrar   * borrar   D punto', 6, 108, 10, { color: AVISO });
}
