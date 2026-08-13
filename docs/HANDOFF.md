# Übergabe an die nächste Sitzung — 13. August 2026, früh

Stand: **1.12 / versionCode 14**, gebaut und signiert. `app-release.aab`
(49 MB) liegt für die Play Console bereit, `app-release.apk` (122 MB, alle vier
ABIs) für GitHub. Alles Dauerhafte steht in `docs/ARCHITECTURE.md` (Aufbau),
`docs/SPEECH.md` (Vorlesen, mit Messwerten), `docs/UI-BASELINE.md` (die zwanzig
Läufe dieser Sitzung mit Zahlen), `docs/ROADMAP.md`, `docs/MOTION.md`,
`docs/CONTRAST.md`, `docs/A11Y.md`.

## Was sich in dieser Sitzung geändert hat

**FoldPage spricht jetzt mit eigenen Stimmen.** Das ist die grosse Änderung.
`sherpa-onnx` (Apache-2.0) steckt als AAR im APK, 31 Stimmen in 22 Sprachen
stehen als Download **in** der App bereit, je rund 21 MB, danach offline. Keine
zweite App mehr nötig. Katalog, Fluss, Routing und die Messungen, nach denen
die Stimmen ausgewählt wurden, stehen in `docs/SPEECH.md`.

⚠️ **Die App ist dadurch grösser:** Der Play-Download springt von rund 5 MB auf
rund 30 MB je Gerät (das AAB splittet nach ABI; die 122-MB-APK enthält alle
vier). Wenn das je stören sollte, wäre der nächste Schritt Play Feature
Delivery für die Engine — bewusst **nicht** gebaut, weil es Maschinerie für ein
Problem wäre, das noch niemand gemeldet hat.

**Der sichtbare Fluss** ist jetzt Sprache → Stimme: eine Zeile je Sprache, darin
**nur** deren Stimmen — FoldPages eigene zuerst, die des Telefons darunter, mit
Vorhören, Grösse, Fortschritt, Abbrechen, Wiederholen und Entfernen.

**Neue Messgeräte** (alle als npm-Skript, alle mit Bericht in `corpus/`):

| Befehl | Was er misst |
|---|---|
| `npm run ui:check` | Console-Fehler, Seitenfehler, tote Requests, waagerechter Überlauf **und** Seitwärts-Ziehbarkeit, drei Routen × zwei Viewports; Flags `--empty`, `--offline`, `--dark`, `--shots` |
| `npm run jargon` | Entwicklerwörter im gerenderten Text aller Routen |
| `npm run voice:check` | die Produktregel selbst: nur passende Stimmen je Sprache, Suche, Auswahl, Vorhören, Pakete, Tastatur, Reader-Sheet (27 Prüfungen) |
| `npm run keyboard` | Tab-Reihenfolge, Fokusringe, Namen, Escape (12 Prüfungen) |
| `npm run voices:catalogue` | erzeugt `lib/voicePacks.generated.ts` aus dem Upstream-Release |
| `npm run voices:aar` | holt das sherpa-onnx-AAR (nicht im Git) |

## Bevor du irgendetwas anfasst

1. `bash scripts/fetch-sherpa-aar.sh` (oder `npm run voices:aar`) — ohne das
   AAR baut Android nicht.
2. `npm run apk:debug` installiert als **`de.ithandwerk.foldpage.debug`** neben
   der Play-Fassung. Nie die echte App deinstallieren, um Platz zu machen: das
   löscht die Bibliothek des Nutzers.

## Offen

- **TalkBack-Durchgang am Gerät.** Die Struktur ist maschinell geprüft
  (`a11y-audit`, `keyboard`), die Ansage-Reihenfolge kann nur ein Mensch
  beurteilen.
- **Ein Bericht ohne Reproduktion:** Die Bibliothek war am Telefon einmal
  seitwärts verschoben („wenn ich am Handy rumziehe"). Mit echten
  Touch-Ereignissen im Browser nicht reproduzierbar; die Ursache ist unbekannt.
  Das Loch ist zu (`overflow-x: clip` + `overscroll-behavior-x: none`, dazu eine
  Dauerprüfung in `ui:check`), der Grund nicht gefunden. Wenn es wieder
  auftritt: Handy anstecken und den Zustand per DevTools auslesen
  (`window.scrollX`, Transform am Element).
- **Automatische Updates geladener Stimmen** sind bewusst nicht gebaut,
  Begründung in
  `.claude/skills/foldpage-product-ux/references/voice-and-language.md`.
- **Pitch** wirkt nur auf Telefonstimmen; bei einer geladenen Stimme wird der
  Regler ausgeblendet, weil das Modell die Tonhöhe mitbringt.

## Fallen, die in dieser Sitzung Zeit gekostet haben

- **`AudioTrack.write()` kehrt zurück, wenn die Daten in der Warteschlange
  stehen — nicht wenn sie gehört wurden.** Ein Aufruf, der schneller
  zurückkommt als der Ton dauert, hat keinen Ton gemacht. Kostete einen ganzen
  Lauf, in dem „perfekt erzeugtes Audio" niemand hörte.
- **Eine deinstallierte Sprach-Engine macht die App stumm**, ohne einen Hinweis
  irgendwo. `autoConfigure()` vergisst sie jetzt, `play()` prüft vor dem ersten
  Wort.
- **Messgeräte, die nichts sehen, melden „sauber".** Dreimal passiert: das
  Jargon-Audit ohne Artikel im Reader, die Maschinennamen-Prüfung ohne Stimmen
  im Browser, der Bibliotheks-Benchmark mit einem Knopf, den es seit einem
  Umbenennen nicht mehr gab. Jede Prüfung erst mit einem echten Fehler
  gegenprüfen, bevor man ihr glaubt.
- **`reader-render` und `ui:check` warten auf die Datenbank der App.** Unter
  Last hat 4 s einmal nicht gereicht und der Lauf meldete einen sauberen
  Bildschirm, den er nie gesehen hat. Steht jetzt auf 10 s.
