// Piezas que comparten los modelos 3D de la demo: lienzos para texturas, materiales y el módulo
// de cobro que lleva cada aparato (pantalla, lector de tarjetas y luz).
import * as THREE from 'three';
import { ALTO, ANCHO, dibujarPantalla } from './pantalla.js';

export const NOCHE = '#000b25';
export const RAYO = '#ffcd00';
export const AZUL = '#16264f';

export function lienzo(ancho, alto) {
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  return c;
}

export function texturaDe(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });

/** Una luz de estado: apagada o verde. */
export function luz(radio = 2.4) {
  const malla = new THREE.Mesh(new THREE.SphereGeometry(radio, 20, 12), new THREE.MeshStandardMaterial({ color: '#26355f', emissive: '#000000' }));
  malla.userData.encender = (si) => {
    malla.material.color.set(si ? '#3dff9a' : '#26355f');
    malla.material.emissive.set(si ? '#19c96b' : '#000000');
  };
  return malla;
}

// La marca del lector: las ondas de «acerca la tarjeta».
function texturaLector() {
  const c = lienzo(128, 128);
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#b98f00';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  for (const radio of [22, 40, 58]) {
    ctx.beginPath();
    ctx.arc(34, 94, radio, -Math.PI / 2 + 0.25, -0.25);
    ctx.stroke();
  }
  ctx.fillStyle = '#b98f00';
  ctx.beginPath();
  ctx.arc(34, 94, 8, 0, Math.PI * 2);
  ctx.fill();
  return texturaDe(c);
}

/**
 * El módulo de cobro: una caja amarilla acostada, con la pantalla en la mitad de atrás y el lector
 * en la de adelante. Es lo que un aparato lleva para cobrar. Devuelve el grupo, lo que tapa el
 * puntero, cómo redibujar su pantalla, su luz y dónde se apoya la tarjeta (en sus coordenadas).
 */
export function moduloDeCobro({ ancho = 66, largo = 100 } = {}) {
  const grupo = new THREE.Group();
  const caja = new THREE.Mesh(new THREE.BoxGeometry(ancho, 10, largo), material(RAYO, { roughness: 0.5 }));
  grupo.add(caja);

  const lienzoPantalla = lienzo(ANCHO, ALTO);
  const ctx = lienzoPantalla.getContext('2d');
  const textura = texturaDe(lienzoPantalla);
  const anchoPantalla = ancho - 10;
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(anchoPantalla, anchoPantalla / 2), new THREE.MeshBasicMaterial({ map: textura }));
  pantalla.rotation.x = -Math.PI / 2;
  pantalla.position.set(0, 5.15, -largo / 2 + 6 + anchoPantalla / 4);
  grupo.add(pantalla);

  const marca = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: texturaLector(), transparent: true }));
  marca.rotation.x = -Math.PI / 2;
  marca.position.set(-4, 5.12, largo / 2 - 26);
  grupo.add(marca);

  const testigo = luz();
  testigo.position.set(ancho / 2 - 8, 5.4, largo / 2 - 12);
  grupo.add(testigo);

  return {
    grupo,
    solidos: [caja, pantalla],
    luz: testigo,
    apoyo: new THREE.Vector3(0, 9, largo / 2 - 26), // dónde queda la tarjeta cuando el lector la lee
    dibujar(estado) {
      dibujarPantalla(ctx, estado);
      textura.needsUpdate = true;
    },
  };
}
