// Saca el retrato para la portada: abre la demo, crea la cuenta, espera el cobro y captura solo
// el modelo 3D, con el fondo transparente. Deja /out/aparato-crudo.png, que después se recorta.
//
//   docker run --rm --ipc=host -v <carpeta de salida>:/out -v <esta carpeta>:/src:ro //     mcr.microsoft.com/playwright:v1.49.0-jammy sh -c //     'mkdir /w && cd /w && npm init -y && npm i playwright@1.49.0 && cp /src/retrato.mjs . && node retrato.mjs'
import { chromium } from 'playwright';

const sitio = process.argv[2] ?? 'http://host.docker.internal:8093';
const navegador = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const contexto = await navegador.newContext({ viewport: { width: 1900, height: 1450 }, deviceScaleFactor: 2 });
const pagina = await contexto.newPage();
pagina.on('console', (m) => m.type() === 'error' && console.log('consola:', m.text().slice(0, 200)));

await pagina.goto(`${sitio}/demo/`);
// Un lienzo ancho, para que entren el aparato y la tarjeta completos.
await pagina.addStyleTag({
  content: `.ancho { max-width: none !important; }
            .sim-cuerpo { grid-template-columns: 1300px 24rem !important; }
            .sim-3d { height: 1120px !important; }`,
});
await pagina.waitForFunction(() => !document.getElementById('sim-pista').textContent.startsWith('Cargando'), null, { timeout: 60000 });
console.log('modelo listo');
// En un navegador nuevo todavía no hay cuenta: se crea, como haría un visitante.
await pagina.waitForSelector('#simulador:not([data-fase="preparando"])', { timeout: 60000 });
if (await pagina.getAttribute('#simulador', 'data-fase') === 'sin-cuenta') await pagina.click('#sim-crear');
console.log('cuenta lista');
await pagina.waitForSelector('#sim-tarjeta:not([disabled])', { timeout: 30000 });
console.log('cobro en pantalla');

await pagina.addStyleTag({
  content: `html, body, .noche, .sim, .sim-3d, .sim-cuerpo { background: transparent !important; border-color: transparent !important; box-shadow: none !important; }
            .sim-3d::before, .sim-3d::after { display: none !important; }
            #sim-pista { display: none !important; }`,
});
const caja = await pagina.locator('#sim-lienzo').boundingBox();
await pagina.waitForTimeout(2000);
console.log('lienzo', JSON.stringify(caja));
await pagina.locator('#sim-lienzo').screenshot({ path: '/out/aparato-crudo.png', omitBackground: true });
await navegador.close();
console.log('listo');
