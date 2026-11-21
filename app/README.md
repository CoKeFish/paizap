# App de Toki (web y Android)

Una sola base de código (React + Tailwind) que sale de dos formas:

- **Web:** la entrega el [servidor de Toki](../servidor/README.md) en su misma dirección.
- **App de Android:** la misma web dentro de una app nativa (Capacitor), que se compila como APK.

Según la cuenta con la que se entra, muestra una de dos cosas:

| Quién entra | Qué ve |
|---|---|
| **El dueño de una tarjeta** (cualquier cuenta) | Su billetera: saldo, recarga, tope de gasto, tarjetas y movimientos |
| **El comercio** (la cuenta que recibe los pagos) | Su panel: las ventas de hoy, a medida que llegan del terminal |

Además, `#/recibo/<código>` es el recibo que abre el QR del terminal (no pide cuenta) y
`#/pagar/<id>` es la pantalla para pagar un cobro del terminal sin acercar la tarjeta.

## Pagar con el QR del terminal

Mientras espera el pago, el terminal muestra un QR. Quien lo escanea con la cámara del celular
paga de una de tres formas, todas con la cuenta de una tarjeta suya (mismo tope de gasto, mismo
bloqueo y mismo límite diario):

| Desde | Cómo |
|---|---|
| **El navegador donde está la billetera** | La página del QR pasa sola a la billetera: un botón «Pagar», sin PIN |
| **Un celular con la app de Android** | En la página del QR, «Abrir en la app de Toki» (`toki://pagar/<id>`) y «Pagar» |
| **Cualquier otro celular** | La página del QR pide el código de cuenta (6 dígitos) y un PIN (4 dígitos) |

El código de cuenta y el PIN se crean en la billetera, en la tarjeta: «Nombre, límite y PIN». El
PIN se muestra una sola vez; el servidor guarda solo su hash.

## La billetera

- **Cuenta sin contraseña.** «Crear mi cuenta» genera una llave de Stellar y la guarda solo en el
  dispositivo. El servidor nunca la ve. En «Mi cuenta» se copia la llave para respaldarla o para
  entrar desde otro celular.
- **Recargar.** Muestra la dirección y el QR de la cuenta para recibir desde otra billetera. En
  testnet hay una recarga de prueba: la primera crea la cuenta en la red.
- **Tope de gasto.** Es el permiso de gasto (`approve`) del contrato del token: el dueño elige un
  monto y un vencimiento, y lo firma en su dispositivo. Toki puede cobrar hasta ese monto y la
  red no deja pasar de ahí. Toki paga la comisión de esa firma, así que el dueño no necesita XLM.
- **Tarjetas.** Vincular una tarjeta nueva (la app ofrece las que el terminal acaba de ver, o se
  escribe su UID), ponerle nombre, bloquearla, fijarle un límite diario y crear su PIN para pagar
  con el QR.
- **Movimientos.** Cada pago con su recibo (y si fue con la tarjeta o con el QR), los rechazos
  con su motivo, las recargas y los topes firmados.

## El panel del comercio

Entra con la llave de la cuenta del comercio (`COMERCIO_SECRET`). Muestra lo vendido hoy, los
cobros aprobados y rechazados (y cuáles se pagaron con QR), el cobro que el terminal tiene en
espera, el saldo de la cuenta en Stellar, las ventas por producto y por hora, y el último
contacto del terminal. Se actualiza solo cada pocos segundos.

## Qué firma la app y qué comprueba antes

La llave firma dos cosas, y la app lee lo que le mandó el servidor antes de firmar
(`src/lib/billetera.ts`):

1. **El inicio de sesión** (SEP-10). Solo firma si es un reto: secuencia 0 y nada más que
   operaciones de datos, o sea, algo que no se puede mandar a la red.
2. **El permiso de gasto.** Solo firma si es una única operación `approve` en el contrato del
   token, de su cuenta para la cuenta de Toki y por el monto que el dueño escribió.

## Correr

Con el servidor levantado (ver su README), la web ya está en su dirección: `http://localhost:8090`
o la del túnel. Para trabajar en la interfaz con recarga en caliente:

```bash
cd app
npm install
VITE_SERVIDOR_URL=http://localhost:8090 npm run dev     # http://localhost:5180
```

## APK de Android

```bash
npm run apk          # compila la web, la pasa a Android y deja app/toki.apk
npm run cap:open     # abre el proyecto en Android Studio
```

Usa el JDK de Android Studio y el SDK de Android del PC (ver `build-apk.ps1`). El APK trae de
fábrica la dirección del túnel de pruebas (`http://bore.pub:48123`); para otra, define
`VITE_SERVIDOR_URL` antes de compilar. Dentro de la app también se cambia, en «Mi cuenta».

Para instalarlo en un celular, pasa `toki.apk` por WhatsApp o Drive y permite «Instalar apps
desconocidas». En el emulador: `adb install -r toki.apk` (desde el emulador, el PC es
`http://10.0.2.2:8090`).

## Dónde cambiar cosas

- **Colores y letra:** `src/index.css` (`@theme`). La marca todavía no está definida; todo sale
  de esos valores.
- **Piezas de interfaz:** `src/components/ui.tsx`.
- **Pantallas:** `src/pages/` (`Entrada`, `Billetera`, `Panel`, `Pagar`, `Recibo`, `Ajustes`).
- **Página liviana del QR de pago** (código y PIN, sin la web): `servidor/src/pagina-pago.mjs`.
- **Conexión con el servidor y tipos de sus respuestas:** `src/lib/api.ts`.
- **Ícono y nombre de la app:** `android/app/src/main/res/` y `capacitor.config.ts`.

## Pendiente

- Guardar la llave en el almacén seguro del sistema (hoy está en el almacenamiento de la app) o
  pasar a billeteras con inicio de sesión social (Pollar).
- Leer la tarjeta con el NFC del celular para vincularla sin pasar por el terminal.
- Escanear el QR de pago desde dentro de la app (hoy se escanea con la cámara del celular y la
  página ofrece abrir la app).
- Pagar con el QR sin tener ninguna tarjeta vinculada (hoy el pago usa la cuenta y el límite
  diario de una tarjeta).
- Versión para iPhone (Capacitor la soporta; hace falta una Mac para compilarla).
- Recarga real: hoy solo existe la recarga de prueba de testnet.
