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

## El simulador

El terminal de `/demo/` no es una placa: es un simulador. Los pagos sí son reales, en Stellar
testnet, y los arma y firma el núcleo de Stellar MCU SDK compilado para el navegador.

| Carpeta | Qué hay |
|---|---|
| `src/simulador/aparato.js` | Lo que hace el aparato: cobrar, vigilar la red, aprobar y devolver |
| `src/simulador/pantalla.js` | Lo que muestra la pantalla del aparato |
| `src/simulador/escena.js` | El modelo 3D: la carcasa, el teclado y la tarjeta de prueba |
| `src/simulador/pagina.js` | Une el simulador con los botones y el registro de la página |
| `public/modelo/` | La base y la tapa de la carcasa, exportadas de `hardware/carcasa` |
| `simulador/tapa_demo.scad` | La tapa de la demo, con la ventana de la pantalla más grande |
| `simulador/retrato.mjs` | Saca la imagen del aparato de la portada (`public/aparato.webp`) con Playwright |
| `public/simulador/` | El núcleo del SDK compilado (`stellar_mcu.mjs`) y quien hace de placa (`device.mjs`) |
| `simulador/adaptacion/` | Las fuentes de esa adaptación y cómo volver a compilarla |
| `public/agentes/demo.mjs` | El mismo cobro sin navegador, con Node |

La pantalla del modelo es más grande que la del terminal que se imprime (64 × 32 mm en vez de
la OLED chica), para que se lea en la web. La base es la misma.

La adaptación para el navegador es de Paizap, para esta demo. No es parte del SDK, que es para
microcontroladores. Para volver a compilarla hace falta Emscripten y el repositorio del SDK:

```bash
SDK_DIR=/ruta/a/stellar-mcu-sdk sh simulador/adaptacion/build.sh
cp simulador/adaptacion/stellar_mcu.mjs public/simulador/
```

El simulador se puede manejar de tres formas: con el modelo 3D, con los botones de la página
(tienen identificadores fijos, `sim-encender`, `sim-cobrar`, `sim-tarjeta`, `sim-devolver`, y el
resultado queda en texto y en JSON en `sim-datos`) y sin navegador, con `agentes/demo.mjs`.

## La documentación

Está en `src/content/docs/sdk/`, en español; el código de los ejemplos va en inglés, como en el
SDK. Los ejemplos que muestra están en `ejemplos/`:

- `pay_and_confirm/`: copia del ejemplo oficial del SDK.
- `payment_notifier/`: un avisador de pagos, escrito para esta documentación.

`ejemplos/compilar.sh <carpeta de stellar-mcu-sdk>` los compila para ESP32-S3 y ESP32 contra el
SDK, sin grabar nada en una placa.

## La marca

Colores y letra: `src/styles/marca.css` (los mismos de `app/src/index.css`). La portada y la demo
se pintan con `src/styles/portada.css` y la documentación con `src/styles/docs.css`.
