// El aparato en 3D: la carcasa del terminal, con su pantalla, su teclado y una tarjeta de prueba.
// La base es la que se imprime; la tapa lleva una ventana de pantalla más grande, solo para la
// demo web (simulador/tapa_demo.scad). Se puede girar con el ratón o el dedo; las teclas
// y la tarjeta responden al clic. Todo lo que se hace aquí también se puede hacer con los botones
// de la página: el 3D es una forma más de usar el mismo aparato.
//
// Las medidas están en milímetros y salen del modelo de la carcasa (hardware/carcasa).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ALTO, ANCHO, dibujarPantalla } from './pantalla.js';

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
// Las teclas, de la fila más cercana a quien usa el aparato a la más lejana.
const TECLAS = [
  ['*', '0', '#', 'D'],
  ['7', '8', '9', 'C'],
  ['4', '5', '6', 'B'],
  ['1', '2', '3', 'A'],
];

const NOCHE = '#000b25';
const RAYO = '#ffcd00';

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

function texturaTecla(letra) {
  const c = lienzo(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#eef1f8';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = NOCHE;
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
 * Devuelve cómo actualizarla con el estado del simulador y cómo animar la tarjeta y las teclas.
 */
export async function crearEscena({ lienzoPagina, urlModelo, alPulsarTecla, alTocarTarjeta }) {
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pintor = new THREE.WebGLRenderer({ canvas: lienzoPagina, antialias: true, alpha: true });
  pintor.setPixelRatio(Math.min(devicePixelRatio, 2));
  pintor.outputColorSpace = THREE.SRGBColorSpace;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(30, 1, 10, 3000);
  camara.position.set(175, 250, 285);

  const controles = new OrbitControls(camara, lienzoPagina);
  controles.target.set(8, 22, -6);
  controles.enablePan = false;
  controles.minDistance = 230;
  controles.maxDistance = 560;
  controles.maxPolarAngle = Math.PI * 0.48;
  controles.enableDamping = !sinMovimiento;
  controles.update();

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
  aparato.add(new THREE.Mesh(base, new THREE.MeshStandardMaterial({ color: '#16264f', roughness: 0.55, metalness: 0.05 })));
  aparato.add(new THREE.Mesh(tapaModelo, new THREE.MeshStandardMaterial({ color: RAYO, roughness: 0.5, metalness: 0.05 })));

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

  // Teclado: la membrana y sus 16 teclas.
  const membrana = new THREE.Mesh(
    new THREE.BoxGeometry(TECLADO.ancho, TECLADO.alto, 0.9),
    new THREE.MeshStandardMaterial({ color: '#0b1634', roughness: 0.8 }),
  );
  membrana.position.set(CENTRO, TECLADO.v0 + TECLADO.alto / 2, GROSOR_TAPA + 0.45);
  tapa.add(membrana);

  const tocables = [];
  const teclas = new Map();
  const costado = new THREE.MeshStandardMaterial({ color: '#c9d0e2', roughness: 0.7 });
  TECLAS.forEach((fila, j) => {
    fila.forEach((letra, i) => {
      const cara = new THREE.MeshStandardMaterial({ map: texturaTecla(letra), roughness: 0.6 });
      const tecla = new THREE.Mesh(new THREE.BoxGeometry(11, 11, 1.4), [costado, costado, costado, costado, cara, costado]);
      tecla.position.set(CENTRO - TECLADO.ancho / 2 + 12 + i * 15, TECLADO.v0 + 14.5 + j * 16, GROSOR_TAPA + 1.5);
      tecla.userData = { tecla: letra, reposo: tecla.position.z };
      tapa.add(tecla);
      tocables.push(tecla);
      teclas.set(letra, tecla);
    });
  });

  // La luz del relé: se enciende cuando el aparato entrega.
  const luzRele = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 12), new THREE.MeshStandardMaterial({ color: '#26355f', emissive: '#000000' }));
  luzRele.position.set(CENTRO + 33, LECTOR_V + 14, GROSOR_TAPA + 0.8);
  tapa.add(luzRele);

  // La tarjeta de prueba descansa al lado del aparato y viaja hasta el lector cuando se acerca.
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

  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 520),
    new THREE.MeshBasicMaterial({ map: texturaSombra(), transparent: true, depthWrite: false }),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.set(18, -0.4, 0);
  escena.add(sombra);

  // ---- Animaciones cortas: una tecla que baja, la tarjeta que va y vuelve ----
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

  function pulsar(letra) {
    const tecla = teclas.get(letra);
    if (!tecla) return;
    animar(160, (t) => {
      tecla.position.z = tecla.userData.reposo - 0.7 * Math.sin(Math.PI * t);
    });
  }

  let tarjetaEnViaje = false;
  async function acercarTarjeta() {
    if (tarjetaEnViaje) return;
    tarjetaEnViaje = true;
    aparato.updateWorldMatrix(true, true);
    const sobreElLector = tapa.localToWorld(new THREE.Vector3(CENTRO, LECTOR_V, 13));
    const desde = tarjeta.position.clone();
    const giroLector = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(INCLINACION), 0, 0));
    const giroReposo = new THREE.Quaternion().setFromEuler(reposoTarjeta.giro);
    await animar(520, (t) => {
      tarjeta.position.lerpVectors(desde, sobreElLector, t);
      tarjeta.position.y += 26 * Math.sin(Math.PI * t); // sube y baja en arco
      tarjeta.quaternion.slerpQuaternions(giroReposo, giroLector, t);
    });
    await new Promise((listo) => setTimeout(listo, sinMovimiento ? 0 : 700));
    await animar(520, (t) => {
      tarjeta.position.lerpVectors(sobreElLector, reposoTarjeta.posicion, t);
      tarjeta.position.y += 26 * Math.sin(Math.PI * t);
      tarjeta.quaternion.slerpQuaternions(giroLector, giroReposo, t);
    });
    tarjetaEnViaje = false;
  }

  // ---- Clic sobre una tecla o sobre la tarjeta (un clic, no un arrastre para girar) ----
  const rayo = new THREE.Raycaster();
  const puntero = new THREE.Vector2();
  function bajoElPuntero(evento) {
    const caja = lienzoPagina.getBoundingClientRect();
    puntero.set(((evento.clientX - caja.left) / caja.width) * 2 - 1, -((evento.clientY - caja.top) / caja.height) * 2 + 1);
    rayo.setFromCamera(puntero, camara);
    return rayo.intersectObjects(tocables, false)[0]?.object ?? null;
  }
  let dondeBajo = null;
  lienzoPagina.addEventListener('pointerdown', (evento) => {
    dondeBajo = { x: evento.clientX, y: evento.clientY };
  });
  lienzoPagina.addEventListener('pointerup', (evento) => {
    if (!dondeBajo || Math.hypot(evento.clientX - dondeBajo.x, evento.clientY - dondeBajo.y) > 6) return;
    const objeto = bajoElPuntero(evento);
    if (objeto?.userData.tecla) {
      pulsar(objeto.userData.tecla);
      alPulsarTecla(objeto.userData.tecla);
    } else if (objeto?.userData.tarjeta) {
      alTocarTarjeta();
    }
  });
  lienzoPagina.addEventListener('pointermove', (evento) => {
    lienzoPagina.style.cursor = bajoElPuntero(evento) ? 'pointer' : 'grab';
  });

  // ---- Tamaño y dibujo ----
  function ajustar() {
    const { clientWidth: ancho, clientHeight: alto } = lienzoPagina;
    if (!ancho || !alto) return;
    pintor.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    // En pantallas angostas el aparato se aleja un poco para que entre con la tarjeta.
    camara.fov = ancho / alto < 0.9 ? 40 : 30;
    camara.updateProjectionMatrix();
  }
  new ResizeObserver(ajustar).observe(lienzoPagina);
  ajustar();

  pintor.setAnimationLoop(() => {
    for (const cuadro of animaciones) cuadro();
    controles.update();
    pintor.render(escena, camara);
  });

  /** Refleja el estado del simulador: la pantalla y la luz del relé. */
  function actualizar(estado) {
    dibujarPantalla(ctxPantalla, estado);
    texturaPantalla.needsUpdate = true;
    luzRele.material.color.set(estado.rele ? '#3dff9a' : '#26355f');
    luzRele.material.emissive.set(estado.rele ? '#19c96b' : '#000000');
  }

  return { actualizar, acercarTarjeta, pulsar };
}
