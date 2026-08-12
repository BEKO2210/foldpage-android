# Übergabe an die nächste Sitzung — 12. August 2026, spät

Stand: **1.11 / versionCode 13**, gebaut, auf GitHub als reguläres Release
(kein Beta) veröffentlicht, AAB liegt bereit für die Play Console. Alles
Dauerhafte steht in `docs/ARCHITECTURE.md` (Aufbau), `docs/ROADMAP.md` (was
ansteht), `docs/SPEECH.md` (Vorlesen, mit Messwerten) und `docs/MOTION.md`.

## Wo es steht

- **Vorlesen richtet sich selbst ein.** Eine Sprache, eine Stimme: `autoConfigure()`
  wählt über alle installierten Engines die beste lokale Stimme je Sprache
  (`pickBestSetup` in `lib/voice.ts`). Die Auswahl von Sprache, Engine und
  Stimme ist **entfernt** — einstellbar bleiben Tempo, Tonhöhe, Pausen.
- **Eigenes Sprach-Plugin** (`android/.../SpeechPlugin.java`) spricht über eine
  benannte Engine, weil das Telefon nur *eine* Standard-Engine hat und die
  Bibliothek mehrere Sprachen. Manifest braucht dafür `<queries>` mit
  `TTS_SERVICE`.
- **Sperrbildschirm** über MediaSession + MediaStyle-Benachrichtigung,
  **Fortsetzen** über eine gemerkte Blockposition (nur als Angebot, nie
  automatisch).
- **C6, C7, C3 sind erledigt** (Tiefe aus Zustand, Sprungmarken in den
  Einstellungen, geteilte Element-Bewegung in den Artikel).
- **Ein 8-Agenten-Lauf** hat 16 bestätigte Fehler gefunden, alle behoben
  (Commit `dae8c1b`): Blockindex-Drift zwischen Stimme und Markierung,
  Sperrbildschirm-Pause, Audio-Fokus, Lesefortschritt, Such-Race, CSV-Import,
  HTML-Export, `allowBackup`, klebende Kopfzeile, doppelter `.chip`-Block.

## Was als Nächstes ansteht

1. **Gerätetest unterwegs** durch Belkis mit der Release-APK. Erst wenn dabei
   nichts auffällt, geht es an UI-Verbesserungen.
2. **Nicht per Finger geprüft:** Pause/Stop aus der Medien-Benachrichtigung.
3. **Bewusst offen:** Hardware-Medientasten erreichen die App nicht, solange sie
   `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` hält (Begründung in `docs/SPEECH.md`).
4. Danach: C4 (Play-Aufnahmen aus dem Reader-Lab), C5, B7.4, D2/D3.

## Arbeitsweise, die sich bewährt hat

1. **Skills zuerst:** `superpowers:systematic-debugging` bei jedem Fehlerbild
   (Phase 1 zu Ende, bevor etwas geändert wird), `ui-ux-pro-max` bei allem, was
   Aussehen, Bedienung oder Bewegung ändert.
2. **Das Messgerät ist verdächtig, bevor es der Code ist.** In diesem Lauf war
   es dreimal selbst der Fehler (siehe `docs/SPEECH.md`).
3. **Belege statt Behauptungen:** `npm test`, `npm run corpus`,
   `node scripts/speech-audit.mjs`, `node scripts/a11y-audit.mjs`,
   `adb logcat` am Gerät.
4. **Bauen:** `JAVA_HOME=/opt/android-studio/android-studio/jbr`, dann
   `npm run sync && cd android && ./gradlew assembleRelease bundleRelease`.

## Lauf 3 (12.08. abends): die Stimme

- **Einstellbar:** Tempo (0,7–1,6×), Tonhöhe, Pausenlänge, Stimme — und die
  **Engine je Sprache**, über ein eigenes Plugin
  (`android/.../SpeechPlugin.java`). Ohne das bleibt Englisch stumm, sobald die
  deutsche neuronale Engine der System-Standard ist.
- **Am Gerät belegt:** Deutsch über sherpa-onnx (neuronal), Englisch über
  Googles Engine mit **29** lokalen Stimmen; Pausen zwischen Absätzen von
  1,80 s auf 0,23–0,35 s (Google) gebracht. Zahlen und Methode:
  `docs/SPEECH.md`.
- **Sprech-Text getrennt vom Lesetext** (`forTheEar()`): Überschriften bekommen
  einen Punkt, Fußnotenmarken und Aufzählungszeichen fallen weg, eine nackte URL
  wird zum Hostnamen. Absätze werden satzweise gesprochen — das kostet nichts,
  weil die Vorlaufzeit der Engine mit der Länge wächst.
- **Neues Messgerät:** `node scripts/speech-audit.mjs` →
  `corpus/speech-report.json`. Es war selbst dreimal der Fehler (siehe
  `docs/SPEECH.md`), unter anderem hat es 46 korrekte englische
  Anführungszeichen als Defekt gezählt — derselbe Denkfehler steckte im Code.
- **Grenze, die bleibt:** Die sherpa-Engine-APKs tragen alle denselben
  Paketnamen. Eine englische Piper-Stimme **ersetzt** damit die deutsche; beide
  neuronal gleichzeitig geht nur über ein in der App gebündeltes Modell (D0).

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
