// Registra una tarjeta en el servidor. Sin cuenta, crea un cliente de testnet con su permiso de gasto.
//   SERVIDOR_URL=http://localhost:8090 ADMIN_TOKEN=... node src/registrar-tarjeta.mjs 04:11:22:33:44:55:66 [G...]
const [uid, cuenta] = process.argv.slice(2);
if (!uid) {
  console.error('Uso: node src/registrar-tarjeta.mjs <UID> [cuenta]');
  process.exit(2);
}
const respuesta = await fetch(`${process.env.SERVIDOR_URL ?? 'http://localhost:8090'}/tarjetas`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-token': process.env.ADMIN_TOKEN ?? '' },
  body: JSON.stringify({ uid, cuenta }),
});
console.log(respuesta.status, await respuesta.json());
process.exit(respuesta.ok ? 0 : 1);
