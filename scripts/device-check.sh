#!/usr/bin/env bash
# Everything a phone on the other end of adb can be asked about reading aloud.
#
#   bash scripts/device-check.sh            # phone already connected
#   bash scripts/device-check.sh --install  # build, install, then ask
#
# Written for one purpose: "nothing happens" is not a fault report, and a
# device on a cable can answer in one minute what three test builds could not.
set -uo pipefail

ADB=${ADB:-adb}
PKG=de.ithandwerk.foldpage
APK=android/app/build/outputs/apk/release/app-release.apk

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

if ! $ADB get-state >/dev/null 2>&1; then
  echo "No device. Enable wireless debugging and pair, or plug in USB." >&2
  exit 1
fi

say "Device"
$ADB shell getprop ro.product.model
$ADB shell getprop ro.build.version.release
echo "SDK: $($ADB shell getprop ro.build.version.sdk | tr -d '\r')"

if [ "${1:-}" = "--install" ]; then
  say "Installing $APK"
  $ADB install -r "$APK"
fi

say "Speech engines the system knows"
# Every installed engine registers an activity for this action; if the list is
# empty, nothing on this phone can speak and no app can change that.
$ADB shell "pm query-activities -a android.intent.action.TTS_SERVICE 2>/dev/null | grep -E 'packageName|name=' | sort -u" \
  || $ADB shell "cmd package query-activities -a android.intent.action.TTS_SERVICE"

say "The engine the system is set to use"
$ADB shell settings get secure tts_default_synth
echo "rate: $($ADB shell settings get secure tts_default_rate | tr -d '\r')  locale: $($ADB shell settings get secure tts_default_locale | tr -d '\r')"

say "Media volume (speech plays on this stream, not the ringer)"
$ADB shell "dumpsys audio | grep -A3 'STREAM_MUSIC' | head -8"

say "Is FoldPage installed, and which version"
$ADB shell dumpsys package $PKG | grep -E "versionName|versionCode|firstInstallTime|lastUpdateTime" | head -4

say "Does the INSTALLED build actually contain the voice check?"
# The most boring explanation for "nothing happens when I press it" is that the
# button is not in the build on the phone. Three betas carry the same
# versionCode 11, so nothing in the interface would say which one is installed.
# This settles it by looking inside the APK the system is really running.
REMOTE=$($ADB shell pm path $PKG | head -1 | tr -d '\r' | sed 's/^package://')
if [ -n "$REMOTE" ]; then
  TMP=$(mktemp -d)
  $ADB pull "$REMOTE" "$TMP/installed.apk" >/dev/null 2>&1
  echo "pulled: $REMOTE"
  if unzip -p "$TMP/installed.apk" 'assets/public/_next/static/chunks/*.js' 2>/dev/null | grep -q "Check the voice"; then
    echo "  ✓ the installed build HAS the voice check"
  else
    echo "  ✗ the installed build does NOT have the voice check — it is an older beta"
  fi
  if unzip -p "$TMP/installed.apk" assets/capacitor.plugins.json 2>/dev/null | grep -q text-to-speech; then
    echo "  ✓ the speech plugin is registered in the installed build"
  else
    echo "  ✗ the speech plugin is NOT registered in the installed build"
  fi
  rm -rf "$TMP"
fi

say "Watching the log — now open the app and press 'Check the voice'"
echo "(Ctrl-C to stop)"
$ADB logcat -c
$ADB logcat -v brief \
  Capacitor:V Capacitor/Console:V TextToSpeech:V TtsEngines:V TTS:V \
  SpeechService:V AudioTrack:V "$PKG":V chromium:E AndroidRuntime:E '*:S'
