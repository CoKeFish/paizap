// La escena en 3D: un aparato que cobra (torniquete, dispensador o terminal de caja), el teléfono
// de quien paga y su tarjeta de prueba.
//
// El modelo muestra lo que pasa y también se puede tocar:
//   - el teléfono y las teclas de la caja responden al clic;
//   - la tarjeta se toca (va sola al lector) o se agarra y se lleva a mano hasta el lector;
//   - la cámara se acerca sola al teléfono cuando lo que importa pasa ahí (al crear la cuenta y
//     después de pasar la tarjeta) y vuelve a mostrar todo cuando termina;
//   - cuando el aparato ve el pago, actúa: el torniquete gira, el dispensador entrega;
//   - cuando el aparato devuelve un pago, se ve el dinero ir del aparato al teléfono;
//   - se puede girar un poco arrastrando; al soltar, la vista vuelve a su lugar.
//
// Cada aparato se arma en su archivo (aparatos/). Las medidas están en milímetros.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { crearCaja } from './aparatos/caja.js';
import { crearDispensador } from './aparatos/dispensador.js';
import { crearTorniquete } from './aparatos/torniquete.js';
import { NOCHE, RAYO, lienzo, texturaDe } from './piezas.js';
import { ALTO as ALTO_TELEFONO, ANCHO as ANCHO_TELEFONO, dibujarTelefono } from './telefono.js';

// El teléfono de quien paga: un rectángulo de puntas redondas, acostado a la izquierda del aparato.
const TELEFONO = { ancho: 72, largo: 150, grosor: 7, radio: 11, giro: 0.16 };
const TARJETA = { ancho: 85.6, alto: 54, giro: -0.32 };
// Desde dónde se mira todo, y cuánto se puede girar (en radianes) antes de soltar.
const MIRADA = new THREE.Vector3(167, 228, 291).normalize();
const GIRO = { lado: 0.42, alto: 0.16 };
const VIAJE_CAMARA_MS = 750; // lo que tarda la cámara en ir de una vista a otra
const MIRAR_PAGO_MS = 2000; // cuánto se queda la cámara en el teléfono después de un pago
const ALCANCE_LECTOR = 30; // a cuántos milímetros del lector se lee la tarjeta llevada a mano

function texturaTarjeta() {
  const c = lienzo(856, 540);
  const ctx = c.getContext('2d');
  ctx.fillStyle = NOCHE;
  ctx.fillRect(0, 0, 856, 540);
  // El arco del logo, de punta a punta de la tarjeta.
  ctx.fillStyle = RAYO;
  ctx.beginPath();
  ctx.moveTo(40, 500);
  ctx.bezierCurveTo(240, 150, 620, 40, 830, 190);
  ctx.bezierCurveTo(620, 110, 300, 230, 40, 500);
  ctx.fill();
  ctx.font = 'italic 800 150px "Barlow Condensed", "Barlow", system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('PAI', 60, 330);
  ctx.fillStyle = RAYO;
  ctx.fillText('ZAP', 60 + ctx.measureText('PAI').width, 330);
  ctx.fillStyle = '#a7b2cf';
  ctx.font = '600 40px "Barlow", system-ui, sans-serif';
  ctx.fillText('Tarjeta de prueba', 62, 470);
  return texturaDe(c);
}

function texturaSombra() {
  const c = lienzo(256, 256);
  const ctx = c.getContext('2d');
  const degradado = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  degradado.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  degradado.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = degradado;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/**
 * Arma la escena sobre `lienzoPagina`. `urlModelo` es la carpeta con base.stl y tapa.stl, de la
 * caja. `aparatoInicial` es el que se ve al empezar.
 *
 * Avisa cuando se pulsa una tecla (`alPulsarTecla`), cuando se toca la tarjeta (`alTocarTarjeta`),
 * cuando la tarjeta llega al lector llevada a mano (`alPasarTarjeta`, que devuelve si con eso
 * empezó un pago) y cuando se toca el teléfono (`alTocarTelefono`).
 *
 * Devuelve cómo actualizarla con el estado del simulador, cómo llevar la tarjeta sola al lector y
 * dónde está cada cosa en la página (`donde`), para quien quiera arrastrar la tarjeta sin mirar.
 */
export async function crearEscena({ lienzoPagina, urlModelo, aparatoInicial, alPulsarTecla, alTocarTarjeta, alPasarTarjeta, alTocarTelefono }) {
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pintor = new THREE.WebGLRenderer({ canvas: lienzoPagina, antialias: true, alpha: true });
  pintor.setPixelRatio(Math.min(devicePixelRatio, 2));
  pintor.outputColorSpace = THREE.SRGBColorSpace;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(30, 1, 10, 6000);

  const controles = new OrbitControls(camara, lienzoPagina);
  controles.enablePan = false;
  controles.enableZoom = false; // la rueda sobre el modelo baja la página, como en el resto
  controles.enableDamping = false;
  controles.rotateSpeed = 0.6;
  // En celular, mover el dedo hacia arriba o abajo desplaza la página; hacia los lados gira.
  lienzoPagina.style.touchAction = 'pan-y';

  escena.add(new THREE.HemisphereLight('#ffffff', '#1b2a55', 1.5));
  const sol = new THREE.DirectionalLight('#ffffff', 2.2);
  sol.position.set(120, 320, 180);
  escena.add(sol);
  const contraluz = new THREE.DirectionalLight('#9db4ff', 0.9);
  contraluz.position.set(-200, 120, -220);
  escena.add(contraluz);

  // ---- Animaciones cortas: lo que se mueve un rato y para ----
  const animaciones = new Set();
  function animar(duracion, paso) {
    if (sinMovimiento) {
      paso(1);
      return Promise.resolve();
    }
    return new Promise((listo) => {
      const inicio = performance.now();
      const cuadro = () => {
        const t = Math.min(1, (performance.now() - inicio) / duracion);
        paso(t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2); // arranca y frena suave
        if (t >= 1) {
          animaciones.delete(cuadro);
          listo();
        }
      };
      animaciones.add(cuadro);
    });
  }
  const espera = (ms) => new Promise((listo) => setTimeout(listo, sinMovimiento ? 0 : ms));

  // ---- Los aparatos: se arman todos y se muestra uno ----
  const aparatos = {
    torniquete: crearTorniquete({ animar, espera }),
    dispensador: crearDispensador({ animar, espera }),
    caja: await crearCaja({ urlModelo, animar, espera }),
  };
  for (const aparato of Object.values(aparatos)) {
    escena.add(aparato.grupo);
    aparato.medir();
    aparato.grupo.visible = false;
  }
  let actual = aparatos[aparatoInicial] ?? aparatos.caja;
  actual.grupo.visible = true;

  // La tarjeta de prueba descansa a la derecha del aparato. Va al lector sola, o llevada a mano.
  const dorso = new THREE.MeshStandardMaterial({ color: NOCHE, roughness: 0.5 });
  const tarjeta = new THREE.Mesh(
    new THREE.BoxGeometry(TARJETA.ancho, 0.9, TARJETA.alto),
    [dorso, dorso, new THREE.MeshStandardMaterial({ map: texturaTarjeta(), roughness: 0.45 }), dorso, dorso, dorso],
  );
  const reposoTarjeta = new THREE.Vector3(actual.lados.tarjeta[0], 0.6, actual.lados.tarjeta[1]);
  const giroReposo = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, TARJETA.giro, 0));
  tarjeta.position.copy(reposoTarjeta);
  tarjeta.quaternion.copy(giroReposo);
  tarjeta.userData = { tarjeta: true };
  escena.add(tarjeta);

  // El teléfono: el cuerpo, con las puntas redondas, y la pantalla, que es otro lienzo.
  const contorno = new THREE.Shape();
  {
    const { ancho: a, largo: l, radio: r } = TELEFONO;
    contorno.moveTo(-a / 2 + r, -l / 2);
    contorno.lineTo(a / 2 - r, -l / 2);
    contorno.quadraticCurveTo(a / 2, -l / 2, a / 2, -l / 2 + r);
    contorno.lineTo(a / 2, l / 2 - r);
    contorno.quadraticCurveTo(a / 2, l / 2, a / 2 - r, l / 2);
    contorno.lineTo(-a / 2 + r, l / 2);
    contorno.quadraticCurveTo(-a / 2, l / 2, -a / 2, l / 2 - r);
    contorno.lineTo(-a / 2, -l / 2 + r);
    contorno.quadraticCurveTo(-a / 2, -l / 2, -a / 2 + r, -l / 2);
  }
  const telefono = new THREE.Group();
  telefono.position.set(actual.lados.telefono[0], 0, actual.lados.telefono[1]);
  telefono.rotation.y = TELEFONO.giro;
  const cuerpoTelefono = new THREE.Mesh(
    new THREE.ExtrudeGeometry(contorno, { depth: TELEFONO.grosor, bevelEnabled: true, bevelThickness: 0.7, bevelSize: 0.7, bevelSegments: 3, curveSegments: 8 }),
    new THREE.MeshStandardMaterial({ color: '#1b2130', roughness: 0.4, metalness: 0.35 }),
  );
  cuerpoTelefono.rotation.x = -Math.PI / 2; // acostado: el contorno queda sobre la mesa
  cuerpoTelefono.position.y = 0.7;
  const lienzoTelefono = lienzo(ANCHO_TELEFONO, ALTO_TELEFONO);
  const ctxTelefono = lienzoTelefono.getContext('2d');
  const texturaTelefono = texturaDe(lienzoTelefono);
  const pantallaTelefono = new THREE.Mesh(
    new THREE.PlaneGeometry(TELEFONO.ancho - 5, (TELEFONO.ancho - 5) * (ALTO_TELEFONO / ANCHO_TELEFONO)),
    new THREE.MeshBasicMaterial({ map: texturaTelefono }),
  );
  pantallaTelefono.rotation.x = -Math.PI / 2;
  pantallaTelefono.position.y = TELEFONO.grosor + 1.5;
  const piezasTelefono = [cuerpoTelefono, pantallaTelefono];
  for (const pieza of piezasTelefono) {
    pieza.userData = { telefono: true };
    telefono.add(pieza);
  }
  escena.add(telefono);

  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 640),
    new THREE.MeshBasicMaterial({ map: texturaSombra(), transparent: true, depthWrite: false }),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.set(0, -0.4, 6);
  escena.add(sombra);

  // El dinero que viaja cuando el aparato devuelve un pago: una luz que va del aparato al teléfono.
  const moneda = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 14), new THREE.MeshStandardMaterial({ color: RAYO, emissive: RAYO, emissiveIntensity: 0.9 }));
  moneda.visible = false;
  escena.add(moneda);

  // ---- Lo que depende del aparato que se ve ----
  // Qué responde al clic y qué solo tapa; dónde se lee la tarjeta y a qué altura viaja en la mano.
  let tocables = [];
  let todo = [];
  const sobreElLector = new THREE.Vector3();
  const giroLector = new THREE.Quaternion();
  let alturaMano = 60;
  let arcoTarjeta = 40; // cuánto sube la tarjeta cuando va sola al lector: más si el lector está alto
  function tomarMedidas() {
    tocables = [...actual.teclas.values(), tarjeta, ...piezasTelefono];
    todo = [...tocables, ...actual.solidos];
    sobreElLector.copy(actual.lector.posicion);
    giroLector.copy(actual.lector.giro);
    alturaMano = sobreElLector.y + 8;
    arcoTarjeta = Math.max(30, sobreElLector.y * 0.8);
  }
  tomarMedidas();

  // ---- Vistas: la cámara muestra todo o se acerca al teléfono ----
  // Cada vista encuadra justo lo suyo, sea cual sea el tamaño del lienzo.
  function vistaDe(cajas, phi, theta, ocupa) {
    return {
      phi,
      theta,
      ocupa, // cuánto del lienzo puede llenar, de 0 a 2 en cada eje
      centro: cajas.reduce((junto, caja) => junto.union(caja), new THREE.Box3()).getCenter(new THREE.Vector3()),
      esquinas: cajas.flatMap((caja) =>
        [0, 1, 2, 3, 4, 5, 6, 7].map(
          (n) => new THREE.Vector3(n & 1 ? caja.max.x : caja.min.x, n & 2 ? caja.max.y : caja.min.y, n & 4 ? caja.max.z : caja.min.z),
        ),
      ),
      radio: 400, // la distancia y el centrado se calculan al conocer el tamaño del lienzo
      x: 0,
      y: 0,
    };
  }
  const casa = new THREE.Spherical().setFromVector3(MIRADA);
  const vistas = {};
  // Las cajas del teléfono y de la tarjeta en su lugar, para el aparato que se ve.
  function armarVistas() {
    const { telefono: suTelefono, tarjeta: suTarjeta } = actual.lados;
    const cajaTelefono = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(suTelefono[0], 5, suTelefono[1]), new THREE.Vector3(96, 10, 160));
    const cajaTarjeta = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(suTarjeta[0], 1, suTarjeta[1]), new THREE.Vector3(98, 2, 78));
    vistas.todo = vistaDe([actual.limites, cajaTarjeta, cajaTelefono], casa.phi, casa.theta, { ancho: 1.84, alto: 1.6 });
    // El teléfono, casi desde arriba y derecho, para que su pantalla se lea.
    vistas.telefono = vistaDe([cajaTelefono], 0.5, TELEFONO.giro + 0.1, { ancho: 1.7, alto: 1.62 });
    for (const vista of Object.values(vistas)) encuadrar(vista);
  }

  const tamano = { ancho: 1, alto: 1 };
  const proyectada = new THREE.Vector3();
  function mirar(centro, radio, phi, theta) {
    camara.position.setFromSphericalCoords(radio, phi, theta).add(centro);
    camara.lookAt(centro);
    camara.updateMatrixWorld();
  }
  // Cuánto ocupan las esquinas de una vista en el lienzo, vistas desde `radio`: de -1 a 1.
  function bordes(vista, radio) {
    mirar(vista.centro, radio, vista.phi, vista.theta);
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const esquina of vista.esquinas) {
      proyectada.copy(esquina).project(camara);
      b.x0 = Math.min(b.x0, proyectada.x);
      b.x1 = Math.max(b.x1, proyectada.x);
      b.y0 = Math.min(b.y0, proyectada.y);
      b.y1 = Math.max(b.y1, proyectada.y);
    }
    return b;
  }
  function encuadrar(vista) {
    // La distancia más corta desde la que entra todo lo de la vista.
    camara.clearViewOffset();
    let cerca = 80;
    let lejos = 5000;
    for (let i = 0; i < 28; i++) {
      const medio = (cerca + lejos) / 2;
      const b = bordes(vista, medio);
      if (b.x1 - b.x0 <= vista.ocupa.ancho && b.y1 - b.y0 <= vista.ocupa.alto) lejos = medio;
      else cerca = medio;
    }
    vista.radio = lejos;
    // Lo que se ve queda centrado en el lienzo, un poco hacia arriba para dejar lugar a la pista.
    const b = bordes(vista, vista.radio);
    vista.x = (tamano.ancho * (b.x0 + b.x1)) / 4;
    vista.y = tamano.alto * (0.03 - (b.y0 + b.y1) / 4);
  }

  // Adónde mira la cámara en este momento.
  const mira = { centro: new THREE.Vector3(), radio: 400, phi: casa.phi, theta: casa.theta, x: 0, y: 0 };
  let enfoque = 'todo'; // la vista en la que está, o a la que va
  let camaraEnViaje = false;
  let viaje = 0; // cada viaje de la cámara tiene su número: el más nuevo manda
  let arrastrando = false; // hay una tarjeta en la mano: la escena no gira
  const habilitar = () => {
    controles.enabled = !camaraEnViaje && !arrastrando;
  };
  function colocar() {
    camara.setViewOffset(tamano.ancho, tamano.alto, mira.x, mira.y, tamano.ancho, tamano.alto);
    mirar(mira.centro, mira.radio, mira.phi, mira.theta);
    controles.target.copy(mira.centro);
  }
  function limitar(vista) {
    controles.minAzimuthAngle = vista.theta - GIRO.lado;
    controles.maxAzimuthAngle = vista.theta + GIRO.lado;
    controles.minPolarAngle = Math.max(vista.phi - GIRO.alto, 0.12);
    controles.maxPolarAngle = Math.min(vista.phi + GIRO.alto, Math.PI * 0.46);
  }
  // Lleva la cámara a una vista. Devuelve una promesa que termina cuando llega.
  function irA(nombre, ms = VIAJE_CAMARA_MS) {
    enfoque = nombre;
    const a = vistas[nombre];
    if (!a) return Promise.resolve(); // el lienzo todavía no tiene tamaño: no hay vistas
    const este = ++viaje;
    // Sale de donde esté la cámara: pudo girarla quien mira.
    const ahora = new THREE.Spherical().setFromVector3(camara.position.clone().sub(controles.target));
    const desde = { centro: controles.target.clone(), radio: ahora.radius, phi: ahora.phi, theta: ahora.theta, x: mira.x, y: mira.y };
    camaraEnViaje = true;
    habilitar();
    const entre = THREE.MathUtils.lerp;
    return animar(ms, (t) => {
      if (este !== viaje) return;
      mira.centro.lerpVectors(desde.centro, a.centro, t);
      mira.radio = entre(desde.radio, a.radio, t);
      mira.phi = entre(desde.phi, a.phi, t);
      mira.theta = entre(desde.theta, a.theta, t);
      mira.x = entre(desde.x, a.x, t);
      mira.y = entre(desde.y, a.y, t);
      colocar();
      if (t >= 1) {
        camaraEnViaje = false;
        limitar(a);
        habilitar();
      }
    });
  }
  // Al soltar después de girar, la vista vuelve sola a su lugar: nunca queda nada de espaldas.
  controles.addEventListener('end', () => {
    const ahora = new THREE.Spherical().setFromVector3(camara.position.clone().sub(controles.target));
    const a = vistas[enfoque];
    if (Math.abs(ahora.phi - a.phi) > 0.003 || Math.abs(ahora.theta - a.theta) > 0.003) irA(enfoque, 520);
  });

  // Qué vista toca según lo que está pasando.
  let estadoActual = null;
  let mirandoElPago = false; // la tarjeta ya tocó el lector y el pago está en camino
  let mirarHasta = 0; // hasta cuándo se mira el teléfono por un pago o una devolución
  let ultimoMovimiento = null;
  let porEntregar = null; // el aparato que vio un pago y todavía no actuó: espera a que se lo mire
  function vistaQueToca() {
    const fase = estadoActual?.fase;
    if (fase === 'sin-cuenta' || fase === 'creando') return 'telefono';
    if (mirandoElPago || performance.now() < mirarHasta) return 'telefono';
    return 'todo';
  }
  function revisarVista() {
    const toca = vistaQueToca();
    const llegada = toca !== enfoque ? irA(toca) : Promise.resolve();
    // El aparato actúa cuando la cámara vuelve a mostrarlo: así se ve girar el torniquete o caer la botella.
    if (toca === 'todo' && porEntregar) {
      const aparato = porEntregar;
      porEntregar = null;
      llegada.then(() => {
        if (aparato === actual) aparato.alAprobar();
      });
    }
  }

  // ---- Cambiar de aparato: sale uno, entra otro, y el teléfono y la tarjeta se acomodan ----
  let cambio = 0;
  function cambiarA(id) {
    const nuevo = aparatos[id];
    if (!nuevo || nuevo === actual) return;
    const este = ++cambio;
    for (const aparato of Object.values(aparatos)) {
      aparato.grupo.visible = aparato === nuevo;
      aparato.grupo.scale.setScalar(1);
    }
    actual = nuevo;
    porEntregar = null;
    tomarMedidas();
    const telefonoDesde = telefono.position.clone();
    const telefonoHasta = new THREE.Vector3(actual.lados.telefono[0], 0, actual.lados.telefono[1]);
    const tarjetaDesde = reposoTarjeta.clone();
    const tarjetaHasta = new THREE.Vector3(actual.lados.tarjeta[0], 0.6, actual.lados.tarjeta[1]);
    animar(320, (t) => {
      if (este !== cambio) return;
      actual.grupo.scale.setScalar(0.6 + 0.4 * t); // el aparato nuevo llega creciendo
      telefono.position.lerpVectors(telefonoDesde, telefonoHasta, t);
      reposoTarjeta.lerpVectors(tarjetaDesde, tarjetaHasta, t);
      if (tarjetaEn === 'reposo') tarjeta.position.copy(reposoTarjeta);
    });
    armarVistas();
    irA(vistaQueToca());
  }

  // ---- La tarjeta: en reposo, en la mano de quien la arrastra, o de viaje (animada) ----
  let tarjetaEn = 'reposo';
  let tarjetaLlama = false; // hay un cobro esperando: la tarjeta se mueve un poco para que la toquen
  const destinoMano = new THREE.Vector3(); // adónde la lleva el puntero
  const agarre = new THREE.Vector3(); // de dónde la agarraron, para que no salte
  let punteroTarjeta = null;
  let movida = false; // el puntero se movió: es un arrastre, no un toque
  let avisada = false; // en este arrastre ya llegó una vez al lector

  // La tarjeta toca el lector: si con eso empezó un pago, la cámara va al teléfono a verlo.
  function tocoElLector() {
    if (estadoActual?.tarjetaPagando) mirandoElPago = true;
    revisarVista();
  }
  async function volverAlReposo(ms = 520, arco = arcoTarjeta) {
    tarjetaEn = 'viaje';
    const desde = tarjeta.position.clone();
    const giro = tarjeta.quaternion.clone();
    await animar(ms, (t) => {
      tarjeta.position.lerpVectors(desde, reposoTarjeta, t);
      tarjeta.position.y += arco * Math.sin(Math.PI * t); // sube y baja en arco
      tarjeta.quaternion.slerpQuaternions(giro, giroReposo, t);
    });
    tarjetaEn = 'reposo';
  }
  // La tarjeta va sola al lector, espera a que la lea y vuelve.
  async function acercarTarjeta() {
    if (tarjetaEn !== 'reposo') return;
    tarjetaEn = 'viaje';
    const desde = tarjeta.position.clone();
    await animar(560, (t) => {
      tarjeta.position.lerpVectors(desde, sobreElLector, t);
      tarjeta.position.y += arcoTarjeta * Math.sin(Math.PI * t);
      tarjeta.quaternion.slerpQuaternions(giroReposo, giroLector, t);
    });
    tocoElLector();
    await espera(700);
    await volverAlReposo();
  }
  // La tarjeta llegó al lector en la mano: se apoya, espera a que la lea y vuelve sola.
  async function leerEnElLector() {
    soltar();
    tarjetaEn = 'viaje';
    const desde = tarjeta.position.clone();
    const giro = tarjeta.quaternion.clone();
    await animar(200, (t) => {
      tarjeta.position.lerpVectors(desde, sobreElLector, t);
      tarjeta.quaternion.slerpQuaternions(giro, giroLector, t);
    });
    tocoElLector();
    await espera(700);
    await volverAlReposo();
  }
  function soltar() {
    if (punteroTarjeta !== null && lienzoPagina.hasPointerCapture?.(punteroTarjeta)) lienzoPagina.releasePointerCapture(punteroTarjeta);
    punteroTarjeta = null;
    arrastrando = false;
    habilitar();
    lienzoPagina.style.cursor = 'grab';
  }

  // El aparato devuelve un pago: mientras firma y envía, el dinero va saliendo hacia el teléfono.
  let latiendo = false;
  async function latir() {
    if (latiendo) return;
    latiendo = true;
    const desde = new THREE.Vector3();
    const hasta = new THREE.Vector3();
    while (estadoActual?.devolviendo) {
      desde.copy(sobreElLector);
      hasta.copy(telefono.position).setY(TELEFONO.grosor + 6);
      const alto = Math.max(50, desde.y * 0.5);
      moneda.visible = true;
      await animar(760, (t) => {
        moneda.position.lerpVectors(desde, hasta, t);
        moneda.position.y += alto * Math.sin(Math.PI * t);
        moneda.scale.setScalar(0.5 + Math.sin(Math.PI * t)); // nace chica, crece y se apaga al llegar
      });
      moneda.visible = false;
      await espera(140);
      if (sinMovimiento) break;
    }
    latiendo = false;
  }

  // ---- El puntero: qué hay debajo, y dónde cae sobre un plano horizontal ----
  const rayo = new THREE.Raycaster();
  const puntero = new THREE.Vector2();
  const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function apuntar(evento) {
    const borde = lienzoPagina.getBoundingClientRect();
    puntero.set(((evento.clientX - borde.left) / borde.width) * 2 - 1, -((evento.clientY - borde.top) / borde.height) * 2 + 1);
    rayo.setFromCamera(puntero, camara);
  }
  function bajoElPuntero(evento) {
    apuntar(evento);
    return rayo.intersectObjects(todo, false)[0]?.object ?? null;
  }
  function enElPlano(evento, altura) {
    apuntar(evento);
    plano.constant = -altura;
    return rayo.ray.intersectPlane(plano, new THREE.Vector3());
  }

  // La tecla bajo el puntero se enciende un poco: así se nota que se puede pulsar.
  let resaltada = null;
  function resaltar(tecla) {
    if (resaltada === tecla) return;
    if (resaltada) resaltada.userData.cara.emissiveIntensity = 0;
    resaltada = tecla;
    if (resaltada) resaltada.userData.cara.emissiveIntensity = 0.45;
  }

  // Agarrar la tarjeta. Va antes que el giro de la escena: con la tarjeta en la mano, nada gira.
  let dondeBajo = null;
  lienzoPagina.addEventListener(
    'pointerdown',
    (evento) => {
      dondeBajo = { x: evento.clientX, y: evento.clientY };
      if (tarjetaEn !== 'reposo' || !bajoElPuntero(evento)?.userData.tarjeta) return;
      tarjetaEn = 'mano';
      punteroTarjeta = evento.pointerId;
      movida = false;
      avisada = false;
      arrastrando = true;
      habilitar();
      try {
        lienzoPagina.setPointerCapture(evento.pointerId);
      } catch {
        // sin captura el arrastre igual sigue mientras el puntero esté sobre el modelo
      }
      const toque = enElPlano(evento, tarjeta.position.y) ?? tarjeta.position;
      agarre.copy(tarjeta.position).sub(toque).setY(0);
      destinoMano.copy(tarjeta.position);
      lienzoPagina.style.cursor = 'grabbing';
    },
    { capture: true },
  );
  // En pantallas táctiles, con el dedo sobre la tarjeta la página no se desplaza: se mueve la tarjeta.
  lienzoPagina.addEventListener(
    'touchstart',
    (evento) => {
      const dedo = evento.changedTouches[0];
      if (tarjetaEn === 'mano' || (tarjetaEn === 'reposo' && dedo && bajoElPuntero(dedo)?.userData.tarjeta)) evento.preventDefault();
    },
    { passive: false },
  );

  lienzoPagina.addEventListener('pointermove', (evento) => {
    if (tarjetaEn === 'mano') {
      if (evento.pointerId !== punteroTarjeta) return;
      if (dondeBajo && Math.hypot(evento.clientX - dondeBajo.x, evento.clientY - dondeBajo.y) > 6) movida = true;
      if (!movida) return;
      const punto = enElPlano(evento, alturaMano);
      if (!punto) return;
      destinoMano.copy(punto).add(agarre);
      destinoMano.x = THREE.MathUtils.clamp(destinoMano.x, -280, 300);
      destinoMano.z = THREE.MathUtils.clamp(destinoMano.z, -200, 220);
      destinoMano.y = alturaMano;
      // Llegó al lector: se avisa una sola vez por arrastre. Si empieza un pago, se apoya y lee.
      if (!avisada && Math.hypot(destinoMano.x - sobreElLector.x, destinoMano.z - sobreElLector.z) < ALCANCE_LECTOR) {
        avisada = true;
        if (alPasarTarjeta()) leerEnElLector();
      }
      return;
    }
    const objeto = bajoElPuntero(evento);
    const tocable = objeto && tocables.includes(objeto);
    resaltar(tocable && objeto.userData.tecla ? objeto : null);
    lienzoPagina.style.cursor = objeto?.userData.tarjeta ? 'grab' : tocable ? 'pointer' : 'grab';
  });
  lienzoPagina.addEventListener('pointerleave', () => resaltar(null));

  function alLevantar(evento, cancelado) {
    if (tarjetaEn === 'mano' && evento.pointerId === punteroTarjeta) {
      soltar();
      if (movida || cancelado) {
        volverAlReposo(420, 0); // la soltaron lejos del lector: vuelve a su lugar
      } else {
        tarjetaEn = 'reposo';
        alTocarTarjeta(); // fue un toque: va sola al lector
      }
      return;
    }
    if (cancelado || !dondeBajo || Math.hypot(evento.clientX - dondeBajo.x, evento.clientY - dondeBajo.y) > 6) return;
    const objeto = bajoElPuntero(evento);
    if (!objeto) return;
    if (objeto.userData.tecla && actual.teclas.get(objeto.userData.tecla) === objeto) {
      actual.pulsar(objeto.userData.tecla);
      alPulsarTecla(objeto.userData.tecla);
    } else if (objeto.userData.telefono) {
      alTocarTelefono();
    }
  }
  lienzoPagina.addEventListener('pointerup', (evento) => alLevantar(evento, false));
  lienzoPagina.addEventListener('pointercancel', (evento) => alLevantar(evento, true));

  // ---- Tamaño y dibujo ----
  function ajustar() {
    const { clientWidth: ancho, clientHeight: alto } = lienzoPagina;
    if (!ancho || !alto) return;
    pintor.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
    Object.assign(tamano, { ancho, alto });
    armarVistas();
    // Con el tamaño nuevo, la cámara queda de una vez en la vista que toca.
    viaje++;
    camaraEnViaje = false;
    const { centro, radio, phi, theta, x, y } = vistas[enfoque];
    mira.centro.copy(centro);
    Object.assign(mira, { radio, phi, theta, x, y });
    colocar();
    limitar(vistas[enfoque]);
    habilitar();
  }
  new ResizeObserver(ajustar).observe(lienzoPagina);
  ajustar();

  const giroEnMano = new THREE.Quaternion();
  pintor.setAnimationLoop((ahora) => {
    for (const cuadro of animaciones) cuadro();
    if (tarjetaEn === 'reposo') {
      tarjeta.position.y = reposoTarjeta.y + (tarjetaLlama && !sinMovimiento ? 4 + 2.5 * Math.sin(ahora / 260) : 0);
    } else if (tarjetaEn === 'mano' && movida) {
      // Sigue al puntero con suavidad y se inclina como el lector al acercarse a él.
      tarjeta.position.lerp(destinoMano, sinMovimiento ? 1 : 0.35);
      const cerca = 1 - Math.min(1, Math.hypot(tarjeta.position.x - sobreElLector.x, tarjeta.position.z - sobreElLector.z) / 90);
      tarjeta.quaternion.copy(giroEnMano.slerpQuaternions(giroReposo, giroLector, cerca));
    }
    if (!camaraEnViaje) controles.update();
    pintor.render(escena, camara);
  });

  /** Refleja el estado del simulador: el aparato elegido, las pantallas y adónde mira la cámara. */
  let cobroVisto = 0;
  let pagoVisto = '';
  function actualizar(estado) {
    const antes = estadoActual;
    estadoActual = estado;
    if (estado.aparato !== actual.id) cambiarA(estado.aparato);
    actual.dibujar(estado);
    dibujarTelefono(ctxTelefono, estado);
    texturaTelefono.needsUpdate = true;
    tarjetaLlama = estado.fase === 'esperando' && Boolean(estado.cobro) && !estado.tarjetaPagando;

    // Un cobro nuevo: el aparato se prepara (llega otra persona, se repone la botella).
    if (estado.cobro && estado.cobro.numero !== cobroVisto) {
      cobroVisto = estado.cobro.numero;
      actual.alEmpezar();
    }
    // El aparato vio el pago: va a actuar en cuanto la cámara lo muestre.
    if (estado.fase === 'aprobado' && estado.ultimoPago && estado.ultimoPago.hash !== pagoVisto) {
      pagoVisto = estado.ultimoPago.hash;
      porEntregar = actual;
    }
    if (estado.devolviendo && !antes?.devolviendo) latir();

    // El pago terminó, bien o mal: lo que sigue lo decide si hubo un movimiento en la cuenta.
    if (!estado.tarjetaPagando) mirandoElPago = false;
    if (estado.fase !== 'aprobado') mirarHasta = 0;
    if (estado.movimiento !== ultimoMovimiento) {
      ultimoMovimiento = estado.movimiento;
      if (estado.movimiento) {
        // Un pago o una devolución: el teléfono lo muestra, y la cámara se queda un rato ahí.
        mirarHasta = performance.now() + MIRAR_PAGO_MS;
        setTimeout(revisarVista, MIRAR_PAGO_MS + 60);
      }
    }
    revisarVista();
  }

  /** Dónde está algo en la página, en píxeles: 'tarjeta', 'lector' (adonde hay que llevarla) o 'telefono'. */
  function donde(nombre) {
    const punto =
      nombre === 'tarjeta'
        ? tarjeta.position.clone()
        : nombre === 'lector'
          ? new THREE.Vector3(sobreElLector.x, alturaMano, sobreElLector.z)
          : telefono.position.clone().setY(TELEFONO.grosor);
    punto.project(camara);
    const borde = lienzoPagina.getBoundingClientRect();
    return { x: borde.left + ((punto.x + 1) / 2) * borde.width, y: borde.top + ((1 - punto.y) / 2) * borde.height };
  }

  return { actualizar, acercarTarjeta, donde };
}
