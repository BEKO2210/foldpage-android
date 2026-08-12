#!/usr/bin/env bash
#
# Baut die signierte Release-APK.
#
#   scripts/release-build.sh              # Web-Build + cap sync + Release-APK
#   scripts/release-build.sh --skip-web   # nur Gradle, vorhandene Assets nutzen
#
# Die Signierungs-Passwoerter stehen in Infisical (Projekt "foldpage", Env "prod")
# und werden nur fuer die Dauer des Builds in android/keystore.properties
# geschrieben. Die Datei ist gitignored und wird am Ende immer geloescht.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROPS="$ROOT/android/keystore.properties"
INFISICAL_PROJECT_ID="f9b5b819-a8d7-4687-89ea-8ab48ee42ab1"
INFISICAL_ENV="prod"
INFISICAL_API="http://127.0.0.1:8320"

SKIP_WEB=0
[ "${1:-}" = "--skip-web" ] && SKIP_WEB=1

# shellcheck disable=SC1090
. "$HOME/.local/android/env.sh"

cleanup() { rm -f "$PROPS"; }
trap cleanup EXIT

if [ ! -f "$ROOT/android/local.properties" ]; then
  echo "sdk.dir=$ANDROID_HOME" > "$ROOT/android/local.properties"
fi

echo "==> Signierungsdaten aus Infisical holen"
TOKEN=$(bash "$HOME/infisical/inf-token.sh")
umask 077
python3 - "$INFISICAL_API" "$TOKEN" "$INFISICAL_PROJECT_ID" "$INFISICAL_ENV" "$PROPS" <<'PY'
import json, sys, urllib.parse, urllib.request

api, token, pid, env, out = sys.argv[1:6]
q = urllib.parse.urlencode({"workspaceId": pid, "environment": env, "secretPath": "/"})

def secret(name):
    req = urllib.request.Request(f"{api}/api/v3/secrets/raw/{name}?{q}",
                                 headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req) as r:
        return json.load(r)["secret"]["secretValue"]

store_pw = secret("ANDROID_KEYSTORE_PASSWORD")
# PKCS12 kennt kein getrenntes Key-Passwort; der Wert ist identisch mit dem Store-Passwort.
key_pw = secret("ANDROID_KEY_PASSWORD") or store_pw

with open(out, "w") as f:
    f.write("storeFile=%s\n" % secret("ANDROID_KEYSTORE_PATH"))
    f.write("keyAlias=%s\n" % secret("ANDROID_KEY_ALIAS"))
    f.write("storePassword=%s\n" % store_pw)
    f.write("keyPassword=%s\n" % key_pw)
PY
unset TOKEN
chmod 600 "$PROPS"

if [ "$SKIP_WEB" -eq 0 ]; then
  echo "==> Web-Build + Capacitor-Sync"
  ( cd "$ROOT" && npm run sync )
fi

echo "==> Gradle bundleRelease & assembleRelease"
( cd "$ROOT/android" && ./gradlew --no-daemon bundleRelease assembleRelease )

AAB="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"
APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
[ -f "$AAB" ] || { echo "AAB fehlt: $AAB"; exit 1; }
[ -f "$APK" ] || { echo "APK fehlt: $APK"; exit 1; }

echo "==> apksigner verify (APK)"
BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
"$BUILD_TOOLS/apksigner" verify --verbose --print-certs "$APK"

echo
echo "AAB (für Play Store): $AAB"
echo "APK (zum Testen): $APK"
ls -lh "$AAB" "$APK"
