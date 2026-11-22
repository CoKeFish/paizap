# Sitio de Paizap y documentación de Stellar MCU SDK

Un solo sitio estático, hecho con [Astro](https://astro.build) y [Starlight](https://starlight.astro.build):

| Dirección | Qué es |
|---|---|
| `/` | La portada de Paizap: pagos dentro de aparatos conectados, la demo en una placa real y el SDK |
| `/demo/` | La demo: un torniquete, un dispensador y un terminal de caja que cobran en Stellar testnet |
| `/sdk/` | La documentación de Stellar MCU SDK |
| `/llms.txt` | Cómo usar la demo, para agentes |

Paizap pone pagos de Stellar dentro de aparatos conectados. El terminal con tarjeta es una demo
de eso en una placa real, no un producto: así lo presentan los textos del sitio.

## Verlo

```bash
docker compose up -d --build      # http://localhost:8093
```

Se compila dentro de Docker porque Astro pide un Node más nuevo que el del PC (22.23 o superior).
Para publicarlo en una subcarpeta, como GitHub Pages, la imagen recibe `SITIO_URL` y `SITIO_BASE`
(ver `astro.config.mjs` y `Dockerfile`).

## La demo

Los aparatos de `/demo/` no son placas: es un simulador. La cuenta y los pagos sí son reales, en
Stellar testnet, y los arma y firma el núcleo de Stellar MCU SDK compilado para el navegador.

Cómo está pensada la página:

- **Tres aparatos.** Un torniquete y un dispensador de agua, con precio fijo: cobran solos y,
  cuando ven el pago, actúan (el torniquete gira y deja pasar; el dispensador entrega la
  botella). Y un terminal de caja, donde se escribe el monto. Son los dos modos del terminal de
  la demo real: autoservicio y caja.
- **Primero, la cuenta.** El visitante crea su cuenta en el teléfono del modelo, y se crea de
  verdad: la llave se genera en el navegador y la red de pruebas abre la cuenta con fondos de
  prueba. Después el teléfono muestra el saldo y lo último que pasó. Quien ya la creó en ese
  navegador no la crea de nuevo.
- **Un momento a la vez.** El panel muestra solo lo que toca: crear la cuenta, cobrar, pagar o
  el resultado, con una frase que dice qué pasa y un botón principal.
- **El resultado se queda.** El pago aprobado sigue a la vista, con su enlace a la transacción,
  hasta el siguiente cobro. Debajo queda la lista de cobros hechos, con su aparato y su estado.
- **El modelo muestra lo mismo y se puede tocar.** El teléfono y las teclas de la caja
  responden; la tarjeta se toca (va sola al lector) o se agarra y se lleva a mano hasta el
  lector.
- **Cada cosa con su animación.** La cámara se acerca al teléfono al crear la cuenta y después
  de pasar la tarjeta, y vuelve a mostrar el aparato justo cuando actúa. Cuando el aparato
  devuelve un pago (ahí firma él), se ve el dinero ir del aparato al teléfono.
- **Lo técnico va plegado:** el registro de lo que pasó, las cuentas, las consultas al nodo y
  las instrucciones para agentes.

| Carpeta | Qué hay |
|---|---|
| `src/pages/demo.astro` | La página de la demo |
| `src/simulador/catalogo.js` | Los aparatos: nombre, modo, precio y lo que dice cada uno |
| `src/simulador/aparato.js` | Lo que pasa: crear la cuenta, cobrar, vigilar la red, aprobar y devolver |
| `src/simulador/pagina.js` | Une todo con el selector, el panel, la lista de cobros y el registro |
| `src/simulador/escena.js` | La escena 3D: el aparato elegido, el teléfono, la tarjeta y la cámara |
| `src/simulador/aparatos/` | Cada aparato en 3D, con su animación: `torniquete.js`, `dispensador.js`, `caja.js` |
| `src/simulador/piezas.js` | Lo que comparten los modelos, y el módulo de cobro (pantalla, lector y luz) |
| `src/simulador/pantalla.js` | Lo que muestra la pantalla del módulo de cobro |
| `src/simulador/telefono.js` | Lo que muestra el teléfono: cómo se crea la cuenta y la billetera |
| `src/styles/demo.css` | Los estilos de la demo |
| `public/modelo/` | La base y la tapa de la carcasa del terminal, exportadas de `hardware/carcasa` |
| `public/simulador/` | El núcleo del SDK compilado (`stellar_mcu.mjs`) y quien hace de placa (`device.mjs`) |
| `public/agentes/demo.mjs` | El mismo cobro sin navegador, con Node |
| `simulador/adaptacion/` | Las fuentes de esa adaptación y cómo volver a compilarla |
| `simulador/tapa_demo.scad` | La tapa del terminal de la demo, con la ventana de la pantalla más grande |
| `simulador/retrato.mjs`, `recortar_retrato.py` | Sacan la imagen de la portada (`public/aparato.webp`) |

El torniquete y el dispensador son maquetas hechas con formas simples. La caja usa la carcasa
del terminal de la demo real, con una pantalla más grande que la que se imprime (64 × 32 mm en
vez de la OLED chica), para que se lea en la web.

La adaptación para el navegador es de Paizap, para esta demo. No es parte del SDK, que es para
microcontroladores. Para volver a compilarla hace falta Emscripten y el repositorio del SDK:

```bash
SDK_DIR=/ruta/a/stellar-mcu-sdk sh simulador/adaptacion/build.sh
cp simulador/adaptacion/stellar_mcu.mjs public/simulador/
```

Para agentes: los botones tienen identificadores fijos (`sim-aparato-torniquete`,
`sim-aparato-dispensador`, `sim-aparato-caja`, `sim-crear`, `sim-cobrar`, `sim-tarjeta`,
`sim-devolver`, `sim-otro`, `sim-reintentar` y `sim-reiniciar`), el aparato y la fase están en
`data-aparato` y `data-fase` de `#simulador`, y el estado completo, en JSON, en `#sim-datos`.
Sin navegador, `agentes/demo.mjs` hace el mismo recorrido. Todo está explicado en `/llms.txt`.

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
