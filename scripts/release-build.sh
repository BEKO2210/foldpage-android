#!/usr/bin/env bash
#
# STILLGELEGT seit 1.5.
#
# Dieses Skript hat die Release-Builds mit dem alten Keystore signiert und die
# Passwoerter dafuer aus Infisical (Projekt "foldpage", Env "prod") geholt. Beides
# gilt nicht mehr:
#
#   * Signiert wird ab 1.5 mit dem Play-Upload-Key
#     (`~/Android APP KEY/FOLDPAGE.jks`, Alias `key0`), Zugangsdaten stehen in
#     `android/keystore.properties` — siehe docs/RELEASE.md.
#   * Ausgeliefert wird ueber den Play Store, nicht mehr als APK von Hand.
#
# Gefaehrlich waere ein Lauf zusaetzlich deshalb: das alte `trap cleanup EXIT`
# hat `android/keystore.properties` am Ende geloescht — also genau die Datei, die
# der heutige Signiervorgang braucht.
#
# Release-Build heute: in Android Studio ueber
#   Build > Generate Signed App Bundle / APK
# oder auf der Kommandozeile
#   npm run sync && cd android && ./gradlew bundleRelease
# Das AAB aus `android/app/build/outputs/bundle/release/` geht in die Play Console.
set -euo pipefail

cat >&2 <<'MSG'
release-build.sh ist stillgelegt.

Der alte Infisical-Keystore wird nicht mehr verwendet. Signiert wird mit dem
Play-Upload-Key aus android/keystore.properties.

Release bauen:
    npm run sync && cd android && ./gradlew bundleRelease

Danach das AAB aus android/app/build/outputs/bundle/release/ in der Play Console
hochladen. Details: docs/RELEASE.md
MSG
exit 1
