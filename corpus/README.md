## Der Reader-Korpus

37 echte Artikel von 21 Seiten, als HTML-Schnappschuss eingefroren. Der Korpus
ist die Messlatte fuer die Extraktion: `lib/parse.ts` laeuft ueber die
Schnappschuesse, und jede Aenderung am Reader wird als Differenz zweier
Reports belegt — nicht als Gefuehl.

### Warum eingefroren

Ein Live-Abruf misst jeden Tag etwas anderes: Redaktionen tauschen Texte,
Consent-Banner wechseln, Werbung rotiert. `corpus/snapshots/*.html.gz` haelt
den Stand fest, an dem die Befunde erhoben wurden. Damit ist `measure` offline,
deterministisch und zwischen zwei Branches vergleichbar.

### Benutzung

```bash
npm run corpus            # messen (offline, braucht nur die Snapshots)
npm run corpus:fetch      # fehlende Snapshots nachladen
node scripts/corpus.mjs pick   # URL-Liste neu ziehen — aendert die Messlatte!
```

`measure` schreibt `corpus/report.json` (alle Zahlen) und `corpus/report.md`
(Tabelle zum Draufschauen). Beide sind eingecheckt, damit ein PR die
Verbesserung im Diff zeigt.

`pick` ist absichtlich nichts, was man nebenbei laufen laesst: eine neue
URL-Liste macht alle frueheren Reports unvergleichbar.

### Was drin ist, und warum

| Gruppe         | Seiten                                                                                     | Gemessen wird                                    |
| -------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Nachrichten DE | welt, spiegel, zeit, sueddeutsche, tagesschau, heise, golem, t3n, netzpolitik, the-decoder | Brotkrumen, Consent- und Paywalls, Autorenzeilen |
| Nachrichten EN | arstechnica, theverge, techcrunch, bbc, guardian                                           | Bildergalerien, Einbettungen, Bildunterschriften |
| Blog           | simonwillison                                                                              | kurze Beitraege, Codeblocks                      |
| Referenz       | en/de.wikipedia, MDN, docs.python.org, web.dev                                             | Tabellen, Fussnoten, tiefe interne Links         |

`developer.android.com` fehlt bewusst: mit unserem eigenen User-Agent schickt
die Seite uns so lange zwischen Sprachversionen hin und her, bis der Abruf am
Redirect-Limit scheitert. Das misst den Abruf, nicht die Extraktion, und
gehoert getrennt betrachtet.

### Die Befunde

Jeder Artikel bekommt Flags. Ein Flag ist ein Befund, kein Geschmack — es
beschreibt etwas, das ein Leser auf dem Telefon sieht:

| Flag                                  | Bedeutung                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `first-chrome-*`, `last-chrome-*`     | erster/letzter Block ist Seitenmoebel (`nav`, `<a-gift>`, `<devsite-progress>`)      |
| `first-furniture`, `last-furniture`   | Text am Rand ist Navigation, Teilen-Leiste, Newsletter, Consent                      |
| `first-stub`, `first-empty`           | Artikel faengt mit einer Datumszeile oder gar nichts an                              |
| `furniture-inside`                    | Moebel mitten im Text, nicht nur am Rand                                             |
| `wall-not-article`                    | gespeichert wurde ein Consent- oder Paywall-Text, kein Artikel                       |
| `suspiciously-short`                  | unter 200 Woerter — meist ein abgeschnittener Artikel                                |
| `tables-lost`                         | Quelle hatte ≥3 Tabellen, im Ergebnis keine                                          |
| `table-wrapped`                       | Tabelle steckt in einem Wrapper — genau die Konstellation, die horizontal wegspringt |
| `wide-table`, `long-cell`             | >3 Spalten bzw. Zellen >120 Zeichen: passt nicht auf ein Telefon                     |
| `image-flood`                         | mehr als 40 Bilder, typischerweise Galerie- oder Teaser-Reste                        |
| `img-without-src`, `img-relative-src` | Lazy-Loading nicht aufgeloest, Pfad nicht absolut gemacht                            |
| `href-relative`                       | Link zeigt ins Leere, weil er relativ geblieben ist                                  |
| `empty-paragraphs`                    | leere Absaetze, die als Luecke gerendert werden                                      |
| `unsanitised-node`, `inline-handler`  | Sicherheitsnetz: haette der Sanitizer entfernen muessen                              |
| `no-author`, `no-lang`                | Kopfzeile bleibt leer                                                                |

### Ausgangsstand (8. August 2026, `lib/parse.ts` vor der Ueberarbeitung)

37 von 37 Artikeln extrahiert, **15 ohne Befund**, Median 587 Woerter.

Die schwersten Faelle:

- **welt.de** (2 von 2): erster Block ist `<nav>` mit
  `PfadnavigationHomePolitikDeutschland` — die Brotkrumen-Navigation der Seite
  steht als Textblock ueber dem Artikel.
- **golem.de** (2 von 2): gespeichert wird der Cookie-Dialog
  („Cookies zustimmen …", 254 Woerter), nicht der Artikel.
- **spiegel.de**: Paywall-Text „Diesen Artikel weiterlesen mit SPIEGEL+" als
  Artikelende, 123 Woerter Inhalt.
- **en.wikipedia.org**: 11 Tabellen in der Quelle, 0 im Ergebnis — bei einem
  Artikel, der aus Tabellen besteht.
- **the-decoder.de**: Tabelle mit 3 Spalten und einer 417 Zeichen langen Zelle,
  eingepackt in ein `div` — der Fall, der beim Scrollen seitlich wegspringt.
- **heise.de**: 307 Bilder in einem Artikel.
- **web.dev**, **heise.de**: leere Custom-Elemente (`<devsite-progress>`,
  `<a-gift>`) als erster und letzter Block.

Alle Zahlen dazu in `corpus/report.md`.
