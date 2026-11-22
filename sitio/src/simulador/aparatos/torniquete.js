// Un torniquete de tres brazos, en maqueta: cobra el pasaje y, cuando ve el pago, gira un tercio
// de vuelta y deja pasar a una persona. Lleva arriba el módulo de cobro. Devuelve lo mismo que
// los demás aparatos (ver caja.js). Medidas en milímetros, a escala de maqueta.
import * as THREE from 'three';
import { AZUL, RAYO, material, moduloDeCobro } from '../piezas.js';

const TERCIO = (Math.PI * 2) / 3;
// El eje del molinete sale del mueble hacia el carril, inclinado hacia abajo: así un brazo queda
// horizontal cerrando el paso y los otros dos cuelgan pegados al mueble.
const EJE = new THREE.Vector3(Math.SQRT1_2, -Math.SQRT1_2, 0);
const CARRIL_X = 40; // por dónde camina quien pasa
const LLEGADA_Z = 104;
const SALIDA_Z = -104;

export function crearTorniquete({ animar, espera }) {
  const grupo = new THREE.Group();
  const cosas = new THREE.Group();
  cosas.position.x = -21; // centra en el origen lo que ocupa
  grupo.add(cosas);
  const solidos = [];
  const pieza = (geometria, mat, x, y, z, padre = cosas) => {
    const malla = new THREE.Mesh(geometria, mat);
    malla.position.set(x, y, z);
    padre.add(malla);
    solidos.push(malla);
    return malla;
  };
  const azul = material(AZUL);
  const amarillo = material(RAYO, { roughness: 0.5 });
  const acero = material('#cfd6e6', { roughness: 0.3, metalness: 0.65 });

  // El carril por donde se pasa.
  pieza(new THREE.BoxGeometry(112, 0.8, 250), material('#0b1634', { roughness: 0.85 }), CARRIL_X, 0.4, 0);
  // El mueble del torniquete y el poste del otro lado del carril, con sus tapas.
  pieza(new THREE.BoxGeometry(66, 150, 140), azul, -50, 75, 0);
  pieza(new THREE.BoxGeometry(66, 5, 140), amarillo, -50, 152.5, 0);
  pieza(new THREE.BoxGeometry(24, 150, 140), azul, 112, 75, 0);
  pieza(new THREE.BoxGeometry(24, 5, 140), amarillo, 112, 152.5, 0);

  // El módulo de cobro, sobre un cuello, inclinado hacia quien llega.
  pieza(new THREE.BoxGeometry(46, 26, 46), azul, -50, 166, 4);
  const modulo = moduloDeCobro();
  modulo.grupo.position.set(-50, 181, 22);
  modulo.grupo.rotation.x = 0.4;
  cosas.add(modulo.grupo);
  solidos.push(...modulo.solidos);

  // El molinete: un cubo sobre el costado del mueble y tres brazos.
  const centro = new THREE.Vector3(-10, 116, 0);
  const cubo = pieza(new THREE.CylinderGeometry(14, 14, 16, 28), acero, centro.x, centro.y, centro.z);
  cubo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), EJE);
  const molinete = new THREE.Group();
  molinete.position.copy(centro);
  cosas.add(molinete);
  const LARGO_BRAZO = 92;
  for (let k = 0; k < 3; k++) {
    const hacia = new THREE.Vector3(1, 0, 0).applyAxisAngle(EJE, k * TERCIO);
    const brazo = pieza(new THREE.CylinderGeometry(4.2, 4.2, LARGO_BRAZO, 16), acero, 0, 0, 0, molinete);
    brazo.position.copy(hacia).multiplyScalar(LARGO_BRAZO / 2 + 8);
    brazo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hacia);
    const punta = pieza(new THREE.SphereGeometry(4.2, 14, 10), acero, 0, 0, 0, molinete);
    punta.position.copy(hacia).multiplyScalar(LARGO_BRAZO + 8);
  }

  // Quien pasa: una figura sencilla que espera delante del brazo.
  const persona = new THREE.Group();
  const claro = material('#eef1f8', { roughness: 0.6 });
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(10, 16, 58, 24), claro);
  cuerpo.position.y = 29;
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 16), claro);
  cabeza.position.y = 70;
  persona.add(cuerpo, cabeza);
  persona.position.set(CARRIL_X, 0, LLEGADA_Z);
  cosas.add(persona);

  let tercios = 0; // cuántos tercios de vuelta lleva girados el molinete
  let turno = 0; // cada pasada tiene su turno: si empieza otra, la anterior deja de mover

  return {
    id: 'torniquete',
    grupo,
    solidos,
    teclas: new Map(),
    lados: { telefono: [-150, 150], tarjeta: [168, 76] },
    medir() {
      grupo.updateWorldMatrix(true, true);
      this.lector = { posicion: modulo.grupo.localToWorld(modulo.apoyo.clone()), giro: modulo.grupo.getWorldQuaternion(new THREE.Quaternion()) };
      this.limites = new THREE.Box3().setFromObject(grupo);
    },
    dibujar: modulo.dibujar,
    // Para un cobro nuevo llega otra persona y se para delante del brazo.
    alEmpezar() {
      const este = ++turno;
      modulo.luz.userData.encender(false);
      persona.position.set(CARRIL_X, 0, LLEGADA_Z);
      animar(320, (t) => {
        if (este === turno) persona.scale.setScalar(t);
      });
    },
    // Ve el pago: el molinete gira un tercio de vuelta y la persona pasa.
    async alAprobar() {
      const este = ++turno;
      modulo.luz.userData.encender(true);
      const desde = tercios;
      tercios += 1;
      await animar(1300, (t) => {
        if (este !== turno) return;
        // La persona avanza; el brazo gira mientras ella cruza la mitad del carril.
        persona.position.z = THREE.MathUtils.lerp(LLEGADA_Z, SALIDA_Z, t);
        const giro = THREE.MathUtils.smoothstep(t, 0.22, 0.78);
        molinete.quaternion.setFromAxisAngle(EJE, (desde + giro) * TERCIO);
      });
      molinete.quaternion.setFromAxisAngle(EJE, tercios * TERCIO);
      await espera(700);
      if (este !== turno) return;
      await animar(260, (t) => {
        if (este === turno) persona.scale.setScalar(1 - t); // ya pasó: sale de la maqueta
      });
      modulo.luz.userData.encender(false);
    },
  };
}
