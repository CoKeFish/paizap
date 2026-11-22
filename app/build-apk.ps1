# Compila la web, la sincroniza con Android y genera el APK de debug.
#
#   npm run apk
#
# La app trae de fábrica la dirección del servidor de Toki (después se puede cambiar dentro de la
# app, en «Mi cuenta»). Por defecto es el túnel de pruebas; para otra:
#
#   $env:VITE_SERVIDOR_URL = 'http://192.168.1.6:8090'; npm run apk
$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
if (-not $env:VITE_SERVIDOR_URL) { $env:VITE_SERVIDOR_URL = 'http://bore.pub:48123' }

npm run build
if ($LASTEXITCODE) { exit $LASTEXITCODE }
npx cap sync android
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Push-Location android
.\gradlew.bat assembleDebug --no-daemon -q
$resultado = $LASTEXITCODE
Pop-Location
if ($resultado) { exit $resultado }

Copy-Item android\app\build\outputs\apk\debug\app-debug.apk paizap.apk -Force
Write-Host "APK listo: app\paizap.apk (servidor de fábrica: $env:VITE_SERVIDOR_URL)"
