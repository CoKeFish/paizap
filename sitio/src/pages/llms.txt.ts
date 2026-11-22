// Texto para agentes: qué es el sitio y cómo usar el simulador, con o sin navegador.
// Sale en /llms.txt con las direcciones reales del sitio.
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const raiz = new URL(base, site).href;

  const texto = `# Paizap

> Paizap construye aparatos que cobran en Stellar. Este sitio trae un simulador de su primer
> aparato, un terminal de cobro, que hace pagos reales en la red de pruebas de Stellar (testnet).
> La librería con la que está hecho es Stellar MCU SDK: pagos de Stellar para microcontroladores.

Es un simulador: no hay una placa detrás. El aparato real es una placa ESP32-S3 con lector de
tarjetas NFC. Los pagos sí son reales, en testnet, y los arma y firma el núcleo de Stellar MCU SDK.
No hace falta iniciar sesión ni tener una cuenta: el simulador crea las suyas y les pide fondos de
prueba a friendbot.

## Usar el simulador con un navegador

Página: ${raiz}demo/

El panel muestra un solo momento a la vez: crear la cuenta, cobrar, pagar y el resultado. La fase
está en el atributo \`data-fase\` de \`#simulador\`: preparando, sin-cuenta, creando, listo,
esperando, aprobado o error. Espera las fases, no los textos.

1. Espera a que la fase deje de ser \`preparando\`. Si es \`sin-cuenta\`, pulsa \`#sim-crear\`
   («Crear mi cuenta») y espera \`data-fase="listo"\`: se crea de verdad la cuenta de quien paga, con
   fondos de prueba. Tarda de 4 a 20 segundos. Si ya es \`listo\`, la cuenta estaba creada en este
   navegador. Si queda en \`error\`, pulsa \`#sim-reintentar\` («Volver a intentar»).
2. Escribe un monto en XLM en el campo \`#sim-monto\` (de 0.01 a 100) y pulsa \`#sim-cobrar\`
   («Cobrar»). La fase pasa a \`esperando\`: el aparato arma el cobro y vigila la red.
3. Pulsa \`#sim-tarjeta\` («Pagar con la tarjeta») y espera \`data-fase="aprobado"\`.
   Tarda de 3 a 15 segundos. La fase se queda en \`aprobado\` hasta el siguiente cobro.
4. Opcional: pulsa \`#sim-devolver\` («Devolver este pago») para que el terminal firme y envíe él
   mismo un pago. Termina cuando \`ultimoPago.devolucion\` deja de ser nulo.
5. Para cobrar de nuevo, pulsa \`#sim-otro\` («Cobrar otra vez») y vuelve al paso 2.
6. Para volver a ver cómo se crea la cuenta, pulsa \`#sim-reiniciar\` («Empezar de cero, con una
   cuenta nueva»): la página se recarga y vuelve a la fase \`sin-cuenta\`.

En el modelo 3D también se puede pagar llevando la tarjeta a mano hasta el lector, con un
arrastre. \`document.getElementById('sim-lienzo').donde('tarjeta')\` y \`.donde('lector')\` dan,
en píxeles de la página, dónde agarrarla y adónde llevarla. No hace falta: \`#sim-tarjeta\` hace
lo mismo.

Dónde leer el resultado:

- \`#sim-datos\`: el estado en JSON. Trae \`fase\`, \`cuenta\` (la de quien paga, con su saldo), \`cobro\` (el cobro en espera),
  \`ultimoPago\` (con su \`hash\`, su \`enlace\` y su \`devolucion\`) y \`cobros\` (los cobros hechos).
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

- [Demo](${raiz}demo/): el terminal simulado.
- [Documentación de Stellar MCU SDK](${raiz}sdk/): inicio rápido, guías, referencia y medidas.
- [Stellar MCU SDK en GitHub](https://github.com/CoKeFish/stellar-mcu-sdk): la librería, en C, con licencia Apache 2.0.
- [Paizap en GitHub](https://github.com/CoKeFish/paizap): el terminal, su servidor y su app.
`;

  return new Response(texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
