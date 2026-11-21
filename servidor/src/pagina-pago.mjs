// Página de pago que abre el QR del terminal en el celular del cliente.
// Una sola página sin dependencias: muestra el cobro, pide el código de cuenta y el PIN, y paga.
//
// Quien tiene la billetera de Toki no necesita PIN: si la billetera está en este mismo navegador,
// la página pasa a ella (#/pagar/<id>); en Android ofrece abrir la app (toki://pagar/<id>).
// Con ?simple=1 la página se queda aquí, con código y PIN.

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ESTILO = `
  :root { color-scheme: light dark; --fondo: #f4f5f7; --tarjeta: #fff; --texto: #14161a; --suave: #5d6470;
          --borde: #d5d9e0; --acento: #0b6e4f; --acento-texto: #fff; --error: #b3261e; }
  @media (prefers-color-scheme: dark) {
    :root { --fondo: #101215; --tarjeta: #1a1d22; --texto: #eef0f3; --suave: #a2a9b4; --borde: #333842;
            --acento: #3ecf8e; --acento-texto: #06281b; --error: #ff8a80; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 17px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         background: var(--fondo); color: var(--texto); }
  main { max-width: 26rem; margin: 0 auto; padding: 1.25rem 1rem 2.5rem; }
  .marca { font-weight: 700; letter-spacing: .02em; color: var(--suave); margin: .25rem 0 1rem; }
  .caja { background: var(--tarjeta); border: 1px solid var(--borde); border-radius: 16px; padding: 1.25rem; }
  .concepto { color: var(--suave); margin: 0; }
  .monto { font-size: 3rem; font-weight: 700; line-height: 1.1; margin: .1rem 0 0; font-variant-numeric: tabular-nums; }
  .moneda { font-size: 1rem; font-weight: 500; color: var(--suave); margin-left: .35rem; }
  .comercio { color: var(--suave); margin: .35rem 0 0; }
  form { margin-top: 1.25rem; display: grid; gap: .9rem; }
  label { display: grid; gap: .3rem; font-size: .95rem; color: var(--suave); }
  input { font: inherit; font-size: 1.4rem; letter-spacing: .12em; padding: .7rem .8rem; width: 100%;
          border: 1px solid var(--borde); border-radius: 12px; background: var(--fondo); color: var(--texto); }
  input:focus { outline: 2px solid var(--acento); outline-offset: 1px; }
  button { font: inherit; font-weight: 700; font-size: 1.15rem; padding: .95rem; border: 0; border-radius: 12px;
           background: var(--acento); color: var(--acento-texto); width: 100%; }
  button:disabled { opacity: .6; }
  .enlace { background: none; color: var(--suave); font-weight: 500; font-size: .95rem; padding: .3rem;
            text-decoration: underline; }
  .aviso { margin: 1rem 0 0; padding: .8rem 1rem; border-radius: 12px; border: 1px solid var(--borde); }
  .aviso.error { color: var(--error); border-color: var(--error); }
  .ok { text-align: center; }
  .ok .marca-ok { font-size: 3.2rem; line-height: 1; color: var(--acento); }
  .ok h1 { font-size: 1.5rem; margin: .4rem 0 .2rem; }
  .ok p { margin: .2rem 0; color: var(--suave); }
  .ok a { display: inline-block; margin-top: .9rem; color: var(--acento); font-weight: 600; }
  .pie { margin-top: 1.25rem; font-size: .85rem; color: var(--suave); text-align: center; }
  .pie a { color: var(--acento); font-weight: 600; font-size: .95rem; }
  [hidden] { display: none !important; }
`;

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
      $('formulario').hidden = true;
      $('cobro').hidden = true;
      $('pie').hidden = true;
      if (resultado.saldoCliente != null) $('saldo').textContent = 'Te quedan ' + resultado.saldoCliente + ' ' + datos.moneda + '.';
      $('recibo').href = '/r/' + resultado.recibo;
      $('pagado').hidden = false;
    } catch (error) {
      avisar(error.message);
      $('pin').value = '';
      boton.disabled = false;
      boton.textContent = 'Pagar ' + datos.monto;
    }
  });
`;

/** Página de un cobro pendiente (o un aviso si ya no se puede pagar). `conBilletera`: el servidor
 *  también entrega la web de Toki, así que se puede pasar a la billetera. */
export function paginaPago({ id, monto, concepto, moneda, comercio, aviso, conBilletera = false }) {
  const cuerpo = aviso
    ? `<div class="caja"><p class="aviso">${escapar(aviso)}</p></div>`
    : `
    <div class="caja">
      <div id="cobro">
        <p class="concepto">${escapar(concepto || 'Total a pagar')}</p>
        <p class="monto">${escapar(monto)}<span class="moneda">${escapar(moneda)}</span></p>
        <p class="comercio">${escapar(comercio)}</p>
      </div>

      <form id="formulario" autocomplete="off">
        <p id="cuenta-guardada" class="concepto" hidden></p>
        <label id="campo-codigo">Código de tu cuenta Toki
          <input id="codigo" name="codigo" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" required
                 placeholder="6 dígitos" autocomplete="username">
        </label>
        <label>PIN
          <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" required
                 placeholder="4 dígitos" autocomplete="current-password">
        </label>
        <button id="pagar" type="submit">Pagar ${escapar(monto)}</button>
        <button id="otra-cuenta" class="enlace" type="button" hidden>Usar otra cuenta</button>
        <p id="aviso" class="aviso error" role="alert" hidden></p>
      </form>

      <div id="pagado" class="ok" hidden>
        <div class="marca-ok" aria-hidden="true">✓</div>
        <h1>Pago aprobado</h1>
        <p>${escapar(monto)} ${escapar(moneda)} a ${escapar(comercio)}</p>
        <p id="saldo"></p>
        <a id="recibo" href="#">Ver la transacción en Stellar</a>
      </div>
    </div>
    <div id="pie">
      <p class="pie">Se cobra de tu cuenta Toki, la misma de tu tarjeta, con tu límite diario.</p>
      <p class="pie"><a id="app" href="toki://pagar/${escapar(id)}" hidden>Abrir en la app de Toki y pagar sin PIN</a></p>
    </div>
    <script id="datos" type="application/json">${JSON.stringify({ id, monto, moneda, billetera: conBilletera }).replace(/</g, '\\u003c')}</script>
    <script>${GUION}</script>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pagar con Toki</title>
<style>${ESTILO}</style>
</head>
<body>
<main>
  <p class="marca">Toki</p>${cuerpo}
</main>
</body>
</html>`;
}
