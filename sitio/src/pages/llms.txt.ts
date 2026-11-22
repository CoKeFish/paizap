// Texto para agentes: qué es el sitio y cómo usar el simulador, con o sin navegador.
// Sale en /llms.txt con las direcciones reales del sitio.
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const raiz = new URL(base, site).href;

  const texto = `# Paizap

> Paizap construye aparatos que cobran en Stellar. Esta página trae un simulador de su primer
> aparato, un terminal de cobro, que hace pagos reales en la red de pruebas de Stellar (testnet).
> La librería con la que está hecho es Stellar MCU SDK: pagos de Stellar para microcontroladores.

Es un simulador: no hay una placa detrás. El aparato real es una placa ESP32-S3 con lector de
tarjetas NFC. Los pagos sí son reales, en testnet, y los arma y firma el núcleo de Stellar MCU SDK.
No hace falta iniciar sesión ni tener una cuenta: el simulador crea las suyas y les pide fondos de
prueba a friendbot.

## Usar el simulador con un navegador

Página: ${raiz}#simulador

1. Pulsa el botón con id \`sim-encender\` («Encender el aparato»). Espera a que el texto de
   \`#sim-estado\` diga «Aparato listo». Tarda de 5 a 20 segundos.
2. Escribe un monto en XLM en el campo \`#sim-monto\` (de 0.01 a 100) y pulsa \`#sim-cobrar\`
   («Cobrar»). El aparato arma un pedido de pago y empieza a vigilar la red.
3. Pulsa \`#sim-tarjeta\` («Acercar la tarjeta de prueba»). Espera a que \`#sim-estado\` diga
   «Pago recibido». Tarda de 5 a 15 segundos.
4. Opcional: pulsa \`#sim-devolver\` («Devolver el último pago») para que el aparato firme y
   envíe él mismo un pago.

Dónde leer el resultado:

- \`#sim-estado\`: una frase con el estado actual.
- \`#sim-registro\`: la lista de lo que pasó, con enlaces a cada transacción en stellar.expert.
- \`#sim-datos\`: el estado en JSON (\`fase\`, cuentas, \`pedido\`, \`ultimoPago\` con su \`hash\` y
  su \`enlace\`, \`ultimaDevolucion\`, \`cobrosAprobados\`).
- El atributo \`data-fase\` de \`#simulador\`: apagado, encendiendo, listo, esperando, aprobado o error.

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

- [Simulador](${raiz}#simulador): el terminal simulado.
- [Documentación de Stellar MCU SDK](${raiz}sdk/): inicio rápido, guías, referencia y medidas.
- [Stellar MCU SDK en GitHub](https://github.com/CoKeFish/stellar-mcu-sdk): la librería, en C, con licencia Apache 2.0.
- [Paizap en GitHub](https://github.com/CoKeFish/paizap): el terminal, su servidor y su app.
`;

  return new Response(texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
