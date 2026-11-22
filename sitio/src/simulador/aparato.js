// La demo de Paizap: un terminal que cobra en Stellar testnet, el teléfono de quien paga y su tarjeta.
//
// Hay dos cuentas, creadas en este navegador: la de quien paga (se ve en el teléfono y de ella
// paga la tarjeta de prueba) y la del terminal (el comercio). Las transacciones las arma y firma
// el núcleo de Stellar MCU SDK, compilado para el navegador (public/simulador). Todo es real, en
// la red de pruebas.
//
// El recorrido:
//   crear cuenta  el teléfono muestra cómo se crea: se genera la llave aquí y la red abre la
//                 cuenta con fondos de prueba. Por detrás también se abre la del terminal.
//   cobrar        el terminal arma el cobro, con su número, y empieza a vigilar la red
//   aprobar       el terminal encuentra el pago en los eventos de la red, con su monto y su número
//   devolver      el terminal devuelve un pago: arma la transacción, la firma y la envía él mismo
//
// Quien ya creó su cuenta en este navegador no la crea de nuevo: la demo arranca en «cobrar».
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
const PASO_MS = 800; // lo mínimo que se ve cada paso al crear la cuenta
const COBROS_GUARDADOS = 12;
const LISTO = 'Ahora eres el comercio: escribe un monto y cobra.';
const SIN_CUENTA = 'Primero eres el cliente: crea tu cuenta para tener con qué pagar.';
const pausa = (ms) => new Promise((listo) => setTimeout(listo, ms));

// Lo que se guarda en este navegador: las llaves (para no crear la cuenta en cada visita), el
// número del último cobro y los cobros hechos.
const PREFIJO = 'paizap.simulador.';
function leer(nombre) {
  try {
    return localStorage.getItem(PREFIJO + nombre);
  } catch {
    return null; // sin almacenamiento: todo dura solo esta visita
  }
}
function guardar(nombre, valor) {
  try {
    localStorage.setItem(PREFIJO + nombre, valor);
  } catch {
    // sin almacenamiento
  }
}

/** Borra las llaves y los cobros guardados: la próxima visita empieza por crear la cuenta. */
export function olvidarTodo() {
  try {
    for (const clave of Object.keys(localStorage)) if (clave.startsWith(PREFIJO)) localStorage.removeItem(clave);
  } catch {
    // sin almacenamiento no hay nada que borrar
  }
}

const llaveGuardada = (nombre) => /^[0-9a-f]{64}$/.test(leer(nombre) ?? '');
function semilla(nombre) {
  if (llaveGuardada(nombre)) return Uint8Array.from(leer(nombre).match(/../g), (par) => parseInt(par, 16));
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
    fase: 'preparando', // preparando | sin-cuenta | creando | listo | esperando | aprobado | error
    mensaje: 'Preparando la demo…',
    reintento: null, // con fase «error»: qué se vuelve a intentar, 'preparar' o 'crear'
    // La cuenta de quien paga, como la muestra el teléfono.
    cuenta: { llave: false, abierta: false, saldo: null },
    movimiento: null, // lo último que pasó en esa cuenta: { tipo: 'pago' | 'devolucion', monto }
    cuentaTarjeta: '',
    cuentaAparato: '',
    monto: '', // el monto que se está escribiendo: el mismo en el teclado y en la página
    cobro: null, // el cobro en espera: { numero, monto, solicitud, desdeLedger }
    tarjetaPagando: false,
    devolviendo: false,
    rele: false,
    // El último cobro aprobado. Se queda hasta el siguiente cobro:
    // { numero, monto, hash, enlace, segundos, conTarjeta, devolucion: null | { hash, enlace } }
    ultimoPago: null,
    cobros: cobrosGuardados(), // los cobros aprobados, del más nuevo al más viejo
  };
  let crearPlaca = null; // createDevice, de la adaptación
  let aparato = null;
  let tarjeta = null;
  let turno = 0; // cada cobro tiene su turno: si cambia, el cobro anterior deja de vigilar
  let reemplazar = true; // el monto a la vista es una sugerencia: la primera tecla lo reemplaza
  let pagoDeLaTarjeta = null; // el pago en curso de la tarjeta de prueba
  let tarjetaLeidaEn = 0;
  let vistoPorElAparato = 0; // número del cobro cuyo pago el terminal ya vio en la red

  const avisar = (cambios = {}) => {
    Object.assign(estado, cambios);
    alCambiar({ ...estado });
  };
  const registrar = (texto, extra = {}) => alRegistrar({ texto, ...extra });
  const corta = (cuenta) => `${cuenta.slice(0, 4)}…${cuenta.slice(-4)}`;
  const saldoDe = (cuenta) => Number(cuenta.balance).toFixed(2);

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

  async function cargar() {
    crearPlaca ??= (await import(/* @vite-ignore */ urlAdaptacion)).createDevice;
  }
  // Las dos llaves: si no estaban guardadas, se generan aquí, en el navegador.
  async function abrirLlaves() {
    [aparato, tarjeta] = await Promise.all([
      crearPlaca({ seed: semilla('aparato'), onEvent: monitor('Terminal') }),
      crearPlaca({ seed: semilla('tarjeta'), onEvent: monitor('Tarjeta') }),
    ]);
    avisar({ cuentaAparato: aparato.account, cuentaTarjeta: tarjeta.account });
  }

  // Al abrir la página: si ya hay una cuenta creada en este navegador, se usa; si no, se pide crearla.
  async function preparar() {
    if (estado.fase !== 'preparando' && estado.fase !== 'error') return;
    avisar({ fase: 'preparando', reintento: null, mensaje: 'Preparando la demo…' });
    const sinCuenta = () => avisar({ fase: 'sin-cuenta', cuenta: { llave: false, abierta: false, saldo: null }, mensaje: SIN_CUENTA });
    try {
      await cargar();
      if (!llaveGuardada('tarjeta') || !llaveGuardada('aparato')) return sinCuenta();
      await abrirLlaves();
      const [delTerminal, deQuienPaga] = await Promise.all([aparato.readAccount(), tarjeta.readAccount()]);
      if (!delTerminal || !deQuienPaga) return sinCuenta(); // la red de pruebas se reinició: se crea de nuevo
      registrar(`Tu cuenta ya estaba creada en este navegador: ${corta(tarjeta.account)}.`, {
        enlace: CUENTA_EN_EXPLORADOR + tarjeta.account,
        rotulo: 'Ver la cuenta',
      });
      reemplazar = true;
      avisar({
        fase: 'listo',
        cuenta: { llave: true, abierta: true, saldo: saldoDe(deQuienPaga) },
        monto: estado.monto || MONTO_SUGERIDO,
        mensaje: LISTO,
      });
    } catch (error) {
      registrar(`No se pudo preparar la demo: ${error.message}`, { tipo: 'error' });
      avisar({ fase: 'error', reintento: 'preparar', mensaje: 'No se pudo preparar la demo. Revisa la conexión y vuelve a intentar.' });
    }
  }

  // Crear la cuenta de quien paga, paso a paso, como se ve en el teléfono. Es lo que pasa de verdad:
  // la llave se genera en el navegador y la red de pruebas abre la cuenta con fondos de prueba.
  async function crearCuenta() {
    if (estado.fase !== 'sin-cuenta' && !(estado.fase === 'error' && estado.reintento === 'crear')) return;
    avisar({ fase: 'creando', reintento: null, cuenta: { llave: false, abierta: false, saldo: null }, mensaje: 'Creando tu cuenta: primero, tu llave…' });
    try {
      await cargar();
      await Promise.all([abrirLlaves(), pausa(PASO_MS)]);
      registrar(`Se creó la llave de tu cuenta, aquí en tu navegador. Tu cuenta es ${corta(tarjeta.account)}.`, {
        enlace: CUENTA_EN_EXPLORADOR + tarjeta.account,
        rotulo: 'Ver la cuenta',
      });
      avisar({ cuenta: { llave: true, abierta: false, saldo: null }, mensaje: 'Tu llave está lista. Ahora la red de Stellar abre tu cuenta…' });

      // La red abre cada cuenta al cargarle fondos de prueba. Si ya existía, no se pide nada.
      const abrir = async (cual) => (await cual.readAccount()) ?? cual.requestTestFunds();
      const [, deQuienPaga] = await Promise.all([abrir(aparato), abrir(tarjeta), pausa(PASO_MS)]);
      const saldo = saldoDe(deQuienPaga);
      registrar(`La red de pruebas de Stellar abrió tu cuenta, con ${saldo} XLM de prueba.`);
      registrar(`El terminal también tiene su cuenta, la del comercio: ${corta(aparato.account)}.`, {
        enlace: CUENTA_EN_EXPLORADOR + aparato.account,
        rotulo: 'Ver la cuenta',
      });
      avisar({ cuenta: { llave: true, abierta: true, saldo }, mensaje: `Cuenta abierta, con ${saldo} XLM de prueba.` });
      await pausa(PASO_MS * 1.5); // que se alcance a ver la cuenta lista antes de pasar a cobrar
      reemplazar = true;
      avisar({ fase: 'listo', monto: estado.monto || MONTO_SUGERIDO, mensaje: `Tu cuenta está lista. ${LISTO}` });
    } catch (error) {
      registrar(`No se pudo crear la cuenta: ${error.message}`, { tipo: 'error' });
      avisar({ fase: 'error', reintento: 'crear', mensaje: 'No se pudo crear la cuenta. Revisa la conexión y vuelve a intentar.' });
    }
  }

  function reintentar() {
    if (estado.fase !== 'error') return;
    return estado.reintento === 'crear' ? crearCuenta() : preparar();
  }

  // El saldo que muestra el teléfono, leído de la red después de cada pago.
  async function refrescarSaldo() {
    try {
      const cuenta = await tarjeta.readAccount();
      if (cuenta) avisar({ cuenta: { ...estado.cuenta, saldo: saldoDe(cuenta) } });
    } catch {
      // el saldo se actualiza en la próxima lectura
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
      registrar(`Nadie pagó el cobro n.º ${cobro.numero}: el terminal lo canceló.`);
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
      `El terminal vio el pago en la red: ${pago.amount} XLM, cobro n.º ${pago.order}. Cobro aprobado` +
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
      movimiento: conTarjeta ? { tipo: 'pago', monto: cobro.monto } : estado.movimiento,
      mensaje: 'Cobro terminado: el dinero ya está en la cuenta del terminal.',
    });
    if (conTarjeta) refrescarSaldo();
    await pausa(RELE_MS);
    if (miTurno === turno) avisar({ rele: false });
  }

  async function cobrar(texto) {
    if (estado.fase === 'sin-cuenta') return avisar({ mensaje: 'Primero crea tu cuenta en el teléfono.' });
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
      registrar(`Cobro n.º ${numero} por ${monto} XLM. El terminal muestra el QR y vigila la red.`);
      avisar({ cobro, mensaje: `El terminal espera ${monto} XLM. Vuelves a ser el cliente: paga con tu tarjeta.` });
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
    if (estado.cobro) registrar(`Cobro n.º ${estado.cobro.numero} cancelado en el terminal.`);
    avisar({ fase: 'listo', cobro: null, mensaje: 'Cobro cancelado. Escribe un monto y cobra.' });
  }

  // La tarjeta de prueba paga, desde tu cuenta, el cobro que el terminal tiene en espera.
  async function acercarTarjeta() {
    const cobro = estado.cobro;
    if (estado.fase !== 'esperando' || !cobro || estado.tarjetaPagando) return;
    tarjetaLeidaEn = Date.now();
    avisar({ tarjetaPagando: true, mensaje: 'Tarjeta leída. El pago viaja por la red de Stellar…' });
    registrar(`Tu tarjeta paga ${cobro.monto} XLM al cobro n.º ${cobro.numero}, desde tu cuenta.`);
    pagoDeLaTarjeta = tarjeta.pay({ destination: aparato.account, amount: cobro.monto, order: cobro.numero });
    try {
      await pagoDeLaTarjeta;
    } catch (error) {
      if (vistoPorElAparato === cobro.numero) return; // el pago llegó igual: el terminal ya lo vio
      pagoDeLaTarjeta = null;
      registrar(`La tarjeta no pudo pagar: ${error.message}`, { tipo: 'error' });
      avisar({ tarjetaPagando: false, mensaje: 'La tarjeta no pudo pagar. El cobro sigue en espera: vuelve a intentar.' });
    }
  }

  // Alguien toca la tarjeta cuando no hay un cobro que pagar: se le dice qué falta.
  function tarjetaSinCobro() {
    if (estado.fase === 'sin-cuenta') avisar({ mensaje: 'Primero crea tu cuenta en el teléfono: la tarjeta paga desde ahí.' });
    if (estado.fase === 'listo') avisar({ mensaje: 'Primero cobra en el terminal: la tarjeta paga cuando hay un cobro.' });
    if (estado.fase === 'aprobado' && !estado.devolviendo) avisar({ mensaje: 'Ese cobro ya está pagado. Cobra otra vez para usar la tarjeta.' });
  }

  // Alguien toca el teléfono: crea la cuenta si falta; si no, se le dice qué sigue.
  function tocarTelefono() {
    if (estado.fase === 'sin-cuenta') return crearCuenta();
    if (estado.fase === 'error') return reintentar();
    if (estado.fase === 'listo') avisar({ mensaje: 'Tu cuenta ya está lista. Ahora cobra en el terminal.' });
  }

  // El terminal paga: devuelve el último cobro a tu cuenta. Aquí firma el terminal con su llave.
  async function devolver() {
    const pago = estado.ultimoPago;
    if (estado.fase !== 'aprobado' || !pago || pago.devolucion || !pago.conTarjeta || estado.devolviendo) return;
    avisar({ devolviendo: true, mensaje: 'El terminal devuelve el dinero: arma el pago y lo firma con su propia llave…' });
    try {
      const hecho = await aparato.pay({ destination: tarjeta.account, amount: pago.monto, order: pago.numero });
      registrar(`El terminal devolvió ${pago.monto} XLM del cobro n.º ${pago.numero}, firmando con su propia llave.`, {
        enlace: hecho.link,
        rotulo: 'Ver la devolución',
        tipo: 'ok',
      });
      const ultimoPago = { ...pago, devolucion: { hash: hecho.hash, enlace: hecho.link } };
      avisar({
        devolviendo: false,
        ultimoPago,
        cobros: anotar(ultimoPago),
        movimiento: { tipo: 'devolucion', monto: pago.monto },
        mensaje: 'Devolución hecha: esta vez el que pagó fue el terminal.',
      });
      refrescarSaldo();
    } catch (error) {
      registrar(`No se pudo devolver: ${error.message}`, { tipo: 'error' });
      avisar({ devolviendo: false, mensaje: 'No se pudo devolver. Vuelve a intentar.' });
    }
  }

  // Después de un cobro aprobado, el terminal vuelve a pedir un monto.
  function otroCobro() {
    if (estado.fase !== 'aprobado' || estado.devolviendo) return;
    reemplazar = true;
    avisar({ fase: 'listo', mensaje: LISTO });
  }

  // El monto escrito en la página: el terminal muestra lo mismo.
  function escribir(texto) {
    if (estado.fase !== 'listo') return;
    reemplazar = false;
    const monto = String(texto).replace(',', '.').replace(/[^\d.]/g, '').slice(0, 9);
    if (monto !== estado.monto) avisar({ monto });
  }

  // Una tecla del teclado del terminal.
  function tecla(t) {
    if (estado.fase === 'sin-cuenta') return avisar({ mensaje: 'Primero crea tu cuenta en el teléfono.' });
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
    preparar,
    crearCuenta,
    reintentar,
    cobrar,
    cancelar,
    acercarTarjeta,
    tarjetaSinCobro,
    tocarTelefono,
    devolver,
    otroCobro,
    escribir,
    tecla,
    estado: () => ({ ...estado }),
  };
}
