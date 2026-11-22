// El aparato simulado de Paizap: un terminal que cobra en Stellar testnet.
//
// Hay dos cuentas, creadas en este navegador: la del aparato (el comercio) y la de una tarjeta de
// prueba (quien paga). Las transacciones las arma y firma el núcleo de Stellar MCU SDK, compilado
// para el navegador (public/simulador). Los pagos son reales, en la red de pruebas.
//
// Lo que hace el aparato:
//   cobrar    arma el pedido de pago, con su número, y empieza a vigilar la red
//   confirmar encuentra el pago en los eventos de la red, con su monto y su número de pedido
//   pagar     devuelve un pago: arma la transacción, la firma y la envía él mismo
//
// El teclado sigue al firmware del terminal: dígitos, D punto decimal, * borrar, A limpiar,
// # cobrar; con un cobro en espera, A o * lo cancelan.

const CUENTA_EN_EXPLORADOR = 'https://stellar.expert/explorer/testnet/account/';
const MONTO_MAXIMO = 100; // por cobro, en XLM de prueba
const ESPERA_MAXIMA_MS = 4 * 60 * 1000; // un cobro que nadie paga se cancela solo
const APROBADO_MS = 7000; // cuánto se queda en pantalla el «pago recibido»
const pausa = (ms) => new Promise((listo) => setTimeout(listo, ms));

// Las llaves se guardan en este navegador para no pedir fondos de prueba en cada visita.
function semilla(nombre) {
  const clave = `paizap.simulador.${nombre}`;
  try {
    const guardada = localStorage.getItem(clave);
    if (guardada && /^[0-9a-f]{64}$/.test(guardada)) {
      return Uint8Array.from(guardada.match(/../g), (par) => parseInt(par, 16));
    }
    const nueva = crypto.getRandomValues(new Uint8Array(32));
    localStorage.setItem(clave, Array.from(nueva, (b) => b.toString(16).padStart(2, '0')).join(''));
    return nueva;
  } catch {
    return crypto.getRandomValues(new Uint8Array(32)); // sin almacenamiento: llave solo para esta visita
  }
}

function siguientePedido() {
  let numero = 1000 + Math.floor(Math.random() * 9000);
  try {
    numero = Number(localStorage.getItem('paizap.simulador.pedido') ?? numero) + 1;
    localStorage.setItem('paizap.simulador.pedido', String(numero));
  } catch {
    // sin almacenamiento, un número al azar alcanza
  }
  return numero;
}

/** "1,5" o "1.50" -> "1.5"; null si no es un monto válido para cobrar. */
export function montoValido(texto) {
  const limpio = String(texto ?? '').trim().replace(',', '.');
  if (!/^\d{1,5}(\.\d{1,7})?$/.test(limpio)) return null;
  const valor = Number(limpio);
  if (!(valor > 0) || valor > MONTO_MAXIMO) return null;
  return String(valor);
}

/**
 * Crea el simulador. `urlAdaptacion` es dónde está device.mjs. `alCambiar(estado)` avisa cada
 * cambio; `alRegistrar({ texto, enlace, tipo })` agrega una línea al registro; `alConsultar(texto)`
 * muestra cada consulta al nodo, como el monitor serie del terminal.
 */
export function crearSimulador({ urlAdaptacion, alCambiar, alRegistrar, alConsultar }) {
  const estado = {
    fase: 'apagado', // apagado | encendiendo | listo | esperando | aprobado | error
    mensaje: 'El aparato está apagado.',
    monto: '', // lo que se va escribiendo en el teclado
    cuentaAparato: '',
    cuentaTarjeta: '',
    pedido: null, // { numero, monto, solicitud, desdeLedger }
    tarjetaPagando: false,
    devolviendo: false,
    rele: false,
    ultimoPago: null, // { numero, monto, hash, enlace, firmaMs, totalMs }
    ultimaDevolucion: null,
    ventas: 0,
  };
  let aparato = null;
  let tarjeta = null;
  let turno = 0; // cada cobro tiene su turno: si cambia, el cobro anterior deja de vigilar

  const avisar = (cambios = {}) => {
    Object.assign(estado, cambios);
    alCambiar({ ...estado });
  };
  const registrar = (texto, extra = {}) => alRegistrar({ texto, ...extra });
  const corta = (cuenta) => `${cuenta.slice(0, 4)}…${cuenta.slice(-4)}`;

  // Lo que avisa el núcleo en cada paso, dicho como lo imprime el terminal por su monitor serie.
  const monitor = (quien) => (paso, datos) => {
    if (paso === 'rpc') alConsultar(`${quien}: ${datos.method} -> ${datos.ms} ms`);
    if (paso === 'signed') alConsultar(`${quien}: firmado en ${datos.signMs.toFixed(2)} ms, ${datos.bytes} bytes`);
  };

  async function encender() {
    if (estado.fase !== 'apagado' && estado.fase !== 'error') return;
    avisar({ fase: 'encendiendo', mensaje: 'Encendiendo: el aparato crea su llave y pide fondos de prueba.' });
    try {
      const { createDevice } = await import(/* @vite-ignore */ urlAdaptacion);
      [aparato, tarjeta] = await Promise.all([
        createDevice({ seed: semilla('aparato'), onEvent: monitor('Aparato') }),
        createDevice({ seed: semilla('tarjeta'), onEvent: monitor('Tarjeta') }),
      ]);
      avisar({ cuentaAparato: aparato.account, cuentaTarjeta: tarjeta.account });
      registrar(`El aparato tiene su llave. Su cuenta es ${corta(aparato.account)}.`, { enlace: CUENTA_EN_EXPLORADOR + aparato.account });
      registrar(`La tarjeta de prueba paga desde la cuenta ${corta(tarjeta.account)}.`, { enlace: CUENTA_EN_EXPLORADOR + tarjeta.account });

      // Fondos de prueba, solo si la cuenta todavía no existe en la red.
      const fondear = async (cual, nombre) => {
        const cuenta = await cual.readAccount();
        if (cuenta) return cuenta;
        registrar(`Pidiendo fondos de prueba para ${nombre}…`);
        return cual.requestTestFunds();
      };
      const [, saldoTarjeta] = await Promise.all([fondear(aparato, 'el aparato'), fondear(tarjeta, 'la tarjeta')]);
      registrar(`Listo. La tarjeta de prueba tiene ${Number(saldoTarjeta.balance).toFixed(2)} XLM de testnet.`);
      avisar({ fase: 'listo', mensaje: 'Aparato listo. Escribe un monto y cobra.' });
    } catch (error) {
      registrar(`No se pudo encender: ${error.message}`, { tipo: 'error' });
      avisar({ fase: 'error', mensaje: 'No se pudo encender. Revisa la conexión y vuelve a intentar.' });
    }
  }

  // Vigila la red hasta ver el pago del pedido, como el terminal mientras muestra el QR.
  async function vigilar(pedido, miTurno) {
    const inicio = Date.now();
    let desde = pedido.desdeLedger;
    while (miTurno === turno && Date.now() - inicio < ESPERA_MAXIMA_MS) {
      let pago = null;
      try {
        pago = await aparato.findPayment({ fromLedger: desde, attempts: 1 });
      } catch {
        await pausa(2000); // el nodo no respondió: se vuelve a preguntar
      }
      if (miTurno !== turno) return;
      if (pago && pago.order === pedido.numero && Number(pago.amount) >= Number(pedido.monto)) {
        return aprobar(pedido, pago, miTurno);
      }
      if (pago) desde = pago.ledger + 1; // un pago de otro pedido: se sigue buscando después de él
    }
    if (miTurno === turno) {
      turno++;
      registrar(`Nadie pagó el pedido ${pedido.numero}: el aparato lo canceló.`);
      avisar({ fase: 'listo', pedido: null, monto: '', tarjetaPagando: false, mensaje: 'El cobro venció sin pago. Escribe un monto y cobra.' });
    }
  }

  async function aprobar(pedido, pago, miTurno) {
    const anterior = estado.ultimoPago?.numero === pedido.numero ? estado.ultimoPago : {};
    const ultimoPago = {
      ...anterior,
      numero: pedido.numero,
      monto: pedido.monto,
      hash: pago.hash,
      enlace: `https://stellar.expert/explorer/testnet/tx/${pago.hash}`,
    };
    registrar(`El aparato vio el pago en la red: ${pago.amount} XLM, pedido ${pago.order}. Cobro aprobado.`, {
      enlace: ultimoPago.enlace,
      tipo: 'ok',
    });
    avisar({
      fase: 'aprobado',
      rele: true,
      pedido: null,
      monto: '',
      tarjetaPagando: false,
      ultimoPago,
      ventas: estado.ventas + 1,
      mensaje: `Pago recibido: ${pedido.monto} XLM, pedido ${pedido.numero}. El aparato lo comprobó en la red.`,
    });
    await pausa(2500);
    if (miTurno === turno) avisar({ rele: false });
    await pausa(APROBADO_MS - 2500);
    if (miTurno === turno && estado.fase === 'aprobado') {
      avisar({ fase: 'listo', mensaje: 'Aparato listo. Escribe un monto y cobra.' });
    }
  }

  async function cobrar(texto) {
    if (estado.fase !== 'listo' && estado.fase !== 'aprobado') return;
    const monto = montoValido(texto ?? estado.monto);
    if (!monto) {
      avisar({ mensaje: `Escribe un monto entre 0,01 y ${MONTO_MAXIMO} XLM.` });
      return;
    }
    const miTurno = ++turno;
    avisar({ fase: 'esperando', rele: false, monto, mensaje: 'Preparando el cobro…' });
    try {
      const red = await aparato.networkState();
      const numero = siguientePedido();
      const pedido = { numero, monto, solicitud: aparato.paymentRequest(monto, numero), desdeLedger: red.ledger };
      if (miTurno !== turno) return;
      registrar(`Cobro de ${monto} XLM, pedido ${numero}. El aparato espera el pago: tarjeta o QR.`);
      avisar({ pedido, mensaje: `Esperando el pago de ${monto} XLM. Acerca la tarjeta de prueba o paga el QR.` });
      vigilar(pedido, miTurno);
    } catch (error) {
      registrar(`No se pudo preparar el cobro: ${error.message}`, { tipo: 'error' });
      avisar({ fase: 'listo', pedido: null, mensaje: 'El nodo no respondió. Vuelve a cobrar.' });
    }
  }

  function cancelar() {
    if (estado.fase !== 'esperando' || estado.tarjetaPagando) return;
    turno++;
    if (estado.pedido) registrar(`Cobro del pedido ${estado.pedido.numero} cancelado en el aparato.`);
    avisar({ fase: 'listo', pedido: null, monto: '', mensaje: 'Cobro cancelado. Escribe un monto y cobra.' });
  }

  // La tarjeta de prueba paga el pedido que el aparato tiene en espera.
  async function acercarTarjeta() {
    const pedido = estado.pedido;
    if (estado.fase !== 'esperando' || !pedido || estado.tarjetaPagando) return;
    avisar({ tarjetaPagando: true, mensaje: 'Tarjeta leída. El pago va camino a la red…' });
    registrar(`Tarjeta de prueba: paga ${pedido.monto} XLM al pedido ${pedido.numero}.`);
    try {
      const pago = await tarjeta.pay({ destination: aparato.account, amount: pedido.monto, order: pedido.numero });
      registrar(
        `Pago firmado en ${pago.signMs.toFixed(2)} ms y confirmado por la red en ${(pago.totalMs / 1000).toFixed(1)} s.`,
        { enlace: pago.link },
      );
      const ya = estado.ultimoPago?.numero === pedido.numero ? estado.ultimoPago : { numero: pedido.numero, monto: pedido.monto };
      avisar({ ultimoPago: { ...ya, hash: pago.hash, enlace: pago.link, firmaMs: pago.signMs, totalMs: pago.totalMs } });
    } catch (error) {
      registrar(`La tarjeta no pudo pagar: ${error.message}`, { tipo: 'error' });
      avisar({ tarjetaPagando: false, mensaje: 'La tarjeta no pudo pagar. El cobro sigue en espera.' });
    }
  }

  // El aparato paga: devuelve el último cobro a la tarjeta. Aquí firma el aparato con su llave.
  async function devolver() {
    const pago = estado.ultimoPago;
    if (!pago || estado.devolviendo || (estado.fase !== 'listo' && estado.fase !== 'aprobado')) return;
    avisar({ devolviendo: true, mensaje: `El aparato devuelve ${pago.monto} XLM: arma el pago, lo firma y lo envía.` });
    registrar(`Devolución de ${pago.monto} XLM del pedido ${pago.numero}: el aparato arma y firma el pago.`);
    try {
      const hecho = await aparato.pay({ destination: tarjeta.account, amount: pago.monto, order: pago.numero });
      registrar(
        `El aparato firmó en ${hecho.signMs.toFixed(2)} ms y la red confirmó en ${(hecho.totalMs / 1000).toFixed(1)} s.`,
        { enlace: hecho.link, tipo: 'ok' },
      );
      avisar({
        devolviendo: false,
        ultimoPago: null,
        ultimaDevolucion: { numero: pago.numero, monto: pago.monto, hash: hecho.hash, enlace: hecho.link, firmaMs: hecho.signMs, totalMs: hecho.totalMs },
        mensaje: `Devolución hecha: ${pago.monto} XLM de vuelta a la tarjeta de prueba.`,
      });
    } catch (error) {
      registrar(`No se pudo devolver: ${error.message}`, { tipo: 'error' });
      avisar({ devolviendo: false, mensaje: 'No se pudo devolver. Vuelve a intentar.' });
    }
  }

  // Una tecla del teclado del aparato.
  function tecla(t) {
    if (estado.fase === 'esperando') {
      if (t === 'A' || t === '*') cancelar();
      return;
    }
    if (estado.fase === 'aprobado') avisar({ fase: 'listo' });
    if (estado.fase !== 'listo' && estado.fase !== 'aprobado') return;
    let monto = estado.monto;
    if (/^\d$/.test(t) && monto.length < 7) monto += t;
    else if (t === 'D' && !monto.includes('.')) monto += monto ? '.' : '0.';
    else if (t === '*' && monto) monto = monto.slice(0, -1);
    else if (t === 'A') monto = '';
    else if (t === '#' && Number(monto) > 0) return cobrar(monto);
    avisar({ monto, mensaje: monto ? `Monto: ${monto} XLM. Pulsa # para cobrar.` : 'Escribe un monto y cobra.' });
  }

  return { encender, cobrar, cancelar, acercarTarjeta, devolver, tecla, estado: () => ({ ...estado }) };
}
