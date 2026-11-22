// La escena en 3D: el terminal (su carcasa, su pantalla y su teclado), el teléfono de quien paga
// y su tarjeta de prueba. La base del terminal es la que se imprime; la tapa lleva una ventana de
// pantalla más grande, solo para la demo web (simulador/tapa_demo.scad).
//
// El modelo muestra lo que pasa y también se puede tocar:
//   - el teléfono y las teclas responden al clic;
//   - la tarjeta se toca (va sola al lector) o se agarra y se lleva a mano hasta el lector;
//   - la cámara se acerca sola al teléfono cuando lo que importa pasa ahí (al crear la cuenta y
//     después de pasar la tarjeta) y vuelve a mostrar todo cuando termina;
//   - se puede girar un poco arrastrando; al soltar, la vista vuelve a su lugar.
//
// Las medidas están en milímetros y salen del modelo de la carcasa (hardware/carcasa).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ALTO, ANCHO, dibujarPantalla } from './pantalla.js';
import { ALTO as ALTO_TELEFONO, ANCHO as ANCHO_TELEFONO, dibujarTelefono } from './telefono.js';

// De la carcasa: ancho, alto del frente, inclinación de la tapa y dónde va cada pieza sobre ella.
const ANCHO_MM = 86;
const LARGO_MM = 172;
const ALTO_FRENTE = 20.5;
const INCLINACION = 10;
const GROSOR_TAPA = 2;
const CENTRO = ANCHO_MM / 2;
const PANTALLA_V = 151.4; // centro de la ventana de la pantalla, medido sobre la tapa
const PANTALLA = { ancho: 64, alto: 32 }; // la ventana de la demo, en milímetros
const LECTOR_V = 110.85; // centro del lector de tarjetas
const TECLADO = { v0: 9, ancho: 69, alto: 77 };
// Las teclas, de la fila más cercana a quien usa el terminal a la más lejana.
const TECLAS = [
  ['*', '0', '#', 'D'],
  ['7', '8', '9', 'C'],
  ['4', '5', '6', 'B'],
  ['1', '2', '3', 'A'],
];
const SIN_USO = new Set(['B', 'C']); // en el modo caja no hacen nada: van apagadas
// El teléfono de quien paga: un rectángulo de puntas redondas, acostado a la izquierda del terminal.
const TELEFONO = { ancho: 72, largo: 150, grosor: 7, radio: 11, x: -100, z: 26, giro: 0.16 };

const NOCHE = '#000b25';
const RAYO = '#ffcd00';
// Desde dónde se mira todo, y cuánto se puede girar (en radianes) antes de soltar.
const MIRADA = new THREE.Vector3(167, 228, 291).normalize();
const GIRO = { lado: 0.42, alto: 0.16 };
const VIAJE_CAMARA_MS = 750; // lo que tarda la cámara en ir de una vista a otra
const MIRAR_PAGO_MS = 3500; // cuánto se queda la cámara en el teléfono después de un pago
const ALCANCE_LECTOR = 30; // a cuántos milímetros del lector se lee la tarjeta llevada a mano

function lienzo(ancho, alto) {
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  return c;
}

function texturaDe(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function texturaTecla(letra, apagada) {
  const c = lienzo(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = apagada ? '#5d6884' : '#eef1f8';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = apagada ? '#3d4763' : NOCHE;
  ctx.font = '700 78px "Barlow", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letra, 64, 70);
  return texturaDe(c);
}

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
 * Arma la escena sobre `lienzoPagina`. `urlModelo` es la carpeta con base.stl y tapa.stl.
 *
 * Avisa cuando se pulsa una tecla (`alPulsarTecla`), cuando se toca la tarjeta (`alTocarTarjeta`),
 * cuando la tarjeta llega al lector llevada a mano (`alPasarTarjeta`, que devuelve si con eso
 * empezó un pago) y cuando se toca el teléfono (`alTocarTelefono`).
 *
 * Devuelve cómo actualizarla con el estado del simulador, cómo llevar la tarjeta sola al lector y
 * dónde está cada cosa en la página (`donde`), para quien quiera arrastrar la tarjeta sin mirar.
 */
export async function crearEscena({ lienzoPagina, urlModelo, alPulsarTecla, alTocarTarjeta, alPasarTarjeta, alTocarTelefono }) {
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pintor = new THREE.WebGLRenderer({ canvas: lienzoPagina, antialias: true, alpha: true });
  pintor.setPixelRatio(Math.min(devicePixelRatio, 2));
  pintor.outputColorSpace = THREE.SRGBColorSpace;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(30, 1, 10, 4000);

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

  // El modelo viene con el eje Z hacia arriba y una esquina en el origen: se acuesta sobre la
  // mesa y se centra. El frente (donde está el teclado) queda mirando a la cámara.
  const aparato = new THREE.Group();
  aparato.rotation.x = -Math.PI / 2;
  aparato.position.set(-CENTRO, 0, LARGO_MM / 2);
  escena.add(aparato);

  const cargador = new STLLoader();
  const [base, tapaModelo] = await Promise.all([cargador.loadAsync(`${urlModelo}base.stl`), cargador.loadAsync(`${urlModelo}tapa.stl`)]);
  for (const forma of [base, tapaModelo]) forma.computeVertexNormals();
  // Lo que no responde al clic pero sí tapa lo que tiene detrás.
  const cuerpo = [
    new THREE.Mesh(base, new THREE.MeshStandardMaterial({ color: '#16264f', roughness: 0.55, metalness: 0.05 })),
    new THREE.Mesh(tapaModelo, new THREE.MeshStandardMaterial({ color: RAYO, roughness: 0.5, metalness: 0.05 })),
  ];
  aparato.add(...cuerpo);

  // Lo que va sobre la tapa se coloca en su propio sistema: u de lado a lado, v del frente al
  // fondo sobre la pendiente, w hacia afuera (la cara exterior está en w = GROSOR_TAPA).
  const tapa = new THREE.Group();
  tapa.position.set(0, 0, ALTO_FRENTE);
  tapa.rotation.x = THREE.MathUtils.degToRad(INCLINACION);
  aparato.add(tapa);

  // Pantalla: un lienzo que se vuelve a dibujar con cada cambio y llena la ventana de la tapa.
  const lienzoPantalla = lienzo(ANCHO, ALTO);
  const ctxPantalla = lienzoPantalla.getContext('2d');
  const texturaPantalla = texturaDe(lienzoPantalla);
  const pantalla = new THREE.Mesh(
    new THREE.PlaneGeometry(PANTALLA.ancho, PANTALLA.alto),
    new THREE.MeshBasicMaterial({ map: texturaPantalla }),
  );
  pantalla.position.set(CENTRO, PANTALLA_V, 1.2);
  tapa.add(pantalla);
  cuerpo.push(pantalla);

  // Teclado: la membrana y sus 16 teclas.
  const membrana = new THREE.Mesh(
    new THREE.BoxGeometry(TECLADO.ancho, TECLADO.alto, 0.9),
    new THREE.MeshStandardMaterial({ color: '#0b1634', roughness: 0.8 }),
  );
  membrana.position.set(CENTRO, TECLADO.v0 + TECLADO.alto / 2, GROSOR_TAPA + 0.45);
  tapa.add(membrana);
  cuerpo.push(membrana);

  const tocables = [];
  const teclas = new Map();
  const costado = new THREE.MeshStandardMaterial({ color: '#c9d0e2', roughness: 0.7 });
  const costadoApagado = new THREE.MeshStandardMaterial({ color: '#4a5572', roughness: 0.8 });
  TECLAS.forEach((fila, j) => {
    fila.forEach((letra, i) => {
      const apagada = SIN_USO.has(letra);
      const lado = apagada ? costadoApagado : costado;
      const cara = new THREE.MeshStandardMaterial({ map: texturaTecla(letra, apagada), roughness: 0.6, emissive: RAYO, emissiveIntensity: 0 });
      const tecla = new THREE.Mesh(new THREE.BoxGeometry(11, 11, 1.4), [lado, lado, lado, lado, cara, lado]);
      tecla.position.set(CENTRO - TECLADO.ancho / 2 + 12 + i * 15, TECLADO.v0 + 14.5 + j * 16, GROSOR_TAPA + 1.5);
      tecla.userData = { tecla: letra, reposo: tecla.position.z, cara };
      tapa.add(tecla);
      if (apagada) {
        cuerpo.push(tecla);
      } else {
        tocables.push(tecla);
        teclas.set(letra, tecla);
      }
    });
  });

  // La luz del relé: se enciende cuando el terminal entrega.
  const luzRele = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 12), new THREE.MeshStandardMaterial({ color: '#26355f', emissive: '#000000' }));
  luzRele.position.set(CENTRO + 33, LECTOR_V + 14, GROSOR_TAPA + 0.8);
  tapa.add(luzRele);

  // La tarjeta de prueba descansa al lado del terminal. Va al lector sola, o llevada a mano.
  const dorso = new THREE.MeshStandardMaterial({ color: NOCHE, roughness: 0.5 });
  const tarjeta = new THREE.Mesh(
    new THREE.BoxGeometry(85.6, 0.9, 54),
    [dorso, dorso, new THREE.MeshStandardMaterial({ map: texturaTarjeta(), roughness: 0.45 }), dorso, dorso, dorso],
  );
  const reposoTarjeta = { posicion: new THREE.Vector3(96, 0.6, 36), giro: new THREE.Euler(0, -0.32, 0) };
  tarjeta.position.copy(reposoTarjeta.posicion);
  tarjeta.rotation.copy(reposoTarjeta.giro);
  tarjeta.userData = { tarjeta: true };
  escena.add(tarjeta);
  tocables.push(tarjeta);

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
  telefono.position.set(TELEFONO.x, 0, TELEFONO.z);
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
  for (const pieza of [cuerpoTelefono, pantallaTelefono]) {
    pieza.userData = { telefono: true };
    telefono.add(pieza);
    tocables.push(pieza);
  }
  escena.add(telefono);

  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 560),
    new THREE.MeshBasicMaterial({ map: texturaSombra(), transparent: true, depthWrite: false }),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.set(-8, -0.4, 6);
  escena.add(sombra);

  escena.updateMatrixWorld(true);
  // Dónde queda la tarjeta cuando el lector la lee, y a qué altura viaja en la mano.
  const sobreElLector = tapa.localToWorld(new THREE.Vector3(CENTRO, LECTOR_V, 13));
  const giroLector = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(INCLINACION), 0, 0));
  const giroReposo = new THREE.Quaternion().setFromEuler(reposoTarjeta.giro);
  const ALTURA_MANO = sobreElLector.y + 8;

  // ---- Animaciones cortas: una tecla que baja, la tarjeta y la cámara que van y vuelven ----
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

  // ---- Vistas: la cámara muestra todo o se acerca al teléfono ----
  // Cada vista encuadra justo lo suyo, sea cual sea el tamaño del lienzo.
  function vistaDe(cosas, phi, theta, ocupa) {
    const cajas = cosas.map((cosa) => new THREE.Box3().setFromObject(cosa));
    return {
      phi,
      theta,
      ocupa, // cuánto del lienzo puede llenar, de 0 a 2 en cada eje
      centro: cajas.reduce((todo, caja) => todo.union(caja), new THREE.Box3()).getCenter(new THREE.Vector3()),
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
  const vistas = {
    todo: vistaDe([aparato, tarjeta, telefono], casa.phi, casa.theta, { ancho: 1.84, alto: 1.6 }),
    // El teléfono, casi desde arriba y derecho, para que su pantalla se lea.
    telefono: vistaDe([telefono], 0.5, TELEFONO.giro + 0.1, { ancho: 1.7, alto: 1.62 }),
  };

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
    let lejos = 3000;
    for (let i = 0; i < 26; i++) {
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
  function irA(nombre, ms = VIAJE_CAMARA_MS) {
    enfoque = nombre;
    const a = vistas[nombre];
    const este = ++viaje;
    // Sale de donde esté la cámara: pudo girarla quien mira.
    const ahora = new THREE.Spherical().setFromVector3(camara.position.clone().sub(controles.target));
    const desde = { centro: controles.target.clone(), radio: ahora.radius, phi: ahora.phi, theta: ahora.theta, x: mira.x, y: mira.y };
    camaraEnViaje = true;
    habilitar();
    const entre = THREE.MathUtils.lerp;
    animar(ms, (t) => {
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
  function vistaQueToca() {
    const fase = estadoActual?.fase;
    if (fase === 'sin-cuenta' || fase === 'creando') return 'telefono';
    if (mirandoElPago || performance.now() < mirarHasta) return 'telefono';
    return 'todo';
  }
  function revisarVista() {
    const toca = vistaQueToca();
    if (toca !== enfoque) irA(toca);
  }

  // ---- Las teclas ----
  function pulsar(letra) {
    const tecla = teclas.get(letra);
    if (!tecla) return;
    animar(160, (t) => {
      tecla.position.z = tecla.userData.reposo - 0.7 * Math.sin(Math.PI * t);
    });
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
  async function volverAlReposo(ms = 520, arco = 26) {
    tarjetaEn = 'viaje';
    const desde = tarjeta.position.clone();
    const giro = tarjeta.quaternion.clone();
    await animar(ms, (t) => {
      tarjeta.position.lerpVectors(desde, reposoTarjeta.posicion, t);
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
    await animar(520, (t) => {
      tarjeta.position.lerpVectors(desde, sobreElLector, t);
      tarjeta.position.y += 26 * Math.sin(Math.PI * t);
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

  // ---- El puntero: qué hay debajo, y dónde cae sobre un plano horizontal ----
  const rayo = new THREE.Raycaster();
  const puntero = new THREE.Vector2();
  const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const todo = [...tocables, ...cuerpo];
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
      const punto = enElPlano(evento, ALTURA_MANO);
      if (!punto) return;
      destinoMano.copy(punto).add(agarre);
      destinoMano.x = THREE.MathUtils.clamp(destinoMano.x, -180, 210);
      destinoMano.z = THREE.MathUtils.clamp(destinoMano.z, -140, 150);
      destinoMano.y = ALTURA_MANO;
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
    if (teclas.get(objeto.userData.tecla) === objeto) {
      pulsar(objeto.userData.tecla);
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
    for (const vista of Object.values(vistas)) encuadrar(vista);
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
      tarjeta.position.y = reposoTarjeta.posicion.y + (tarjetaLlama && !sinMovimiento ? 4 + 2.5 * Math.sin(ahora / 260) : 0);
    } else if (tarjetaEn === 'mano' && movida) {
      // Sigue al puntero con suavidad y se inclina como la tapa al acercarse al lector.
      tarjeta.position.lerp(destinoMano, sinMovimiento ? 1 : 0.35);
      const cerca = 1 - Math.min(1, Math.hypot(tarjeta.position.x - sobreElLector.x, tarjeta.position.z - sobreElLector.z) / 90);
      tarjeta.quaternion.copy(giroEnMano.slerpQuaternions(giroReposo, giroLector, cerca));
    }
    if (!camaraEnViaje) controles.update();
    pintor.render(escena, camara);
  });

  /** Refleja el estado del simulador: las dos pantallas, la luz del relé y adónde mira la cámara. */
  function actualizar(estado) {
    estadoActual = estado;
    dibujarPantalla(ctxPantalla, estado);
    texturaPantalla.needsUpdate = true;
    dibujarTelefono(ctxTelefono, estado);
    texturaTelefono.needsUpdate = true;
    luzRele.material.color.set(estado.rele ? '#3dff9a' : '#26355f');
    luzRele.material.emissive.set(estado.rele ? '#19c96b' : '#000000');
    tarjetaLlama = estado.fase === 'esperando' && Boolean(estado.cobro) && !estado.tarjetaPagando;

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
          ? new THREE.Vector3(sobreElLector.x, ALTURA_MANO, sobreElLector.z)
          : telefono.position.clone().setY(TELEFONO.grosor);
    punto.project(camara);
    const borde = lienzoPagina.getBoundingClientRect();
    return { x: borde.left + ((punto.x + 1) / 2) * borde.width, y: borde.top + ((1 - punto.y) / 2) * borde.height };
  }

  return { actualizar, acercarTarjeta, pulsar, donde };
}
