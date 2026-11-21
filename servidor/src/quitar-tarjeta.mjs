// Quita una tarjeta del registro: deja de pagar y queda libre para que su dueño la vincule desde
// la app.
//   SERVIDOR_URL=http://localhost:8090 ADMIN_TOKEN=... node src/quitar-tarjeta.mjs 04:11:22:33:44:55:66
const [uid] = process.argv.slice(2);
if (!uid) {
  console.error('Uso: node src/quitar-tarjeta.mjs <UID>');
  process.exit(2);
}
const respuesta = await fetch(`${process.env.SERVIDOR_URL ?? 'http://localhost:8090'}/tarjetas/${encodeURIComponent(uid)}`, {
  method: 'DELETE',
  headers: { 'x-admin-token': process.env.ADMIN_TOKEN ?? '' },
});
console.log(respuesta.status, await respuesta.json());
process.exit(respuesta.ok ? 0 : 1);
