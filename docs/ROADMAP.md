# FoldPage — Roadmap

Zwei Sorten Arbeit, bewusst getrennt:

- **Teil A — Einzelmaßnahmen:** je eine abgeschlossene Änderung, die in einem
  Lauf entworfen, umgesetzt, gemessen und committet werden kann.
- **Teil B — Vorhaben über mehrere Läufe:** größere Stränge, die in Etappen
  zerfallen. Jede Etappe endet in einem lauffähigen, testbaren Zustand.

Jeder Eintrag nennt **Ziel · betroffene Dateien · Abnahme**. Abnahme heißt:
woran man *belegt*, dass es fertig ist — Testlauf, Korpuszahl oder Gerätetest.
Der Aufbau des Codes steht in `docs/ARCHITECTURE.md`; ohne die gelesen zu haben,
sollte hier niemand anfangen.

Stand: 12. August 2026, Version 1.5 (`versionCode 7`), geschlossener Test bei
Google Play.

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

### A2 · `source` beim Teilen korrekt setzen · G
`addArticleFromUrl` wird aus dem Share-Intent ohne zweites Argument gerufen,
alles landet als `"manual"`. Damit ist nicht mehr auswertbar, wie Artikel
hereinkommen, und eine spätere „zuletzt geteilt"-Ansicht hat keine Grundlage.
**Ziel:** Share-Weg schreibt `"share"`, `?add=`-Weg ebenfalls.
**Dateien:** `components/Library.tsx` (`handleAdd` bekommt einen Quellparameter).
**Abnahme:** Artikel per Share speichern, Export als JSON, Feld prüfen.

### A3 · Toten Code entfernen
`components/BottomNav.tsx` ist der abgelöste Vorgänger von `AppNav` und wird
nirgends importiert. Zwei Navigationen im Baum sind eine Einladung, die falsche
zu ändern.
**Dateien:** `components/BottomNav.tsx` (löschen).
**Abnahme:** `npx eslint` + `npm run build` grün, `grep -r BottomNav` leer.

### A4 · Sprachbruch in der Oberfläche beseitigen
Die Oberfläche ist **durchgehend englisch** — „Inbox", „Archive", „Search your
library…", „Could not reach that page". Deutsch sind genau drei Stellen: der
Titel des Android-Share-Sheets beim Export („Export teilen", `lib/native.ts`
Zeile 174) und die Fußzeilen-Links „Datenschutz" / „Impressum"
(`app/settings/page.tsx` Zeile 251/255). Dazu steht `<html lang="en">`
(`app/layout.tsx`), während die verlinkten Rechtstexte deutsch sind und der
Play-Eintrag auf ein deutsches Publikum zielt.
**Ziel dieser Einzelmaßnahme:** den Mischzustand beenden, ohne schon zu
übersetzen — die drei Stellen englisch fassen („Share export", „Privacy",
„Legal notice"). Die Grundsatzfrage, welche Sprache die App spricht, steckt in
**B7** und wird nicht nebenbei entschieden.
**Dateien:** `lib/native.ts`, `app/settings/page.tsx`.
**Abnahme:** kein Bildschirm mehr mit zwei Sprachen; Export-Sheet und
Einstellungs-Fußzeile am Gerät gesehen.

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

### A7 · Artikel erneut laden
Ein Artikel, der beim Speichern halb kaputt extrahiert wurde (Paywall,
Consent-Wand, langsame Seite), bleibt für immer halb kaputt.
**Ziel:** „Neu laden" im Reader — holt die Seite erneut, ersetzt `contentHtml`,
`wordCount`, `readingMin`, behält `id`, `tags`, `favorite`, `progress`.
**Dateien:** `app/read/page.tsx`, `lib/articles.ts` (`refetchArticle`).
**Abnahme:** Unit-Test für `refetchArticle` (Felder bleiben erhalten), Gerätetest.

### A8 · Wischgesten in der Bibliothek · G
Archivieren und Löschen brauchen heute einen genauen Treffer auf ein kleines
Icon. Auf dem Telefon ist Wischen die erwartete Geste.
**Ziel:** nach rechts = archivieren, nach links = löschen (mit demselben
Undo-Toast), mit `prefers-reduced-motion`-Rücksicht.
**Dateien:** `components/Library.tsx`, `app/globals.css`, `docs/MOTION.md` +
`lib/motion.test.ts` (neue Animation dokumentieren und prüfen).
**Abnahme:** Motion-Test grün, Gerätetest inklusive Fehlgriff-Rückweg.

### A9 · Schriftwahl im Reader
Vier Größen gibt es, aber nur eine Schriftfamilie. Serif ist für viele Leser
richtig, für manche nicht — und für Code-lastige Artikel selten.
**Ziel:** Umschalter Serif/Sans im Reader, Speicherung wie `fp-reader-size`.
**Dateien:** `app/read/page.tsx`, `app/globals.css`.
**Abnahme:** Kontrast-Test grün, beide Schriften bei allen vier Größen gesehen.

### A10 · Zeilenlänge und Rand prüfen lassen
Der Reader-Lab-Bericht misst Zeichen pro Zeile bereits (3 bis 53 im Korpus),
aber nichts erzwingt das Fenster. Eine CSS-Änderung kann es unbemerkt sprengen.
**Ziel:** Grenze (etwa 30–50 Zeichen bei 412 px) als Testbedingung.
**Dateien:** `scripts/reader-render.mjs`, `docs/READER-LAB.md`.
**Abnahme:** `npm run reader-render` schlägt bei absichtlich verstellter
`max-width` fehl. ⚠ Braucht `npx playwright install` — auf `lenovo` fehlt
Chromium derzeit (`chrome-headless-shell` nicht vorhanden).

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

## Teil B — Vorhaben über mehrere Läufe

### B1 · Wirklich offline: Bilder mit ablegen
**Das Versprechen stimmt noch nicht.** README und Welcome sagen, der Artikel
liege mit Bildern auf dem Telefon; tatsächlich speichert die App nur absolute
`img src`-URLs. Ohne Netz ist der Artikel bebildert leer — der Reader entfernt
die Bilder dann sogar (`naturalWidth === 0`). Zusätzlich lädt jedes Öffnen die
Bilder erneut beim fremden Server, der damit Lesezeit und IP mitbekommt: für
eine App, die mit „kein Tracking" wirbt, die größte offene Flanke.

| Etappe | Inhalt | Abnahme |
|---|---|---|
| B1.1 | Entscheidung + Messung: wie viele Bytes je Artikel, Obergrenze pro Bild und Artikel, Speicherort (IndexedDB-Blob-Store `images`, Schlüssel = SHA-256 der URL) | Notiz in `docs/`, Zahlen aus dem Korpus |
| B1.2 | DB-Schema auf Version 2, neuer Store, `normalize()` und Migration | Test: alte Bibliothek öffnet ohne Verlust |
| B1.3 | Beim Speichern Bilder nachladen (begrenzt parallel, Zeitbudget, Fehler tolerant) und `img src` auf `blob:`/Objekt-URL umschreiben | Fixture-Test mit Data-URI-Bild + Gerätetest im Flugmodus |
| B1.4 | Aufräumen: Bilder eines gelöschten Artikels verschwinden, Statistik in Settings zeigt Speicherbedarf | Test für die Aufräumfunktion |
| B1.5 | Texte korrigieren oder Versprechen einlösen — README, Welcome, Play-Beschreibung | Diff geprüft |

**Risiko:** Speicherplatz. Deshalb Obergrenze pro Artikel und ein Schalter
„Bilder mitspeichern" in den Einstellungen, standardmäßig an, im WLAN.

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

### B7 · Sprache: Deutsch als erste Sprache
Heute ist die Oberfläche englisch, die Rechtstexte deutsch, das Zielpublikum
des Play-Eintrags deutschsprachig. Die Texte stehen als Literale direkt im JSX
verteilt — es gibt keine Übersetzungsschicht, kein `strings.xml` auf Web-Seite,
kein `lang`-Handling außer dem festen `<html lang="en">`.

Erst entscheiden, dann bauen: **Deutsch als Standard mit englischem Rückfall**
ist der Vorschlag, weil Store-Eintrag, Impressum und Datenschutz ohnehin
deutsch sind und die Möbel-Erkennung in `lib/parse.ts` auf deutschsprachige
Seiten getrimmt ist. Reines Englisch bleibt vertretbar, wenn die App
international ausgerichtet werden soll — dann fällt B7 auf A4 zusammen.

| Etappe | Inhalt | Abnahme |
|---|---|---|
| B7.1 | Entscheidung festhalten (Deutsch zuerst oder Englisch zuerst) und alle Textstellen inventarisieren — Komponenten, `EMPTY_META`, `TAB_META`, Fehlermeldungen in `lib/parse.ts`, `aria-label`s, `Welcome.tsx` | Liste in `docs/`, Anzahl der Strings bekannt |
| B7.2 | Dünne Übersetzungsschicht: ein `lib/i18n.ts` mit `t("key")`, Sprache aus `navigator.language`, überschreibbar in den Einstellungen. Kein Framework — es sind wenige hundert Strings | Test: fehlender Schlüssel fällt auf, statt leer zu rendern |
| B7.3 | Strings umziehen, `<html lang>` dynamisch, Datums- und Zahlenformate mitziehen (`toLocaleString("de-DE")` steckt schon fest verdrahtet in `app/settings/page.tsx`) | `npm run build` grün, beide Sprachen durchgeklickt |
| B7.4 | `aria-label`s und Bildschirmleser-Texte mitübersetzt, Play-Store-Eintrag und Screenshots in der neuen Sprache | TalkBack-Durchgang (siehe B6) |
| B7.5 | Reader-Sprache: `article.lang` steht bereits im Datenmodell — Silbentrennung und Anführungszeichen je Artikel korrekt setzen | Reader-Lab-Lauf ohne neue Befunde |

**Achtung bei B7.3:** die Fehlermeldungen aus `lib/parse.ts` sind derzeit in
`lib/parse.test.ts` als Regex festgenagelt („came back empty", „private
addresses"). Werden sie übersetzt, gehören Schlüssel statt Klartext in die
Tests — sonst bricht der Testlauf bei jeder Textänderung.

---

## Reihenfolge, wenn niemand etwas anderes sagt

0. **B7.1** — Sprachentscheidung. Sie hängt A4 und jeden neuen Text davor;
   ohne sie schreibt der nächste Lauf Strings, die danach wieder umziehen.
1. **A2, A3, A4** — kleine Korrekturen, sofort erledigt, machen den Rest sauberer.
2. **B1** — das einzige offene *Versprechen*; bis dahin sind README und Welcome
   in einem Punkt schöner als die Wirklichkeit.
3. **A7, A5, A6** — sichtbarer Nutzen im Alltag.
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
- Ein Release erhöht `versionCode` **und** `versionName` (siehe A12).
