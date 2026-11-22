# Servidor de Paizap (MVP)

Recibe el toque de la tarjeta desde el terminal y cobra en Stellar con el **permiso de gasto**
(`approve` / `transfer_from`) del contrato del token. Paizap firma, pero la red no le deja pasar del
tope que autorizó el dueño de la cuenta.

En el código, las variables y los comandos aparece `toki`: es el nombre interno del proyecto.

```
Terminal ──POST /cobros {uid, monto}──► Servidor ──transfer_from(toki, cliente, comercio, monto)──► Stellar
                                           ▲
Web y app del celular ──/api/…─────────────┤   billetera del dueño y panel del comercio
Celular que escanea el QR ──/p/<id>────────┘   paga el mismo cobro sin la tarjeta
```

La misma dirección atiende al terminal, a la web y a la app de Android. La web es la compilación
de [`app/`](../app/README.md), que va dentro de la imagen del servidor.

## Lo que usa el terminal

- `POST /cobros` con la cabecera `X-Terminal-Token`: busca la cuenta de la tarjeta, revisa el
  bloqueo y el límite diario y cobra. Responde `{ok, hash, recibo, permisoRestante, saldoCliente,
  hoyRestante}` o `{ok:false, motivo}`.
- `GET /cobros/<id>` con la misma cabecera: consulta un cobro sin cobrar. Lo usa el terminal
  cuando se cayó la conexión y no le llegó la respuesta, y para enterarse de un pago con QR.
- `POST /pedidos {id, monto, concepto}` y `POST /pedidos/<id>/cancelar`: deja un cobro listo para
  pagar con el QR de la pantalla, o lo retira. Ver «Pago con QR».
- `GET /r/<recibo>`: el enlace corto que el terminal muestra en el QR. Lleva al recibo de Paizap
  (monto, producto, fecha y enlace a la transacción en el explorador de Stellar).
- `GET /salud`: red, token y comercio.

Un terminal que firma el cobro con su propia llave (ver «Cobro firmado por el terminal» en
[`hardware/`](../hardware/README.md)) usa dos pasos en vez de `POST /cobros`:

- `POST /cobros/preparar {id, uid, monto, sun, concepto}`: revisa la tarjeta, el bloqueo y el
  límite diario y responde `{ok, cuenta, comercio, gastador, token}`. No cobra.
- `POST /cobros/registrar {id, uid, monto, concepto, hash}`: el terminal ya cobró. El servidor
  comprueba en la red que esa transacción terminó bien y que es exactamente ese cobro, y lo anota
  como los demás (historial, límite diario y recibo). Con `motivo` en vez de `hash` anota un
  rechazo de la red.

Para que la red acepte los cobros de un terminal, su llave se autoriza una vez:

```bash
doppler run --project toki --config dev -- node src/autorizar-terminal.mjs <cuenta G del terminal>
doppler run --project toki --config dev -- node src/autorizar-terminal.mjs <cuenta G del terminal> quitar
```

Eso agrega la llave del terminal como firmante de la cuenta de Paizap con peso 1, y deja la llave
de Paizap con peso 2. Los umbrales bajo y medio quedan en 1 y el alto en 2, así que el terminal
cobra con los permisos de gasto que ya existen y no puede cambiar los firmantes.

**Lo que esa llave puede hacer de más.** Para la red, la firma del terminal vale para cualquier
pago o llamada a un contrato en nombre de la cuenta de Paizap, no solo para el cobro que arma el
firmware: puede usar el permiso de gasto de cualquier cliente hacia cualquier destino y mover el
saldo de la cuenta. El comercio fijo lo revisa el firmware y el límite diario lo revisa
`POST /cobros/preparar`; la red no impone ninguno de los dos, y quien saque la llave de un
terminal se los salta. Lo que lo acota es el monto y el vencimiento de cada permiso de gasto, y
que a un terminal perdido se le quita la firma con `quitar`. Sirve para un prototipo con un
terminal a la vista. Para un producto, el permiso de gasto debe estar a nombre de un contrato que
fije el comercio y los límites de cada terminal, y el terminal firma la llamada a ese contrato.

Mientras un terminal firma un cobro, ese cobro no se puede pagar también con el QR.

Cada cobro lleva un `id`: si el terminal reintenta porque no le llegó la respuesta, recibe la
misma y no se cobra dos veces. Los cobros hechos y los recibos se guardan en el volumen `datos`,
así que eso vale aunque el servidor se reinicie. Una tarjeta no registrada se rechaza con su UID,
que el terminal muestra en pantalla.

## Pago con QR

Mientras espera el pago, el terminal deja el cobro en el servidor (`POST /pedidos`) y muestra un
QR con `http://<servidor>/p/<id>`. El id del pedido es el mismo id del cobro: se pague acercando
la tarjeta o escaneando el QR, se cobra una sola vez, y el terminal se entera preguntando por
`GET /cobros/<id>`. Un pedido vale 5 minutos o hasta que el terminal lo cancela.

Quien escanea el QR paga con la cuenta de una tarjeta suya, con su mismo permiso de gasto, su
bloqueo y su límite diario:

- **Con la billetera de Paizap** (`POST /api/pedidos/<id>/pagar {uid}`, con sesión): la firma de la
  cuenta ya prueba quién paga, así que no hace falta PIN. La página `/p/<id>` pasa sola a la
  billetera si está en ese navegador, y en Android ofrece abrir la app (`toki://pagar/<id>`).
- **Sin la billetera** (`POST /p/<id>/pagar {codigo, pin}`): la página `/p/<id>` es liviana, no
  depende de la web y pide el código de cuenta (6 dígitos) y el PIN (4 dígitos) de la tarjeta.
  Lleva la marca Paizap (ver la identidad visual en el README de `app/`); el logo y la letra los
  toma de la web y, si el servidor corre sin ella, usa la letra del sistema.
  Del PIN se guarda solo su hash; tras 5 intentos fallidos, el código queda bloqueado 10 minutos.

El PIN lo crea el dueño desde la app (`POST /api/tarjetas/<uid>/pin`) y se muestra una sola vez.
Las tarjetas registradas sin la app lo reciben al registrarlas, y `POST /tarjetas/pin {uid}`
(administración) entrega uno nuevo.

## Lo que usa la app (web y celular)

No hay usuario ni contraseña: la app abre sesión con la cuenta Stellar (SEP-10). El servidor
entrega un reto, la app lo firma con la llave de la cuenta y recibe una sesión. La llave nunca
llega al servidor.

| Ruta | Para |
|---|---|
| `GET /api/info` | Red, moneda y cuentas de Paizap y del comercio |
| `GET /api/sesion/reto?cuenta=G…` · `POST /api/sesion {reto}` | Abrir sesión firmando el reto |
| `GET /api/cuenta` | Saldo, permiso de gasto con su vencimiento, tarjetas y movimientos |
| `POST /api/cuenta/recarga` | Recarga de prueba (solo testnet); la primera crea la cuenta |
| `POST /api/permiso/preparar {monto, dias}` | Arma el permiso de gasto para firmarlo en la app |
| `POST /api/permiso {xdr}` | Manda a la red el permiso ya firmado |
| `GET /api/tarjetas/nuevas` | Tarjetas sin dueño que el terminal vio en los últimos minutos |
| `POST /api/tarjetas {uid, nombre}` | Vincular una tarjeta a mi cuenta |
| `PATCH /api/tarjetas/<uid> {nombre, bloqueada, limiteDiario}` · `DELETE` | Nombre, bloqueo y límite diario; desvincular |
| `POST /api/tarjetas/<uid>/pin` | PIN nuevo para pagar con el QR desde un celular sin la billetera |
| `GET /api/pedidos/<id>` | Datos de un cobro que espera pago (sin sesión) |
| `POST /api/pedidos/<id>/pagar {uid}` | Pagar ese cobro con una tarjeta mía, sin acercarla |
| `GET /api/movimientos` | Cobros de mis tarjetas (con tarjeta o con QR), recargas y permisos |
| `GET /api/panel` | Ventas de hoy en vivo y el cobro en espera. Solo para la cuenta del comercio |
| `GET /api/recibos/<código>` | Datos de un recibo (sin sesión) |

**El permiso de gasto lo firma el dueño.** El servidor arma el `approve`, la app comprueba que
diga lo que el dueño pidió, lo firma en el dispositivo y lo devuelve. El servidor solo manda a la
red lo que es exactamente un `approve` de este token, de la cuenta de la sesión para Paizap, y paga
su comisión (*fee bump*): el dueño no necesita XLM para firmar.

**Bloqueo y límite diario.** El dueño bloquea una tarjeta o le fija un límite diario desde la app.
El límite se calcula con el historial de cobros (`datos/historial.json`), así que sobrevive a un
reinicio. El día es el de `ZONA_HORARIA` (por defecto `America/La_Paz`).

## Administración

Con la cabecera `X-Admin-Token`:

- `POST /tarjetas {uid, cuenta?}`: registra una tarjeta. Sin cuenta, crea un cliente de testnet
  con su permiso de gasto firmado por el servidor (sirve para probar sin la app). Responde con el
  código de cuenta y el PIN para pagar con el QR.
- `POST /tarjetas/pin {uid}`: PIN nuevo para esa tarjeta.
- `GET /tarjetas` y `DELETE /tarjetas/<uid>`.

Hoy cobra en **XLM de testnet** (su contrato SAC). Para cobrar en USDC basta con poner su
contrato en `TOKEN_CONTRACT`; la app muestra el código que responde el contrato. La tarjeta se
identifica por su UID; la verificación de la NTAG 424 DNA (SUN) viene después.

## Correr

Todo en Docker y con los secretos en Doppler (proyecto `toki`, config `dev`). La imagen se
construye desde la raíz del repo, porque lleva el servidor y la web:

```bash
# Una vez: crea las cuentas de testnet (toki, comercio, cliente) y el permiso de gasto del cliente
docker build -t toki-servidor -f servidor/Dockerfile .
docker run --rm toki-servidor node src/preparar-testnet.mjs > testnet.json
doppler secrets upload testnet.json --project toki --config dev && rm testnet.json

# Servidor (puerto 8090) y túnel público, para que el terminal, la web y el celular lo alcancen
# desde cualquier red
cd servidor
doppler run --project toki --config dev -- docker compose --profile tunel up -d --build
docker compose logs tunel | grep bore.pub          # dirección pública: http://bore.pub:<puerto>
```

La web queda en `http://localhost:8090` y en la dirección del túnel. El dueño de una tarjeta crea
su cuenta ahí mismo; el comercio entra con la llave de su cuenta (`COMERCIO_SECRET`). El nombre
del comercio que ve quien paga con el QR sale de `COMERCIO_NOMBRE`.

Para levantar una segunda copia sin tocar la primera (otro puerto, otros datos):
`PUERTO_HOST=8091 docker compose -p toki-prueba up -d --build`.

```bash
# Prueba sin terminal: cobra 1.25 y comprueba que el saldo del comercio subió
doppler run --project toki --config dev -- docker run --rm --network host -e COMERCIO_PUBLIC \
  -e TERMINAL_TOKEN -e SERVIDOR_URL=http://localhost:8090 toki-servidor node src/prueba-cobro.mjs 1.25
```

## Registrar una tarjeta

**Desde la app (lo normal).** Pide un cobro en el terminal y acerca la tarjeta nueva: el terminal
muestra «No registrada» y su UID. En la app, «Vincular tarjeta» ofrece esa tarjeta; también se
puede escribir el UID.

**Sin la app**, con un cliente de prueba creado por el servidor:

```bash
doppler run --project toki --config dev -- docker run --rm --network host -e ADMIN_TOKEN -e SERVIDOR_URL=http://localhost:8090 toki-servidor node src/registrar-tarjeta.mjs 04:11:22:33:44:55:66
```

Para pasar a la app una tarjeta que ya estaba registrada así, primero se quita
(`node src/quitar-tarjeta.mjs <UID>`, con las mismas variables) y después se vincula desde la app.

## Pruebas contra testnet

Cada prueba mira la red, no solo la respuesta del servidor.

```bash
# El terminal: tarjeta desconocida, registro, cobro, reintento sin doble cobro, pago con QR
# (código y PIN) y límite diario
doppler run --project toki --config dev -- docker run --rm --network host -e COMERCIO_PUBLIC -e TERMINAL_TOKEN -e ADMIN_TOKEN -e SERVIDOR_URL=http://localhost:8090 toki-servidor node src/pruebas.mjs

# La app: sesión con la cuenta, recarga, permiso firmado por el dueño, vincular, pagar con la
# tarjeta y con el QR, PIN, bloquear, límite diario y panel del comercio
doppler run --project toki --config dev -- docker run --rm --network host -e COMERCIO_SECRET -e TERMINAL_TOKEN -e SERVIDOR_URL=http://localhost:8090 toki-servidor node src/pruebas-app.mjs
```

## Probar con el terminal simulado

Desde `hardware/firmware`, compila el simulador con la URL del túnel y corre la prueba en Wokwi:

```bash
doppler run --project toki --config dev -- docker run --rm -e TERMINAL_TOKEN \
  -e TOKI_SERVIDOR_URL=http://bore.pub:<puerto> -v "$PWD":/work -v toki-pio-cache:/root/.platformio \
  toki-pio run -e sim-esp32
doppler run --project toki --config dev -- docker run --rm -e WOKWI_CLI_TOKEN -v "$PWD":/work \
  --entrypoint wokwi-cli toki-pio sim/esp32 --scenario cobro.test.yaml --timeout 90000
```

Con la placa real se usa la misma dirección pública del túnel: así el terminal alcanza al
servidor desde cualquier Wi-Fi y el QR del recibo abre en cualquier celular. El puerto del túnel
es fijo (`TUNEL_PUERTO` en `compose.yaml`) para que la dirección grabada en el terminal no cambie.
Si el terminal y este PC están en la misma red, también sirve `http://<IP de este PC>:8090`.

## Pendiente

- Verificar la NTAG 424 DNA (SUN) en vez de confiar en el UID. Hasta entonces, cualquiera que
  conozca el UID de una tarjeta sin dueño puede vincularla.
- HTTPS entre el terminal, la app y el servidor (hoy el túnel de pruebas es HTTP sin cifrar).
- Devolver el dinero cuando un cobro se hizo pero el terminal nunca llegó a entregar.
- USDC en vez de XLM.
- Recarga real desde la app (hoy solo la recarga de prueba de testnet).
