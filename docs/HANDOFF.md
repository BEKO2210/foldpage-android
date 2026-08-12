# Übergabe an die nächste Sitzung — 12. August 2026, abends

Stand nach einem langen Tag am Gerät. Diese Datei ist der Einstieg für ein
frisches Fenster; alles Dauerhafte steht in `docs/ARCHITECTURE.md` (Aufbau),
`docs/ROADMAP.md` (was ansteht) und `docs/FUTURE-PROOFING.md` (Fristen).

## Wo wir stehen

- **Version 1.9 (`versionCode 11`)** ist gebaut, im Play-Store-Upload und als
  GitHub-Release. Seither sind **zwei Läufe** dazugekommen (Suchindex/Liste,
  Vorlesen) — der Release-Zähler steht bei **2 von ~5**, die Versionsdateien
  bleiben bis dahin unberührt.
- **Vorlesen funktioniert am Gerät.** Zwei Fehler, beide gefunden und behoben:
  1. `registerPlugin()` liefert einen Proxy, bei dem jeder Zugriff ein
     Brückenaufruf ist — auch `.then`. Aus einer `async`-Funktion zurückgegeben,
     fragt JavaScript den Rückgabewert nach `.then`, der Proxy hält das für eine
     native Methode dieses Namens, ruft ins Leere, und das `await` kehrt **nie**
     zurück. Kein Fehler, keine Ablehnung, keine Logzeile. Gelöst durch
     `wrapEngine()` in `lib/readAloud.ts`, festgehalten von `lib/speech.test.ts`.
  2. Seit Android 16 schaltet „Audio Hardening" Wiedergabe stumm, die ein
     **anderer Prozess** für die App startet — und die Sprach-Engine ist immer
     ein anderer Prozess. `SystemSettingsPlugin.requestAudioFocus()` hält jetzt
     Fokus (`USAGE_MEDIA`/`CONTENT_TYPE_SPEECH`, transient mit Ducking) für die
     Dauer eines Artikels.
- **Neuronale Stimme installiert.** Auf dem S23 Ultra läuft
  `com.k2fsa.sherpa.onnx.tts.engine` (Piper `vits-piper-de_DE-thorsten-medium`,
  85 MB) als **System-Engine**, gesetzt über
  `settings put secure tts_default_synth`. FoldPage benutzt immer die
  System-Engine — die App musste dafür **nicht** geändert werden.

## Was am Gerät geprüft ist

`adb` läuft über USB (`SM-S918B`). `bash scripts/device-check.sh` sammelt in
einem Lauf: Engines, gewählte Engine, Medien-Lautstärke, installierte Version —
und zieht die **installierte** APK, um hineinzusehen. Das war entscheidend:
drei Betas trugen denselben `versionCode 11`, und nichts in der Oberfläche sagt,
welche davon läuft.

## Arbeitsweise, die sich heute bewährt hat

1. **Skills zuerst.** `superpowers:systematic-debugging` bei jedem Fehlerbild
   (Phase 1 zu Ende führen, *bevor* etwas geändert wird),
   `ui-ux-pro-max` bei allem, was Aussehen, Bedienung oder Bewegung ändert. Der
   UI-Skill fand eine doppelte Haptik, die niemand gesucht hatte; der
   Debugging-Skill verhinderte drei weitere Blindschüsse.
2. **Das Messgerät ist verdächtig, bevor es der Code ist.** Heute dreimal:
   die Möbel-Erkennung war deutschsprachig und meldete englische Seiten als
   sauber; der Barrierefreiheits-Prüfer hielt Radio-Knöpfe für namenlos; er
   klickte vor der Hydration und meldete einen Fokus-Fehler, den es nicht gab.
   Eine Null im Bericht heißt „nichts gefunden", nicht „nichts da".
3. **Belege statt Behauptungen.** Jede Zahl in den Dokumenten stammt aus einem
   Lauf: `npm test`, `npm run corpus`, `npm run reader-render`,
   `node scripts/library-bench.mjs`, `node scripts/a11y-audit.mjs`.

## Was als Nächstes ansteht

In dieser Reihenfolge, sofern nichts dazwischenkommt:

1. **C6 zu Ende** — „Premium-Gefühl": Der Schwellen-Impuls beim Wischen ist
   gebaut; offen sind Tiefe aus Zustand (Karte senkt sich beim Drücken, Kopfzeile
   bekommt beim Scrollen eine Kante) und Feder-Übergänge zwischen Lade-, Leer-
   und Fehlerzuständen.
2. **C7 zu Ende** — die Einstellungen sind fünf Karten lang; Gliederung oder
   zweite Ebene.
3. **C3** — der Übergang in den Artikel (geteilte Element-Bewegung). Vorher das
   Zusammenspiel mit den `backwards`-Animationen klären, sonst schwebt die
   Bottom-Navigation wieder in der Bildschirmmitte.
4. **D1-Rest** — Sperrbildschirm-Steuerung (Media-Session) und Fortsetzen nach
   App-Neustart. Der Player merkt sich die Stelle heute nur innerhalb der
   Sitzung.
5. **D2/D3** — Zusammenfassung und Fragen. Erst messen, dann entscheiden, und
   **nur veröffentlichen, wenn die Qualität stimmt** — das ist Belkis' Bedingung,
   nicht ein Vorbehalt.

## Fallen, die heute Zeit gekostet haben

- Ein Capacitor-Plugin-Proxy darf **nie** direkt aus einer `async`-Funktion
  zurückgegeben werden (siehe oben).
- Das TTS-Plugin fasst `window` beim Laden an; als normaler Import bricht
  `npm run build`, weil die Reader-Route vorgerendert wird. Erst bei Bedarf
  laden.
- Ein `versionCode` ist verbraucht, sobald ein Bundle damit in der Play Console
  liegt. `npm run set-version -- 1.10` zieht alle drei Stellen gemeinsam.
- Play nimmt **keine** debuggable Artefakte: für den Store `bundleRelease`,
  für GitHub `assembleRelease`.
