// Sirve la web de Toki (la carpeta `publico`, que es la compilación de `app/`). La misma dirección
// atiende al terminal, a la web y a la app del celular.
import fs from 'node:fs';
import path from 'node:path';

const CARPETA = path.resolve(process.env.WEB_CARPETA ?? 'publico');
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.apk': 'application/vnd.android.package-archive',
};

export const hayWeb = () => fs.existsSync(path.join(CARPETA, 'index.html'));

/** Responde con el archivo pedido si existe. Devuelve false si no hay nada que servir. */
export function servir(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let ruta;
  try {
    ruta = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    return false;
  }
  if (ruta === '/') ruta = '/index.html';
  const archivo = path.join(CARPETA, ruta);
  if (!archivo.startsWith(CARPETA + path.sep)) return false; // nada fuera de la carpeta
  if (!fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) return false;

  const cabeceras = {
    'content-type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream',
    // Los archivos de /assets llevan un código en el nombre: no cambian nunca.
    'cache-control': ruta.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
  res.writeHead(200, cabeceras);
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(archivo).pipe(res);
  return true;
}
