# Sitio de Paizap y documentación de Stellar MCU SDK

Un solo sitio estático, hecho con [Astro](https://astro.build) y [Starlight](https://starlight.astro.build):

| Dirección | Qué es |
|---|---|
| `/` | La portada de Paizap: qué es, su terminal y el SDK |
| `/demo/` | La demo: el terminal simulado, que cobra en Stellar testnet |
| `/sdk/` | La documentación de Stellar MCU SDK |
| `/llms.txt` | Cómo usar el simulador, para agentes |

## Verlo

```bash
docker compose up -d --build      # http://localhost:8093
```

Se compila dentro de Docker porque Astro pide un Node más nuevo que el del PC (22.23 o superior).
Para publicarlo en una subcarpeta, como GitHub Pages, la imagen recibe `SITIO_URL` y `SITIO_BASE`
(ver `astro.config.mjs` y `Dockerfile`).

## La demo

El terminal de `/demo/` no es una placa: es un simulador. Los pagos sí son reales, en Stellar
testnet, y los arma y firma el núcleo de Stellar MCU SDK compilado para el navegador.

Cómo está pensada la página:

- **Primero, la cuenta.** El visitante crea su cuenta en el teléfono del modelo, y se crea de
  verdad: la llave se genera en el navegador y la red de pruebas abre la cuenta con fondos de
  prueba. Después el teléfono muestra el saldo y lo último que pasó. Quien ya la creó en ese
  navegador arranca directo en «cobrar».
- **Un momento a la vez.** El panel muestra solo lo que toca: crear la cuenta, cobrar, pagar o
  el resultado, con una frase que dice qué pasa y un botón principal.
- **El resultado se queda.** El pago aprobado sigue a la vista, con su enlace a la transacción,
  hasta el siguiente cobro. Debajo queda la lista de cobros hechos, con su estado.
- **El modelo muestra lo mismo y se puede tocar.** El teléfono, las teclas y la tarjeta
  responden; el monto es uno solo para el teclado y el campo de la página. El modelo tiene alto
  propio, siempre encuadra el teléfono, el terminal y la tarjeta enteros, se gira un poco y
  vuelve solo a su lugar.
- **Lo técnico va plegado:** el registro de lo que hizo el aparato, las cuentas, las consultas
  al nodo y las instrucciones para agentes.

| Carpeta | Qué hay |
|---|---|
| `src/pages/demo.astro` | La página de la demo |
| `src/simulador/aparato.js` | Lo que pasa: crear la cuenta, cobrar, vigilar la red, aprobar y devolver |
| `src/simulador/pagina.js` | Une el aparato con el panel, la lista de cobros y el registro |
| `src/simulador/pantalla.js` | Lo que muestra la pantalla del terminal |
| `src/simulador/telefono.js` | Lo que muestra el teléfono: cómo se crea la cuenta y la billetera |
| `src/simulador/escena.js` | El modelo 3D: el terminal, el teléfono y la tarjeta |
| `src/styles/demo.css` | Los estilos de la demo |
| `public/modelo/` | La base y la tapa de la carcasa, exportadas de `hardware/carcasa` |
| `public/simulador/` | El núcleo del SDK compilado (`stellar_mcu.mjs`) y quien hace de placa (`device.mjs`) |
| `public/agentes/demo.mjs` | El mismo cobro sin navegador, con Node |
| `simulador/adaptacion/` | Las fuentes de esa adaptación y cómo volver a compilarla |
| `simulador/tapa_demo.scad` | La tapa de la demo, con la ventana de la pantalla más grande |
| `simulador/retrato.mjs`, `recortar_retrato.py` | Sacan la imagen del aparato de la portada (`public/aparato.webp`) |

La pantalla del modelo es más grande que la del terminal que se imprime (64 × 32 mm en vez de
la OLED chica), para que se lea en la web. La base es la misma.

La adaptación para el navegador es de Paizap, para esta demo. No es parte del SDK, que es para
microcontroladores. Para volver a compilarla hace falta Emscripten y el repositorio del SDK:

```bash
SDK_DIR=/ruta/a/stellar-mcu-sdk sh simulador/adaptacion/build.sh
cp simulador/adaptacion/stellar_mcu.mjs public/simulador/
```

Para agentes: los botones tienen identificadores fijos (`sim-crear`, `sim-cobrar`,
`sim-tarjeta`, `sim-devolver`, `sim-otro`, `sim-reintentar` y `sim-reiniciar`), la fase está en `data-fase` de `#simulador` y el
estado completo, en JSON, en `#sim-datos`. Sin navegador, `agentes/demo.mjs` hace el mismo
recorrido. Todo está explicado en `/llms.txt`.

## La documentación

Está en `src/content/docs/sdk/`, en español; el código de los ejemplos va en inglés, como en el
SDK. Los ejemplos que muestra están en `ejemplos/`:

- `pay_and_confirm/`: copia del ejemplo oficial del SDK.
- `payment_notifier/`: un avisador de pagos, escrito para esta documentación.

`ejemplos/compilar.sh <carpeta de stellar-mcu-sdk>` los compila para ESP32-S3 y ESP32 contra el
SDK, sin grabar nada en una placa.

## La marca

Colores y letra: `src/styles/marca.css` (los mismos de `app/src/index.css`). La portada se pinta
con `src/styles/portada.css`, la demo le suma `src/styles/demo.css` y la documentación usa
`src/styles/docs.css`.
