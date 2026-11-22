// La pantalla del aparato: una OLED de 128 × 64 puntos, de un solo color. Se dibuja en un lienzo
// cuatro veces más grande y ese lienzo se usa como textura del modelo 3D.
// Los títulos siguen al firmware del terminal: «Paizap: …» arriba y lo importante en grande.
import QRCode from 'qrcode';

export const ANCHO = 512;
export const ALTO = 256;
const U = 4; // un punto de la pantalla real son 4 del lienzo
const TINTA = '#e9f7ff';
const LETRA = '"Cascadia Mono", "SF Mono", Consolas, "Liberation Mono", ui-monospace, monospace';

function texto(ctx, t, x, y, puntos, opciones = {}) {
  ctx.font = `${opciones.grueso ? '700' : '500'} ${puntos * U}px ${LETRA}`;
  ctx.textAlign = opciones.alinear ?? 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(t, x * U, y * U);
}

function titulo(ctx, t) {
  texto(ctx, t, 0, 0, 9);
  ctx.fillRect(0, 11 * U, ANCHO, U); // la línea bajo el título
}

// El QR del pedido, a la izquierda. En 64 puntos de alto queda chico, como en el terminal: el QR
// para escanear de verdad es el de la página.
function qr(ctx, contenido) {
  const matriz = QRCode.create(contenido, { errorCorrectionLevel: 'L' }).modules;
  const lado = matriz.size;
  const punto = Math.floor((ALTO - 8) / lado);
  const margen = (ALTO - punto * lado) / 2;
  ctx.fillRect(margen - 6, margen - 6, punto * lado + 12, punto * lado + 12); // fondo claro
  ctx.fillStyle = '#000';
  for (let fila = 0; fila < lado; fila++) {
    for (let columna = 0; columna < lado; columna++) {
      if (matriz.data[fila * lado + columna]) ctx.fillRect(margen + columna * punto, margen + fila * punto, punto, punto);
    }
  }
  ctx.fillStyle = TINTA;
}

/** Dibuja lo que muestra el aparato según el estado del simulador. */
export function dibujarPantalla(ctx, estado) {
  ctx.fillStyle = '#02040a';
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.fillStyle = TINTA;

  if (estado.fase === 'apagado') return;

  if (estado.fase === 'encendiendo') {
    titulo(ctx, 'Paizap: Iniciando');
    texto(ctx, 'Creando llave', 0, 20, 10);
    texto(ctx, 'y pidiendo fondos', 0, 34, 10);
    texto(ctx, 'de prueba...', 0, 48, 10);
    return;
  }

  if (estado.fase === 'error') {
    titulo(ctx, 'Paizap: Error');
    texto(ctx, 'Sin conexion', 0, 22, 12, { grueso: true });
    texto(ctx, 'Vuelva a encender', 0, 46, 9);
    return;
  }

  if (estado.fase === 'esperando' && estado.pedido) {
    qr(ctx, estado.pedido.solicitud);
    texto(ctx, 'Total', 68, 2, 10);
    texto(ctx, estado.pedido.monto, 68, 18, 17, { grueso: true });
    texto(ctx, estado.tarjetaPagando ? 'Cobrando' : 'Tarjeta/QR', 68, 46, 9);
    return;
  }

  if (estado.fase === 'esperando') {
    titulo(ctx, 'Paizap: Cobrar');
    texto(ctx, 'Preparando...', 0, 26, 12);
    return;
  }

  if (estado.fase === 'aprobado' && estado.ultimoPago) {
    titulo(ctx, 'Paizap: Pago');
    texto(ctx, `OK ${estado.ultimoPago.monto}`, 0, 17, 22, { grueso: true });
    texto(ctx, `Pedido ${estado.ultimoPago.numero}`, 0, 50, 9);
    return;
  }

  // Listo: se escribe el monto, como en el modo caja del terminal.
  titulo(ctx, 'Paizap: Cobrar');
  if (estado.devolviendo) {
    texto(ctx, 'Devolviendo', 0, 20, 14, { grueso: true });
    texto(ctx, 'firma y envia...', 0, 46, 9);
    return;
  }
  texto(ctx, estado.monto || '0', 126, 16, 26, { grueso: true, alinear: 'right' });
  texto(ctx, '# cobrar  * borrar', 0, 52, 8);
}
