// Texto para agentes: qué es el sitio y cómo usar el simulador, con o sin navegador.
// Sale en /llms.txt con las direcciones reales del sitio.
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const raiz = new URL(base, site).href;

  const texto = `# Paizap

> Paizap pone pagos de Stellar dentro de aparatos conectados: torniquetes, dispensadores, cajas.
> Este sitio trae un simulador con tres aparatos que hacen pagos reales en la red de pruebas de
> Stellar (testnet). La librería con la que cobran es Stellar MCU SDK: pagos de Stellar para
> microcontroladores.

Es un simulador: no hay placas detrás. Los pagos sí son reales, en testnet, y los arma y firma el
núcleo de Stellar MCU SDK. No hace falta iniciar sesión: la demo crea una cuenta de prueba en el
navegador y le pide fondos de prueba a friendbot.

## Usar el simulador con un navegador

Página: ${raiz}demo/

Hay tres aparatos: un torniquete y un dispensador, que tienen precio fijo y cobran solos, y un
terminal de caja, donde se escribe el monto. El panel muestra un solo momento a la vez: crear la
cuenta, cobrar, pagar y el resultado.

El estado está en dos atributos de \`#simulador\`. Espera los atributos, no los textos.

- \`data-aparato\`: torniquete, dispensador o caja.
- \`data-fase\`: preparando, sin-cuenta, creando, listo, esperando, aprobado o error.

1. Elige un aparato con \`#sim-aparato-torniquete\`, \`#sim-aparato-dispensador\` o
   \`#sim-aparato-caja\`. Al abrir la página está elegido el torniquete.
2. Espera a que la fase deje de ser \`preparando\`. Si es \`sin-cuenta\`, pulsa \`#sim-crear\`
   («Crear mi cuenta») y espera a que deje de ser \`creando\`: se crea de verdad la cuenta de quien
   paga, con fondos de prueba. Tarda de 4 a 20 segundos. Si queda en \`error\`, pulsa
   \`#sim-reintentar\` («Volver a intentar»).
3. Con el torniquete o el dispensador no hay que cobrar: la fase pasa sola a \`esperando\`. Con la
   caja, escribe un monto en XLM en \`#sim-monto\` (de 0.01 a 100) y pulsa \`#sim-cobrar\`
   («Cobrar»); la fase pasa a \`esperando\`.
4. Pulsa \`#sim-tarjeta\` («Pagar con la tarjeta») y espera \`data-fase="aprobado"\`. Tarda de 3 a
   15 segundos. La fase se queda en \`aprobado\` hasta el siguiente cobro. En el modelo, el
   torniquete gira y el dispensador entrega una botella.
5. Opcional: pulsa \`#sim-devolver\` («Devolver el pago») para que el aparato firme y envíe él mismo
   un pago. Termina cuando \`ultimoPago.devolucion\` deja de ser nulo.
6. Para otro cobro en el mismo aparato, pulsa \`#sim-otro\`.
7. Para volver a ver cómo se crea la cuenta, pulsa \`#sim-reiniciar\` («Empezar de cero, con una
   cuenta nueva»): la página se recarga y vuelve a la fase \`sin-cuenta\`.

En el modelo 3D también se puede pagar llevando la tarjeta a mano hasta el lector, con un
arrastre. \`document.getElementById('sim-lienzo').donde('tarjeta')\` y \`.donde('lector')\` dan,
en píxeles de la página, dónde agarrarla y adónde llevarla. No hace falta: \`#sim-tarjeta\` hace
lo mismo.

Dónde leer el resultado:

- \`#sim-datos\`: el estado en JSON. Trae \`fase\`, \`aparato\`, \`cuenta\` (la de quien paga, con su
  saldo), \`cobro\` (el cobro en espera), \`ultimoPago\` (con su \`hash\`, su \`enlace\` y su
  \`devolucion\`) y \`cobros\` (los cobros hechos).
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
- [Paizap en GitHub](https://github.com/CoKeFish/paizap): la demo en una placa real, con su servidor y su app.
`;

  return new Response(texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
