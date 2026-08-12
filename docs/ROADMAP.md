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

Stand: 12. August 2026, Version 1.7 (`versionCode 9`), geschlossener Test bei
Google Play.

**Release-Zähler:** seit 1.6 sind **5 von ~5** Läufen erledigt —
1. A2, A3, A4, A7, B7.2 · 2. B1.1–B1.5 (Bilder mitspeichern) · 3. Schalter und
Nachladen für Altbestand · 4. A5, A6 · 5. B2.1, B2.2.
Daraus wurde **1.7 / `versionCode 9`** (12.08.2026). Der Zähler beginnt für
1.8 / `versionCode 10` wieder bei null. Der nächste Versionssprung ist 1.7 / `versionCode 9`;
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

### A5 · Abbruch beim Speichern ✅ erledigt (12.08.2026)
Nach fünf Sekunden sagt die App „This one is taking longer than usual" und
bietet „Stop waiting". Die native HTTP-Brücke kennt kein Abbrechen — der schon
laufende Abruf lässt sich nicht zurückrufen —, also wird seine Antwort
**verworfen** statt gespeichert: `addArticleFromUrl` fragt vor dem Schreiben
nach, ob abgebrochen wurde, und wirft dann `Abandoned`. In der Bibliothek
landet nichts, die Oberfläche ist sofort wieder bedienbar.
Dateien: `lib/articles.ts`, `components/Library.tsx`.

### A6 · Suche hervorheben und zählen ✅ erledigt (12.08.2026)
Über der Liste steht, wie viele Treffer es sind. Der gesuchte Begriff wird in
Titel und Auszug markiert — als React-Knoten aus geteiltem Text, **nie** als
zusammengebautes HTML, damit ein Suchbegriff mit spitzen Klammern Text bleibt.
Artikel, bei denen der Begriff nur im Fließtext steht, tragen den Hinweis
„Found in the article text" statt wie ein Fehltreffer auszusehen —
`searchArticlesDetailed()` liefert dafür den Fundort mit.
Dateien: `lib/db.ts`, `components/Library.tsx`, `app/globals.css`.

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

### A8 · Wischgesten in der Bibliothek ✅ erledigt (12.08.2026) · Gerätetest offen
Nach rechts archivieren (bzw. zurück in die Inbox), nach links löschen — mit
demselben Undo-Toast. `components/SwipeRow.tsx`, Pointer-Events statt
Touch-Events, damit Finger, Maus und Stift denselben Pfad nehmen und ein Zug,
der das Element verlässt, per `setPointerCapture` trotzdem hier endet.
Zwei Regeln gegen Fehlgriffe: die Richtung wird **einmal** entschieden (sonst
wird die Liste unscrollbar), und unter 96 px federt die Karte zurück.
**Die Knöpfe bleiben.** Eine Wischgeste existiert für TalkBack, Tastatur und
alle, deren Hände keine feinen Gesten machen, nicht — sie ist eine Abkürzung,
nie der einzige Weg. Nichts, was sie auslöst, ist endgültig.

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

### A10 · Zeilenlänge prüfen ✅ erledigt (12.08.2026)
Der Reader-Lab prüft die Zeilenlänge als Bedingung: über **75 Zeichen** ist ein
Fehlschlag, bewertet werden Absätze ab 200 Zeichen, keine Untergrenze (kurze
Syntaxkästen sind Inhalt, kein Fehler).
**Der erste Lauf fand einen echten Fehler:** Tablet-Median **93** Zeichen je
Zeile, Maximum 141. `max-width: 39em` unterstellte eine Zeichenbreite, die die
Schrift nicht hat; auf dem Telefon war das unsichtbar, weil dort die
Seitenränder begrenzen. Jetzt `min(39em, 56ch)` — Tablet-Median **51**, Telefon
unverändert 41. Details in `docs/READER-LAB.md`.

### A11 · Play-Store-Pflichtangaben nachziehen
Datenschutz und Impressum liegen auf GitHub Pages und sind aus der App verlinkt.
Was fehlt, ist die App-interne Fassung für den Fall, dass die Seite offline ist
oder die Play-Prüfung eine In-App-Ansicht verlangt.
**Ziel:** `/settings/datenschutz/` als statische Route mit demselben Text.
**Dateien:** `app/settings/`, `docs/datenschutz/`.
**Abnahme:** Route im Export vorhanden, im Flugmodus lesbar.

### A12 · Versionsnummer aus einer Quelle ✅ erledigt (12.08.2026)
`npm run set-version -- 1.8` setzt `versionName` und erhöht `versionCode` in
`android/app/build.gradle`, zieht `package.json` und die Statuszeile im README
mit. `npm run set-version -- --check` meldet nur, ob die drei übereinstimmen —
und beendet sich mit Fehlercode, wenn nicht. `versionCode` kann nur steigen:
eine Nummer, die schon ein Bundle in die Play Console getragen hat, ist
verbraucht. Genau die beiden Fehler, die uns heute passiert sind.
**Nicht** `npm version` genannt — das ist ein npm-Lebenszyklus-Hook und würde
bei jedem `npm version` mitlaufen.

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

### B2 · Bibliothek, die auch bei tausenden Artikeln trägt
Heute liest jede Aktion **alle** Artikel aus IndexedDB, filtert im Speicher und
rendert alle Karten. `searchArticlesDetailed()` liest zusätzlich jeden
`contentHtml`-String linear.

| Etappe | Inhalt | Stand |
|---|---|---|
| B2.1 | Messen statt raten: `scripts/library-bench.mjs` sät eine synthetische Bibliothek in den gebauten Export und misst in Chromium — Öffnen, Volltextsuche, ein Stern | ✅ 12.08.2026 |
| B2.2 | Zustandsänderungen lokal statt Vollneuladen | ✅ 12.08.2026 |
| B2.3 | Invertierter Wortindex als eigener Store, beim Speichern gepflegt | ✅ 12.08.2026 |
| B2.4 | Nur so viele Karten im DOM wie gebraucht | ✅ 12.08.2026 |

**Gemessen bei 200 Artikeln à 900 Wörtern** (Chromium auf `lenovo`, kein
Telefon — als Vorher/Nachher auf derselben Maschine aussagekräftig, nicht als
absolute Zahl):

| | vorher | nachher |
|---|---:|---:|
| Bibliothek öffnen bis erste Karte | 512 ms | 513–517 ms |
| Volltextsuche, Treffer nur im Fließtext | 319 ms | 322 ms |
| **Ein Stern setzen** | **411 ms** | **269–283 ms** |

Der Stern war der Punkt: er löste ein vollständiges Neuladen der Bibliothek aus
— alle Artikel aus IndexedDB, Suche erneut, jede Karte neu. Jetzt liefert der
Schreibvorgang den aktualisierten Datensatz zurück und die Liste wird an Ort und
Stelle geflickt. Öffnen und Suche sind unverändert, weil dort tatsächlich alles
gelesen werden **muss** — das behebt erst B2.3.

Ausnahme mit Absicht: das Rückgängigmachen einer Löschung lädt weiterhin voll
neu. Der Artikel muss an seine Stelle in der Sortierung zurück, und wo die ist,
weiß nur die Datenbank.

### B2.3 und B2.4 (12.08.2026): erst messen, dann glauben

**Gemessen bei 1.000 Artikeln à 900 Wörtern**, dieselbe Maschine, dieselbe
Abfrage (ein Wort, das nur im Fließtext genau eines Artikels steht):

| | vorher | nachher |
|---|---:|---:|
| Bibliothek öffnen | 1.789 ms | **522 ms** |
| Volltextsuche ohne Index | 1.348 ms | **139 ms** |
| Volltextsuche mit Index | — | **103 ms** |
| Stern setzen | 203 ms | 146 ms |

Bei 200 Artikeln: Öffnen 347 ms, Suche 119 ms (mit Index 116 ms).

**Die unbequeme Erkenntnis:** Der Wortindex (B2.3) war nicht der große Hebel.
Den Löwenanteil hat **B2.4** gebracht — die Liste rendert nur noch 40 Karten
statt tausend und wächst beim Scrollen nach. Bei tausend Artikeln waren tausend
Karten mit Wischgeste und je drei Knöpfen im DOM; die Datenbank war nie das
Problem, der Browser war es.

Was der Index trotzdem beiträgt, und warum er bleibt: Er halbiert die
verbleibende Arbeit (139 → 103 ms) und **wächst nicht mit der Bibliothek**, weil
er den Treffer nachschlägt statt jeden Artikel zu lesen. Auf dem Weg dorthin
fielen zwei Fehler auf, die ohne Messung nie aufgefallen wären:

- Die Suche lud **alle** Artikel samt gespeichertem HTML, nur um zu
  entscheiden, welche sie zeigt. Jetzt laufen erst die Schlüssel (`by-addedAt`
  als **Key**-Cursor, ohne die Werte anzufassen), dann werden genau die Treffer
  geladen.
- Jeder Tastendruck lud über `allTags()` die ganze Bibliothek nach — die
  Tag-Liste kann sich beim Tippen aber nicht ändern. Wird beim Suchen
  übersprungen.

**Grenzen, benannt:** Der Index kennt **Wörter**. Ein Bruchstück aus der *Mitte*
eines Wortes („finster" in „Sonnenfinsternis") kann er nicht beantworten — das
konnte die alte Suche, weil sie jeden Artikel las. Solche Abfragen und alles,
was der Index noch nicht kennt, fallen deshalb auf das Lesen zurück, statt
stillschweigend weniger zu liefern. Das Wortende zählt: „mond" sucht als
Präfix, „mond " (mit Leerzeichen) als vollständiges Wort. Artikel aus der Zeit
vor dem Index werden über „Index for search" in den Einstellungen nachgetragen
— bei 1.000 Artikeln dauert das rund 8 Sekunden.

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

| Etappe | Befund | Angriffspunkt | Stand |
|---|---|---|---|
| B5.1 | `empty-paragraphs` | leere Absätze nach dem Sanitizer entfernen, ohne Abstände zu zerstören | ✅ **15 → 0** (12.08.2026), dazu `last-empty` 5 → 3 |
| B5.2 | `no-author` | Autor zusätzlich aus JSON-LD und `<meta name="author">` lesen | ⚠️ gebaut, **Befund unverändert 6** — siehe unten |
| B5.3 | `tables-lost` | Wikipedia-Fall: Readability wirft Tabellenseiten weg — Rückfall auf den größten Tabellencontainer |
| B5.4 | `image-flood` | Galerie-/Teaser-Reste am Artikelende erkennen | ⏸ zurückgestellt, Begründung unten |
| B5.5 | `suspiciously-short` | Paywall erkennen und **benennen** | ✅ **5 → 3** (12.08.2026), `no-author` 6 → 4 |

**B5.2 im Detail, weil „gebaut" hier nicht „besser" heißt:** Die Ergänzung
liest den Autor jetzt aus JSON-LD (auch verschachtelt in `@graph`), aus
`meta[name=author]`, `article:author` und `citation_author`, und sie weist
Unsinn zurück, den Readability bisher ungeprüft in die Kopfzeile schrieb — ein
Wort mit sechzig Zeichen ist kein Name. **Am Korpus ändert das nichts:** alle
sechs Seiten ohne Autor führen nachweislich *keine* Autorenangabe, weder als
Meta-Tag noch als JSON-LD (geprüft: golem ×2, MDN, web.dev, docs.python.org,
github). Der Befund bleibt bei 6, und das ist die richtige Zahl — die Seiten
nennen schlicht niemanden. `twitter:creator` wurde bewusst **nicht** genommen:
„@MozDevNet" hätte die Zahl gesenkt und die Kopfzeile verschlechtert.

**Regel für diesen Strang:** keine Änderung ohne Vorher/Nachher-Zahl aus
`npm run corpus`.

### B5.5 (12.08.2026): lieber gar nichts als ein falsches Etikett

Die beiden golem-Schnappschüsse wurden bisher als 29-Wörter-„Artikel" unter der
echten Überschrift gespeichert. Das ist schlimmer als ein Fehlschlag: es sieht
aus wie der Artikel, wird abgelegt wie der Artikel, und der Leser merkt es erst
beim Öffnen — womöglich offline. Jetzt bricht die Extraktion mit einer klaren
Meldung ab: „That page returned its paywall or cookie notice instead of the
article". Die Bedingung ist bewusst zweiteilig — **unter 150 Wörter *und*
Wandformel** —, damit eine lange Analyse über Bezahlschranken ein Artikel
bleibt. Beides ist getestet.

### B5.4 zurückgestellt (12.08.2026): eine Obergrenze wäre Schaden

`image-flood` markiert zwei Artikel: heise mit 307 Bildern (eine Bestenliste,
deren Teaser Readability mitnimmt) und de.wikipedia mit 42. Die naheliegende
Lösung — eine Obergrenze für Bilder im Artikel — würde den Wikipedia-Artikel
beschädigen, dessen 42 Bilder Inhalt sind. Und bei heise stehen die Teaser
nicht am Ende, sondern zwischen dem Text, sodass „Reste am Artikelende
erkennen" nicht greift. Eine tragfähige Regel müsste die Teaser-Form selbst
erkennen (Bild plus Link, kaum Text, in einer Liste) und das ist eine eigene
Untersuchung mit eigener Messung — nicht etwas, das man nebenbei mit einer Zahl
erschlägt. **Für die Speicherung ist der Fall bereits entschärft:** es werden
höchstens 40 Bilder je Artikel abgelegt (`docs/IMAGE-STORAGE.md`).

### Nachtrag B7.3 (12.08.2026): das Messinstrument war blind

Der Auftrag lautete „englische Muster ergänzen, Befunde an englischen Quellen
sinken". Die englischen Quellen hatten aber **null** Befunde — nicht weil sie
sauber waren, sondern weil die Möbel-Erkennung **im Korpus-Skript** ebenfalls
fast nur deutsche Formeln kannte. Reihenfolge deshalb umgedreht:

1. Zuerst das Messinstrument (`scripts/corpus.mjs`, `FURNITURE`) um englische
   Muster erweitert. Ergebnis: **4 Befunde**, die vorher unsichtbar waren —
   theverge (Autoren-Biografie als letzter Block), techcrunch (Bildnachweis mit
   Uhrzeit als erster, Affiliate-Hinweis als letzter Block), web.dev
   (Lizenz-Boilerplate).
2. Dann `EDGE_FURNITURE` in `lib/parse.ts` entsprechend erweitert.
3. Nachgemessen: **4 → 0**, dabei nur **174 Wörter** entfernt, ausschließlich in
   genau diesen vier Artikeln.

Lehre für den ganzen Strang: eine Null im Bericht heißt „nichts gefunden", nicht
„nichts da". Wenn ein Befund an einer Quellengruppe systematisch fehlt, ist als
Erstes das Messinstrument verdächtig. Sinkt ein Befund, während ein anderer steigt, gehört das in
die Commit-Nachricht.

### B6 · Barrierefreiheit über den Kontrast hinaus

| Etappe | Inhalt | Stand |
|---|---|---|
| B6.1 | Bestandsaufnahme, Fundliste in `docs/A11Y.md` | ✅ 12.08.2026, **3 Befunde gefunden und behoben** |
| B6.2 | Fokus nach Routenwechsel setzen | ✅ 12.08.2026 — TalkBack-Durchgang am Gerät bleibt offen |
| B6.3 | Layout bei 200 % Systemschrift | ✅ mit B6.1 erledigt und als Prüfung verankert |
| B6.4 | Prüfungen dauerhaft verankern | ✅ `node scripts/a11y-audit.mjs` |

**Gefunden und behoben:** die Einstellungen liefen bei doppelter Systemschrift
**267 px** über den Rand (der native Datei-Wähler bemisst sich an seinem eigenen
Beschriftungstext), die segmentierten Regler passten dann nicht mehr
nebeneinander, und drei Bedienelemente im Reader lagen unter 44 px.

**Offen und benannt:** der Fokus bleibt nach einem Routenwechsel auf `<body>` —
für TalkBack heißt das, sich jede Seite neu von oben zu erarbeiten. Das ist
B6.2 und braucht ein Gerät, weil dort auch die Ansage-Reihenfolge zu beurteilen
ist. Vollständig in `docs/A11Y.md`.

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
| B7.3 | ✅ erledigt (12.08.2026) — siehe unten, das Messinstrument war selbst deutsch | 4 Befunde sichtbar gemacht, 4 behoben |
| B7.4 | Play-Eintrag international ausrichten: englische Beschreibung als Standard, Screenshots ohne deutschen Text | Store-Eintrag geprüft |
| B7.5 | Reader-Sprache: `article.lang` steht bereits im Datenmodell — Silbentrennung und Anführungszeichen je Artikel setzen, statt alles wie Englisch zu behandeln | Reader-Lab-Lauf ohne neue Befunde |

**Bleibt gültig, falls die Entscheidung je gedreht wird:** die Fehlermeldungen
aus `lib/parse.ts` sind in `lib/parse.test.ts` als Regex festgenagelt („came
back empty", „private addresses"). Eine Übersetzung bräuchte Schlüssel statt
Klartext in den Tests, sonst bricht der Lauf bei jeder Textänderung.

---

## Teil C — Marke und Feinschliff

Eigener Teil, weil hier nicht Funktionen fehlen, sondern **Ausführung**. Regel
für alles hier: eine Bewegung darf nur dann existieren, wenn sie etwas erklärt.
Der Rest ist Dekoration und altert schlecht.

### C1 · Zeichen und Falz ✅ erledigt (12.08.2026)
Das App-Symbol war ein Blatt mit drei Linien und einer kleinen gelben Ecke —
bei 48 px zerfielen die Linien zu Grau und übrig blieb ein beliebiges
Dokument-Symbol. Jetzt nimmt die **Falz ein Drittel des Blattes**, der Knick
wirft einen kurzen Schatten, sonst steht nichts im Bild. Dieselbe Geometrie in
`public/icon.svg`, im Kopfzeilen-Zeichen (vorher ein nacktes gelbes Dreieck —
also die Falz ohne das Blatt, von dem sie stammt) und in der Willkommens-Marke.
Die Karten-Ecke „gelesen" ist kein gelber Spitz mehr, sondern eine echte
umgeschlagene Ecke: Unterseite des Papiers, warm getönt, mit Knickschatten.
`scripts/make-assets.mjs` rendert alles neu — jetzt über Chromium statt über
`sharp`, das nie in der `package.json` stand und auf dieser Maschine gar nicht
lief. Ein Werkzeug, das man nicht ausführen kann, ist keine Pipeline.

### C2 · Bewegung mit Physik
`--ease-spring` (als `linear()`-Kurve, mit 6 % Überschwingen) ist eingeführt und
wird beim Erscheinen von Sheet und Falz benutzt. Offen: dieselbe Kurve für den
Undo-Toast, die Karten-Staffelung und das Öffnen eines Artikels — aber je
einzeln geprüft, nicht pauschal ersetzt.
**Abnahme:** `docs/MOTION.md` und `lib/motion.test.ts` mitgezogen, unter
`prefers-reduced-motion` bleibt alles still.

### C3 · Der Übergang in den Artikel
Beim Öffnen springt der Reader hart auf. Eine geteilte Element-Bewegung —
Kartentitel wird Artikelüberschrift — ist die eine Stelle, an der eine
Animation wirklich etwas erklärt: wohin man gegangen ist und wie man zurück
kommt. Technisch mit der View-Transition-API, die in `docs/FUTURE-PROOFING.md`
bewusst noch als „nicht benutzt" steht, weil sie mit den bestehenden
`backwards`-Animationen kollidiert. Erst deren Zusammenspiel klären, dann
bauen.
**Abnahme:** Reader-Lab ohne neue Befunde, Bottom-Navigation bleibt an ihrem
Platz (das war die Falle, die sie einmal in die Bildschirmmitte gehoben hat).

### C4 · Play-Auftritt
Die Store-Screenshots zeigen die alte Oberfläche und das alte Symbol. Neue
Aufnahmen aus dem Reader-Lab erzeugen, statt sie von Hand zu schießen — das Lab
rendert bereits in Gerätegröße und in beiden Themes.
**Abnahme:** vier Aufnahmen, kein deutscher Text darin (die App ist englisch),
Symbol neu.

### C6 · Premium-Gefühl: Haptik, Tiefe, Zustand
Die App fühlt sich sauber an, aber nicht **teuer**. Der Unterschied liegt nicht
in mehr Animation, sondern in drei Dingen, die Systemapps richtig machen und
Web-Apps fast nie:

1. **Haptik mit Bedeutung statt Vibration.** Es gibt bereits drei Verben
   (setzen, zurücknehmen, verwerfen). Was fehlt: ein Puls, wenn eine Wischgeste
   die Schwelle **überschreitet** — die Hand weiß dann, dass Loslassen etwas
   auslöst, ohne hinzusehen. Ab Android 12 gibt es dafür
   `HapticFeedbackConstants.GESTURE_THRESHOLD_ACTIVATE` statt einer nackten
   Millisekundenzahl; das Capacitor-Haptics-Plugin kennt nur `impact`, also
   braucht es eine kleine eigene Methode im vorhandenen Plugin.
2. **Tiefe, die aus Zustand entsteht.** Karten liegen flach. Eine Karte, die
   sich beim Drücken minimal senkt statt zu schrumpfen, eine Kopfzeile, die
   beim Scrollen eine Kante bekommt statt einen Schatten zu erben — das ist,
   was „hochwertig" ausmacht.
3. **Zustände, die niemand zeigt.** Was passiert beim Laden, beim Leeren, beim
   Fehler? Skelette gibt es, aber der Rest springt. Jeder Übergang zwischen
   diesen Zuständen soll dieselbe Feder benutzen (`--ease-spring`).

**Abnahme:** `docs/MOTION.md` mitgezogen, `lib/motion.test.ts` grün,
`prefers-reduced-motion` schaltet alles still, und ein Gerätetest, weil Haptik
im Browser nicht existiert.

### C7 · Einstellungen, die nicht wachsen wie ein Werkzeugkasten
✅ Teil erledigt (12.08.2026): Die Aktionen waren auf fünf, sechs gleich
aussehende Knöpfe angewachsen, die in zwei ausgefranste Zeilen umbrachen — und
jeder sah gleich wichtig aus, auch die zwei, die es nur zur Fehlersuche gibt.
Jetzt eine **Zeilenliste**: eine Aktion je Zeile, Name links, Wirkung darunter,
56 px hoch. Lesen statt Suchen.

**Offen:** Die Fehlersuche-Aktionen („Check the voice") gehören eigentlich hinter
ein „Diagnose"-Aufklappen, damit die erste Ebene nur zeigt, was man im Alltag
braucht. Und die Einstellungen sind inzwischen fünf Karten lang — eine
Gliederung mit Ankern oder ein zweites Blatt wäre ehrlicher als weiterscrollen.

### C5 · Leerer Zustand und erster Eindruck
Die Willkommensseite ist gut, danach ist das leere Regal ein Bild und drei
Zeilen. Ein erster Artikel zum Ausprobieren („speichere diesen Link") oder eine
sichtbare Erklärung, wie das Teilen aus anderen Apps geht, wäre der Unterschied
zwischen „leer" und „bereit".

---

## Teil D — Vorlesen und Verstehen, auf dem Gerät

Der Wunsch: **Vorlesen**, **Zusammenfassung**, **Fragen zum Artikel** — und
zwar auf dem Telefon, ohne dass ein Text das Gerät verlässt. Das passt zum
einzigen Versprechen, das diese App hat. Es ist auch die einzige Art, wie es
gehen darf: eine Cloud-Anfrage würde genau das brechen, wofür es die App gibt.

**Die Bedingung steht vor der Arbeit, nicht danach:** Ist die Qualität nicht
gut, wird es **nicht veröffentlicht**. Kein „Beta"-Etikett, kein „experimentell"
im Einstellungsmenü. Eine falsche Zusammenfassung ist schlimmer als keine, weil
sie gelesen und geglaubt wird.

### D0 · Eine Stimme, die nicht nach Maschine klingt
Die Systemstimmen klingen nach 2010. Das ist keine Frage der App — sie fragt nur
die Engine, die das Telefon eingestellt hat. Die Antwort liegt deshalb **neben**
der App:

| Weg | Was es ist | Kosten |
|---|---|---|
| **sherpa-onnx TTS-Engine-APK** | Piper-Modelle (VITS, ~15M Parameter) als **System-Engine** installiert, z. B. `vits-piper-de_DE-thorsten-medium`. Offline, neuronal, wählbar wie jede andere Engine | einmalige APK, kein Eingriff in FoldPage |
| **VoxSherpa** | dieselbe Technik als fertige App mit Modellauswahl | dito |
| **RHVoice** | quelloffen, robuster als die Systemstimme, klanglich zwischen alt und neu | klein |
| Modell **in** FoldPage bündeln | volle Kontrolle über Klang und Version | mehrere hundert MB, eigener Update-Pfad, eigene Lizenzprüfung je Modell |

**Entscheidung für den Moment:** FoldPage bleibt bei der System-Engine und wird
gut darin, den Weg dorthin zu zeigen (siehe „Android speech settings"). Ein
gebündeltes Modell wäre die erste Stelle, an der diese App groß wird statt
klein — und das ist eine Entscheidung, keine Aufgabe.

### D1 · Vorlesen ✅ gebaut (12.08.2026) · Gerätetest offen
Über Androids eigene Engine (`@capacitor-community/text-to-speech` 8.0.2, Peer
`@capacitor/core >=8`). Kein Modell, kein Download, nichts verlässt das Telefon.

**Wie es arbeitet:** Der Artikel wird in Blöcke zerlegt — Absätze, Überschriften,
Listenpunkte, Zitate, Bildunterschriften — und **einzeln** gesprochen. Das ist
der Kern: Eine Engine, der man zwanzigtausend Zeichen gibt, liefert ein einziges
undurchsichtiges Versprechen zurück und keine Möglichkeit, anzuhalten, weiter-
zumachen oder zu sagen, wo sie gerade ist. Blockweise ist all das da, und der
gerade gesprochene Absatz wird im Text markiert und bei Bedarf in Sicht
gescrollt.

**Sprache** kommt aus `article.lang`, nicht aus der Systemsprache: „de" wird zu
`de-DE`, ein unbekanntes Kürzel bleibt bewusst leer — ein deutscher Artikel in
englischer Stimme ist schlechter als die Stimme, die der Nutzer selbst gewählt
hat. Fehlt die Stimme, sagt die App das und öffnet auf Wunsch Androids
Installationsseite.

**Zwei Fallen, beide im Bauen aufgefallen:** Das Plugin fasst `window` beim
Laden an — als normaler Import bricht damit `npm run build`, weil die
Reader-Route vorgerendert wird; es wird deshalb erst bei Bedarf geladen. Und
ein Tag wird beim Entfernen zu einem Leerzeichen, was „den Link ." erzeugt —
eine Engine liest die Lücke als Pause und den Punkt als eigenen Atemzug.

**Stimme einstellbar und mehrsprachig ✅ (12.08.2026, am Gerät geprüft).**
Tempo (6 Stufen), Tonhöhe, Pausenlänge und die Stimme selbst — die Stimme
**je Sprache** gemerkt, dazu die **Engine je Sprache** über ein eigenes
Android-Plugin (`SpeechPlugin.java`). Grund: das Telefon hat eine
Standard-Engine, die Bibliothek mehrere Sprachen; die neuronale deutsche Engine
kann kein Englisch, Googles Engine beides. Gemessen und begründet in
`docs/SPEECH.md`, geprüft mit `node scripts/speech-audit.mjs`.

**Offen:** Sperrbildschirm-Steuerung (Media-Session) und Fortsetzen nach einem
App-Neustart — heute merkt sich der Player die Stelle nur innerhalb der Sitzung.
**Abnahme (Gerät):** ein deutscher und ein englischer Artikel vollständig
vorgelesen, Anruf oder Sperre dazwischen, Verlassen des Artikels beendet die
Stimme.

### D2 · Zusammenfassung, wenn das Gerät es kann
Der Stand der Technik (geprüft 12.08.2026): **Gemini Nano über die ML-Kit-
GenAI-APIs**, on-device über AICore. Die Summarization-API ist auf **Englisch,
Japanisch, Koreanisch** beschränkt — für einen deutschen Artikel also heute
**nicht** brauchbar. Verfügbar ist das Ganze auf Pixel 8+, Galaxy S24+ und
einzelnen Xiaomi/Motorola-Geräten, nicht auf jedem Telefon.
Alternative: ein eigenes kleines Modell (Gemma in INT4, wenige Gigabyte) über
MediaPipe LLM Inference — dann trägt die App den Download und die
Geschwindigkeit hängt am Chip.
**Reihenfolge:** erst messen, was auf Belkis' eigenen Geräten wirklich
herauskommt — Latenz, Qualität, Sprache —, dann entscheiden. Nicht umgekehrt.
**Abnahme:** 20 Artikel aus dem Korpus, Zusammenfassung neben dem Original
gelesen und bewertet; erfundene Aussagen sind ein K.-o.-Kriterium, nicht ein
Punktabzug.

### D3 · Fragen zum Artikel
Nur über **diesen** Artikel, mit dem Text im Prompt statt aus dem Gedächtnis
des Modells — das begrenzt das Erfinden und passt zu einem 1B-Modell. Über die
ML-Kit-Prompt-API (Alpha) oder dasselbe lokale Modell wie D2.
**Abnahme:** ein Satz Fragen je Artikel, darunter solche, die der Artikel
**nicht** beantwortet — das Modell muss „steht nicht drin" sagen können.

### D4 · Was die Oberfläche verspricht
Wenn D2/D3 kommen, gehört sichtbar dazu, **wer** antwortet: auf dem Gerät,
welches Modell, und dass es sich irren kann. Und ein Schalter, der es ganz
abstellt.

**Warum in dieser Reihenfolge:** D1 funktioniert überall und sofort. D2 und D3
hängen an Geräten, Sprachen und Modellqualität, die wir nicht kontrollieren —
und an der Bedingung oben.

---

## Reihenfolge, wenn niemand etwas anderes sagt

1. ~~**A2, A3, A4**~~ — erledigt am 12.08.2026.
2. **B1** — das einzige offene *Versprechen*; bis dahin sind README und Welcome
   in einem Punkt schöner als die Wirklichkeit. **Als Nächstes dran.**
3. ~~A5, A6, A7~~ — erledigt am 12.08.2026.
4. **B5** — der Reader ist das Produkt, und er ist messbar.
5. ~~A8, A9~~, **B6.2** — der TalkBack-Durchgang am Gerät ist der Rest.
6. **B2.3, B2.4** — Wortindex und virtualisierte Liste, sobald Öffnen und
   Suche spürbar werden (heute 0,5 s bzw. 0,3 s bei 200 Artikeln).
7. **C2–C5** — Feinschliff, sobald die Funktionen stehen.
8. **D1** — Vorlesen; es hängt an nichts als Android selbst.
9. **D2/D3** — erst messen, dann entscheiden, und nur veröffentlichen, wenn die
   Qualität stimmt.
10. **B4** — zuletzt, und nur, wenn B4.1 wirklich getragen hat.

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
