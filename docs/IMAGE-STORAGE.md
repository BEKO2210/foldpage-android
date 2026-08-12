# Bilder mitspeichern — Messung und Entscheidung (B1.1)

FoldPage verspricht einen Artikel, der offline liest. Bilder speichert die App
bisher **nicht** — im gespeicherten HTML stehen nur die fremden Adressen. Folge:
ohne Netz fehlen die Bilder (der Reader entfernt sie sogar, weil
`naturalWidth === 0`), und mit Netz erfährt der fremde Server bei **jedem**
Öffnen Lesezeit und IP-Adresse. Für eine App, die mit „kein Tracking" wirbt, ist
das die größte offene Flanke.

Bevor das behoben wird, muss der Preis bekannt sein. Nicht geschätzt — gemessen.

## Wie gemessen wurde

`node scripts/image-budget.mjs` läuft mit der **eigenen** Extraktion über die 39
eingefrorenen Korpus-Artikel, sammelt jedes Bild, das der Reader behalten würde,
und fragt die Server nach der Dateigröße (HEAD, ersatzweise ein
Bereichs-GET für Server ohne `Content-Length`). Bis zu 12 Bilder je Artikel
werden gemessen, der Rest über den Mittelwert des Artikels hochgerechnet.

Das Skript braucht als einziges hier das Netz und läuft **nicht** im Testlauf
mit. Rohdaten: `corpus/image-budget.json`, Messung vom 12. August 2026,
49 Bilder gemessen, 7 nicht erreichbar (nicht als 0 gezählt).

## Was dabei herauskam

| | |
|---|---|
| Artikel **mit** Bildern | 21 von 39 — gut die Hälfte hat gar keine |
| Bilder je Artikel | Median **1**, Maximum **301** |
| Ein Bild | Median **42 KB**, Mittelwert 80 KB |
| Artikel gesamt | Median **56 KB**, p90 **845 KB**, Maximum **5,4 MB** |
| **100 Artikel, ungedeckelt** | **≈ 40 MB** |
| 100 Artikel, Deckel 1 MB/Artikel | ≈ 19,5 MB |
| 100 Artikel, Deckel 2 MB/Artikel | ≈ 24 MB |
| 100 Artikel, Deckel 5 MB/Artikel | ≈ 38,5 MB |

Die Verteilung ist das eigentliche Ergebnis: **der Median ist winzig, der
Ausreißer riesig.** Ein einziger heise-Artikel mit 301 Bildern (eine
Bestenliste, deren Teaser Readability mitnimmt) kostet allein 5,4 MB — mehr als
die 20 nächstgrößeren zusammen. Ohne Deckel bezahlt jeder Nutzer diesen einen
Artikel mit.

## Entscheidung

**Bilder werden mitgespeichert**, mit drei Grenzen, die genau den Ausreißer
abfangen und den Normalfall unberührt lassen:

| Grenze | Wert | Begründung |
|---|---|---|
| je Bild | **2 MB** | Über 2 MB ist kein Artikelbild, sondern ein unskaliertes Original. Median liegt bei 42 KB. |
| je Artikel | **4 MB** | Deckt p90 (845 KB) um Faktor 4 ab; abgeschnitten wird nur der Galerie-Fall. |
| Bilder je Artikel | **40** | Bei 42 Bildern steht Wikipedia, bei 301 die Teaser-Liste. Die Grenze trennt beide. |

Erwartet damit für eine Bibliothek mit 100 Artikeln: **rund 25 MB**. Zum
Vergleich: der bereits gespeicherte Artikeltext liegt bei rund 1,5 MB für
dieselben 100 Artikel.

**Speicherort:** ein zweiter IndexedDB-Store `images` in derselben Datenbank,
Schlüssel ist der **SHA-256 der Bild-URL**. Damit teilen sich zwei Artikel
dasselbe Bild automatisch, und der Schlüssel ist reproduzierbar, ohne dass
irgendwo eine Zuordnungstabelle gepflegt werden muss.

**Was im Artikel steht:** das `src`-Attribut bleibt die Original-URL — sie ist
die Herkunft und der Rückfall, wenn das Bild nicht abgelegt werden konnte. Dazu
kommt `data-fp-img="<schlüssel>"`. Der Reader tauscht beim Anzeigen auf eine
Object-URL aus dem Store; findet er nichts, bleibt es beim Original. Ein
Artikel bleibt damit auch dann lesbar, wenn die Bildablage fehlschlägt.

**Warum nicht Data-URIs im HTML:** ein 2-MB-Bild wird als Base64 rund 2,7 MB
Text, der bei jeder Suche über `contentHtml` mitgelesen und bei jedem Öffnen des
Artikels neu geparst würde. Blobs bleiben Blobs.

## Etappen

| Etappe | Inhalt | Stand |
|---|---|---|
| B1.1 | Messung und diese Entscheidung | ✅ 12.08.2026 |
| B1.2 | Datenbank auf Version 2, Store `images`, Migration | offen |
| B1.3 | Bilder beim Speichern holen, Reader zeigt sie aus dem Store | offen |
| B1.4 | Aufräumen beim Löschen, Speicherbedarf in den Einstellungen, Schalter | offen |
| B1.5 | Texte einlösen: README, Willkommen, Play-Beschreibung | offen |

Erst nach B1.5 darf irgendwo stehen, der Artikel liege mit Bildern auf dem
Telefon.
