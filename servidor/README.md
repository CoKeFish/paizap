# Servidor de Toki (MVP)

Recibe el toque de la tarjeta desde el terminal y cobra en Stellar con el **permiso de gasto**
(`approve` / `transfer_from`) del contrato del token. Toki firma, pero la red no le deja pasar del
tope que autorizó el dueño de la cuenta.

```
Terminal ──POST /cobros {uid, monto}──► Servidor ──transfer_from(toki, cliente, comercio, monto)──► Stellar
```

- `POST /cobros` con la cabecera `X-Terminal-Token`: busca la cuenta de la tarjeta, revisa el
  límite diario y cobra. Responde `{ok, hash, permisoRestante, saldoCliente, hoyRestante}` o
  `{ok:false, motivo}`.
- `POST /tarjetas {uid, cuenta?}` con la cabecera `X-Admin-Token`: registra una tarjeta. Sin
  cuenta, crea un cliente de testnet con su permiso de gasto (en producción lo firma el dueño
  desde la app). Las tarjetas se guardan en el volumen `datos`.
- `GET /salud`: red, token y comercio.

Cada cobro lleva un `id`: si el terminal reintenta porque no le llegó la respuesta, recibe la
misma y no se cobra dos veces. Una tarjeta no registrada se rechaza con su UID, que el terminal
muestra en pantalla.

Hoy cobra en **XLM de testnet** (su contrato SAC). Para cobrar en USDC basta con poner su
contrato en `TOKEN_CONTRACT`. La tarjeta se identifica por su UID; la verificación de la
NTAG 424 DNA (SUN) viene después.

## Correr

Todo en Docker y con los secretos en Doppler (proyecto `toki`, config `dev`):

```bash
# Una vez: crea las cuentas de testnet (toki, comercio, cliente) y el permiso de gasto del cliente
docker build -t toki-servidor .
docker run --rm toki-servidor node src/preparar-testnet.mjs > testnet.json
doppler secrets upload testnet.json --project toki --config dev && rm testnet.json

# Servidor (puerto 8090) y túnel público para el simulador
doppler run --project toki --config dev -- docker compose --profile tunel up -d --build
docker compose logs tunel | grep bore.pub          # URL pública, p. ej. http://bore.pub:7939

# Prueba sin terminal: cobra 1.25 y comprueba que el saldo del comercio subió
doppler run --project toki --config dev -- docker run --rm --network host -e COMERCIO_PUBLIC \
  -e TERMINAL_TOKEN -e SERVIDOR_URL=http://localhost:8090 toki-servidor node src/prueba-cobro.mjs 1.25
```

## Registrar una tarjeta

Acerca la tarjeta: el terminal muestra «No registrada» y su UID. Luego:

```bash
doppler run --project toki --config dev -- docker run --rm --network host -e ADMIN_TOKEN -e SERVIDOR_URL=http://localhost:8090 toki-servidor node src/registrar-tarjeta.mjs 04:11:22:33:44:55:66
```

## Pruebas contra testnet

Tarjeta desconocida, registro, cobro, reintento sin doble cobro y límite diario, comprobados en la
red:

```bash
doppler run --project toki --config dev -- docker run --rm --network host -e COMERCIO_PUBLIC -e TERMINAL_TOKEN -e ADMIN_TOKEN -e SERVIDOR_URL=http://localhost:8090 toki-servidor node src/pruebas.mjs
```

## Probar con el terminal simulado

Desde `hardware/firmware`, compila el simulador con la URL del túnel y corre la prueba en Wokwi:

```bash
doppler run --project toki --config dev -- docker run --rm -e TERMINAL_TOKEN \
  -e TOKI_SERVIDOR_URL=http://bore.pub:7939 -v "$PWD":/work -v toki-pio-cache:/root/.platformio \
  toki-pio run -e sim-esp32
doppler run --project toki --config dev -- docker run --rm -e WOKWI_CLI_TOKEN -v "$PWD":/work \
  --entrypoint wokwi-cli toki-pio sim/esp32 --scenario cobro.test.yaml --timeout 90000
```

Con la placa real, el terminal y este PC en la misma red Wi-Fi, la URL es
`http://<IP de este PC>:8090`, y la red se pasa con `TOKI_WIFI_SSID` y `TOKI_WIFI_CLAVE`.

## Pendiente

- Verificar la NTAG 424 DNA (SUN) en vez de confiar en el UID.
- HTTPS entre el terminal y el servidor (hoy el túnel de pruebas es HTTP sin cifrar).
- Guardar los límites diarios en una base de datos (hoy viven en memoria).
- USDC en vez de XLM.
