// Página de pago que abre el QR del terminal en el celular del cliente.
// Una sola página sin dependencias: muestra el cobro, pide el código de cuenta y el PIN, y paga.
//
// Quien tiene la billetera no necesita PIN: si la billetera está en este mismo navegador, la
// página pasa a ella (#/pagar/<id>); en Android ofrece abrir la app (toki://pagar/<id>).
// Con ?simple=1 la página se queda aquí, con código y PIN.
//
// Lleva la identidad de Paizap (los mismos colores y la misma letra que app/src/index.css). El
// logo y la letra los entrega la web; si el servidor corre sin ella, la página usa la letra del
// sistema y escribe el nombre.

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NUMERO = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "1234.5" -> "1.234,50", como en la app. */
const comoMonto = (valor) => (Number.isFinite(Number(valor)) ? NUMERO.format(Number(valor)) : '');

const LETRA = `
  @font-face { font-family: "Barlow"; font-weight: 400; font-display: swap; src: url("/fuentes/barlow-400.woff2") format("woff2"); }
  @font-face { font-family: "Barlow"; font-weight: 600; font-display: swap; src: url("/fuentes/barlow-600.woff2") format("woff2"); }
  @font-face { font-family: "Barlow Condensed"; font-weight: 800; font-style: italic; font-display: swap;
               src: url("/fuentes/barlow-condensada-800-cursiva.woff2") format("woff2"); }
`;

const ESTILO = `
  :root { --noche: #000b25; --rayo: #ffcd00; --noche-suave: #a7b2cf; --fondo: #f1f3f8; --panel: #fff;
          --borde: #dce1ec; --texto: #000b25; --suave: #56617b; --acento: #2447c6; --error: #b3232b; --error-fondo: #fce4e4;
          --letra: "Barlow", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
          --letra-marca: "Barlow Condensed", "Barlow", system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 17px/1.45 var(--letra); background: var(--fondo); color: var(--texto); -webkit-font-smoothing: antialiased; }
  .ancho { max-width: 26rem; margin: 0 auto; padding-left: 1rem; padding-right: 1rem; }

  /* La franja azul noche: el logo y, debajo, cuánto se paga y a quién. */
  .franja { position: relative; overflow: hidden; background: var(--noche); color: #fff; padding: .75rem 0 1.5rem; }
  .arco { position: absolute; right: -3.5rem; bottom: .75rem; width: 15rem; fill: var(--rayo); pointer-events: none; }
  .franja .ancho { position: relative; }
  .logo { display: block; height: 56px; width: auto; }
  .logo-letras { margin: .45rem 0; font: italic 800 2rem/1 var(--letra-marca); letter-spacing: .01em; }
  .logo-letras span { color: var(--rayo); }
  .concepto { margin: 1.5rem 0 0; color: var(--noche-suave); }
  .comercio { margin: 0; color: var(--noche-suave); }
  .monto { margin: .5rem 0; font: italic 800 4.5rem/.95 var(--letra-marca); font-variant-numeric: tabular-nums; }
  .moneda { margin-left: .2em; font-size: .42em; color: var(--rayo); }
  .aprobado { display: flex; align-items: center; gap: .5rem; margin: 1.5rem 0 0; color: var(--rayo);
              font: italic 800 2.25rem/1 var(--letra-marca); }
  .aprobado svg { width: 2rem; height: 2rem; flex: none; }

  main { padding-top: 1rem; padding-bottom: 2.5rem; }
  .caja { background: var(--panel); border: 1px solid var(--borde); border-radius: 16px; padding: 1rem; }
  form { display: grid; gap: .9rem; }
  label { display: grid; gap: .3rem; font-size: .95rem; font-weight: 600; }
  input { font: inherit; font-weight: 400; font-size: 1.4rem; letter-spacing: .12em; padding: .7rem .8rem; width: 100%;
          border: 1px solid var(--borde); border-radius: 12px; background: var(--panel); color: var(--texto); }
  input:focus { outline: 2px solid var(--acento); outline-offset: 1px; }
  /* El botón amarillo: la única acción de la página. */
  .pagar { width: 100%; min-height: 3.5rem; padding: .9rem; border: 0; border-radius: 12px; background: var(--rayo); color: var(--noche);
           font: italic 800 1.5rem/1 var(--letra-marca); letter-spacing: .03em; text-transform: uppercase; }
  .pagar:disabled { opacity: .6; }
  .enlace { background: none; border: 0; padding: .3rem; color: var(--acento); font: inherit; font-size: .95rem; font-weight: 600;
            text-decoration: underline; }
  .cuenta { margin: 0; font-weight: 600; }
  .aviso { margin: 0; padding: .8rem 1rem; border-radius: 12px; border: 1px solid var(--borde); background: var(--panel); }
  .aviso.error { color: var(--error); border-color: transparent; background: var(--error-fondo); }
  .saldo { margin: 0; color: var(--suave); }
  .boton { display: flex; align-items: center; justify-content: center; min-height: 2.75rem; margin-top: 1rem; border-radius: 12px;
           background: var(--noche); color: #fff; font-weight: 600; font-size: .95rem; text-decoration: none; }
  .pie { margin: 1.25rem 0 0; font-size: .85rem; color: var(--suave); text-align: center; }
  .pie a { color: var(--acento); font-weight: 600; font-size: .95rem; }
  [hidden] { display: none !important; }
`;

// El arco del logo (el mismo dibujo que en la app) y la marca de «aprobado».
const ARCO = '<svg class="arco" viewBox="0 0 240 110" aria-hidden="true"><path d="M4 104C38 30 150-8 236 44 158 16 62 42 4 104Z"/></svg>';
const VISTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 4.5-5.5"/></svg>';

// El script va aparte para no mezclar comillas con la plantilla de la página.
const GUION = `
  const datos = JSON.parse(document.getElementById('datos').textContent);
  const $ = (id) => document.getElementById(id);
  // 'toki.llave' es donde la billetera web guarda la llave de la cuenta: aquí solo se mira si
  // existe, para pasar a la billetera.
  if (datos.billetera && !/[?&]simple=1/.test(location.search) && localStorage.getItem('toki.llave')) {
    location.replace('/#/pagar/' + datos.id);
  }
  if (/Android/.test(navigator.userAgent)) $('app').hidden = false;
  const guardado = localStorage.getItem('toki-codigo');
  if (guardado) {
    $('codigo').value = guardado;
    $('campo-codigo').hidden = true;
    $('otra-cuenta').hidden = false;
    $('cuenta-guardada').textContent = 'Cuenta ' + guardado;
    $('cuenta-guardada').hidden = false;
  }
  $('otra-cuenta').addEventListener('click', () => {
    localStorage.removeItem('toki-codigo');
    $('codigo').value = '';
    $('campo-codigo').hidden = false;
    $('otra-cuenta').hidden = true;
    $('cuenta-guardada').hidden = true;
    $('codigo').focus();
  });
  function avisar(texto) {
    $('aviso').textContent = texto;
    $('aviso').hidden = !texto;
  }
  $('formulario').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    avisar('');
    const boton = $('pagar');
    boton.disabled = true;
    boton.textContent = 'Cobrando en Stellar…';
    try {
      const respuesta = await fetch('/p/' + datos.id + '/pagar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ codigo: $('codigo').value, pin: $('pin').value }),
      });
      const resultado = await respuesta.json();
      if (!resultado.ok) throw new Error(resultado.motivo || 'No se pudo cobrar.');
      localStorage.setItem('toki-codigo', $('codigo').value.replace(/\\D/g, ''));
      $('por-pagar').hidden = true;
      $('cobro').hidden = true;
      if (resultado.saldoCliente != null) {
        const saldo = Number(resultado.saldoCliente).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        $('saldo').textContent = 'Te quedan ' + saldo + ' ' + datos.moneda + ' en tu cuenta.';
      }
      $('recibo').href = '/r/' + resultado.recibo;
      $('pagado').hidden = false;
      $('despues').hidden = false;
    } catch (error) {
      avisar(error.message);
      $('pin').value = '';
      boton.disabled = false;
      boton.textContent = datos.pagar;
    }
  });
`;

/** Página de un cobro pendiente (o un aviso si ya no se puede pagar). `conBilletera`: el servidor
 *  también entrega la web, así que hay logo, letra de marca y billetera a la que pasar. */
export function paginaPago({ id, monto, concepto, moneda, comercio, aviso, conBilletera = false }) {
  const logo = conBilletera
    ? '<img class="logo" src="/logo-franja.png" alt="Paizap" width="76" height="56">'
    : '<p class="logo-letras">PAI<span>ZAP</span></p>';
  const cifra = `<p class="monto">${escapar(comoMonto(monto))}<span class="moneda">${escapar(moneda)}</span></p>`;
  const pagar = `Pagar ${comoMonto(monto)} ${moneda}`;

  const franja = aviso
    ? `<div class="ancho">${logo}</div>`
    : `${ARCO}
    <div class="ancho">
      ${logo}
      <div id="cobro">
        <p class="concepto">${escapar(concepto || 'Total a pagar')}</p>
        ${cifra}
        <p class="comercio">${escapar(comercio)}</p>
      </div>
      <div id="pagado" hidden>
        <h1 class="aprobado">${VISTO} Pago aprobado</h1>
        ${cifra}
        <p class="comercio">a ${escapar(comercio)}</p>
      </div>
    </div>`;

  const cuerpo = aviso
    ? `<p class="aviso">${escapar(aviso)}</p>`
    : `
    <div id="por-pagar">
      <form id="formulario" class="caja" autocomplete="off">
        <p id="cuenta-guardada" class="cuenta" hidden></p>
        <label id="campo-codigo">Código de tu cuenta Paizap
          <input id="codigo" name="codigo" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" required
                 placeholder="6 dígitos" autocomplete="username">
        </label>
        <label>PIN
          <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" required
                 placeholder="4 dígitos" autocomplete="current-password">
        </label>
        <p id="aviso" class="aviso error" role="alert" hidden></p>
        <button id="pagar" class="pagar" type="submit">${escapar(pagar)}</button>
        <button id="otra-cuenta" class="enlace" type="button" hidden>Usar otra cuenta</button>
      </form>
      <p class="pie">Se cobra de tu cuenta Paizap, la misma de tu tarjeta, con tu límite diario.</p>
      <p class="pie"><a id="app" href="toki://pagar/${escapar(id)}" hidden>Abrir en la app de Paizap y pagar sin PIN</a></p>
    </div>

    <div id="despues" hidden>
      <div class="caja">
        <p id="saldo" class="saldo">El pago quedó registrado en la red de Stellar.</p>
        <a id="recibo" class="boton" href="#">Ver el recibo</a>
      </div>
    </div>
    <script id="datos" type="application/json">${JSON.stringify({ id, monto, moneda, pagar, billetera: conBilletera }).replace(/</g, '\\u003c')}</script>
    <script>${GUION}</script>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#000b25">
${conBilletera ? '<link rel="icon" type="image/png" href="/favicon.png">' : ''}
<title>Pagar con Paizap</title>
<style>${conBilletera ? LETRA : ''}${ESTILO}</style>
</head>
<body>
<header class="franja">${franja}</header>
<main class="ancho">${cuerpo}</main>
</body>
</html>`;
}
