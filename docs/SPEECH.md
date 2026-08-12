# Vorlesen — wie es klingt, und woher die Zahlen kommen

Alles hier ist am Gerät gemessen (Galaxy S23 Ultra, `SM-S918B`, Android 16), mit
`adb logcat`-Zeitstempeln zwischen dem Ende einer Äußerung und dem hörbaren
Beginn der nächsten. Der Code steht in `lib/readAloud.ts` (Text), `lib/voice.ts`
(Einstellungen und Pausen), `lib/speech.ts` (Player) und
`android/.../SpeechPlugin.java` (Engine-Ansteuerung).

## Eine Engine reicht nicht

Ein Telefon hat **eine** Standard-Engine, eine Bibliothek hat mehrere Sprachen.
Auf diesem Gerät:

| Engine | Stimmen | Klang |
|---|---|---|
| `com.k2fsa.sherpa.onnx.tts.engine` (Piper, neuronal) | **1** — nur Deutsch | modern |
| `com.google.android.tts` | **29** für Englisch, dazu Deutsch | älter |

Welche man auch als System-Standard setzt, die halbe Bibliothek verliert. Darum
wählt FoldPage die Engine **je Sprache** (`VoicePrefs.engines`), spricht über ein
eigenes Plugin (`SpeechPlugin.java`) und fällt auf die System-Engine zurück,
solange nichts gewählt ist.

⚠️ **Falle:** Ohne `<queries><intent><action android:name="android.intent.action.TTS_SERVICE"/>`
im Manifest meldet Android seit Version 11 **genau eine** Engine — die
Standard-Engine — egal wie viele installiert sind. Kein Fehler, kein Logeintrag.

## Pausen: was die App hinzufügt, und was die Engine schon tut

Gemessene Stille zwischen zwei Absätzen, jeweils Gesamtwert:

| Engine | vor der Messung | nach der Korrektur |
|---|---:|---:|
| sherpa-onnx (neuronal) | **1,80 s** | 0,95–1,80 s |
| Google TTS | — | **0,23–0,35 s** |

Die neuronale Engine synthetisiert die ganze Äußerung, bevor der erste Ton
kommt; diese Vorlaufzeit ist **längenproportional** — rund 7 % der Sprechdauer
(2,4 s Audio → 0,23 s Vorlauf; 20 s Audio → 1,6 s). Die erste Fassung legte
darauf noch 350 ms je Absatz, Ergebnis 1,8 s: klingt nach Fehler, nicht nach
Atmen. Halbiert (`GAP_BEFORE` in `lib/voice.ts`), die Form blieb: Überschrift
450 ms, Absatz 180 ms, Listenpunkt 100 ms, Zitat/Bildunterschrift 300 ms,
zwischen zwei Sätzen 120 ms. Der Regler „Pauses" skaliert alles mit 0,4 / 1 /
1,8.

**Warum Sätze einzeln gesprochen werden:** Weil der Vorlauf mit der Länge wächst,
kostet das Aufteilen eines Absatzes in Sätze **nichts** — drei kleine Vorläufe
statt eines großen. Was sich ändert: Die Stille landet an den Satzenden, wo ein
Mensch atmet, und die ersten Worte kommen früher.

## Was der Sprech-Text anders macht als der Lesetext

`node scripts/speech-audit.mjs` misst genau das über den Korpus
(`corpus/speech-report.json`). Erster Lauf → nach den Korrekturen:

| Befund | vorher | nachher |
|---|---:|---:|
| Überschrift ohne Satzzeichen | 1.828\* | **0** |
| Anführungszeichen am Wort klebend | 46 | **0** |
| Fußnotenmarke `[1]`, `[Bearbeiten]` | 176\* | **0** |
| Vorgelesene URL | 20 | **0** |
| Aufzählungszeichen am Satzanfang | 1 | **0** |
| Lange Großbuchstabenfolge | 65 | 65 (bewusst) |
| Äußerung über 400 Zeichen | 6 | 5 (bewusst) |

\* Die erste Zahl zählte alle Blöcke ohne Schlusszeichen bzw. jede Klammer; die
Prüfung wurde danach auf das eingegrenzt, was hörbar falsch ist — siehe unten.

Die Eingriffe stehen in `forTheEar()` (`lib/readAloud.ts`) und gelten **nur** für
die Stimme; auf dem Bildschirm bleibt der Artikel unverändert.

## Das Messgerät war dreimal selbst der Fehler

1. **„Shouty"** schlug bei vier Großbuchstaben an — also bei `HTTP`, `NASA`,
   `CDU`. Die spricht jede Engine wie ein Mensch. Auf sechs erhöht.
2. **Klammern** galten pauschal als Befund. `[Update]` liest eine Engine normal;
   Ärger machen nur Fußnotenziffern und Wiki-Bearbeiten-Links.
3. **Anführungszeichen**: Die Prüfung zählte erst 53 korrekte deutsche
   Guillemets (`»Das`), dann 46 korrekte englische Öffnungszeichen (`“Because`)
   als Fehler. `»` `«` und `“` öffnen in der einen Sprache und schließen in der
   anderen — sie haben keine feste Seite. Nur `„` (öffnet) und `”` (schließt)
   sind eindeutig.

Genau derselbe Fehler steckte auch im **Code**: `plainText()` führte `“` als
Öffner und entfernte das Leerzeichen dahinter — daher `„Rente mit 63“fordert`,
von der Engine als ein Wort gelesen. Behoben und in `lib/readAloud.test.ts`
festgehalten.

## Was bewusst offen bleibt

- **Großbuchstabenfolgen** (65) sind Marken und Schlagzeilen (`THE‑DECODER‑Abo`).
  Sie kleinzuschreiben würde Namen verfälschen.
- **Fünf Äußerungen über 400 Zeichen** sind einzelne, wirklich lange Sätze. Ein
  Schnitt mitten hinein wäre schlimmer als der lange Atem.
- **Sperrbildschirm und Fortsetzen nach Neustart** (D1-Rest) fehlen weiterhin.

## Sperrbildschirm und Fortsetzen (12.08.2026, D1-Rest)

**Fortsetzen nach Neustart.** Die Stelle wird je Block in `localStorage`
geschrieben (`fp-speech-at`, ein Eintrag: der zuletzt vorgelesene Artikel).
Beim Öffnen desselben Artikels steht die Marke wieder dort — als **Position**,
nicht als Wiedergabe: ein Telefon, das beim Entsperren von selbst zu reden
anfängt, ist ein Schreck. Der Reader bietet stattdessen „Reading aloud stopped
at part N of M. **Continue**". Ist der Artikel durchgelaufen, wird die Marke
gelöscht.

**Sperrbildschirm.** `SpeechPlugin` hält eine `MediaSessionCompat` samt
MediaStyle-Benachrichtigung, solange gesprochen wird; Play/Pause/Stop kommen
über `SpeechControlReceiver` zurück in denselben Player, den auch die Knöpfe in
der App bedienen.

Am Gerät belegt (`dumpsys media_session`):

```
FoldPage de.ithandwerk.foldpage/FoldPage/149 (userId=0)
  mediaButtonReceiver=MBR {... SpeechControlReceiver}
  active=true
  state=PlaybackState {state=PLAYING(3), ... actions=519}
  metadata: description=Partielle Sonnenfinsternis: Wo sie in Hamburg gut zu sehen ist, FoldPage
```

⚠️ **Zwei gemessene Grenzen, bewusst so:**

1. `Media button session is null` — Hardware-Medientasten (Headset, Auto)
   landen auf diesem Gerät nicht bei uns. Grund ist die Fokus-Art: FoldPage
   nimmt `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`, damit ein Navigationshinweis den
   Artikel **leiser** macht statt ihn zu beenden. Vollen `GAIN` zu nehmen würde
   die Tasten bringen und das Ducking kosten. Die Wahl steht zur Diskussion,
   ist aber keine Panne.
2. Die sichtbare „Now bar" auf dem Sperrbildschirm zeigte im Test die
   Samsung-TV-Sitzung, nicht FoldPage — bei mehreren aktiven Sitzungen wählt
   One UI selbst. Die FoldPage-Benachrichtigung ist da (im Log als
   `0|de.ithandwerk.foldpage|4711| ... ACTIONS: Pausieren`), sie liegt im
   Benachrichtigungs-Schatten.
   **Noch nicht am Gerät geprüft:** ob Pause/Stop aus dieser Benachrichtigung
   den Player wirklich anhalten — die Kette ist gebaut und der Receiver ist
   registriert, aber ein Fingerdruck darauf steht aus.

⚠️ `POST_NOTIFICATIONS` steht auf `granted=false` und die Benachrichtigung
erschien trotzdem, weil Medien-Benachrichtigungen einen eigenen Weg gehen. Auf
einem Gerät ohne diesen Weg fehlen die Steuerungen — der Artikel liest
weiter, das ist der bewusste Rückfall.
