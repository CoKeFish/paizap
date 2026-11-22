// Un dispensador de agua, en maqueta: cobra la botella y, cuando ve el pago, la suelta a la
// bandeja. Lleva al frente el módulo de cobro. Devuelve lo mismo que los demás aparatos (ver
// caja.js). Medidas en milímetros, a escala de maqueta.
import * as THREE from 'three';
import { AZUL, NOCHE, RAYO, lienzo, material, moduloDeCobro, texturaDe } from '../piezas.js';

const FRENTE = 60; // dónde queda la cara de adelante del mueble
const VITRINA_X = -36; // el centro de la vitrina, a la izquierda; el módulo va a la derecha
const BANDEJA = new THREE.Vector3(VITRINA_X, 22, FRENTE + 16); // dónde queda la botella entregada

function texturaRotulo() {
  const c = lienzo(512, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = NOCHE;
  ctx.font = 'italic 800 84px "Barlow Condensed", "Barlow", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AGUA', 256, 52);
  return texturaDe(c);
}

function botella() {
  const grupo = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 30, 20), material('#7fd3ff', { roughness: 0.25, metalness: 0.1 }));
  const tapa = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 7, 16), material('#f4f7ff', { roughness: 0.5 }));
  tapa.position.y = 18.5;
  grupo.add(cuerpo, tapa);
  return grupo;
}

export function crearDispensador({ animar, espera }) {
  const grupo = new THREE.Group();
  const solidos = [];
  const pieza = (geometria, mat, x, y, z) => {
    const malla = new THREE.Mesh(geometria, mat);
    malla.position.set(x, y, z);
    grupo.add(malla);
    solidos.push(malla);
    return malla;
  };
  const azul = material(AZUL);
  const amarillo = material(RAYO, { roughness: 0.5 });
  const fondo = material('#060d22', { roughness: 0.9 });

  // El mueble y su cabezal, con el rótulo.
  pieza(new THREE.BoxGeometry(170, 250, 120), azul, 0, 125, 0);
  pieza(new THREE.BoxGeometry(173, 34, 124), amarillo, 0, 235, 0);
  const rotulo = new THREE.Mesh(new THREE.PlaneGeometry(120, 22), new THREE.MeshBasicMaterial({ map: texturaRotulo(), transparent: true }));
  rotulo.position.set(0, 234, FRENTE + 2.2);
  grupo.add(rotulo);

  // La vitrina: tres estantes con tres botellas cada uno.
  pieza(new THREE.BoxGeometry(92, 138, 1), fondo, VITRINA_X, 142, FRENTE + 0.3);
  const exhibidas = [];
  for (let fila = 0; fila < 3; fila++) {
    pieza(new THREE.BoxGeometry(92, 2.5, 22), material('#22386f'), VITRINA_X, 84 + fila * 44, FRENTE + 10);
    for (let columna = 0; columna < 3; columna++) {
      const una = botella();
      una.position.set(VITRINA_X + (columna - 1) * 28, 84 + fila * 44 + 16.3, FRENTE + 11);
      grupo.add(una);
      exhibidas.push(una);
    }
  }
  // La boca de entrega y la bandeja.
  pieza(new THREE.BoxGeometry(92, 42, 1), fondo, VITRINA_X, 34, FRENTE + 0.3);
  pieza(new THREE.BoxGeometry(96, 4, 34), material('#22386f'), VITRINA_X, 11, FRENTE + 16);

  // El módulo de cobro, a la derecha, saliendo del frente como una repisa inclinada.
  pieza(new THREE.BoxGeometry(56, 34, 36), azul, 50, 100, FRENTE + 14);
  const modulo = moduloDeCobro({ ancho: 60, largo: 92 });
  modulo.grupo.position.set(50, 128, FRENTE + 20);
  modulo.grupo.rotation.x = 0.7;
  grupo.add(modulo.grupo);
  solidos.push(...modulo.solidos);

  // La botella que se entrega: sale del estante de arriba y cae a la bandeja.
  const laQueSale = exhibidas[6]; // arriba, a la izquierda
  const enElEstante = laQueSale.position.clone();
  const entregada = botella();
  entregada.visible = false;
  grupo.add(entregada);
  let turno = 0;

  return {
    id: 'dispensador',
    grupo,
    solidos,
    teclas: new Map(),
    lados: { telefono: [-152, 124], tarjeta: [150, 112] },
    medir() {
      grupo.updateWorldMatrix(true, true);
      this.lector = { posicion: modulo.grupo.localToWorld(modulo.apoyo.clone()), giro: modulo.grupo.getWorldQuaternion(new THREE.Quaternion()) };
      this.limites = new THREE.Box3().setFromObject(grupo);
    },
    dibujar: modulo.dibujar,
    // Para un cobro nuevo se retira la botella entregada y el estante vuelve a estar lleno.
    alEmpezar() {
      turno++;
      modulo.luz.userData.encender(false);
      entregada.visible = false;
      laQueSale.visible = true;
    },
    // Ve el pago: una botella sale del estante, cae y queda acostada en la bandeja.
    async alAprobar() {
      const este = ++turno;
      modulo.luz.userData.encender(true);
      laQueSale.visible = false;
      entregada.visible = true;
      entregada.rotation.set(0, 0, 0);
      entregada.position.copy(enElEstante);
      const alBorde = enElEstante.clone().setZ(FRENTE + 26);
      await animar(260, (t) => {
        if (este === turno) entregada.position.lerpVectors(enElEstante, alBorde, t); // sale del estante
      });
      await animar(620, (t) => {
        if (este !== turno) return;
        // Cae cada vez más rápido y se va acostando.
        entregada.position.lerpVectors(alBorde, BANDEJA, t * t);
        entregada.rotation.z = (Math.PI / 2) * t;
      });
      await animar(180, (t) => {
        if (este === turno) entregada.position.y = BANDEJA.y + 5 * Math.sin(Math.PI * t); // un rebote
      });
      await espera(1500);
      if (este === turno) modulo.luz.userData.encender(false);
    },
  };
}
