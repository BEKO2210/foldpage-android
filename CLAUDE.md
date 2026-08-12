# foldpage-android

Dauerhafte Regeln und Kontext fuer diesen Ordner.

## Erst lesen, dann anfassen

- `docs/HANDOFF.md` — Stand der letzten Sitzung, offene Punkte, Fallen.
- `docs/ARCHITECTURE.md` — die vollstaendige Karte: Aufbau, Datenmodell,
  Kernfluss, native Bruecke, Bauwege und die Fallen, die schon Zeit gekostet
  haben. Wer hier arbeitet, faengt dort an und kartiert den Code **nicht**
  erneut. Aendert sich der Aufbau, wird diese Datei mitgezogen.
- `docs/ROADMAP.md` — was als Naechstes ansteht, getrennt nach
  Einzelmassnahmen (ein Lauf) und Vorhaben ueber mehrere Laeufe.
- `docs/RELEASE.md` — Signieren und Ausliefern (Play-Upload-Key).
- `.claude/JOURNAL.md` — was zuletzt getan wurde (automatisch gepflegt,
  nicht von Hand bearbeiten).

## Regeln

- **`foldpage-product-ux` ist bei Produkt-, UX- und UI-Arbeit Pflicht**, vor
  jeder Aenderung und vor jeder Rueckfrage. Der Skill liegt in
  `.claude/skills/foldpage-product-ux/` und traegt die dauerhaften
  Produktregeln: keine Engine-, Modell- oder Anbieternamen in der Nutzer-
  Oberflaeche, der Fluss Text → Sprache → Stimme → Vorlesen, nur zur gewaehlten
  Sprache passende Stimmen, automatische Engine-Wahl mit Rueckfall,
  schlanke App plus nachladbare Sprachpakete mit eigenem Download-Fluss,
  der UI-Qualitaetsanspruch und die Playwright-Pflichtpruefung.
  Ausloeser: alles an Vorlesen, Stimmen, Sprachen, Downloads, Einstellungen,
  Reader, Navigation, Typografie, Bewegung, Barrierefreiheit oder sichtbarem
  Text. Widerspricht ein Auftrag einer Regel, den Widerspruch in einem Satz
  nennen und die regelkonforme Fassung bauen.
- **Passenden Skill suchen und benutzen**, nicht frei Hand arbeiten:
  `superpowers:systematic-debugging` bei jedem Fehlerbild (Phase 1 zu Ende
  fuehren, bevor etwas geaendert wird), `ui-ux-pro-max` bei allem, was
  Aussehen, Bedienung oder Bewegung aendert. `foldpage-product-ux` setzt dabei
  die Rahmenbedingungen, die anderen Skills arbeiten darin.
- **Das Messgeraet ist verdaechtig, bevor es der Code ist.** Eine Null im
  Bericht heisst „nichts gefunden", nicht „nichts da".
- Version nicht pro Lauf erhoehen — ein Release fasst rund fuenf Laeufe
  zusammen, `npm run set-version -- <x.y>` zieht alle drei Stellen.

- Aenderung an der Extraktion (`lib/parse.ts`): `npm test` **und**
  `npm run corpus`; den Diff von `corpus/report.json` im Commit lassen.
- Aenderung an Farben oder Animationen: `docs/CONTRAST.md` bzw.
  `docs/MOTION.md` mitziehen — `lib/contrast.test.ts` und `lib/motion.test.ts`
  lesen diese Werte.
- Gerätetest heisst `npm run apk:debug` (enthaelt `cap sync`). `npm run build`
  allein zeigt am Geraet den vorherigen Stand.
- Jede spuerbare UI-Aenderung: `npm run build` und danach `npm run ui:check`
  (dazu `-- --empty` und `-- --offline`), plus die Zustaende Laden, Leer,
  Fehler, Download und Offline von Hand angesehen. Bericht:
  `corpus/ui-report.json`. Einzelheiten in
  `.claude/skills/foldpage-product-ux/references/playwright-checks.md`.
- `capacitor.config.ts`: `androidScheme` und `hostname` nie aendern — IndexedDB
  haengt am Origin, ein Wechsel loescht faktisch die Bibliothek des Nutzers.
