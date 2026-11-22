// El aparato simulado de Paizap: un terminal que cobra en Stellar testnet.
//
// Hay dos cuentas, creadas en este navegador: la del aparato (el comercio) y la de una tarjeta de
// prueba (quien paga). Las transacciones las arma y firma el núcleo de Stellar MCU SDK, compilado
// para el navegador (public/simulador). Los pagos son reales, en la red de pruebas.
//
// Lo que hace el aparato:
//   cobrar    arma el cobro, con su número, y empieza a vigilar la red
//   aprobar   encuentra el pago en los eventos de la red, con su monto y su número de cobro
//   devolver  devuelve un pago: arma la transacción, la firma y la envía él mismo
//
// El teclado sigue al firmware del terminal: dígitos, D punto decimal, * borrar, A limpiar,
// # cobrar; con un cobro en espera, A o * lo cancelan.

const CUENTA_EN_EXPLORADOR = 'https://stellar.expert/explorer/testnet/account/';
const TX_EN_EXPLORADOR = 'https://stellar.expert/explorer/testnet/tx/';
const MONTO_MINIMO = 0.01; // por cobro, en XLM de prueba
const MONTO_MAXIMO = 100;
const MONTO_SUGERIDO = '1.5';
const ESPERA_MAXIMA_MS = 4 * 60 * 1000; // un cobro que nadie paga se cancela solo
const RELE_MS = 2500; // cuánto queda encendida la luz de «entregado»
const COBROS_GUARDADOS = 12;
const LISTO = 'Aparato listo. Eres el comercio: escribe un monto y cobra.';
const pausa = (ms) => new Promise((listo) => setTimeout(listo, ms));

// Lo que se guarda en este navegador: las llaves (para no pedir fondos de prueba en cada visita),
// el número del último cobro y los cobros hechos.
function leer(nombre) {
  try {
    return localStorage.getItem(`paizap.simulador.${nombre}`);
  } catch {
    return null; // sin almacenamiento: todo dura solo esta visita
  }
}
function guardar(nombre, valor) {
  try {
    localStorage.setItem(`paizap.simulador.${nombre}`, valor);
  } catch {
    // sin almacenamiento
  }
}

function semilla(nombre) {
  const guardada = leer(nombre);
  if (guardada && /^[0-9a-f]{64}$/.test(guardada)) {
    return Uint8Array.from(guardada.match(/../g), (par) => parseInt(par, 16));
  }
  const nueva = crypto.getRandomValues(new Uint8Array(32));
  guardar(nombre, Array.from(nueva, (b) => b.toString(16).padStart(2, '0')).join(''));
  return nueva;
}

function siguienteNumero() {
  const numero = Number(leer('pedido') ?? 1000 + Math.floor(Math.random() * 9000)) + 1;
  guardar('pedido', String(numero));
  return numero;
}

function cobrosGuardados() {
  try {
    const lista = JSON.parse(leer('cobros') ?? '[]');
    return Array.isArray(lista) ? lista.filter((c) => c && c.numero && c.enlace) : [];
  } catch {
    return [];
  }
}

/** "1,5" o "1.50" -> "1.5"; null si no es un monto válido para cobrar. */
export function montoValido(texto) {
  const limpio = String(texto ?? '').trim().replace(',', '.');
  if (!/^\d{1,5}(\.\d{1,7})?$/.test(limpio)) return null;
  const valor = Number(limpio);
  if (valor < MONTO_MINIMO || valor > MONTO_MAXIMO) return null;
  return String(valor);
}

/**
 * Crea el simulador. `urlAdaptacion` es dónde está device.mjs. `alCambiar(estado)` avisa cada
 * cambio; `alRegistrar({ texto, enlace, rotulo, tipo })` agrega una línea al registro;
 * `alConsultar(texto)` muestra cada consulta al nodo, como el monitor serie del terminal.
 */
export function crearSimulador({ urlAdaptacion, alCambiar, alRegistrar, alConsultar }) {
  const estado = {
    fase: 'apagado', // apagado | encendiendo | listo | esperando | aprobado | error
    mensaje: 'El aparato está apagado. Enciéndelo para empezar.',
    monto: '', // el monto que se está escribiendo: el mismo en el teclado y en la página
    cuentaAparato: '',
    cuentaTarjeta: '',
    cobro: null, // el cobro en espera: { numero, monto, solicitud, desdeLedger }
    tarjetaPagando: false,
    devolviendo: false,
    rele: false,
    // El último cobro aprobado. Se queda hasta el siguiente cobro:
    // { numero, monto, hash, enlace, segundos, conTarjeta, devolucion: null | { hash, enlace } }
    ultimoPago: null,
    cobros: cobrosGuardados(), // los cobros aprobados, del más nuevo al más viejo
  };
  let aparato = null;
  let tarjeta = null;
  let turno = 0; // cada cobro tiene su turno: si cambia, el cobro anterior deja de vigilar
  let reemplazar = true; // el monto a la vista es una sugerencia: la primera tecla lo reemplaza
  let pagoDeLaTarjeta = null; // el pago en curso de la tarjeta de prueba
  let tarjetaLeidaEn = 0;
  let vistoPorElAparato = 0; // número del cobro cuyo pago el aparato ya vio en la red

  const avisar = (cambios = {}) => {
    Object.assign(estado, cambios);
    alCambiar({ ...estado });
  };
  const registrar = (texto, extra = {}) => alRegistrar({ texto, ...extra });
  const corta = (cuenta) => `${cuenta.slice(0, 4)}…${cuenta.slice(-4)}`;

  // Lo que avisa el núcleo en cada paso, dicho como lo imprime el terminal por su monitor serie.
  const monitor = (quien) => (paso, datos) => {
    if (paso === 'rpc') alConsultar(`${quien}: ${datos.method} -> ${datos.ms} ms`);
    if (paso === 'signed') alConsultar(`${quien}: transacción firmada, ${datos.bytes} bytes`);
  };

  // Anota un cobro aprobado (o su devolución) en la lista que se guarda en el navegador.
  function anotar(pago) {
    const cobros = [pago, ...estado.cobros.filter((c) => c.numero !== pago.numero)].slice(0, COBROS_GUARDADOS);
    guardar('cobros', JSON.stringify(cobros));
    return cobros;
  }

  async function encender() {
    if (estado.fase !== 'apagado' && estado.fase !== 'error') return;
    avisar({ fase: 'encendiendo', mensaje: 'Encendiendo: el aparato crea su cuenta en Stellar y recibe fondos de prueba…' });
    try {
      const { createDevice } = await import(/* @vite-ignore */ urlAdaptacion);
      [aparato, tarjeta] = await Promise.all([
        createDevice({ seed: semilla('aparato'), onEvent: monitor('Aparato') }),
        createDevice({ seed: semilla('tarjeta'), onEvent: monitor('Tarjeta') }),
      ]);
      avisar({ cuentaAparato: aparato.account, cuentaTarjeta: tarjeta.account });
      registrar(`El aparato tiene su cuenta en Stellar: ${corta(aparato.account)}.`, {
        enlace: CUENTA_EN_EXPLORADOR + aparato.account,
        rotulo: 'Ver la cuenta',
      });
      registrar(`La tarjeta de prueba paga desde su propia cuenta: ${corta(tarjeta.account)}.`, {
        enlace: CUENTA_EN_EXPLORADOR + tarjeta.account,
        rotulo: 'Ver la cuenta',
      });

      // Fondos de prueba, solo si la cuenta todavía no existe en la red.
      const fondear = async (cual) => (await cual.readAccount()) ?? cual.requestTestFunds();
      const [, saldoTarjeta] = await Promise.all([fondear(aparato), fondear(tarjeta)]);
      registrar(`La tarjeta de prueba tiene ${Number(saldoTarjeta.balance).toFixed(2)} XLM de prueba para pagar.`);
      reemplazar = true;
      avisar({ fase: 'listo', monto: estado.monto || MONTO_SUGERIDO, mensaje: LISTO });
    } catch (error) {
      registrar(`No se pudo encender: ${error.message}`, { tipo: 'error' });
      avisar({ fase: 'error', mensaje: 'No se pudo encender. Revisa la conexión y vuelve a intentar.' });
    }
  }

  // Vigila la red hasta ver el pago del cobro, como el terminal mientras muestra el QR.
  async function vigilar(cobro, miTurno) {
    const inicio = Date.now();
    let desde = cobro.desdeLedger;
    while (miTurno === turno && Date.now() - inicio < ESPERA_MAXIMA_MS) {
      let pago = null;
      try {
        pago = await aparato.findPayment({ fromLedger: desde, attempts: 1 });
      } catch {
        await pausa(2000); // el nodo no respondió: se vuelve a preguntar
      }
      if (miTurno !== turno) return;
      if (pago && pago.order === cobro.numero && Number(pago.amount) >= Number(cobro.monto)) {
        return aprobar(cobro, pago, miTurno);
      }
      if (pago) desde = pago.ledger + 1; // un pago de otro cobro: se sigue buscando después de él
    }
    if (miTurno === turno) {
      turno++;
      reemplazar = true;
      registrar(`Nadie pagó el cobro n.º ${cobro.numero}: el aparato lo canceló.`);
      avisar({ fase: 'listo', cobro: null, tarjetaPagando: false, mensaje: 'El cobro venció sin pago. Escribe un monto y cobra.' });
    }
  }

  async function aprobar(cobro, pago, miTurno) {
    vistoPorElAparato = cobro.numero;
    const conTarjeta = Boolean(pagoDeLaTarjeta);
    const segundos = conTarjeta ? Number(((Date.now() - tarjetaLeidaEn) / 1000).toFixed(1)) : null;
    // Si pagó la tarjeta de prueba, se espera a que ella termine: así nada queda a medias.
    await pagoDeLaTarjeta?.catch(() => {});
    if (miTurno !== turno) return;
    const ultimoPago = {
      numero: cobro.numero,
      monto: cobro.monto,
      hash: pago.hash,
      enlace: TX_EN_EXPLORADOR + pago.hash,
      segundos,
      conTarjeta,
      devolucion: null,
    };
    registrar(
      `El aparato vio el pago en la red: ${pago.amount} XLM, cobro n.º ${pago.order}. Cobro aprobado` +
        (segundos ? ` a los ${segundos} s de leer la tarjeta.` : '.'),
      { enlace: ultimoPago.enlace, rotulo: 'Ver la transacción', tipo: 'ok' },
    );
    avisar({
      fase: 'aprobado',
      rele: true,
      cobro: null,
      tarjetaPagando: false,
      ultimoPago,
      cobros: anotar(ultimoPago),
      mensaje: 'Cobro terminado: el dinero ya está en la cuenta del aparato.',
    });
    await pausa(RELE_MS);
    if (miTurno === turno) avisar({ rele: false });
  }

  async function cobrar(texto) {
    if ((estado.fase !== 'listo' && estado.fase !== 'aprobado') || estado.devolviendo) return;
    const monto = montoValido(texto ?? estado.monto);
    if (!monto) {
      avisar({ fase: 'listo', mensaje: `Escribe un monto entre ${MONTO_MINIMO} y ${MONTO_MAXIMO} XLM.` });
      return;
    }
    const miTurno = ++turno;
    pagoDeLaTarjeta = null;
    tarjetaLeidaEn = 0;
    avisar({ fase: 'esperando', rele: false, monto, cobro: null, mensaje: 'Preparando el cobro…' });
    try {
      const red = await aparato.networkState();
      const numero = siguienteNumero();
      const cobro = { numero, monto, solicitud: aparato.paymentRequest(monto, numero), desdeLedger: red.ledger };
      if (miTurno !== turno) return;
      registrar(`Cobro n.º ${numero} por ${monto} XLM. El aparato muestra el QR y vigila la red.`);
      avisar({ cobro, mensaje: `El aparato espera ${monto} XLM. Ahora eres el cliente: paga con la tarjeta de prueba.` });
      vigilar(cobro, miTurno);
    } catch (error) {
      registrar(`No se pudo preparar el cobro: ${error.message}`, { tipo: 'error' });
      avisar({ fase: 'listo', cobro: null, mensaje: 'El nodo no respondió. Vuelve a cobrar.' });
    }
  }

  function cancelar() {
    if (estado.fase !== 'esperando' || estado.tarjetaPagando) return;
    turno++;
    reemplazar = true;
    if (estado.cobro) registrar(`Cobro n.º ${estado.cobro.numero} cancelado en el aparato.`);
    avisar({ fase: 'listo', cobro: null, mensaje: 'Cobro cancelado. Escribe un monto y cobra.' });
  }

  // La tarjeta de prueba paga el cobro que el aparato tiene en espera.
  async function acercarTarjeta() {
    const cobro = estado.cobro;
    if (estado.fase !== 'esperando' || !cobro || estado.tarjetaPagando) return;
    tarjetaLeidaEn = Date.now();
    avisar({ tarjetaPagando: true, mensaje: 'Tarjeta leída. El pago viaja por la red de Stellar…' });
    registrar(`La tarjeta de prueba paga ${cobro.monto} XLM al cobro n.º ${cobro.numero}.`);
    pagoDeLaTarjeta = tarjeta.pay({ destination: aparato.account, amount: cobro.monto, order: cobro.numero });
    try {
      await pagoDeLaTarjeta;
    } catch (error) {
      if (vistoPorElAparato === cobro.numero) return; // el pago llegó igual: el aparato ya lo vio
      pagoDeLaTarjeta = null;
      registrar(`La tarjeta no pudo pagar: ${error.message}`, { tipo: 'error' });
      avisar({ tarjetaPagando: false, mensaje: 'La tarjeta no pudo pagar. El cobro sigue en espera: vuelve a intentar.' });
    }
  }

  // Alguien toca la tarjeta cuando no hay un cobro que pagar: se le dice qué falta.
  function tarjetaSinCobro() {
    if (estado.fase === 'apagado' || estado.fase === 'error') return encender();
    if (estado.fase === 'listo') avisar({ mensaje: 'Primero cobra: la tarjeta paga cuando el aparato muestra un cobro.' });
    if (estado.fase === 'aprobado' && !estado.devolviendo) avisar({ mensaje: 'Ese cobro ya está pagado. Cobra otra vez para usar la tarjeta.' });
  }

  // El aparato paga: devuelve el último cobro a la tarjeta. Aquí firma el aparato con su llave.
  async function devolver() {
    const pago = estado.ultimoPago;
    if (estado.fase !== 'aprobado' || !pago || pago.devolucion || !pago.conTarjeta || estado.devolviendo) return;
    avisar({ devolviendo: true, mensaje: 'El aparato devuelve el dinero: arma el pago y lo firma con su propia llave…' });
    try {
      const hecho = await aparato.pay({ destination: tarjeta.account, amount: pago.monto, order: pago.numero });
      registrar(`El aparato devolvió ${pago.monto} XLM del cobro n.º ${pago.numero}, firmando con su propia llave.`, {
        enlace: hecho.link,
        rotulo: 'Ver la devolución',
        tipo: 'ok',
      });
      const ultimoPago = { ...pago, devolucion: { hash: hecho.hash, enlace: hecho.link } };
      avisar({
        devolviendo: false,
        ultimoPago,
        cobros: anotar(ultimoPago),
        mensaje: 'Devolución hecha: esta vez el que pagó fue el aparato.',
      });
    } catch (error) {
      registrar(`No se pudo devolver: ${error.message}`, { tipo: 'error' });
      avisar({ devolviendo: false, mensaje: 'No se pudo devolver. Vuelve a intentar.' });
    }
  }

  // Después de un cobro aprobado, el aparato vuelve a pedir un monto.
  function otroCobro() {
    if (estado.fase !== 'aprobado' || estado.devolviendo) return;
    reemplazar = true;
    avisar({ fase: 'listo', mensaje: LISTO });
  }

  // El monto escrito en la página: el aparato muestra lo mismo.
  function escribir(texto) {
    if (estado.fase !== 'listo') return;
    reemplazar = false;
    const monto = String(texto).replace(',', '.').replace(/[^\d.]/g, '').slice(0, 9);
    if (monto !== estado.monto) avisar({ monto });
  }

  // Una tecla del teclado del aparato.
  function tecla(t) {
    if (estado.fase === 'apagado' || estado.fase === 'error') return encender();
    if (estado.fase === 'esperando') {
      if (t === 'A' || t === '*') cancelar();
      return;
    }
    if ((estado.fase !== 'listo' && estado.fase !== 'aprobado') || estado.devolviendo) return;
    if (t === '#') return cobrar();
    let monto = reemplazar ? '' : estado.monto;
    if (/^\d$/.test(t)) monto = monto.length < 7 ? monto + t : monto;
    else if (t === 'D') monto = monto.includes('.') ? monto : monto ? `${monto}.` : '0.';
    else if (t === '*') monto = estado.monto.slice(0, -1);
    else if (t === 'A') monto = '';
    else return; // B y C no hacen nada en el modo caja
    reemplazar = false;
    avisar({ fase: 'listo', monto, mensaje: LISTO });
  }

  return {
    encender,
    cobrar,
    cancelar,
    acercarTarjeta,
    tarjetaSinCobro,
    devolver,
    otroCobro,
    escribir,
    tecla,
    estado: () => ({ ...estado }),
  };
}
