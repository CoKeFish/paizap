// Une el simulador con la página de la demo: los botones, el registro en texto, el estado en
// JSON y el modelo 3D. Los identificadores de la página (sim-…) son fijos: los usan los agentes.
import QRCode from 'qrcode';
import { crearSimulador } from './aparato.js';

const base = document.body.dataset.base;
const aqui = new URL(base, location.href).href;
const $ = (id) => document.getElementById(id);
const sim = $('simulador');

// El comando para agentes lleva la dirección real del sitio.
$('agentes-comando').textContent = $('agentes-comando').textContent.replaceAll('SITIO/', aqui);

let escena = null;
let hayRegistro = false;
const consultas = [];

function enlace(texto, url) {
  const a = document.createElement('a');
  a.href = url;
  a.textContent = texto;
  a.target = '_blank';
  a.rel = 'noreferrer';
  return a;
}

function registrar({ texto, enlace: url, tipo }) {
  const lista = $('sim-registro');
  if (!hayRegistro) lista.replaceChildren();
  hayRegistro = true;
  const li = document.createElement('li');
  if (tipo) li.dataset.tipo = tipo;
  li.append(texto);
  if (url) li.append(' ', enlace('Ver en la red', url));
  lista.append(li);
  lista.scrollTop = lista.scrollHeight;
}

function consultar(texto) {
  consultas.push(texto);
  if (consultas.length > 9) consultas.shift();
  $('sim-monitor').textContent = consultas.join('\n');
}

const corta = (cuenta) => `${cuenta.slice(0, 6)}…${cuenta.slice(-6)}`;
function cuenta(id, valor) {
  if (!valor || $(id).dataset.valor === valor) return;
  $(id).dataset.valor = valor;
  $(id).replaceChildren(enlace(corta(valor), `https://stellar.expert/explorer/testnet/account/${valor}`));
}
function pago(id, p) {
  const clave = p ? p.hash + (p.firmaMs ?? '') : '';
  if ($(id).dataset.valor === clave) return;
  $(id).dataset.valor = clave;
  if (!p) return $(id).replaceChildren('—');
  const tiempos = p.firmaMs ? ` · firmado en ${p.firmaMs.toFixed(2)} ms, confirmado en ${(p.totalMs / 1000).toFixed(1)} s` : '';
  $(id).replaceChildren(`${p.monto} XLM, pedido ${p.numero}${tiempos} · `, enlace('ver en la red', p.enlace));
}

let solicitudDibujada = '';
function pintar(estado) {
  sim.dataset.fase = estado.fase;
  $('sim-estado').textContent = estado.mensaje;
  const listo = estado.fase === 'listo' || estado.fase === 'aprobado';
  $('sim-encender').disabled = !(estado.fase === 'apagado' || estado.fase === 'error');
  $('sim-encender').textContent = estado.fase === 'encendiendo' ? 'Encendiendo…' : estado.fase === 'error' ? 'Volver a encender' : estado.cuentaAparato ? 'Aparato encendido' : 'Encender el aparato';
  $('sim-monto').disabled = !listo;
  $('sim-cobrar').disabled = !listo || estado.devolviendo;
  $('sim-tarjeta').disabled = !(estado.fase === 'esperando' && estado.pedido && !estado.tarjetaPagando);
  $('sim-tarjeta').textContent = estado.tarjetaPagando ? 'Pagando…' : 'Acercar la tarjeta de prueba';
  $('sim-cancelar').disabled = !(estado.fase === 'esperando' && !estado.tarjetaPagando);
  $('sim-devolver').disabled = !(listo && estado.ultimoPago && !estado.devolviendo);
  $('sim-devolver').textContent = estado.devolviendo ? 'Devolviendo…' : 'Devolver el último pago';
  // Lo que se escribe en el teclado del aparato aparece también en el campo de la página.
  if (listo && estado.monto && document.activeElement !== $('sim-monto')) $('sim-monto').value = estado.monto;

  const solicitud = estado.pedido?.solicitud ?? '';
  $('sim-pedido').hidden = !solicitud;
  if (solicitud && solicitud !== solicitudDibujada) {
    $('sim-solicitud').textContent = solicitud;
    $('sim-pedido-numero').textContent = estado.pedido.numero;
    QRCode.toDataURL(solicitud, { margin: 1, width: 296 }).then((imagen) => ($('sim-qr').src = imagen));
  }
  solicitudDibujada = solicitud;

  cuenta('sim-cuenta-aparato', estado.cuentaAparato);
  cuenta('sim-cuenta-tarjeta', estado.cuentaTarjeta);
  pago('sim-ultimo', estado.ultimoPago);
  pago('sim-devolucion', estado.ultimaDevolucion);
  $('sim-ventas').textContent = String(estado.ventas);
  // El mismo estado, en JSON, para quien lo quiera leer sin interpretar la página.
  $('sim-datos').textContent = JSON.stringify({
    fase: estado.fase,
    mensaje: estado.mensaje,
    red: 'Stellar testnet',
    cuentaAparato: estado.cuentaAparato,
    cuentaTarjeta: estado.cuentaTarjeta,
    pedido: estado.pedido,
    ultimoPago: estado.ultimoPago,
    ultimaDevolucion: estado.ultimaDevolucion,
    cobrosAprobados: estado.ventas,
  });
  escena?.actualizar(estado);
}

const simulador = crearSimulador({
  urlAdaptacion: `${aqui}simulador/device.mjs`,
  alCambiar: pintar,
  alRegistrar: registrar,
  alConsultar: consultar,
});

function acercarTarjeta() {
  if ($('sim-tarjeta').disabled) return;
  escena?.acercarTarjeta();
  simulador.acercarTarjeta();
}
$('sim-encender').addEventListener('click', () => simulador.encender());
$('sim-cobrar').addEventListener('click', () => simulador.cobrar($('sim-monto').value));
$('sim-monto').addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter') simulador.cobrar($('sim-monto').value);
});
$('sim-tarjeta').addEventListener('click', acercarTarjeta);
$('sim-cancelar').addEventListener('click', () => simulador.cancelar());
$('sim-devolver').addEventListener('click', () => simulador.devolver());

// El modelo 3D se carga aparte: si el navegador no puede mostrarlo, los botones funcionan igual.
(async () => {
  try {
    const { crearEscena } = await import('./escena.js');
    await Promise.all([document.fonts.load('700 20px "Barlow"'), document.fonts.load('italic 800 20px "Barlow Condensed"')]);
    escena = await crearEscena({
      lienzoPagina: $('sim-lienzo'),
      urlModelo: `${aqui}modelo/`,
      alPulsarTecla: (tecla) => simulador.tecla(tecla),
      alTocarTarjeta: acercarTarjeta,
    });
    escena.actualizar(simulador.estado());
    $('sim-pista').textContent = 'Gira el aparato con el ratón o el dedo. Toca las teclas o la tarjeta.';
  } catch (error) {
    console.error(error);
    $('sim-pista').textContent = 'Este navegador no puede mostrar el modelo 3D. Usa los botones: hacen lo mismo.';
    sim.dataset.sin3d = 'si';
  }
})();
