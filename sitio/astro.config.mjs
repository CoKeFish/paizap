// Sitio de Paizap: la portada (src/pages/index.astro) y la documentación del SDK (Starlight, en
// src/content/docs/sdk). Sale como un solo sitio estático: / es la portada y /sdk/ la documentación.
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Dirección pública y carpeta base. GitHub Pages sirve el sitio de un repositorio en una
// subcarpeta (/paizap/); con dominio propio o en local, la base es la raíz.
const sitio = process.env.SITIO_URL || 'http://localhost:8093';
const base = process.env.SITIO_BASE || '/';

export default defineConfig({
  site: sitio,
  // Astro 7 quita por defecto los espacios alrededor de las etiquetas, como JSX, y pega palabras
  // con enlaces y negritas. Así los comprime sin perder el espacio entre una palabra y la siguiente.
  compressHTML: true,
  base,
  integrations: [
    starlight({
      title: 'Stellar MCU SDK',
      description: 'Librería abierta para que un microcontrolador cobre, confirme y firme pagos en Stellar.',
      favicon: '/favicon.png',
      locales: { root: { label: 'Español', lang: 'es' } },
      customCss: ['./src/styles/marca.css', './src/styles/docs.css'],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/CoKeFish/stellar-mcu-sdk' }],
      sidebar: [
        {
          label: 'Empezar',
          items: [{ slug: 'sdk' }, { slug: 'sdk/inicio-rapido' }, { slug: 'sdk/como-esta-hecho' }],
        },
        {
          label: 'Guías',
          items: [
            { slug: 'sdk/guias/pagar' },
            { slug: 'sdk/guias/confirmar' },
            { slug: 'sdk/guias/cobrar' },
            { slug: 'sdk/guias/contrato-de-token' },
            { slug: 'sdk/guias/llave' },
          ],
        },
        {
          label: 'Referencia',
          items: [
            { slug: 'sdk/referencia/nucleo' },
            { slug: 'sdk/referencia/nodo' },
            { slug: 'sdk/referencia/medidas' },
            { slug: 'sdk/referencia/microcontroladores' },
          ],
        },
        {
          label: 'Más',
          items: [{ slug: 'sdk/seguridad' }, { slug: 'sdk/demo-terminal' }, { slug: 'sdk/hoja-de-ruta' }],
        },
      ],
    }),
  ],
});
