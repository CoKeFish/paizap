// Une el simulador con la página de la demo: el selector de aparato, el panel, la lista de
// cobros, el registro, el estado en JSON y el modelo 3D. Los identificadores de la página (sim-…)
// son fijos: los usan los agentes.
//
// El panel muestra un solo momento a la vez (crear la cuenta, cobrar, pagar o el resultado), con
// una frase que dice qué pasa y un botón principal. El modelo 3D muestra lo mismo y también se toca.
import QRCode from 'qrcode';
import { crearSimulador, olvidarTodo } from './aparato.js';
import { APARATOS, INICIAL } from './catalogo.js';

const base = document.body.dataset.base;
const aqui = new URL(base, location.href).href;
const $ = (id) => document.getElementById(id);
const sim = $('simulador');
const panel = $('sim-panel');

let escena = null;
let modelo = 'cargando'; // cargando | listo | sin3d
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

// El registro: una línea por cada cosa que pasó, con un solo enlace como prueba.
function registrar({ texto, enlace: url, rotulo, tipo }) {
  const lista = $('sim-registro');
  if (!hayRegistro) lista.replaceChildren();
  hayRegistro = true;
  const li = document.createElement('li');
  if (tipo) li.dataset.tipo = tipo;
  li.append(texto);
  if (url) li.append(' ', enlace(rotulo ?? 'Ver en la red', url));
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

// Qué momento del recorrido se ve en el panel según la fase. Mientras la demo se prepara no se
// muestra ninguno; «reintentar» solo aparece si algo falló.
const ETAPA = {
  preparando: 'ninguna',
  'sin-cuenta': 'cuenta',
  creando: 'cuenta',
  error: 'reintentar',
  listo: 'cobrar',
  esperando: 'pagar',
  aprobado: 'resultado',
};
const ETAPAS = ['reintentar', 'cuenta', 'cobrar', 'pagar', 'resultado'];
const PRINCIPAL = { cuenta: 'sim-crear', reintentar: 'sim-reintentar', cobrar: 'sim-cobrar', pagar: 'sim-tarjeta', resultado: 'sim-otro' };
// El recorrido que se ve arriba del panel. En la caja alguien cobra; con precio fijo, el aparato
// cobra solo y el tercer paso es lo que hace al ver el pago.
const CAMINO = {
  caja: [
    { nombre: 'Cuenta', etapas: ['cuenta'] },
    { nombre: 'Cobrar', etapas: ['cobrar'] },
    { nombre: 'Pagar', etapas: ['pagar'] },
  ],
  torniquete: [
    { nombre: 'Cuenta', etapas: ['cuenta'] },
    { nombre: 'Pagar', etapas: ['cobrar', 'pagar'] },
    { nombre: 'Pasar', etapas: [] },
  ],
  dispensador: [
    { nombre: 'Cuenta', etapas: ['cuenta'] },
    { nombre: 'Pagar', etapas: ['cobrar', 'pagar'] },
    { nombre: 'Recibir', etapas: [] },
  ],
};
let etapaALaVista = '';
let caminoPintado = '';

function pintarCamino(aparato, etapa) {
  const clave = `${aparato}/${etapa}`;
  if (clave === caminoPintado || etapa === 'ninguna' || etapa === 'reintentar') return;
  caminoPintado = clave;
  const pasos = CAMINO[aparato];
  // El paso actual es el que contiene la etapa; en «resultado» ya están todos hechos.
  const lugar = etapa === 'resultado' ? pasos.length : pasos.findIndex((paso) => paso.etapas.includes(etapa));
  $('sim-camino').replaceChildren(
    ...pasos.map((paso, i) => {
      const li = document.createElement('li');
      li.textContent = paso.nombre;
      li.dataset.estado = i < lugar ? 'hecho' : i === lugar ? 'actual' : 'pendiente';
      if (i === lugar) li.setAttribute('aria-current', 'step');
      return li;
    }),
  );
}

function mostrarEtapa(etapa) {
  if (etapa === etapaALaVista) return;
  // Si el foco estaba en el panel, pasa al botón del momento nuevo: quien usa el teclado no se pierde.
  const teniaFoco = panel.contains(document.activeElement);
  for (const nombre of ETAPAS) $(`etapa-${nombre}`).hidden = nombre !== etapa;
  sim.dataset.etapa = etapa;
  if (teniaFoco && etapaALaVista && PRINCIPAL[etapa]) $(PRINCIPAL[etapa]).focus({ preventScroll: true });
  etapaALaVista = etapa;
}

// La pista bajo el modelo: qué se puede tocar en este momento.
function pista(estado, aparato) {
  if (modelo === 'cargando') return 'Cargando el modelo…';
  if (modelo === 'sin3d') return 'Este navegador no puede mostrar el modelo 3D. El panel funciona igual.';
  if (estado.fase === 'sin-cuenta') return 'Toca «Crear cuenta» en el teléfono.';
  if (estado.fase === 'creando') return 'El teléfono muestra cómo se crea tu cuenta.';
  if (estado.fase === 'error') return 'Toca el teléfono para volver a intentar.';
  if (estado.fase === 'listo' && aparato.modo === 'caja') return 'En el teclado del terminal: # cobra, * borra y D es el punto.';
  if (estado.fase === 'esperando' && !estado.tarjetaPagando) return 'Toca la tarjeta o llévala al lector.';
  return 'Arrastra para girar.';
}

// El selector: qué aparato está elegido, y cuándo se puede cambiar.
function pintarAparatos(estado) {
  const ocupado = estado.fase === 'creando' || estado.tarjetaPagando || estado.devolviendo;
  for (const boton of document.querySelectorAll('#sim-aparatos button')) {
    boton.setAttribute('aria-pressed', String(boton.dataset.aparato === estado.aparato));
    boton.disabled = ocupado;
  }
}

// Crear la cuenta: los dos pasos, con su marca cuando están hechos.
function pintarAlta(estado) {
  const creando = estado.fase === 'creando';
  $('sim-crear').disabled = creando;
  $('sim-crear').textContent = creando ? 'Creando tu cuenta…' : 'Crear mi cuenta';
  const pasos = { llave: estado.cuenta.llave, abierta: estado.cuenta.abierta };
  let anteriorHecho = true;
  for (const paso of document.querySelectorAll('#sim-alta li')) {
    const hecho = pasos[paso.dataset.paso];
    paso.dataset.estado = hecho ? 'hecho' : creando && anteriorHecho ? 'en-curso' : 'pendiente';
    anteriorHecho = hecho;
  }
}

// Cobrar: en la caja se escribe el monto; un aparato de precio fijo solo tiene que ponerse a cobrar.
function pintarCobrar(estado, aparato) {
  const fijo = aparato.modo === 'autoservicio';
  $('sim-monto-rotulo').hidden = fijo;
  $('sim-monto').hidden = fijo;
  $('sim-cobrar').textContent = fijo ? `Poner ${aparato.el} a cobrar` : 'Cobrar';
  $('sim-cobrar-nota').textContent = fijo ? `Precio fijo: ${aparato.precio} XLM de prueba ${aparato.porQue}.` : 'Es dinero de prueba: cobra lo que quieras, de 0.01 a 100.';
  // El monto es uno solo. Lo que se escribe en el teclado del terminal aparece en el campo (salvo
  // mientras se escribe en el campo, que es quien manda en ese momento).
  if (document.activeElement !== $('sim-monto') && $('sim-monto').value !== estado.monto) $('sim-monto').value = estado.monto;
}

// El resultado del último cobro: se queda a la vista hasta el siguiente.
function pintarResultado(estado) {
  const pago = estado.ultimoPago;
  if (!pago) return;
  const aparato = APARATOS[pago.aparato] ?? APARATOS.caja;
  const devuelto = Boolean(pago.devolucion);
  $('etapa-resultado').dataset.devuelto = devuelto ? 'si' : 'no';
  $('sim-resultado-titulo').textContent = devuelto ? 'Pago devuelto' : 'Pago aprobado';
  $('sim-resultado-monto').textContent = `${pago.monto} XLM`;
  const clave = pago.hash + (pago.devolucion?.hash ?? '');
  if ($('sim-resultado-detalle').dataset.valor !== clave) {
    $('sim-resultado-detalle').dataset.valor = clave;
    const cuando = pago.segundos ? `, ${pago.segundos} s después de leer la tarjeta` : '';
    $('sim-resultado-detalle').replaceChildren(
      `Cobro n.º ${pago.numero}. ${aparato.El} vio el pago en la red${cuando}. ${aparato.hizo} `.replace('  ', ' '),
      enlace('Ver la transacción en la red de Stellar', pago.enlace),
    );
    $('sim-resultado-devolucion').hidden = !devuelto;
    if (devuelto) {
      $('sim-resultado-devolucion').replaceChildren(
        `${aparato.El} devolvió el dinero a tu cuenta, firmando con su propia llave. `,
        enlace('Ver la devolución', pago.devolucion.enlace),
      );
    }
  }
  $('sim-otro').textContent = aparato.otraVez;
  $('sim-otro').disabled = estado.devolviendo;
  // La devolución es el momento en que firma el aparato: el botón lo dice.
  $('sim-devolver').hidden = devuelto || !pago.conTarjeta;
  $('sim-devolver').disabled = estado.devolviendo;
  $('sim-devolver').textContent = estado.devolviendo ? `Firma ${aparato.el}…` : `Devolver el pago (firma ${aparato.el})`;
}

// Los cobros hechos: una fila por cobro, con su aparato, su estado y su prueba en la red.
let cobrosPintados = '';
function pintarCobros(cobros) {
  const clave = cobros.map((c) => c.numero + (c.devolucion ? 'd' : 'a')).join();
  if (clave === cobrosPintados) return;
  cobrosPintados = clave;
  $('sim-cobros-caja').hidden = cobros.length === 0;
  $('sim-cobros').replaceChildren(
    ...cobros.map((cobro) => {
      const fila = document.createElement('tr');
      const celda = (...contenido) => {
        const td = document.createElement('td');
        td.append(...contenido);
        return td;
      };
      const prueba = [enlace('Ver el pago', cobro.enlace)];
      if (cobro.devolucion) prueba.push(' ', enlace('Ver la devolución', cobro.devolucion.enlace));
      fila.dataset.estado = cobro.devolucion ? 'devuelto' : 'aprobado';
      fila.append(
        celda(`n.º ${cobro.numero}`),
        celda((APARATOS[cobro.aparato] ?? APARATOS.caja).nombre),
        celda(`${cobro.monto} XLM`),
        celda(cobro.devolucion ? 'Devuelto' : 'Aprobado'),
        celda(...prueba),
      );
      return fila;
    }),
  );
}

// La fase que se publica, en data-fase y en el JSON. Además de las del simulador, dice si el
// aparato todavía arma el cobro, si el pago va en camino y si el aparato está devolviendo: con
// «esperando» ya se puede pagar.
function fasePublica(estado) {
  if (estado.fase === 'esperando') return estado.tarjetaPagando ? 'pagando' : estado.cobro ? 'esperando' : 'cobrando';
  if (estado.fase === 'aprobado' && estado.devolviendo) return 'devolviendo';
  return estado.fase;
}

let solicitudDibujada = '';
function pintar(estado) {
  const aparato = APARATOS[estado.aparato];
  sim.dataset.aparato = estado.aparato;
  $('sim-estado').textContent = estado.mensaje;
  const etapa = ETAPA[estado.fase];
  mostrarEtapa(etapa);
  pintarCamino(estado.aparato, etapa);
  $('sim-pista').textContent = pista(estado, aparato);
  pintarAparatos(estado);
  pintarAlta(estado);
  pintarCobrar(estado, aparato);

  // Pagar
  const puedePagar = estado.fase === 'esperando' && estado.cobro && !estado.tarjetaPagando;
  $('sim-tarjeta').disabled = !puedePagar;
  $('sim-tarjeta').textContent = estado.tarjetaPagando ? 'Pagando…' : 'Pagar con la tarjeta';
  // Cancelar es cosa de la caja: un aparato de precio fijo siempre está cobrando.
  $('sim-cancelar').hidden = aparato.modo !== 'caja';
  $('sim-cancelar').disabled = !(estado.fase === 'esperando' && !estado.tarjetaPagando);
  const solicitud = estado.cobro?.solicitud ?? '';
  $('sim-qr-caja').hidden = !solicitud;
  if (solicitud && solicitud !== solicitudDibujada) {
    $('sim-solicitud').href = solicitud;
    QRCode.toDataURL(solicitud, { margin: 1, width: 296 }).then((imagen) => ($('sim-qr').src = imagen));
  }
  if (!solicitud) $('sim-qr-caja').open = false;
  solicitudDibujada = solicitud;

  pintarResultado(estado);
  pintarCobros(estado.cobros);
  cuenta('sim-cuenta-tarjeta', estado.cuentaTarjeta);
  cuenta('sim-cuenta-aparato', estado.cuentaAparato);
  // Empezar de cero solo tiene sentido cuando ya hay una cuenta y nada está a medias.
  $('sim-reiniciar').hidden = !['listo', 'esperando', 'aprobado'].includes(estado.fase) || estado.tarjetaPagando || estado.devolviendo;

  // Lo que leen los agentes se escribe al final, con los botones ya puestos: cuando data-fase dice
  // «esperando», el botón de pagar ya se puede pulsar. data-pago es el identificador del último
  // pago aprobado: cambia con cada cobro.
  const fase = fasePublica(estado);
  const fijo = aparato.modo === 'autoservicio';
  sim.dataset.cobro = estado.cobro ? String(estado.cobro.numero) : '';
  sim.dataset.pago = estado.ultimoPago?.hash ?? '';
  sim.dataset.devolucion = estado.ultimoPago?.devolucion?.hash ?? '';
  sim.dataset.fase = fase;

  // El mismo estado, en JSON, para quien lo quiera leer sin interpretar la página.
  $('sim-datos').textContent = JSON.stringify({
    fase,
    mensaje: estado.mensaje,
    red: 'Stellar testnet',
    aparato: estado.aparato,
    cuenta: { direccion: estado.cuentaTarjeta, ...estado.cuenta },
    cuentaComercio: estado.cuentaAparato,
    // Lo que cobra el aparato: su precio fijo o, en la caja, el monto que se está escribiendo.
    precio: fijo ? aparato.precio : null,
    monto: fijo ? aparato.precio : estado.monto,
    cobro: estado.cobro,
    ultimoPago: estado.ultimoPago,
    cobros: estado.cobros,
  });
  escena?.actualizar(estado);
}

const simulador = crearSimulador({
  urlAdaptacion: `${aqui}simulador/device.mjs`,
  alCambiar: pintar,
  alRegistrar: registrar,
  alConsultar: consultar,
});

const hayQuePagar = () => {
  const estado = simulador.estado();
  return estado.fase === 'esperando' && Boolean(estado.cobro) && !estado.tarjetaPagando;
};
// Pagar con un toque (en el botón o en la tarjeta): la tarjeta va sola al lector.
function pagarConTarjeta() {
  if (hayQuePagar()) {
    escena?.acercarTarjeta();
    simulador.acercarTarjeta();
  } else {
    simulador.tarjetaSinCobro();
  }
}
// La tarjeta llegó al lector llevada a mano. Devuelve si con eso empezó un pago.
function pasarTarjeta() {
  const paga = hayQuePagar();
  if (paga) simulador.acercarTarjeta();
  else simulador.tarjetaSinCobro();
  return paga;
}

// En pantallas angostas el modelo y el panel van uno sobre el otro. Si al pulsar un botón el
// modelo no se ve entero, la página se acomoda para que se vea lo que pasa.
const angosta = matchMedia('(max-width: 61.99rem)');
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
function mostrarModelo() {
  if (!angosta.matches || sim.dataset.sin3d) return;
  const borde = $('sim-lienzo').getBoundingClientRect();
  if (borde.top >= 0 && borde.bottom <= innerHeight) return;
  document.querySelector('.sim-cuerpo').scrollIntoView({ block: 'start', behavior: sinMovimiento.matches ? 'auto' : 'smooth' });
}
for (const id of ['sim-crear', 'sim-cobrar', 'sim-tarjeta', 'sim-devolver', 'sim-otro']) $(id).addEventListener('click', mostrarModelo);

for (const boton of document.querySelectorAll('#sim-aparatos button')) {
  boton.addEventListener('click', () => simulador.elegirAparato(boton.dataset.aparato));
}
$('sim-crear').addEventListener('click', () => simulador.crearCuenta());
$('sim-reintentar').addEventListener('click', () => simulador.reintentar());
$('sim-monto').addEventListener('input', () => simulador.escribir($('sim-monto').value));
$('sim-monto').addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter') simulador.cobrar($('sim-monto').value);
});
$('sim-cobrar').addEventListener('click', () => simulador.cobrar($('sim-monto').value));
$('sim-tarjeta').addEventListener('click', pagarConTarjeta);
$('sim-cancelar').addEventListener('click', () => simulador.cancelar());
$('sim-devolver').addEventListener('click', () => simulador.devolver());
$('sim-otro').addEventListener('click', () => simulador.otroCobro());
// Empezar de cero: se olvidan la cuenta y los cobros guardados, y la página vuelve a pedir crearla.
$('sim-reiniciar').addEventListener('click', () => {
  olvidarTodo();
  location.reload();
});

pintar(simulador.estado());
simulador.preparar(); // si ya hay una cuenta creada en este navegador, no se crea otra

// El modelo 3D se carga aparte: si el navegador no puede mostrarlo, el panel funciona igual.
(async () => {
  try {
    const { crearEscena } = await import('./escena.js');
    await Promise.all([document.fonts.load('700 20px "Barlow"'), document.fonts.load('italic 800 20px "Barlow Condensed"')]);
    escena = await crearEscena({
      lienzoPagina: $('sim-lienzo'),
      urlModelo: `${aqui}modelo/`,
      aparatoInicial: simulador.estado().aparato ?? INICIAL,
      alPulsarTecla: (tecla) => simulador.tecla(tecla),
      alTocarTarjeta: pagarConTarjeta,
      alPasarTarjeta: pasarTarjeta,
      alTocarTelefono: () => simulador.tocarTelefono(),
    });
    // Dónde está cada cosa del modelo en la página: sirve para arrastrar la tarjeta sin mirar.
    $('sim-lienzo').donde = escena.donde;
    modelo = 'listo';
  } catch (error) {
    console.error(error);
    modelo = 'sin3d';
    sim.dataset.sin3d = 'si';
  }
  pintar(simulador.estado());
})();
