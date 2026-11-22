// Saca el retrato del aparato para la portada: abre la demo, enciende, cobra 2.50 y captura solo
// el modelo 3D, con el fondo transparente.
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
            .sim-cuerpo { grid-template-columns: 1300px 25rem !important; align-items: start !important; }
            .sim-3d { height: 1120px !important; min-height: 0 !important; }`,
});
await pagina.waitForFunction(() => document.getElementById('sim-pista').textContent.startsWith('Gira'), null, { timeout: 60000 });
console.log('modelo listo');
await pagina.click('#sim-encender');
await pagina.waitForSelector('#simulador[data-fase="listo"]', { timeout: 120000 });
console.log('aparato encendido');
await pagina.fill('#sim-monto', '2.50');
await pagina.click('#sim-cobrar');
await pagina.waitForFunction(() => !document.getElementById('sim-pedido').hidden, null, { timeout: 30000 });
console.log('cobro en pantalla');

await pagina.addStyleTag({
  content: `html, body, .noche, .sim, .sim-3d, .sim-cuerpo { background: transparent !important; border-color: transparent !important; box-shadow: none !important; }
            .sim-3d::before, .sim-3d::after { display: none !important; }
            #sim-pista { display: none !important; }`,
});
const caja = await pagina.locator('#sim-lienzo').boundingBox();
// Aleja un poco la cámara con la rueda, para que la tarjeta entre completa.
await pagina.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
for (let i = 0; i < 3; i++) {
  await pagina.mouse.wheel(0, 120);
  await pagina.waitForTimeout(250);
}
await pagina.waitForTimeout(2000);
console.log('lienzo', JSON.stringify(caja));
await pagina.locator('#sim-lienzo').screenshot({ path: '/out/aparato-crudo.png', omitBackground: true });
await navegador.close();
console.log('listo');
