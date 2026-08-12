# FoldPage — Roadmap

Zwei Sorten Arbeit, bewusst getrennt:

- **Teil A — Einzelmaßnahmen:** je eine abgeschlossene Änderung, die in einem
  Lauf entworfen, umgesetzt, gemessen und committet werden kann.
- **Teil B — Vorhaben über mehrere Läufe:** größere Stränge, die in Etappen
  zerfallen. Jede Etappe endet in einem lauffähigen, testbaren Zustand.

Jeder Eintrag nennt **Ziel · betroffene Dateien · Abnahme**. Abnahme heißt:
woran man *belegt*, dass es fertig ist — Testlauf, Korpuszahl oder Gerätetest.
Der Aufbau des Codes steht in `docs/ARCHITECTURE.md`; ohne die gelesen zu haben,
sollte hier niemand anfangen. Was von außen kommt — Play-Fristen, Android-
Versionen, Bibliotheks-Majors — steht getrennt in `docs/FUTURE-PROOFING.md`.

Stand: 12. August 2026, Version 1.6 (`versionCode 8`), geschlossener Test bei
Google Play.

**Release-Zähler:** seit 1.6 sind **3 von ~5** Läufen erledigt —
1. A2, A3, A4, A7, B7.2 · 2. B1.1–B1.5 (Bilder mitspeichern) · 3. Schalter und
Nachladen für Altbestand. Der nächste Versionssprung ist 1.7 / `versionCode 9`;
bis dahin bleiben die Versionsdateien unberührt.

---

## Teil A — Einzelmaßnahmen

Sortiert nach Wirkung pro Aufwand. „G" = braucht einen Gerätetest.

### A1 · Sanitizer als Allowlist ✅ erledigt (12.08.2026)
Gespeichertes HTML wird auf eine Tag-/Attribut-Allowlist reduziert, statt
bekannte Übeltäter zu entfernen. `<base>`, `<svg>`, `style` und `class` fallen
weg, URLs nur noch `http(s)`/`mailto`/`tel`/`#`/`data:image`.
**Ergebnis:** 14/14 Tests grün, Wortbestand über den Korpus unverändert
(85.676), gespeicherte HTML-Bytes −22,5 %, Befund `href-relative` 1 → 0.
Dateien: `lib/parse.ts`, `lib/parse.test.ts`, `corpus/report.*`.

### A2 · `source` beim Teilen korrekt setzen ✅ erledigt (12.08.2026)
`handleAdd` nimmt jetzt die Quelle als zweites Argument; Share-Intent (kalt und
warm) und der `?add=`-Weg schreiben `"share"`, das Eingabefeld `"manual"`.
Dateien: `components/Library.tsx`.

### A3 · Toten Code entfernen ✅ erledigt (12.08.2026)
`components/BottomNav.tsx` gelöscht — abgelöster Vorgänger von `AppNav`,
nirgends importiert.

### A4 · Sprachbruch beseitigt ✅ erledigt (12.08.2026)
Die drei deutschen Stellen sind englisch: „Share export" im Share-Sheet
(`lib/native.ts`), „Privacy" und „Legal notice" in der Fußzeile
(`app/settings/page.tsx`) — beide Links tragen jetzt `hrefLang="de"`, weil die
Zielseiten deutsch bleiben (sie sind die rechtsverbindliche Fassung). Dazu
B7.2 gleich miterledigt: `toLocaleString("de-DE")` ist auf die Gerätesprache
umgestellt, ein englisches Telefon liest wieder „12,500" statt „12.500".

### A5 · Abbruch beim Speichern
Ein hängender Abruf blockiert bis zum Timeout (15 s Connect / 25 s Read) ohne
Ausweg; der Nutzer sieht nur „Speichern…".
**Ziel:** Abbrechen-Knopf neben dem Fortschritt, plus ein Hinweis nach 5 s
(„dauert länger als üblich").
**Dateien:** `components/Library.tsx`, ggf. `lib/parse.ts` (AbortSignal).
**Abnahme:** Flugmodus an, Link speichern, abbrechen — Oberfläche bleibt bedienbar.

### A6 · Suche hervorheben und zählen
Die Suche liefert Treffer, zeigt aber nicht, *warum* etwas Treffer ist. Bei
Volltexttreffern im Artikelkörper wirkt das Ergebnis willkürlich.
**Ziel:** Trefferzahl über der Liste, gefundener Begriff in Titel/Excerpt
markiert (`<mark>`), bei reinem Body-Treffer ein Hinweis „im Text gefunden".
**Dateien:** `components/Library.tsx`, `lib/db.ts` (Suche gibt Fundort zurück),
`app/globals.css`.
**Abnahme:** neuer Test für den Fundort in `lib/`, Sichtprüfung.

### A7 · Artikel erneut laden ✅ erledigt (12.08.2026)
„Reload" neben „View original" im Reader. Holt die Seite erneut und ersetzt
Titel, Text, Wortzahl, Lesezeit, Sprache und Canonical — behält Tags, Stern,
Ablage, Lesefortschritt, `addedAt` und die ID.
**Ergebnis:** 19/19 Tests grün. Die Zusammenführung steckt bewusst in einem
eigenen Modul (`lib/refetch.ts`, reine Funktion ohne IndexedDB und ohne
Capacitor), damit sie offline testbar ist; der Test prüft auch, welche Felder
**nicht** im Patch stehen dürfen.
Dateien: `lib/refetch.ts`, `lib/refetch.test.ts`, `lib/articles.ts`,
`app/read/page.tsx`, `app/globals.css`.

### A8 · Wischgesten in der Bibliothek · G
Archivieren und Löschen brauchen heute einen genauen Treffer auf ein kleines
Icon. Auf dem Telefon ist Wischen die erwartete Geste.
**Ziel:** nach rechts = archivieren, nach links = löschen (mit demselben
Undo-Toast), mit `prefers-reduced-motion`-Rücksicht.
**Dateien:** `components/Library.tsx`, `app/globals.css`, `docs/MOTION.md` +
`lib/motion.test.ts` (neue Animation dokumentieren und prüfen).
**Abnahme:** Motion-Test grün, Gerätetest inklusive Fehlgriff-Rückweg.

### A9 · Anzeige-Einstellungen ✅ erledigt (12.08.2026)
Aus „Schriftwahl im Reader" wurde ein vollständiger Satz Einstellungen: Theme
(System/Hell/Dunkel), Textgröße, Schriftart (Serif/Sans), Ausrichtung
(Flattersatz/Blocksatz mit Silbentrennung) und Zeilenabstand. Erreichbar über
das Zahnrad im Reader (Bottom-Sheet) und den Abschnitt „Appearance" in den
Einstellungen — eine Komponente, zwei Orte.
**Ergebnis:** 18/18 Tests grün, davon vier neue (Reparatur ungültiger
Speicherwerte, Gleichlauf von Inline-Skript und Modul, Stylesheet-Regeln je
Einstellung, Farbgleichheit der erzwungenen Themes). Kein Flackern beim Start,
weil `app/layout.tsx` die Attribute vor dem ersten Paint setzt.
Dateien: `lib/display.ts`, `components/DisplaySettings.tsx`,
`components/DisplaySheet.tsx`, `app/read/page.tsx`, `app/settings/page.tsx`,
`app/layout.tsx`, `app/globals.css`, `lib/native.ts`, `lib/*.test.ts`.

### A10 · Zeilenlänge und Rand prüfen lassen
Der Reader-Lab-Bericht misst Zeichen pro Zeile bereits (3 bis 53 im Korpus),
aber nichts erzwingt das Fenster. Eine CSS-Änderung kann es unbemerkt sprengen.
**Ziel:** Grenze (etwa 30–50 Zeichen bei 412 px) als Testbedingung.
**Dateien:** `scripts/reader-render.mjs`, `docs/READER-LAB.md`.
**Abnahme:** `npm run reader-render` schlägt bei absichtlich verstellter
`max-width` fehl. Chromium ist seit 12.08.2026 auf `lenovo` installiert, das
Lab läuft dort.

### A11 · Play-Store-Pflichtangaben nachziehen
Datenschutz und Impressum liegen auf GitHub Pages und sind aus der App verlinkt.
Was fehlt, ist die App-interne Fassung für den Fall, dass die Seite offline ist
oder die Play-Prüfung eine In-App-Ansicht verlangt.
**Ziel:** `/settings/datenschutz/` als statische Route mit demselben Text.
**Dateien:** `app/settings/`, `docs/datenschutz/`.
**Abnahme:** Route im Export vorhanden, im Flugmodus lesbar.

### A12 · Versionsnummer aus einer Quelle
`versionCode`/`versionName` stehen in `android/app/build.gradle`, `package.json`
hat davon unabhängig `1.0.0`, der README-Status nennt noch 1.4. Bei jedem
Release driftet das auseinander.
**Ziel:** ein Skript `npm run version -- 1.6`, das `build.gradle`,
`package.json` und den README-Status gemeinsam setzt und `versionCode` erhöht.
**Dateien:** neues `scripts/set-version.mjs`, `package.json`, `docs/RELEASE.md`.
**Abnahme:** Skript läuft, `git diff` zeigt genau die drei Stellen.

---

### A13 · Große Bildschirme ✅ erledigt (12.08.2026)
Android 17 (API 37, erschienen 16.06.2026) entfernt auf Geräten ab `sw600dp`
die Opt-outs für Orientierung und Größenänderung. Pflicht wird `targetSdk 37`
bei Google Play im **August 2027**; bis dahin reicht 36, das die App bereits
hat (Play-Frist 31.08.2026 damit erfüllt).
**Umgesetzt:** Das Reader-Lab misst zwei Viewports statt einem — Telefon
412 × 915 und Tablet 1024 × 768, beide Themes. Dazu drei Spalten in der
Bibliothek ab 1100 px, breiterer Container, das Einstellungs-Sheet als
zentrierter Dialog ab 768 px, eigene Regeln für kurze Querformat-Fenster.
**Ergebnis:** 156 Renderings, 84 Tabellenprüfungen, **0 Befunde**.
Dateien: `app/globals.css`, `components/Library.tsx`, `components/TopBar.tsx`,
`scripts/reader-render.mjs`, `corpus/reader-report.json`.
Der Sprung auf `targetSdk 37` selbst steht in `docs/FUTURE-PROOFING.md`, samt
Ablauf und der Begründung, warum er **nicht vor Capacitor** passiert.

---

## Teil B — Vorhaben über mehrere Läufe

### B1 · Wirklich offline: Bilder mit ablegen ✅ erledigt (12.08.2026)
Gemessen, entschieden, gebaut und in den Texten eingelöst. Bilder liegen in
IndexedDB (Schema 2, Store `images`, Schlüssel = SHA-256 der Bild-URL), Deckel
2 MB je Bild / 4 MB je Artikel / 40 Bilder, Abruf **nach** dem Speichern, mit
Schalter, Nachladen für Altbestand, Aufräumen und Speicheranzeige.
Vollständig: `docs/IMAGE-STORAGE.md`. Offen bleibt bewusst nur „nur im WLAN"
(bräuchte das Network-Plugin).

### B2 · Bibliothek, die auch bei 5.000 Artikeln trägt
Heute liest jede Aktion **alle** Artikel aus IndexedDB, filtert im Speicher und
rendert alle Karten. `searchArticles()` durchsucht zusätzlich jeden
`contentHtml`-String linear. Bei ein paar hundert Artikeln unauffällig, danach
nicht mehr — und jede Änderung (Stern setzen) löst ein komplettes `refresh()`
aus.

| Etappe | Inhalt | Abnahme |
|---|---|---|
| B2.1 | Messen statt raten: Skript erzeugt 2.000 synthetische Artikel, misst Startzeit, Suchzeit, Speicher | Zahlen in `docs/` |
| B2.2 | Zustandsänderungen lokal statt Vollneuladen (`updateArticle` liefert den Artikel bereits zurück) | Messung besser, Verhalten gleich |
| B2.3 | Invertierter Wortindex als eigener Store, beim Speichern gepflegt | Test: Suchergebnisse identisch zur linearen Suche |
| B2.4 | Virtualisierte Liste (nur sichtbare Karten im DOM), Scrollposition bleibt erhalten | Reader-Lab-Lauf ohne neue Befunde |

### B3 · Verlässlich lesen: Zustand, den man nicht verliert
Einzelne Bausteine sind da (Fortschritt, Scrollposition je Tab), aber es gibt
kein Netz gegen den harten Fall: WebView-Neustart mitten im Lesen,
Speichervorgang während eines Prozess-Kills, halb geschriebener Import.

| Etappe | Inhalt | Abnahme |
|---|---|---|
| B3.1 | Import als wiederaufnehmbarer Auftrag (Warteschlange in IndexedDB statt Schleife im Component-State) | App während des Imports schließen, weiter geht es beim Öffnen |
| B3.2 | Speichern eines geteilten Links läuft weiter, auch wenn die App sofort wieder in den Hintergrund geht | Gerätetest |
| B3.3 | „Zuletzt gelesen" überlebt einen Prozess-Kill exakt (heute Debounce von 500 ms) | Test mit erzwungenem Kill |

### B4 · Sync zwischen Geräten (bewusst zurückgestellt)
Das Datenmodell ist darauf vorbereitet: `modifiedAt`, Soft Delete mit
Tombstones, `listAllRaw()`. Es fehlt der Transport. Die Web-Version von FoldPage
hat Sync; hier ist sie **absichtlich** nicht drin, weil sie ein Konto und einen
Server bedeutet — genau das, was die App nicht sein will.

Wenn überhaupt, dann in dieser Reihenfolge, jede Etappe für sich nützlich:
B4.1 Export/Import als vollständiges Backup inklusive Bilder →
B4.2 Abgleich zweier Backups auf demselben Gerät (Konfliktlogik testbar machen)
→ B4.3 Transport über einen Ort, den der Nutzer besitzt (WebDAV, Nextcloud,
eigener Tailscale-Node) → B4.4 erst danach die Frage nach einem Dienst.
**Vor B4.1 hat keine dieser Etappen einen Zweck.**

### B5 · Extraktion messbar besser machen
Der Korpus nennt die offenen Befunde beim Namen: `empty-paragraphs` 15,
`no-author` 6, `suspiciously-short` 5, `tables-lost` 1, `image-flood` 2.
Jede Etappe nimmt **einen** Befund und belegt den Effekt im Diff von
`corpus/report.json`.

| Etappe | Befund | Angriffspunkt |
|---|---|---|
| B5.1 | `empty-paragraphs` | leere Absätze nach dem Sanitizer entfernen, ohne Abstände zu zerstören |
| B5.2 | `no-author` | Autor zusätzlich aus JSON-LD und `<meta name="author">` lesen |
| B5.3 | `tables-lost` | Wikipedia-Fall: Readability wirft Tabellenseiten weg — Rückfall auf den größten Tabellencontainer |
| B5.4 | `image-flood` | Galerie-/Teaser-Reste am Artikelende erkennen |
| B5.5 | `suspiciously-short` | Paywall erkennen und **benennen**, statt einen 29-Wörter-Artikel zu speichern |

**Regel für diesen Strang:** keine Änderung ohne Vorher/Nachher-Zahl aus
`npm run corpus`. Sinkt ein Befund, während ein anderer steigt, gehört das in
die Commit-Nachricht.

### B6 · Barrierefreiheit über den Kontrast hinaus
Kontrast und Motion sind getestet, der Rest nicht: TalkBack-Reihenfolge,
Fokusreihenfolge nach Routenwechsel, Live-Regionen für Toast und Import,
Bedienung mit Systemschriftgröße 200 %.

| Etappe | Inhalt | Abnahme |
|---|---|---|
| B6.1 | Bestandsaufnahme mit TalkBack am Gerät, Fundliste in `docs/A11Y.md` | Dokument mit je Fund einer Zeile |
| B6.2 | Fokus nach Routenwechsel setzen, Überschriftenebenen korrigieren | Wiederholter TalkBack-Durchgang |
| B6.3 | Layout bei 200 % Systemschrift ohne Überlauf | Screenshots bei 412 px, beide Themes |
| B6.4 | Prüfungen, wo möglich, in `reader-render.mjs` verankern | Lauf schlägt bei Regression fehl |

### B7 · Sprache — **entschieden am 12.08.2026: international, Englisch**
Die App bleibt englisch. Damit ist der große Übersetzungsstrang gestrichen; was
bleibt, ist der Mischzustand aus **A4** (drei deutsche Stellen englisch fassen)
und die Folgearbeiten unten. Deutsch bleiben ausschließlich die Dinge, die
rechtlich oder fachlich deutsch sein müssen: Impressum, Datenschutz und die
deutschsprachigen Muster in `EDGE_FURNITURE` (`lib/parse.ts`) — Letztere sind
kein Oberflächentext, sondern Erkennungsregeln für deutsche Consent- und
Paywall-Formeln und bleiben unangetastet.

| Etappe | Inhalt | Abnahme |
|---|---|---|
| B7.1 | ✅ Entscheidung getroffen: Englisch, international | hier festgehalten |
| B7.2 | ✅ erledigt (12.08.2026): `toLocaleString()` ohne festes Locale, folgt dem Gerät | mit A4 zusammen umgesetzt |
| B7.3 | Möbel-Erkennung um englischsprachige Muster erweitern („accept cookies", „subscribe to continue", „skip to main content") — die Regex kennt heute fast nur deutsche Seiten | `npm run corpus`: Befunde an den englischen Quellen sinken |
| B7.4 | Play-Eintrag international ausrichten: englische Beschreibung als Standard, Screenshots ohne deutschen Text | Store-Eintrag geprüft |
| B7.5 | Reader-Sprache: `article.lang` steht bereits im Datenmodell — Silbentrennung und Anführungszeichen je Artikel setzen, statt alles wie Englisch zu behandeln | Reader-Lab-Lauf ohne neue Befunde |

**Bleibt gültig, falls die Entscheidung je gedreht wird:** die Fehlermeldungen
aus `lib/parse.ts` sind in `lib/parse.test.ts` als Regex festgenagelt („came
back empty", „private addresses"). Eine Übersetzung bräuchte Schlüssel statt
Klartext in den Tests, sonst bricht der Lauf bei jeder Textänderung.

---

## Reihenfolge, wenn niemand etwas anderes sagt

1. ~~**A2, A3, A4**~~ — erledigt am 12.08.2026.
2. **B1** — das einzige offene *Versprechen*; bis dahin sind README und Welcome
   in einem Punkt schöner als die Wirklichkeit. **Als Nächstes dran.**
3. ~~A7~~ erledigt; **A5, A6** — sichtbarer Nutzen im Alltag.
4. **B5** — der Reader ist das Produkt, und er ist messbar.
5. **A8, A9, B6** — Bedienung und Zugänglichkeit.
6. **B2** — sobald echte Bibliotheken groß genug werden, dass man es merkt.
7. **B4** — zuletzt, und nur, wenn B4.1 wirklich getragen hat.

## Arbeitsregeln für jeden Lauf

- Vor der Änderung: `docs/ARCHITECTURE.md` Abschnitt 10 („Fallen") lesen.
- Nach jeder Änderung an der Extraktion: `npm test` **und** `npm run corpus`,
  den Diff von `corpus/report.json` im Commit lassen.
- Nach jeder Änderung an CSS/Animationen: `docs/CONTRAST.md` bzw.
  `docs/MOTION.md` mitziehen — die Tests lesen diese Werte.
- Gerätetest heißt: `npm run apk:debug`, installieren, den konkreten Fall
  ausprobieren. `npm run build` allein zeigt am Gerät den alten Stand.
- **Version nicht pro Lauf erhöhen.** Ein Release fasst rund **fünf Läufe**
  zusammen — erst dann steigen `versionCode` und `versionName` gemeinsam
  (siehe A12). Ein Lauf endet mit Code, Tests und Doku im Commit; die
  Versionsdateien (`android/app/build.gradle`, `package.json`) bleiben
  unangetastet, bis Belkis den Release ansagt. Grund: zwischen zwei Versionen
  soll sichtbar etwas passiert sein, und jede gebaute Version wird von Hand
  durchgetestet.
- **Getestet wird gegen eine echte Bibliothek mit über 100 Artikeln.** Was in
  einer leeren Bibliothek nicht auffällt — lineare Volltextsuche, vollständiges
  Neuladen der Liste nach jeder Änderung, Speicherbedarf — ist dort spürbar.
  Bei jeder Änderung an Bibliothek, Suche oder Speicher gilt das als
  Abnahmebedingung, nicht als Nebensache (Strang B2).
