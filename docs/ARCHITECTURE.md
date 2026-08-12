# FoldPage Android — vollständige Karte

Diese Datei ist die Referenz für jeden, der am Projekt weiterarbeitet. Sie
beschreibt, **was wo liegt, warum es so gebaut ist und welche Regeln nicht
gebrochen werden dürfen**, damit niemand den Code erneut kartieren muss.
Ergänzend: `README.md` (öffentliche Sicht), `docs/RELEASE.md` (Signieren und
Ausliefern), `docs/ROADMAP.md` (was als Nächstes ansteht),
`docs/READER-LAB.md`, `docs/CONTRAST.md`, `docs/MOTION.md` (Messwerte),
`docs/FUTURE-PROOFING.md` (Plattformfristen, Versionen, Browsereigenschaften).

Stand: 12. August 2026, App-Version 1.7 (`versionCode 9`), im geschlossenen
Test bei Google Play.

---

## 1. Was die App ist

Ein Read-it-later-Reader ohne Server, ohne Konto, ohne Tracking. Ein Link kommt
per Android-Share-Intent oder Eingabefeld herein, die App holt die Seite selbst,
extrahiert den Artikel und legt ihn lokal ab. Alles Weitere — Lesen, Suchen,
Taggen, Exportieren — passiert offline auf dem Gerät.

Technisch: **Next.js 16 (App Router, `output: "export"`) + React 19**, statisch
exportiert nach `out/`, verpackt in eine **Capacitor-8-WebView**. Es gibt
keinerlei Backend, keine Route Handler, keine Server Components mit Laufzeit —
der Export ist reines HTML/JS/CSS im APK.

| Eckdaten | Wert |
|---|---|
| Package / applicationId | `de.ithandwerk.foldpage` |
| minSdk / target / compileSdk | 24 / 36 / 36 |
| Berechtigungen | `INTERNET` (Manifest), `VIBRATE` (vom Haptics-Plugin gemerged) |
| Origin in der WebView | `https://localhost` (fest in `capacitor.config.ts`) |
| Speicher | IndexedDB `foldpage`, **Version 3**, Stores `articles` + `images` + `postings` |
| Auslieferung | Play Store (AAB), zusätzlich signierte APK auf GitHub Releases |

**Der Origin ist heilig.** `server.androidScheme: "https"` + `hostname:
"localhost"` stehen in `capacitor.config.ts` fest verdrahtet, weil IndexedDB
pro Origin getrennt ist. Wird das Schema geändert, sieht ein Update die alte
Bibliothek nicht mehr — jeder gespeicherte Artikel wäre für den Nutzer weg,
ohne Fehlermeldung.

---

## 2. Verzeichnisbaum mit Zweck

```
app/                    Next.js App Router — drei Routen
  layout.tsx            html/body, Metadaten, mountet AppNav + NativeShell
  page.tsx              "/" — rendert <Library/>
  read/page.tsx         "/read/?id=<uuid>" — der Reader
  settings/page.tsx     "/settings/" — Statistik, Import, Export, Rechtstexte
  globals.css           1076 Zeilen: Farbtokens, Reader-Typografie, Navigation,
                        Motion. Einzige Stelle für Design-Entscheidungen.
components/
  Library.tsx           529 Z. — die Bibliothek: Tabs, Suche, Tag-Filter,
                        Speichern, Karten, Undo-Toast, Share-Intent-Empfang
  AppNav.tsx            Bottom-Navigation, lebt im Layout (siehe 6.)
  DisplaySettings.tsx   Theme/Größe/Schrift/Ausrichtung/Zeilenabstand (siehe 6a.)
  DisplaySheet.tsx      dieselben Regler als <dialog> im Reader
  SwipeRow.tsx          Wischen: rechts archivieren, links löschen (Knöpfe bleiben)
  TopBar.tsx            Kopfzeile: Logo oder Zurück-Link + rechte Aktionen
  TagEditor.tsx         Chips + Eingabefeld im Reader
  Welcome.tsx           Einmaliger Erststart-Dialog (+ SVG-Marke)
  icons.tsx             Alle Icons als Inline-SVG (keine Icon-Library)
lib/
  types.ts              `Article`, `ParseResult` — das Datenmodell
  db.ts                 IndexedDB über `idb`, alle Lese-/Schreibwege
  articles.ts           `addArticleFromUrl`, `refetchArticle` — Abruf, Dublette, Speichern
  refetch.ts            reine Zusammenführung beim Neuladen (ohne DB/Capacitor)
  display.ts            Anzeige-Einstellungen (siehe 6a.)
  searchIndex.ts        Tokenizer und Abfrageplan (rein, testbar)
  search.ts             Suche über den Index, mit Rückfall aufs Lesen
  imagePlan.ts          welche Bilder behalten werden (rein, testbar)
  images.ts             Bilder holen, ablegen, anzeigen, aufräumen
  parse.ts              409+ Z. — Abruf, Extraktion, Möbelentfernung, Sanitizer
  native.ts             Capacitor-Brücke: Haptik, Statusleiste, Splash, Dateien,
                        externe Links, Hardware-Zurück, ShareTarget-Plugin
  importExport.ts       Pocket-CSV / Bookmarks-HTML rein, JSON/HTML/MD raus
  *.test.ts             node:test — Extraktion, Kontrast, Motion, Fixtures
  fixtures/*.html       6 Offline-Testseiten mit Data-URI-Bildern
android/                Capacitor-Android-Projekt
  app/build.gradle      Signatur, Minify, Versionen
  app/src/main/java/de/ithandwerk/foldpage/
    MainActivity.java   Insets → CSS, registriert ShareTargetPlugin
    ShareTargetPlugin.java  ACTION_SEND (kalt + warm)
  app/src/main/AndroidManifest.xml  Intent-Filter, FileProvider
  variables.gradle      SDK- und AndroidX-Versionen
  keystore.properties   ⚠ nicht im Git — Signaturpasswörter
corpus/                 39 eingefrorene Artikel-Snapshots + Messberichte
scripts/
  corpus.mjs            pick / fetch / measure — die Extraktions-Messlatte
  reader-render.mjs     Playwright: gebauten Reader bei 412×915 messen
  make-assets.mjs       Icon-/Splash-Quellen erzeugen
  adaptive-icon.mjs     Adaptive-Icon-Nachbearbeitung
  release-build.sh      ⚠ stillgelegt, bricht absichtlich ab
docs/                   diese Datei + ROADMAP/FUTURE-PROOFING/RELEASE/READER-LAB/
                        CONTRAST/MOTION, datenschutz/ + impressum/ (Pages), screenshots/
```

---

## 3. Datenmodell

`lib/types.ts` — ein Artikel ist ein flaches Objekt, `id` ist der Primärschlüssel:

| Feld | Typ | Bemerkung |
|---|---|---|
| `id` | string | `crypto.randomUUID()` |
| `url` / `canonicalUrl` | string | Original bzw. `<link rel=canonical>`; Dubletten werden über beide erkannt |
| `title`, `author`, `siteName`, `excerpt`, `lang` | string/null | aus der Extraktion |
| `contentHtml` | string | **bereinigtes** Reader-HTML, wird mit `dangerouslySetInnerHTML` gerendert |
| `wordCount`, `readingMin` | number | `readingMin = max(1, round(wordCount/220))` |
| `state` | `"inbox" \| "archived"` | Favoriten sind **kein** State, sondern ein Flag |
| `favorite` | boolean | |
| `progress` | 0..1 | Lesefortschritt; ≥ 0.98 gilt als gelesen |
| `tags` | string[] | kleingeschrieben, max. 100 Zeichen je Tag |
| `source` | `"manual" \| "import" \| "share"` | Eingabefeld, Import, oder Share-Intent bzw. `?add=` |
| `addedAt`, `readAt`, `modifiedAt` | epoch ms | `modifiedAt` bei jeder Änderung neu |
| `deleted` | boolean | **Soft Delete** (Tombstone), damit Undo verlustfrei ist |

`lib/db.ts` kapselt jeden Zugriff. Wichtig:

- `listArticles()` filtert Tombstones heraus und sortiert nach `addedAt` absteigend.
- `listAllRaw()` liefert inklusive Tombstones — für eine spätere Sync.
- `normalize()` füllt Felder nach, die es in der ersten Version noch nicht gab
  (`modifiedAt`, `deleted`, `tags`). **Jedes neue Feld gehört dort hinein**, sonst
  laufen alte Bibliotheken auf `undefined`.
- `searchArticles()` ist eine lineare Volltextsuche über Titel, Excerpt, Site,
  Autor, Tags und `contentHtml` — kein Index. Bei ein paar hundert Artikeln
  unauffällig, bei mehreren tausend nicht mehr (Roadmap).
- Schema-Version ist **2** (seit 12.08.2026, Store `images`). Eine weitere
  Änderung an den Stores braucht den nächsten Bump samt Migrationspfad; ohne
  Bump greift `upgrade` nie. Die Migration auf 2 ist additiv und fasst keinen
  Artikel an — `oldVersion` entscheidet, was angelegt wird.
- **Wortindex** im Store `postings`, Schlüssel `[term, id]`, Index `by-id`.
  Ein Datensatz je Wort und Artikel — Hinzufügen ist eine Reihe von `put`,
  Entfernen ein Bereichslöschen über `by-id`; kein Array, das gelesen,
  umgeschrieben und dabei überholt werden kann. Suche und Grenzen:
  `lib/search.ts`, Zahlen in `docs/ROADMAP.md` (B2).
- **Bilder** liegen im Store `images`, Schlüssel ist der SHA-256 der Bild-URL;
  zwei Artikel mit demselben Bild teilen sich die Kopie. Details, Grenzen und
  die Messung dahinter: `docs/IMAGE-STORAGE.md`.

---

## 4. Der Weg eines Links (Kernfluss)

```
Share-Intent (ACTION_SEND) ─┐
Eingabefeld in der Library ─┼─► addArticleFromUrl(url)      lib/articles.ts
?add=/​?url=/​?text= in der URL ┘        │
                                       ├─ parseUrl(url)                lib/parse.ts
                                       │    ├─ assertFetchable()   Schema + private IPs
                                       │    ├─ CapacitorHttp.get() nativ, kein CORS
                                       │    ├─ extractArticle(html, finalUrl)
                                       │    │    ├─ DOMParser (inertes Dokument)
                                       │    │    ├─ absolutize()      relative URLs
                                       │    │    ├─ Readability       Artikelkern
                                       │    │    ├─ cleanArticleEdges()  Möbel an den Rändern
                                       │    │    └─ sanitize()        Allowlist + Tabellen + Bilder
                                       ├─ findByUrl(canonicalUrl)  Dublettenprüfung
                                       └─ saveArticle()            IndexedDB
```

### 4.1 Abrufschutz (`assertFetchable`)
Nur `http`/`https`; abgewiesen werden `localhost`, `::1`, `0.*`, `10.*`,
`127.*`, `169.254.*` (Cloud-Metadaten!), `192.168.*`, `172.16–31.*` und
`*.local`. IPv6 wird vorher aus den eckigen Klammern gelöst. **Das ist der
SSRF-Schutz** — die App läuft im Heimnetz und darf nicht auf Router, NAS oder
Nachbargeräte losgehen.

### 4.2 Extraktion
`@mozilla/readability` gegen ein **inertes** DOMParser-Dokument. Nie im Live-DOM
bauen: dort würde jedes `<img>` sofort laden und sein `onerror` feuern, also
fremdes Script laufen, bevor der Sanitizer überhaupt drankommt.

### 4.3 Möbelentfernung (`cleanArticleEdges`)
Läuft **nach** Readability und **nur an den beiden Rändern** des Ergebnisses,
niemals im Fließtext — sonst reißt ein Stichwort wie „Navigation" mitten im
Artikel ein Loch. Erkannt werden: leere Blöcke, `nav`/`aside`/`header`/`footer`,
Link-Listen (>60 % Linktext), sehr kurze Blöcke ohne echtes Bild, Consent- und
Paywall-Formeln (Regex `EDGE_FURNITURE`, deutschsprachig gewachsen) sowie leere
Custom-Elemente. Generische Wrapper werden erst innen gesäubert und dann
bewertet, weil ein Wrapper Möbel **und** den ganzen Artikel enthalten kann
(t3n ist genau dieser Fall).

### 4.4 Sanitizer (`sanitize`, seit 12.08.2026 Allowlist)
Der gespeicherte HTML-Block wird im eigenen Origin per
`dangerouslySetInnerHTML` gerendert — was dort ausgeführt wird, kann die
komplette Bibliothek aus IndexedDB lesen. Deshalb **Allowlist statt Blocklist**:

- `ALLOWED_TAGS`: Fließtext, Listen, Tabellen, Medien, Links. Alles andere wird
  **entpackt** (Kinder bleiben, Element verschwindet) — so überleben Texte in
  Custom-Elementen wie `<a-gift>`.
- `DROPPED_TAGS`: samt Teilbaum weg. Darunter `BASE` (ein `<base href>` würde
  jede relative URL der App umbiegen), `SVG` und `MATH` (deren Parser akzeptieren
  Konstrukte, die HTML nicht kennt — `<animate attributeName="href">`,
  `foreignObject`), Formularelemente, `TEMPLATE`, `NOSCRIPT`, `CANVAS`.
- Attribute: `GLOBAL_ATTRS` (`id`, `lang`, `dir`, `title`) plus eine Liste je
  Tag. **`class` und `style` sind bewusst nicht dabei** — Quellklassen könnten
  mit App-Klassen kollidieren, ein `style="position:fixed;inset:0"` die eigene
  Oberfläche überdecken. Die Reader-Klassen (`tablewrap`, `numeric`, `prose`)
  setzt die App danach selbst.
- URLs: nur `http(s)`, `mailto`, `tel`, `#fragment` und `data:image/*`.
  Pfad-relative Ziele fliegen raus, weil sie nach `absolutize()` nur noch gegen
  den App-Origin auflösen würden — ein Tipp darauf liefe in eine Route, die es
  nicht gibt.

Messbar: gleicher Wortbestand (85.676 Wörter über den Korpus), aber **22,5 %
weniger gespeicherte HTML-Bytes**, und der Befund `href-relative` ist von 1 auf
0 gefallen.

### 4.5 Tabellen und Bilder (`prepareTables`, `prepareMedia`)
- Jede Tabelle bekommt einen `div.tablewrap` als **stabilen Scroll-Elternteil**;
  ohne den springt die horizontale Position beim vertikalen Scrollen zurück.
- Zellen, die wie Zahlen aussehen (`NUMERIC_CELL`), bekommen `.numeric` für die
  rechtsbündige Ausrichtung — nicht über die Spaltenposition geraten.
- Tabellen mit Zellen > 80 Zeichen sind auf dem Telefon keine Tabellen: sie
  bekommen `.prose` und werden per CSS zu beschrifteten Blöcken gestapelt
  (`data-label` je Zelle).
- Bilder unter 100 px Attributgröße fliegen raus (Zählpixel, Logos). Bekannte
  Maße werden als `aspect-ratio` reserviert, `loading="lazy"`,
  `decoding="async"`. Ein Bild mit direkt folgender Kurz-Caption
  („Foto: …", „Quelle: …") wird zu `<figure>` + `<figcaption>` gepaart.
- Was erst der Browser weiß — Bild lädt nicht, oder ist real < 100 px —
  entfernt der Reader zur Laufzeit (`app/read/page.tsx`, `ArticleContent`).

---

## 5. Die drei Oberflächen

### Library (`components/Library.tsx`)
- Drei Ansichten über **einen** State `tab`: `inbox`, `archived`, `favorites`.
  Inbox/Archive filtern auf `state`, Favoriten auf das Flag.
- Suche ist global: sobald `query` gesetzt ist, wird der Tab-Filter übersprungen.
- Scrollposition je Tab in `sessionStorage` (`foldpage:scroll:<tab>`),
  Wiederherstellung in einem `requestAnimationFrame`.
- Tab-Wechsel macht `history.pushState({foldPageSection}, "", "/?tab=…")` —
  deshalb läuft die Hardware-Zurück-Taste durch die Bereiche, statt die App
  zu schließen.
- Löschen = Soft Delete + Toast mit *Undo*, 6 Sekunden. Kein Bestätigungsdialog.
- Haptik trennt die Verben: setzen = `commit()` (mittel), zurücknehmen =
  `uncommit()` (leicht), löschen = `discard()` (Warnmuster).
- Der Share-Intent wird **hier** abgeholt (`ShareTarget.consume()` beim Kaltstart,
  Event `shared` im Warmstart) — die Bibliothek ist die einzige Route, die
  garantiert existiert.
- `addingRef` verhindert doppeltes Speichern, wenn kalt und warm zusammenfallen.

### Reader (`app/read/page.tsx`)
- Statischer Export kennt keine dynamischen Segmente → die ID steht in der
  Query: `/read/?id=<uuid>`.
- Vier Schriftgrößen (`SIZES`), in `localStorage["fp-reader-size"]`. Beim
  Umschalten wird die **relative** Leseposition gehalten (zwei `rAF`, weil der
  Reflow erst im zweiten Frame steht).
- Fortschritt wird beim Scrollen berechnet und **debounced** (500 ms) gespeichert;
  ab 0.98 wird `readAt` gesetzt.
- `ArticleContent` ist `memo`-gekapselt. Grund: jeder Fortschritts-Render würde
  sonst die `.tablewrap`-Elemente neu erzeugen und deren `scrollLeft` verlieren.
- Der `.tablewrap` bekommt `has-more`, solange rechts noch etwas steht
  (ResizeObserver + Scroll-Listener).
- „Reload" holt die Seite erneut (`refetchArticle`). Was dabei ersetzt wird und
  was bleibt, entscheidet `lib/refetch.ts` — Text und Metadaten neu, alles vom
  Leser (Tags, Stern, Ablage, Fortschritt) unangetastet.
- Links im Artikel behandelt **nicht** der Reader, sondern global
  `wireExternalLinks()` — ein zweiter Listener würde jeden Link doppelt öffnen.

### Settings (`app/settings/page.tsx`)
- Statistik (Anzahl, Wörter), Import (Pocket-CSV / Bookmarks-HTML, sequenziell
  mit Abbrechen-Knopf), Export (JSON / HTML / Markdown), Rechtstext-Links.
- Import, der den Artikel nicht laden kann, legt einen **Link-only-Eintrag** an
  (`contentHtml: ""`); der Reader zeigt dafür einen eigenen Hinweis.
- Export schreibt nach `Documents` und öffnet danach das Android-Share-Sheet —
  eine WebView kann keinen normalen Download auslösen.

---

## 6. Native Brücke (`lib/native.ts` + Java)

| Thema | Wo | Was man wissen muss |
|---|---|---|
| Share-Intent | `ShareTargetPlugin.java` | Kaltstart: Wert wird geparkt, `consume()` holt ihn einmal ab. Warmstart: Event `shared`. Der Intent wird nach der Übernahme durch `ACTION_MAIN` ersetzt, sonst speichert ein wiederhergestellter Prozess denselben Artikel erneut. Registrierung passiert **vor** `super.onCreate`, sonst sieht `load()` den Launch-Intent nicht. |
| Insets | `MainActivity.forwardInsetsToCss()` | Unter SDK 36 erzwingt Android Edge-to-Edge, aber `env(safe-area-inset-top)` kommt in dieser WebView als 0 an. Die echten Insets werden als `--fp-inset-*` in CSS geschrieben; `globals.css` bevorzugt sie und fällt auf `env()` zurück. **Kein `EdgeToEdge.enable()`** — das legt einen System-Scrim über die App. |
| Haptik | `native.ts` `pulse()` | `Haptics.impact` löst still nichts aus, wenn „Vibration bei Berührung" aus ist — das Promise erfüllt trotzdem. Deshalb zusätzlich `Haptics.vibrate` und als letzter Ausweg `navigator.vibrate`. |
| Statusleiste | `applyStatusBar()` | Kein Overlay; die Leiste bekommt die Papierfarbe. Dunkles Theme = helle Icons (`Style.Dark`), sieht invertiert aus, ist aber richtig. Wird bei Systemtheme-Wechsel neu gesetzt. |
| Externe Links | `wireExternalLinks()` | Ein globaler Click-Listener; alles außerhalb des eigenen Origins geht an den System-Browser. Verhindert, dass eine fremde Seite ohne Chrome in der App-WebView landet. |
| Hardware-Zurück | `wireBackButton()` | Verlässt erst Reader/Settings/Bereiche, schließt die App erst am ursprünglichen Bibliothekseintrag (`history.state.foldPageSection` fehlt). |
| Splash | `hideSplash()` | Wird nach **zwei** `requestAnimationFrame` versteckt: erster committet das DOM, zweiter malt es. |

`AppNav` hängt im **Root-Layout**, nicht in den Seiten. Pro Seite gerendert
wurde die Leiste bei jedem Routenwechsel neu gemountet und sprang sichtbar.
Im Reader gibt `AppNav` `null` zurück — dort gehört der untere Rand der
eigenen Werkzeugleiste.

---

## 7. Styling und Motion

Alles in `app/globals.css`, Tailwind v4 nur als Utility-Ergänzung.

- Farbtokens auf `:root`, Dark-Theme über `prefers-color-scheme` — **kein**
  manueller Theme-Schalter, das Theme folgt dem System.
- Der gelbe Akzent (`--highlight`) ist Fläche, Unterstreichung oder Marke. Als
  Textfarbe wird `--accent-text` benutzt, weil Gelb auf Weiß sonst durchfällt.
- Zwei Motion-Tokens: `--dur-fast: 150ms`, `--dur-med: 250ms`.
- **Regel, die schon einmal gebrochen wurde:** Seiten-Wrapper animieren mit
  `fill: backwards`, nie `forwards`/`both`. Ein liegengebliebener `transform`
  macht das Element zum Containing Block für seine `position: fixed`-Kinder —
  genau so landete die Bottom-Navigation einmal mitten im Bildschirm.
- Beides ist **getestet, nicht nur dokumentiert**: `lib/contrast.test.ts` liest
  die Tokens und erzwingt WCAG AA (4.5:1), `lib/motion.test.ts` prüft Dauern,
  Fill-Modes und die `prefers-reduced-motion`-Abschaltung.

---

## 6a. Anzeige-Einstellungen (seit 12.08.2026)

Fünf Einstellungen, eine Quelle: `lib/display.ts`.

| Einstellung | Werte | Wirkung |
|---|---|---|
| `theme` | `system` · `light` · `dark` | Farbpalette, dazu `color-scheme` und die native Statusleiste |
| `size` | 0–3 | `--reader-size`, die vier Textgrößen |
| `font` | `serif` · `sans` | `--reader-family` |
| `align` | `left` · `justify` | Blocksatz mit `hyphens: auto` |
| `leading` | `cozy` · `airy` | `--reader-leading` (1.68 / 1.95) |

**Wie es zusammenhängt:**

- Gespeichert wird ein einziges Objekt unter `localStorage["fp-display"]`.
  `normalizePrefs()` repariert jeden Wert, der nicht passt — eine kaputte Zeile
  im Speicher darf die App nicht unlesbar machen. Die alte Größe aus
  `fp-reader-size` wird einmalig übernommen.
- `applyPrefs()` schreibt die Werte als **Attribute auf `<html>`**
  (`data-theme`, `data-align`, `data-font`, `data-leading`) plus die
  CSS-Variable `--reader-size`. Danach macht die Arbeit ausschließlich das
  Stylesheet; keine Komponente reicht Werte durch.
- **Kein Flackern:** `app/layout.tsx` enthält ein kleines Inline-Skript
  (`APPLY_DISPLAY_PREFS`), das dieselben Attribute **vor dem ersten Paint**
  setzt. Ohne das zeigte jeder Start kurz das Systemtheme. Es ist bewusst eine
  zweite Umsetzung derselben Defaults — deshalb prüft `lib/display.test.ts`,
  dass Skript und Modul dieselben Werte kennen.
- React abonniert über **`useSyncExternalStore`** (`useDisplayPrefs()` in
  `components/DisplaySettings.tsx`), nicht über State plus Effekt: die
  Einstellungen leben außerhalb von React. `getPrefs()` gibt dasselbe Objekt
  zurück, solange sich nichts ändert — ein frisch gebautes Objekt pro Aufruf
  würde React in eine Endlosschleife schicken.
- Dieselbe Komponente erscheint an zwei Stellen: als Abschnitt „Appearance" in
  den Einstellungen und als Bottom-Sheet hinter dem Zahnrad im Reader.
- Das Sheet ist ein echtes `<dialog>` (`showModal`) — Fokusfalle, Esc und
  Inertheit der Seite dahinter gibt es damit geschenkt. Die **Hardware-Zurück-
  Taste** schließt es: `wireBackButton()` prüft zuerst auf `dialog[open]`.
- Jede Typografie-Änderung reflowt den Artikel. Der Reader merkt sich die
  **relative** Leseposition und stellt sie nach zwei `requestAnimationFrame`
  wieder her (`layoutKey`-Effekt in `app/read/page.tsx`).
- Der Reader setzt `lang` aus `article.lang`, damit die Silbentrennung im
  Blocksatz nach den Regeln der Artikelsprache bricht.

**Farbtokens:** `:root` hält Hell, die Media Query bedient „System", zwei
explizite Blöcke `:root[data-theme="light"|"dark"]` gewinnen über
Spezifität (0,2,0 gegen 0,1,0). Die dunklen Werte stehen zwangsläufig zweimal
im Stylesheet — `lib/contrast.test.ts` prüft, dass beide Fassungen identisch
sind.

## 7a. Sprache der Oberfläche

**Die App spricht Englisch.** Jeder sichtbare String steht als Literal direkt
im JSX — es gibt keine Übersetzungsschicht, keinen Sprachschalter, und
`app/layout.tsx` setzt fest `<html lang="en">`.

Deutsch sind genau drei Stellen, und das ist ein Bruch, kein Konzept:

| Stelle | Text |
|---|---|
| `lib/native.ts:174` | `dialogTitle: "Export teilen"` im Android-Share-Sheet |
| `app/settings/page.tsx:251` | Fußzeilen-Link „Datenschutz" |
| `app/settings/page.tsx:255` | Fußzeilen-Link „Impressum" |

Dazu kommt Umfeld, das durchgehend deutsch ist: die verlinkten Rechtstexte
(`docs/datenschutz/`, `docs/impressum/`), die Zahlenformatierung
(`toLocaleString("de-DE")` in `app/settings/page.tsx`), die Möbel-Regex
`EDGE_FURNITURE` in `lib/parse.ts` (auf deutsche Consent- und Paywall-Formeln
getrimmt), die Projektdokumentation und der Play-Eintrag.

**Entschieden am 12.08.2026: die App ist international und bleibt englisch.**
Jeder neue Oberflächentext wird englisch geschrieben. Deutsch bleiben nur
Impressum, Datenschutz und die deutschsprachigen Muster in `EDGE_FURNITURE`
(`lib/parse.ts`) — das sind Erkennungsregeln für deutsche Consent- und
Paywall-Formeln, kein Oberflächentext. Die drei deutschen Stellen oben werden
englisch gefasst (`docs/ROADMAP.md`, A4).

## 8. Qualitätssicherung

| Befehl | Was er tut | Dauer/Bedarf |
|---|---|---|
| `npm test` | 14 Tests: Extraktion, Sanitizer-Allowlist, Kontrast, Motion, 6 Fixtures | ~15 s, offline |
| `npm run corpus` | `extractArticle` über 39 eingefrorene Snapshots, schreibt `corpus/report.{json,md}` | ~1 min, offline, deterministisch |
| `npm run reader-render` | baut den Export und misst ihn mit Playwright/Chromium in **zwei** Viewports — Telefon 412×915 und Tablet 1024×768 —, DPR 2, hell + dunkel; schreibt `corpus/reader-report.json` + Screenshots (nur Telefon) | mehrere Minuten, braucht Chromium (`npx playwright install`) |
| `npx eslint` | Lint (eslint-config-next) | schnell |
| `node scripts/library-bench.mjs` | sät eine synthetische Bibliothek und misst Öffnen, Suche, Stern | ~1 min, braucht Chromium |
| `node scripts/a11y-audit.mjs` | strukturelle Barrierefreiheit über drei Routen, dazu 200 % Systemschrift | ~1 min, braucht Chromium |
| `node scripts/image-budget.mjs` | misst reale Bildgrößen — **braucht Netz**, gehört nicht in einen Testlauf | mehrere Minuten |

`corpus/report.json` und `report.md` sind **eingecheckt**. Eine Änderung an der
Extraktion muss ihren Effekt dort im Diff zeigen — Zahlen statt Gefühl.
`node scripts/corpus.mjs pick` würde die Messlatte selbst austauschen und
gehört nicht in einen normalen Lauf.

---

## 9. Bauen und ausliefern

```bash
npm install
npm run build                 # statischer Export nach out/
npx cap sync android          # Export + Plugins ins Android-Projekt
cd android && ./gradlew assembleDebug     # Debug-APK
```

Kurzform: `npm run apk:debug`. Release: siehe `docs/RELEASE.md` — signiert wird
mit dem Play-Upload-Key aus `~/Android APP KEY/FOLDPAGE.jks`, Passwörter in
`android/keystore.properties` (nicht im Repo, Modus 600).
`scripts/release-build.sh` ist stillgelegt und bricht absichtlich ab.

⚠ **`npm run build` allein reicht nie für einen Gerätetest.** Ohne `cap sync`
liegt der alte Export in `android/app/src/main/assets/public/`, und das Gerät
zeigt den vorherigen Stand — ein Fehler, der wie „meine Änderung wirkt nicht"
aussieht.

⚠ **Minify ist an** (`minifyEnabled`, `shrinkResources`). Capacitor lädt Plugins
per Reflection; `proguard-rules.pro` hält `com.getcapacitor.**`,
`com.capacitorjs.plugins.**`, `org.apache.cordova.**` und alles mit
`@JavascriptInterface`. Ein neues Plugin außerhalb dieser Pakete braucht eine
eigene `-keep`-Regel, sonst fällt es erst zur Laufzeit auf.

⚠ **Signatur-Bruch 1.4 → 1.5.** Bis 1.4 wurde ein anderer Keystore benutzt; ein
direktes APK-Update lehnt Android ab. Betrifft niemanden, 1.4 war nie öffentlich.

---

## 10. Fallen, die schon Zeit gekostet haben

1. **Origin ändern = Bibliothek weg.** `androidScheme`/`hostname` nie anfassen.
2. **`cap sync` vergessen** — Gerät zeigt den alten Stand (siehe oben).
3. **Zwei Klick-Listener für Links** — jeder Artikel-Link öffnete doppelt.
   Externe Links gehören ausschließlich in `wireExternalLinks()`.
4. **`ArticleContent` ohne `memo`** — Tabellen springen beim Scrollen zurück.
5. **`fill: forwards` auf Seiten-Wrappern** — die Bottom-Navigation schwebt.
6. **Möbel-Regex im Fließtext anwenden** — reißt Absätze aus Artikeln.
7. **Sanitize im Live-Dokument** — führt fremdes Script aus, bevor es entfernt ist.
8. **Neues `Article`-Feld ohne `normalize()`** — alte Bibliotheken kippen auf
   `undefined`.
9. **IndexedDB-Store ändern ohne Versions-Bump** — `upgrade` läuft nie.
10. **`EdgeToEdge.enable()` in `MainActivity`** — legt einen System-Scrim über
    die App.
11. **Paket-Sichtbarkeit ab Android 11** — ohne `<queries>` mit
    `android.intent.action.TTS_SERVICE` im Manifest meldet das Telefon genau
    **eine** Sprach-Engine (die Standard-Engine), egal wie viele installiert
    sind. Kein Fehler, kein Logeintrag. Siehe `docs/SPEECH.md`.
12. **Anführungszeichen haben keine feste Seite** — `»` `«` öffnen im Deutschen
    und schließen im Französischen, `“` schließt im Deutschen und öffnet im
    Englischen. Leerzeichen daran zu „korrigieren" verklebt Wörter. Nur `„` und
    `”` sind eindeutig.

---

## 11. Was es bewusst **nicht** gibt

- Kein Konto, keine Cloud-Sync, keine Analytik, kein Crash-Reporting, kein Ad-SDK.
  Der einzige ausgehende Request ist der Abruf einer Seite, die der Nutzer
  speichern will (plus die Bilder, die der Artikel referenziert — siehe Roadmap).
- Kein Server, keine API-Route: `output: "export"` schließt das aus.
- Kein manueller Theme-Schalter, keine Icon-Library, kein State-Management-Paket.
- `components/BottomNav.tsx` ist der abgelöste Vorgänger von `AppNav` und wird
  nirgends importiert — beim Aufräumen zuerst löschen.
