// El terminal de caja: la carcasa del terminal de Paizap, con su pantalla y su teclado.
// La base es la que se imprime; la tapa lleva una ventana de pantalla más grande, solo para la
// demo web (simulador/tapa_demo.scad). Las medidas, en milímetros, salen de hardware/carcasa.
//
// Todos los aparatos de la demo se arman igual y devuelven lo mismo:
//   grupo      el modelo, parado en el origen
//   solidos    lo que no responde al clic pero tapa lo que tiene detrás
//   teclas     las teclas que se pueden pulsar (solo este las tiene)
//   lados      dónde van el teléfono y la tarjeta junto a él, como [x, z]: adelante si el aparato es alto
//   medir()    calcula `lector` (dónde y cómo se apoya la tarjeta) y `limites` (su caja)
//   dibujar()  redibuja su pantalla con el estado
//   alEmpezar() lo deja listo para un cobro nuevo
//   alAprobar() lo que hace cuando ve el pago; devuelve una promesa que termina con la animación
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ALTO, ANCHO, dibujarPantalla } from '../pantalla.js';
import { AZUL, NOCHE, RAYO, lienzo, luz, material, texturaDe } from '../piezas.js';

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

export async function crearCaja({ urlModelo, animar, espera }) {
  const grupo = new THREE.Group();
  // El modelo viene con el eje Z hacia arriba y una esquina en el origen: se acuesta sobre la
  // mesa y se centra. El frente (donde está el teclado) queda mirando a la cámara.
  const carcasa = new THREE.Group();
  carcasa.rotation.x = -Math.PI / 2;
  carcasa.position.set(-CENTRO, 0, LARGO_MM / 2);
  grupo.add(carcasa);

  const cargador = new STLLoader();
  const [base, tapaModelo] = await Promise.all([cargador.loadAsync(`${urlModelo}base.stl`), cargador.loadAsync(`${urlModelo}tapa.stl`)]);
  for (const forma of [base, tapaModelo]) forma.computeVertexNormals();
  const solidos = [new THREE.Mesh(base, material(AZUL)), new THREE.Mesh(tapaModelo, material(RAYO, { roughness: 0.5 }))];
  carcasa.add(...solidos);

  // Lo que va sobre la tapa se coloca en su propio sistema: u de lado a lado, v del frente al
  // fondo sobre la pendiente, w hacia afuera (la cara exterior está en w = GROSOR_TAPA).
  const tapa = new THREE.Group();
  tapa.position.set(0, 0, ALTO_FRENTE);
  tapa.rotation.x = THREE.MathUtils.degToRad(INCLINACION);
  carcasa.add(tapa);

  // Pantalla: un lienzo que se vuelve a dibujar con cada cambio y llena la ventana de la tapa.
  const lienzoPantalla = lienzo(ANCHO, ALTO);
  const ctxPantalla = lienzoPantalla.getContext('2d');
  const texturaPantalla = texturaDe(lienzoPantalla);
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(PANTALLA.ancho, PANTALLA.alto), new THREE.MeshBasicMaterial({ map: texturaPantalla }));
  pantalla.position.set(CENTRO, PANTALLA_V, 1.2);
  tapa.add(pantalla);
  solidos.push(pantalla);

  // Teclado: la membrana y sus 16 teclas.
  const membrana = new THREE.Mesh(new THREE.BoxGeometry(TECLADO.ancho, TECLADO.alto, 0.9), material('#0b1634', { roughness: 0.8 }));
  membrana.position.set(CENTRO, TECLADO.v0 + TECLADO.alto / 2, GROSOR_TAPA + 0.45);
  tapa.add(membrana);
  solidos.push(membrana);

  const teclas = new Map();
  const costado = material('#c9d0e2', { roughness: 0.7 });
  const costadoApagado = material('#4a5572', { roughness: 0.8 });
  TECLAS.forEach((fila, j) => {
    fila.forEach((letra, i) => {
      const apagada = SIN_USO.has(letra);
      const lado = apagada ? costadoApagado : costado;
      const cara = new THREE.MeshStandardMaterial({ map: texturaTecla(letra, apagada), roughness: 0.6, emissive: RAYO, emissiveIntensity: 0 });
      const tecla = new THREE.Mesh(new THREE.BoxGeometry(11, 11, 1.4), [lado, lado, lado, lado, cara, lado]);
      tecla.position.set(CENTRO - TECLADO.ancho / 2 + 12 + i * 15, TECLADO.v0 + 14.5 + j * 16, GROSOR_TAPA + 1.5);
      tecla.userData = { tecla: letra, reposo: tecla.position.z, cara };
      tapa.add(tecla);
      if (apagada) solidos.push(tecla);
      else teclas.set(letra, tecla);
    });
  });

  // La luz del relé: se enciende cuando el terminal entrega.
  const testigo = luz(2.2);
  testigo.position.set(CENTRO + 33, LECTOR_V + 14, GROSOR_TAPA + 0.8);
  tapa.add(testigo);

  return {
    id: 'caja',
    grupo,
    solidos,
    teclas,
    lados: { telefono: [-105, 26], tarjeta: [101, 40] },
    medir() {
      grupo.updateWorldMatrix(true, true);
      this.lector = {
        posicion: tapa.localToWorld(new THREE.Vector3(CENTRO, LECTOR_V, 13)),
        giro: new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(INCLINACION), 0, 0)),
      };
      this.limites = new THREE.Box3().setFromObject(grupo);
    },
    dibujar(estado) {
      dibujarPantalla(ctxPantalla, estado);
      texturaPantalla.needsUpdate = true;
    },
    pulsar(letra) {
      const tecla = teclas.get(letra);
      if (!tecla) return;
      animar(160, (t) => {
        tecla.position.z = tecla.userData.reposo - 0.7 * Math.sin(Math.PI * t);
      });
    },
    alEmpezar() {
      testigo.userData.encender(false);
    },
    // En la caja no hay nada que mover: se enciende la luz de «entregado», como en el terminal.
    async alAprobar() {
      testigo.userData.encender(true);
      await espera(2600);
      testigo.userData.encender(false);
    },
  };
}
