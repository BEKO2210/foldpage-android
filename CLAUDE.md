# foldpage-android

Dauerhafte Regeln und Kontext fuer diesen Ordner.

## Erst lesen, dann anfassen

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

- Aenderung an der Extraktion (`lib/parse.ts`): `npm test` **und**
  `npm run corpus`; den Diff von `corpus/report.json` im Commit lassen.
- Aenderung an Farben oder Animationen: `docs/CONTRAST.md` bzw.
  `docs/MOTION.md` mitziehen — `lib/contrast.test.ts` und `lib/motion.test.ts`
  lesen diese Werte.
- Gerätetest heisst `npm run apk:debug` (enthaelt `cap sync`). `npm run build`
  allein zeigt am Geraet den vorherigen Stand.
- `capacitor.config.ts`: `androidScheme` und `hostname` nie aendern — IndexedDB
  haengt am Origin, ein Wechsel loescht faktisch die Bibliothek des Nutzers.
