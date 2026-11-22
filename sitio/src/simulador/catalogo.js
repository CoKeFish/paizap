// Los aparatos de la demo: cosas conectadas que llevan adentro un cobro en Stellar.
//
// Hay dos modos, los mismos del terminal de verdad:
//   autoservicio  el precio es fijo. El aparato cobra solo y, cuando ve el pago, actúa: el
//                 torniquete deja pasar, el dispensador entrega.
//   caja          alguien escribe el monto en el teclado y cobra.

export const APARATOS = {
  torniquete: {
    id: 'torniquete',
    nombre: 'Torniquete',
    el: 'el torniquete',
    El: 'El torniquete',
    del: 'del torniquete',
    modo: 'autoservicio',
    precio: '0.5',
    concepto: 'Pasaje', // lo que muestra su pantalla junto al precio
    porQue: 'por pasar',
    alAprobar: 'el torniquete gira y te deja pasar',
    hizo: 'Giró para dejarte pasar.',
    enPantalla: 'Adelante',
    otraVez: 'Pasar otra vez',
  },
  dispensador: {
    id: 'dispensador',
    nombre: 'Dispensador',
    el: 'el dispensador',
    El: 'El dispensador',
    del: 'del dispensador',
    modo: 'autoservicio',
    precio: '1',
    concepto: 'Agua',
    porQue: 'por una botella de agua',
    alAprobar: 'el dispensador entrega tu botella',
    hizo: 'Entregó la botella.',
    enPantalla: 'Retire su botella',
    otraVez: 'Comprar otra',
  },
  caja: {
    id: 'caja',
    nombre: 'Terminal de caja',
    el: 'el terminal',
    El: 'El terminal',
    del: 'del terminal',
    modo: 'caja',
    alAprobar: 'el dinero ya está en la cuenta del comercio',
    hizo: '',
    enPantalla: 'visto en la red',
    otraVez: 'Cobrar otra vez',
  },
};

export const ORDEN = ['torniquete', 'dispensador', 'caja'];
export const INICIAL = 'torniquete';
