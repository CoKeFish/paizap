// La demo de Paizap: aparatos que cobran en Stellar testnet, el teléfono de quien paga y su tarjeta.
//
// Hay dos cuentas, creadas en este navegador: la de quien paga (se ve en el teléfono y de ella
// paga la tarjeta de prueba) y la del comercio (a la que cobran los aparatos). Las transacciones
// las arma y firma el núcleo de Stellar MCU SDK, compilado para el navegador (public/simulador).
// Todo es real, en la red de pruebas.
//
// El recorrido:
//   crear cuenta  el teléfono muestra cómo se crea: se genera la llave aquí y la red abre la
//                 cuenta con fondos de prueba. Por detrás también se abre la del comercio.
//   cobrar        el aparato arma el cobro, con su número, y empieza a vigilar la red. Con precio
//                 fijo (torniquete, dispensador) cobra solo; en la caja, alguien escribe el monto.
//   aprobar       el aparato encuentra el pago en los eventos de la red, con su monto y su número
//   devolver      el aparato devuelve un pago: arma la transacción, la firma y la envía él mismo
//
// Quien ya creó su cuenta en este navegador no la crea de nuevo.
//
// El teclado de la caja sigue al firmware del terminal: dígitos, D punto decimal, * borrar,
// A limpiar, # cobrar; con un cobro en espera, A o * lo cancelan.
import { APARATOS, INICIAL } from './catalogo.js';

const CUENTA_EN_EXPLORADOR = 'https://stellar.expert/explorer/testnet/account/';
const TX_EN_EXPLORADOR = 'https://stellar.expert/explorer/testnet/tx/';
const MONTO_MINIMO = 0.01; // por cobro, en XLM de prueba
const MONTO_MAXIMO = 100;
const MONTO_SUGERIDO = '1.5';
const ESPERA_MAXIMA_MS = 4 * 60 * 1000; // un cobro que nadie paga se cancela solo
const PASO_MS = 800; // lo mínimo que se ve cada paso al crear la cuenta
const COBROS_GUARDADOS = 12;
const SIN_CUENTA = 'Primero crea tu cuenta: de ahí sale el dinero con que pagas.';
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
    aparato: INICIAL, // el aparato elegido: torniquete, dispensador o caja
    // La cuenta de quien paga, como la muestra el teléfono.
    cuenta: { llave: false, abierta: false, saldo: null },
    movimiento: null, // lo último que pasó en esa cuenta: { tipo: 'pago' | 'devolucion', monto }
    cuentaTarjeta: '',
    cuentaAparato: '',
    monto: '', // en la caja, el monto que se está escribiendo: el mismo en el teclado y en la página
    cobro: null, // el cobro en espera: { numero, monto, solicitud, desdeLedger }
    tarjetaPagando: false,
    devolviendo: false,
    // El último cobro aprobado. Se queda hasta el siguiente cobro:
    // { numero, monto, aparato, hash, enlace, segundos, conTarjeta, devolucion: null | { hash, enlace } }
    ultimoPago: null,
    cobros: cobrosGuardados(), // los cobros aprobados, del más nuevo al más viejo
  };
  let crearPlaca = null; // createDevice, de la adaptación
  let aparato = null; // quien cobra: la cuenta del comercio
  let tarjeta = null; // quien paga
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
  const saldoDe = (cuenta) => Number(cuenta.balance).toFixed(2);
  const elegido = () => APARATOS[estado.aparato];
  const precioFijo = () => elegido().modo === 'autoservicio';
  const hayCuenta = () => estado.fase === 'listo' || estado.fase === 'esperando' || estado.fase === 'aprobado';

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

  // El aparato quedó libre. Con precio fijo se pone a cobrar solo; en la caja espera un monto.
  function quedarListo(mensaje, cobrarSolo = true) {
    reemplazar = true;
    const solo = precioFijo() && cobrarSolo;
    avisar({
      fase: 'listo',
      cobro: null,
      tarjetaPagando: false,
      monto: estado.monto || MONTO_SUGERIDO,
      mensaje: mensaje ?? (precioFijo() ? `${elegido().El} no está cobrando. Ponlo a cobrar para seguir.` : 'Ahora eres el comercio: escribe un monto y cobra.'),
    });
    if (solo) cobrar();
  }

  async function cargar() {
    crearPlaca ??= (await import(/* @vite-ignore */ urlAdaptacion)).createDevice;
  }
  // Las dos llaves: si no estaban guardadas, se generan aquí, en el navegador.
  async function abrirLlaves() {
    [aparato, tarjeta] = await Promise.all([
      crearPlaca({ seed: semilla('aparato'), onEvent: monitor('Aparato') }),
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
      const [delComercio, deQuienPaga] = await Promise.all([aparato.readAccount(), tarjeta.readAccount()]);
      if (!delComercio || !deQuienPaga) return sinCuenta(); // la red de pruebas se reinició: se crea de nuevo
      registrar(`Tu cuenta ya estaba creada en este navegador: ${corta(tarjeta.account)}.`, {
        enlace: CUENTA_EN_EXPLORADOR + tarjeta.account,
        rotulo: 'Ver la cuenta',
      });
      avisar({ cuenta: { llave: true, abierta: true, saldo: saldoDe(deQuienPaga) } });
      quedarListo();
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
      registrar(`Los aparatos cobran a la cuenta del comercio: ${corta(aparato.account)}.`, {
        enlace: CUENTA_EN_EXPLORADOR + aparato.account,
        rotulo: 'Ver la cuenta',
      });
      avisar({ cuenta: { llave: true, abierta: true, saldo }, mensaje: `Cuenta abierta, con ${saldo} XLM de prueba.` });
      await pausa(PASO_MS * 1.5); // que se alcance a ver la cuenta lista antes de seguir
      quedarListo(precioFijo() ? undefined : 'Tu cuenta está lista. Ahora eres el comercio: escribe un monto y cobra.');
    } catch (error) {
      registrar(`No se pudo crear la cuenta: ${error.message}`, { tipo: 'error' });
      avisar({ fase: 'error', reintento: 'crear', mensaje: 'No se pudo crear la cuenta. Revisa la conexión y vuelve a intentar.' });
    }
  }

  function reintentar() {
    if (estado.fase !== 'error') return;
    return estado.reintento === 'crear' ? crearCuenta() : preparar();
  }

  // Cambiar de aparato. Si había un cobro esperando, se deja: el aparato nuevo arma el suyo.
  function elegirAparato(id) {
    if (!APARATOS[id] || id === estado.aparato) return;
    if (estado.fase === 'creando' || estado.tarjetaPagando || estado.devolviendo) return;
    turno++;
    const conCuenta = hayCuenta();
    avisar({ aparato: id });
    if (conCuenta) quedarListo();
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
      registrar(`Nadie pagó el cobro n.º ${cobro.numero}: ${elegido().el} lo canceló.`);
      quedarListo(precioFijo() ? `${elegido().El} dejó de esperar el pago. Ponlo a cobrar para seguir.` : 'El cobro venció sin pago. Escribe un monto y cobra.', false);
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
      aparato: estado.aparato,
      hash: pago.hash,
      enlace: TX_EN_EXPLORADOR + pago.hash,
      segundos,
      conTarjeta,
      devolucion: null,
    };
    registrar(
      `${elegido().El} vio el pago en la red: ${pago.amount} XLM, cobro n.º ${pago.order}. Cobro aprobado` +
        (segundos ? ` a los ${segundos} s de leer la tarjeta.` : '.'),
      { enlace: ultimoPago.enlace, rotulo: 'Ver la transacción', tipo: 'ok' },
    );
    avisar({
      fase: 'aprobado',
      cobro: null,
      tarjetaPagando: false,
      ultimoPago,
      cobros: anotar(ultimoPago),
      movimiento: conTarjeta ? { tipo: 'pago', monto: cobro.monto } : estado.movimiento,
      mensaje: `Pago aprobado: ${elegido().alAprobar}.`,
    });
    if (conTarjeta) refrescarSaldo();
  }

  // Armar un cobro. Con precio fijo el monto es el del aparato; en la caja, el que se escribió.
  async function cobrar(texto) {
    if (estado.fase === 'sin-cuenta') return avisar({ mensaje: 'Primero crea tu cuenta en el teléfono.' });
    if ((estado.fase !== 'listo' && estado.fase !== 'aprobado') || estado.devolviendo) return;
    const monto = precioFijo() ? elegido().precio : montoValido(texto ?? estado.monto);
    if (!monto) {
      avisar({ fase: 'listo', mensaje: `Escribe un monto entre ${MONTO_MINIMO} y ${MONTO_MAXIMO} XLM.` });
      return;
    }
    const miTurno = ++turno;
    pagoDeLaTarjeta = null;
    tarjetaLeidaEn = 0;
    avisar({ fase: 'esperando', cobro: null, ...(precioFijo() ? {} : { monto }), mensaje: `${elegido().El} prepara el cobro…` });
    try {
      const red = await aparato.networkState();
      const numero = siguienteNumero();
      const cobro = { numero, monto, solicitud: aparato.paymentRequest(monto, numero), desdeLedger: red.ledger };
      if (miTurno !== turno) return;
      registrar(`Cobro n.º ${numero} por ${monto} XLM. ${elegido().El} muestra el QR y vigila la red.`);
      avisar({
        cobro,
        mensaje: precioFijo()
          ? `${elegido().El} cobra ${monto} XLM ${elegido().porQue}. Paga con tu tarjeta.`
          : `El terminal espera ${monto} XLM. Vuelves a ser el cliente: paga con tu tarjeta.`,
      });
      vigilar(cobro, miTurno);
    } catch (error) {
      if (miTurno !== turno) return;
      registrar(`No se pudo preparar el cobro: ${error.message}`, { tipo: 'error' });
      quedarListo(precioFijo() ? 'El nodo no respondió. Vuelve a poner el aparato a cobrar.' : 'El nodo no respondió. Vuelve a cobrar.', false);
    }
  }

  // Cancelar el cobro, desde la caja. Un aparato de precio fijo no cancela: siempre está cobrando.
  function cancelar() {
    if (estado.fase !== 'esperando' || estado.tarjetaPagando || precioFijo()) return;
    turno++;
    if (estado.cobro) registrar(`Cobro n.º ${estado.cobro.numero} cancelado en el terminal.`);
    quedarListo('Cobro cancelado. Escribe un monto y cobra.');
  }

  // La tarjeta de prueba paga, desde tu cuenta, el cobro que el aparato tiene en espera.
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
      if (vistoPorElAparato === cobro.numero) return; // el pago llegó igual: el aparato ya lo vio
      pagoDeLaTarjeta = null;
      registrar(`La tarjeta no pudo pagar: ${error.message}`, { tipo: 'error' });
      avisar({ tarjetaPagando: false, mensaje: 'La tarjeta no pudo pagar. El cobro sigue en espera: vuelve a intentar.' });
    }
  }

  // Alguien toca la tarjeta cuando no hay un cobro que pagar: se le dice qué falta.
  function tarjetaSinCobro() {
    if (estado.fase === 'sin-cuenta') avisar({ mensaje: 'Primero crea tu cuenta en el teléfono: la tarjeta paga desde ahí.' });
    if (estado.fase === 'listo') avisar({ mensaje: `Primero hace falta un cobro: la tarjeta paga cuando ${elegido().el} está cobrando.` });
    if (estado.fase === 'aprobado' && !estado.devolviendo) avisar({ mensaje: 'Ese cobro ya está pagado. Empieza otro para usar la tarjeta.' });
  }

  // Alguien toca el teléfono: crea la cuenta si falta; si no, se le dice qué sigue.
  function tocarTelefono() {
    if (estado.fase === 'sin-cuenta') return crearCuenta();
    if (estado.fase === 'error') return reintentar();
    if (estado.fase === 'listo' && !precioFijo()) avisar({ mensaje: 'Tu cuenta ya está lista. Ahora cobra en el terminal.' });
  }

  // El aparato paga: devuelve el último cobro a tu cuenta. Aquí firma el aparato con su llave.
  async function devolver() {
    const pago = estado.ultimoPago;
    if (estado.fase !== 'aprobado' || !pago || pago.devolucion || !pago.conTarjeta || estado.devolviendo) return;
    avisar({ devolviendo: true, mensaje: `${elegido().El} devuelve el dinero: arma el pago y lo firma con su propia llave…` });
    try {
      const hecho = await aparato.pay({ destination: tarjeta.account, amount: pago.monto, order: pago.numero });
      registrar(`${elegido().El} devolvió ${pago.monto} XLM del cobro n.º ${pago.numero}, firmando con su propia llave.`, {
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
        mensaje: `Devolución hecha: esta vez el que pagó fue ${elegido().el}.`,
      });
      refrescarSaldo();
    } catch (error) {
      registrar(`No se pudo devolver: ${error.message}`, { tipo: 'error' });
      avisar({ devolviendo: false, mensaje: 'No se pudo devolver. Vuelve a intentar.' });
    }
  }

  // Después de un cobro aprobado, el aparato vuelve a cobrar (o, en la caja, a pedir un monto).
  function otroCobro() {
    if (estado.fase !== 'aprobado' || estado.devolviendo) return;
    quedarListo();
  }

  // El monto escrito en la página: el terminal de caja muestra lo mismo.
  function escribir(texto) {
    if (estado.fase !== 'listo' || precioFijo()) return;
    reemplazar = false;
    const monto = String(texto).replace(',', '.').replace(/[^\d.]/g, '').slice(0, 9);
    if (monto !== estado.monto) avisar({ monto });
  }

  // Una tecla del teclado del terminal de caja.
  function tecla(t) {
    if (precioFijo()) return;
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
    avisar({ fase: 'listo', monto, mensaje: 'Ahora eres el comercio: escribe un monto y cobra.' });
  }

  return {
    preparar,
    crearCuenta,
    reintentar,
    elegirAparato,
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
