## Zusammenfassung

**Nachtrag 12. August 2026:** Das Lab misst seit diesem Tag zwei Viewports —
Telefon 412 × 915 und Tablet 1024 × 768, jeweils hell und dunkel. Grund ist
Android 17: ab `sw600dp` ignoriert das System jede Orientierungs- und
Größenbeschränkung einer App, ein reines Telefon-Layout ist damit keine Option
mehr. Ergebnis des ersten Laufs: **156 Renderings, 84 Tabellenprüfungen, 0
Befunde**, keine Seitenüberläufe in beiden Formaten. Screenshots entstehen
weiterhin nur im Telefonformat. Die Messwerte unten stammen aus dem Lauf vom
8. August und beschreiben das Telefonformat.

**Nachtrag 12. August 2026, Zeilenlänge:** Der Lab prüft die Zeilenlänge jetzt
als **Bedingung**, nicht mehr nur als Notiz — über 75 Zeichen ist ein
Fehlschlag, bewertet werden nur Absätze ab 200 Zeichen (kurze Syntaxkästen bei
MDN oder Überschriften bei web.dev sind Inhalt, kein Layoutfehler, und ein
Fehlschlag darauf würde nur dazu führen, dass der Lauf ignoriert wird). Eine
Untergrenze gibt es aus demselben Grund nicht.

Der erste Lauf dieser Prüfung fand sofort etwas: **auf dem Tablet lag der Median
bei 93 Zeichen je Zeile, das Maximum bei 141.** `max-width: 39em` unterstellte
eine Zeichenbreite, die diese Schrift nicht hat — auf dem Telefon fiel das nie
auf, weil dort die Seitenränder die Breite bestimmen. Behoben mit
`max-width: min(39em, 56ch)`, also einer Grenze in der Einheit, um die es
tatsächlich geht:

| | Telefon 412 px | Tablet 1024 px |
|---|---:|---:|
| vorher | Median 41, Max 56 | Median **93**, Max **141** |
| nachher | Median 41, Max 56 | Median **51**, Max 78 |

Die 78 stammen aus einem Absatz unter 200 Zeichen und werden nach der Regel
oben nicht bewertet. Der Lauf umfasst seither **37 Artikel** — zwei
golem-Schnappschüsse liefern seit B5.5 gar keinen Artikel mehr, sondern die
ehrliche Meldung „Paywall statt Artikel", und stehen als `notExtracted` im
Bericht statt als gerendertes Nichts.

Stand 8. August 2026: 37 von 37 gespeicherten Artikeln wurden offline extrahiert und bei 412 × 915 px, DPR 2, in hellem und dunklem Theme gerendert (74 Renderings). Es gab **0 führende Fremdblöcke**, **0 springende Tabellen** bei 26 Tabellenmessungen und **0 Seitenüberläufe**. Von 748 Bildinstanzen wurden 66 tatsächlich geladen und geprüft; 682 blieben wegen externer, im Offline-Korpus nicht mitgespeicherter Dateien ungeprüft. Bei den geladenen Bildern gab es 0 kaputte und 0 zu breite Bilder.

Die vollständigen Rohdaten stehen in `corpus/report.json` und `corpus/reader-report.json`. Tabellenwerte sind `Spalten/Zeilen/scrollbar/stabil`; L/D steht für hell/dunkel. Bildwerte sind `gesamt/geladen/kaputt/zu breit`.

## Messwerte je Artikel

| Quelle | Wörter | Vorlauf L/D px | Fremdblöcke L/D | Tabellen | Bilder | Überlauf L/D | Zeichen/Zeile L/D | Links L/D (alle unterstrichen) |
|---|---:|---:|---:|---|---|---|---:|---:|
| welt.de | 383 | 0/0 | 0/0 | — | 1/1/0/0 | nein/nein | 17/17 | 2/2 |
| welt.de | 617 | 0/0 | 0/0 | — | 1/1/0/0 | nein/nein | 5/5 | 2/2 |
| the-decoder.de | 731 | 0/0 | 0/0 | 3/2/ja/ja | 0/0/0/0 | nein/nein | 31/31 | 9/9 |
| the-decoder.de | 424 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 30/30 | 7/7 |
| the-decoder.de | 207 | 0/0 | 0/0 | — | 1/1/0/0 | nein/nein | 8/8 | 6/6 |
| heise.de | 19498 | 0/0 | 0/0 | — | 307/3/0/0 | nein/nein | 37/37 | 370/370 |
| heise.de | 658 | 0/0 | 0/0 | — | 1/1/0/0 | nein/nein | 34/34 | 5/5 |
| golem.de | 29 | 31/31 | 0/0 | — | 0/0/0/0 | nein/nein | 53/53 | 2/2 |
| golem.de | 29 | 31/31 | 0/0 | — | 0/0/0/0 | nein/nein | 53/53 | 2/2 |
| spiegel.de | 16 | 536/536 | 0/0 | — | 2/2/0/0 | nein/nein | 39/39 | 0/0 |
| spiegel.de | 190 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 33/33 | 1/1 |
| zeit.de | 587 | 0/0 | 0/0 | — | 1/1/0/0 | nein/nein | 42/42 | 14/14 |
| zeit.de | 152 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 32/32 | 1/1 |
| sueddeutsche.de | 2342 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 34/34 | 4/4 |
| tagesschau.de | 341 | 272/272 | 0/0 | — | 1/1/0/0 | nein/nein | 29/29 | 1/1 |
| tagesschau.de | 732 | 272/272 | 0/0 | — | 1/1/0/0 | nein/nein | 29/29 | 1/1 |
| netzpolitik.org | 2017 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 31/31 | 17/17 |
| netzpolitik.org | 674 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 32/32 | 13/13 |
| t3n.de | 466 | 0/0 | 0/0 | — | 1/1/0/0 | nein/nein | 40/40 | 3/3 |
| t3n.de | 515 | 0/0 | 0/0 | — | 1/1/0/0 | nein/nein | 42/42 | 3/3 |
| arstechnica.com | 245 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 34/34 | 7/7 |
| arstechnica.com | 414 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 36/36 | 5/5 |
| theverge.com | 339 | 0/0 | 0/0 | — | 2/2/0/0 | nein/nein | 39/39 | 11/11 |
| theverge.com | 347 | 0/0 | 0/0 | — | 3/3/0/0 | nein/nein | 36/36 | 12/12 |
| techcrunch.com | 501 | 321/321 | 0/0 | — | 1/1/0/0 | nein/nein | 28/28 | 7/7 |
| techcrunch.com | 983 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 34/34 | 6/6 |
| bbc.co.uk | 266 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 37/37 | 0/0 |
| bbc.co.uk | 2644 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 26/26 | 2/2 |
| theguardian.com | 1301 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 36/36 | 25/25 |
| theguardian.com | 1482 | 0/0 | 0/0 | — | 1/0/0/0 | nein/nein | 35/35 | 2/2 |
| simonwillison.net | 851 | 0/0 | 0/0 | — | 0/0/0/0 | nein/nein | 35/35 | 5/5 |
| simonwillison.net | 337 | 0/0 | 0/0 | — | 2/2/0/0 | nein/nein | 33/33 | 11/11 |
| en.wikipedia.org | 5689 | 0/0 | 0/0 | — | 1/1/0/0 | nein/nein | 36/36 | 886/886 |
| de.wikipedia.org | 18085 | 0/0 | 0/0 | 4/6/ja/ja; 6/18/ja/ja; 6/17/ja/ja; 5/17/ja/ja; 5/12/ja/ja | 42/10/0/0 | nein/nein | 31/31 | 1610/1610 |
| developer.mozilla.org | 2364 | 0/0 | 0/0 | 2/5/ja/ja | 0/0/0/0 | nein/nein | 3/3 | 183/183 |
| web.dev | 3091 | 0/0 | 0/0 | — | 3/0/0/0 | nein/nein | 0/0 | 22/22 |
| docs.python.org | 13246 | 0/0 | 0/0 | 2/16/ja/ja; 2/6/ja/ja; 2/6/ja/ja; 3/4/ja/ja; 4/25/ja/ja; 4/5/ja/ja | 1/0/0/0 | nein/nein | 35/35 | 581/581 |

## Ausreißer

- **spiegel.de (16 Wörter):** Der Snapshot enthält im Wesentlichen nur Aufmacher und Paywall-Grenze. Der große Vorlauf von 536 px ist das reservierte, tatsächlich geladene Aufmacherbild, kein leerer Fremdblock.
- **golem.de (je 29 Wörter):** Der gespeicherte Snapshot liefert wegen der Paywall nur den Pur-Hinweis. Die Möbelbereinigung entfernt den Consent-Dialog, kann den nicht ausgelieferten Artikeltext aber nicht herstellen.
- **heise.de (19.498 Wörter, 307 Bilder):** Readability übernimmt eine sehr große Bestenliste. 304 Bilder pro Theme werden offline nicht geladen und sind daher nicht als visuell geprüft zu werten.
- **tagesschau.de und techcrunch.com:** Der gemessene Vorlauf stammt von geladenen Aufmacherbildern beziehungsweise Bildunterschriften, nicht von Navigation oder Leerblöcken.
- **Wikipedia/MDN/Python:** Alle 13 extrahierten Tabellen bleiben horizontal scrollbar und behielten in beiden Themes nach 400 px vertikalem Hin-/Rückscroll exakt ihre horizontale Position.
- **Links:** `textLinks` zählt alle Links im extrahierten Body einschließlich Fußnoten und Strukturverweisen. Bei allen Zeilen mit Links meldet Chromium `allUnderlined: false` (bei 0 Links vacuously `true`); damit ist die Styling-Abnahme aus Stufe 4 nicht erfüllt und nicht als behoben zu werten.

## Die drei schwersten Ausgangsbefunde

Die Ausgangsmessung nannte welt.de (Brotkrumen), golem.de (Consent/Paywall) und the-decoder.de (breite Tabelle) als schwerste direkt vergleichbare Fälle. Aktuelle Screenshots liegen je Theme unter `corpus/screenshots/{light,dark}/` und werden vom Lab reproduzierbar neu erzeugt. Der Stufe-1-Commit enthielt keine Vorher-Screenshots; echte visuelle Vorher-Dateien lassen sich nachträglich nicht seriös erzeugen, ohne den eingefrorenen Ausgangsstand erneut in einer separaten alten App-Version zu rendern. Die numerischen Vorherwerte bleiben in der Git-Historie von `corpus/report.json` erhalten.

## Bekannte Grenzen

- **Bildprüfung im Offline-Korpus:** 682 von 748 Bildinstanzen referenzieren externe Dateien, die nicht Teil der HTML-Snapshots sind. Damit sind `kaputt`, `zu breit` und Zählpixel nur für 66 geladene Instanzen belegt. Das vollständige Spiegeln aller 748 Drittanbieterbilder wurde bewusst nicht vorgenommen: Es würde den Korpus massiv vergrößern, Ablauf- und Lizenzrisiken einführen und die Messlatte von externen Binärdateien abhängig machen. Die sechs Fixtures unter `lib/fixtures/` enthalten deshalb selbstständige Data-URI-Bilder und prüfen Bilddimensionen, Ladeattribute und Zählpixelentfernung vollständig offline. Für die 682 externen Bilder bleibt eine Live-/Geräteprüfung offen.
- **Tabellen-Rücksprung am Gerät:** Desktop-Chromium reproduziert den ursprünglich gemeldeten Rücksprung auch mit dem alten, kaputten Zustand nicht zuverlässig. Die 26 aktuellen Chromium-Messungen zeigen stabile Scrollpositionen, sind aber kein Beweis für Android WebView. Die Verifikation auf einem physischen Gerät bleibt offen; der Fehler wird nicht als abschließend behoben bezeichnet.
- **Paywalls und nicht ausgelieferter Inhalt:** Die zwei golem.de-Snapshots und ein spiegel.de-Snapshot enthalten keinen vollständigen Artikel. Readability kann Text, den der Server nicht geliefert hat, nicht rekonstruieren.
- **Readability-Sonderfälle:** en.wikipedia.org verliert die Tabellen einer fast ausschließlich tabellarischen Seite; kurze Meldungen werden als verdächtig kurz markiert. Diese Extraktionsgrenzen sind im Korpus sichtbar und werden nicht stillschweigend als Erfolg gezählt.
- ~~**Link-Unterstreichung**~~ — behoben. `.reader a` setzte nur Farbe und Stärke der Dekoration, nie `text-decoration-line`; die Unterstreichung hing damit von Vererbung ab. Der Fund aus diesem Durchlauf war korrekt und die Zeile ist ergänzt: 70 von 70 Renderings mit Links melden jetzt `allUnderlined`.
