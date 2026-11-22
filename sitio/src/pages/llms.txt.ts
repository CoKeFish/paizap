// Texto para agentes: qué es el sitio y cómo usar el simulador, con o sin navegador.
// Sale en /llms.txt con las direcciones reales del sitio.
import type { APIRoute } from 'astro';
import { APARATOS } from '../simulador/catalogo.js';

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const raiz = new URL(base, site).href;

  const texto = `# Paizap

> Paizap lleva pagos de Stellar a dispositivos IoT: torniquetes, dispensadores, cajas.
> Este sitio trae un simulador con tres aparatos que cobran en Stellar testnet, la red de pruebas
> de Stellar. Los pagos son transacciones de testnet hechas con dinero de prueba: nadie gasta dinero
> real. La librería con la que cobran es Stellar MCU SDK: una librería de pagos de Stellar para
> microcontroladores, no para un chip. El núcleo es C99 portable.

Es un simulador con pagos en Stellar testnet:

- Cada pago es una transacción en Stellar testnet, hecha con XLM de prueba, que no tienen valor.
  Queda registrada en esa red y se puede comprobar ahí.
- No hay aparatos reales detrás y nadie gasta dinero real. Pagar aquí no usa tarjetas, cuentas
  bancarias ni datos de pago de nadie.
- Las transacciones las arma y firma el núcleo de Stellar MCU SDK.
- No hace falta iniciar sesión: la demo crea una cuenta de prueba en el navegador y le pide fondos
  de prueba a friendbot, el servicio de la red de pruebas que los regala.

## Usar el simulador con un navegador

Página: ${raiz}demo/

Hay tres aparatos: un torniquete (cobra ${APARATOS.torniquete.precio} XLM) y un dispensador (cobra ${APARATOS.dispensador.precio} XLM), que tienen
precio fijo y cobran solos, y un terminal de caja, donde se escribe el monto. El panel muestra un
solo momento a la vez: crear la cuenta, cobrar, pagar y el resultado.

El estado está en atributos de \`#simulador\`. Espera los atributos, no los textos.

- \`data-aparato\`: torniquete, dispensador o caja.
- \`data-fase\`: en qué momento está la demo.
  - \`preparando\`: la página está cargando.
  - \`sin-cuenta\`: falta crear la cuenta de quien paga.
  - \`creando\`: la cuenta se está creando.
  - \`listo\`: hay cuenta y ningún cobro. En la caja, falta escribir el monto y cobrar.
  - \`cobrando\`: el aparato arma el cobro. Todavía no se puede pagar.
  - \`esperando\`: el cobro está listo y \`#sim-tarjeta\` ya se puede pulsar.
  - \`pagando\`: el pago va en camino por la red.
  - \`aprobado\`: el aparato vio el pago en la red.
  - \`devolviendo\`: el aparato está devolviendo el pago.
  - \`error\`: algo falló; \`#sim-reintentar\` lo vuelve a intentar.
- \`data-cobro\`: el número del cobro en espera. Vacío si no hay.
- \`data-pago\`: el identificador (hash) de la transacción del último pago aprobado. Cambia con
  cada cobro: si haces varios, espera a que cambie y no solo a ver \`aprobado\`.
- \`data-devolucion\`: el identificador de la devolución de ese pago. Vacío si no hubo.

1. Elige un aparato con \`#sim-aparato-torniquete\`, \`#sim-aparato-dispensador\` o
   \`#sim-aparato-caja\`. Al abrir la página está elegido el torniquete.
2. Espera a que la fase deje de ser \`preparando\`. Si es \`sin-cuenta\`, pulsa \`#sim-crear\`
   («Crear mi cuenta») y espera a que deje de ser \`creando\`: se crea en la red de pruebas la cuenta de quien
   paga, con fondos de prueba. Tarda de 4 a 20 segundos. Si queda en \`error\`, pulsa
   \`#sim-reintentar\` («Volver a intentar»).
3. Con el torniquete o el dispensador no hay que cobrar: la fase pasa sola por \`cobrando\` y
   queda en \`esperando\`. Si se quedara en \`listo\`, pulsa \`#sim-cobrar\`. Con la caja, escribe un
   monto en XLM en \`#sim-monto\` (de 0.01 a 100) y pulsa \`#sim-cobrar\` («Cobrar»); la fase pasa
   por \`cobrando\` y queda en \`esperando\`.
4. Cuando la fase sea \`esperando\`, pulsa \`#sim-tarjeta\` («Pagar con la tarjeta»). La fase pasa
   a \`pagando\` y después a \`aprobado\`: tarda de 3 a 15 segundos. Se queda en \`aprobado\` hasta
   el siguiente cobro, con el identificador del pago en \`data-pago\`. En el modelo, el torniquete
   gira y el dispensador entrega una botella.
5. Opcional: pulsa \`#sim-devolver\` («Devolver el pago») para que el aparato firme y envíe él mismo
   un pago. La fase pasa a \`devolviendo\` y vuelve a \`aprobado\`, con el identificador de la
   devolución en \`data-devolucion\`.
6. Para otro cobro en el mismo aparato, pulsa \`#sim-otro\`.
7. Para volver a ver cómo se crea la cuenta, pulsa \`#sim-reiniciar\` («Empezar de cero, con una
   cuenta nueva»): la página se recarga y vuelve a la fase \`sin-cuenta\`.

En el modelo 3D también se puede pagar llevando la tarjeta a mano hasta el lector, con un
arrastre. \`document.getElementById('sim-lienzo').donde('tarjeta')\` y \`.donde('lector')\` dan,
en píxeles de la página, dónde agarrarla y adónde llevarla. No hace falta: \`#sim-tarjeta\` hace
lo mismo.

Dónde leer el resultado:

- \`#sim-datos\`: el estado en JSON. Trae \`fase\`, \`aparato\`, \`cuenta\` (la de quien paga, con su
  saldo), \`precio\` (el precio fijo del aparato; nulo en la caja), \`monto\` (lo que cobra el
  aparato: su precio o, en la caja, el monto escrito), \`cobro\` (el cobro en espera), \`ultimoPago\`
  (con su \`hash\`, su \`enlace\` y su \`devolucion\`) y \`cobros\` (los cobros hechos).
- Para comprobar un pago en la red, sin pasar por esta página:
  \`https://horizon-testnet.stellar.org/transactions/<hash>\` responde con \`"successful": true\`.
- \`#sim-estado\`: una frase con lo que pasa ahora.
- \`#sim-registro\`: la lista de lo que pasó, con un enlace a cada cuenta y transacción en
  stellar.expert.

## Usar el simulador sin navegador

Con Node 18 o más nuevo:

\`\`\`sh
curl -sO ${raiz}simulador/device.mjs -O ${raiz}simulador/stellar_mcu.mjs -O ${raiz}agentes/demo.mjs
node demo.mjs 1.5
\`\`\`

Hace el mismo recorrido (cobrar, pagar, comprobar en la red y devolver), escribe una línea de
texto por paso y termina con una línea en JSON que trae \`ok\`, las cuentas y los enlaces a las
transacciones. Usa cuentas nuevas con fondos de friendbot: no gasta fondos de nadie.

## Enlaces

- [Demo](${raiz}demo/): los aparatos simulados.
- [Documentación de Stellar MCU SDK](${raiz}sdk/): inicio rápido, guías, referencia y medidas.
- [Stellar MCU SDK en GitHub](https://github.com/CoKeFish/stellar-mcu-sdk): la librería, en C, con licencia Apache 2.0.
- [Paizap en GitHub](https://github.com/CoKeFish/paizap): la demo en un aparato real, con su servidor y su app.
`;

  return new Response(texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
