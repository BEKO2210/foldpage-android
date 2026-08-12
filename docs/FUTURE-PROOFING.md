# Zukunftssicherheit

Was in absehbarer Zeit von außen auf die App zukommt, was davon **wirklich**
zutrifft, und wann was zu tun ist. Alles hier ist an der Quelle geprüft
(developer.android.com, Play-Console-Hilfe, npm-Registry, Capacitor-Repo), nicht
aus Blogs übernommen. Stand: **12. August 2026**.

Die Faustregel dahinter: nicht jede neue Version mitnehmen, sondern **keine
Version verpassen, die zur Pflicht wird** — und jede Änderung mit einer Messung
belegen, nicht mit einem Gefühl.

---

## 1. Fristenkalender

| Termin | Was passiert | Stand der App |
|---|---|---|
| **31.08.2026** | Google Play nimmt nur noch Uploads mit `targetSdk ≥ 36` | ✅ erfüllt, App steht auf 36 |
| 16.06.2026 | Android 17 (API 37) ist erschienen | — läuft bereits auf Geräten |
| **August 2027** | Play verlangt `targetSdk ≥ 37` | offen, Vorbereitung siehe 2. |
| laufend | Play-Console-Anforderungen an Datenschutzerklärung und Data Safety | erfüllt, siehe `docs/` |

Nichts davon ist kurzfristig kritisch. Der einzige echte Stolperstein ist der
Sprung auf 37, und der wird unten zerlegt.

---

## 2. Android 17 (API 37) — was wirklich zutrifft

Beim Erhöhen von `targetSdkVersion` auf 37 greifen Verhaltensänderungen. Die
vollständige Liste steht bei Google; hier steht, was **diese** App betrifft.

### Trifft zu

**Orientierung und Größe werden auf großen Bildschirmen ignoriert.**
Ab `sw600dp` ignoriert Android 17 `screenOrientation`,
`setRequestedOrientation()`, `resizeableActivity`, `minAspectRatio` und
`maxAspectRatio`. Die App deklariert zwar keine Einschränkung — aber ihr Layout
war bis heute nur bei 412 × 915 vermessen.
**Erledigt am 12.08.2026:** Das Reader-Lab misst jetzt zwei Viewports, Telefon
(412 × 915) und Tablet (1024 × 768), in beiden Themes: **156 Renderings, 84
Tabellenprüfungen, 0 Befunde.** Dazu drei Spalten in der Bibliothek ab 1100 px,
das Einstellungs-Sheet als zentrierter Dialog ab 768 px und eigene Regeln für
kurze Querformat-Fenster.

**Certificate Transparency ist standardmäßig an.** Die App ruft beliebige
fremde Seiten ab. Ein Server, dessen Zertifikat nicht CT-konform ist, schlägt
dann fehl statt zu laden. Kein Code-Fix möglich und keiner nötig — aber die
Fehlermeldung muss verständlich bleiben (Roadmap A4).

**Encrypted Client Hello (ECH) wird opportunistisch genutzt.** Betrifft
`CapacitorHttp` und die WebView. Opportunistisch heißt: Server ohne ECH
funktionieren unverändert. Nichts zu tun, nur zu wissen, falls einzelne Seiten
nach dem Sprung anders reagieren.

**`static final`-Felder sind nicht mehr veränderbar, `MessageQueue` ist
lock-free.** Beides trifft Bibliotheken, die per Reflection arbeiten — also
möglicherweise Capacitor oder ein Plugin, nicht den eigenen Code. Prüfpunkt beim
Sprung auf 37, nicht vorher.

### Trifft **nicht** zu — bewusst festgehalten, damit es niemand „vorsorglich" einbaut

**`ACCESS_LOCAL_NETWORK` wird nicht gebraucht.** Ab `targetSdk 37` ist der
Zugriff auf das lokale Netz standardmäßig gesperrt und braucht diese
Laufzeitberechtigung. FoldPage **verweigert private Adressen von sich aus**
(`assertFetchable()` in `lib/parse.ts`: `localhost`, `127.*`, `10.*`,
`192.168.*`, `172.16–31.*`, `169.254.*`, `::1`, `*.local`). Die Berechtigung
wäre also nicht nur überflüssig, sondern würde die Berechtigungsliste der App —
heute genau `INTERNET` und `VIBRATE` — ohne Gegenwert aufblähen.

Ebenfalls ohne Bezug: SMS-OTP-Verzögerung, Hintergrund-Audio,
Contacts-Provider, Bluetooth-RFCOMM, dynamisches Laden nativer Bibliotheken,
Passwortanzeige an Hardware-Tastaturen.

### Wann auf 37 gehen

**Nicht vor Capacitor.** Das Android-Template von Capacitor steht heute (main)
auf `compileSdk 36` / `targetSdk 36` — genau wie dieses Projekt. Erst wenn
Capacitor auf 37 geht, hat der Sprung eine getestete Grundlage. Danach:

1. `android/variables.gradle` auf `compileSdkVersion 37`, `targetSdkVersion 37`.
2. Debug-Build auf einem Gerät mit Android 17, dazu einem Tablet oder
   aufgeklappten Foldable (Emulator reicht).
3. `npm run reader-render` — beide Viewports müssen ohne Befund bleiben.
4. Abruf-Pfad gegen mehrere echte Seiten prüfen (CT und ECH betreffen genau ihn).
5. Erst dann `versionCode` erhöhen und veröffentlichen.

---

## 3. Werkzeugkette — Ist-Stand und Regel

| Werkzeug | Im Projekt | Aktuell verfügbar | Regel |
|---|---|---|---|
| Gradle | **9.6.1** | 9.6.x | Wrapper eingecheckt, folgt Android Studio |
| Android Gradle Plugin | **9.3.1** | 9.3.x | zusammen mit Android Studio anheben |
| JDK | **21** (JBR) | 21 LTS | bleibt, bis AGP mehr verlangt |
| minSdk / compile / target | **24 / 36 / 36** | 37 verfügbar | siehe 2. |
| Capacitor | **8.5.0** | 8.5.0 stabil, 9.0.0-alpha.6 als `next` | **auf 8.x bleiben**, 9 erst als stabile Version |
| Next.js | **16.2.10** | 16.3.0 | Patches sofort, Minor im Quartal |
| React | **19.2.4** | 19.2.8 | Patches sofort |
| TypeScript | **5.9.3** | **7.0.2** | eigener Vorgang, siehe unten |
| ESLint | **9.39.5** | **10.8.1** | eigener Vorgang, siehe unten |
| Playwright | 1.62.1 | — | Chromium am 12.08.2026 auf `lenovo` installiert |

**TypeScript 7 und ESLint 10 sind Major-Sprünge** und gehören nicht nebenbei in
einen Feature-Lauf. Beide bekommen einen eigenen Durchgang mit einem Kriterium:
`npx tsc --noEmit`, `npx eslint`, `npm test` und `npm run build` müssen danach
so grün sein wie vorher — und die vorhandene Warnung in `lib/motion.test.ts`
(Regex-Flag `s`, braucht ES2018 als Ziel) wird dabei gleich mitbehoben.

**Capacitor 9 nicht vorziehen.** Alpha heißt hier: die Android-Vorlage kann sich
noch ändern, und diese App hat ein eigenes Plugin (`ShareTargetPlugin`) sowie
eine `MainActivity`, die Insets an CSS weiterreicht. Beides sind genau die
Stellen, an denen ein Major bricht.

---

## 4. Web-Plattform: was benutzt wird und was passiert, wenn es fehlt

Die App ist eine WebView. Die WebView wird über den Play Store aktualisiert und
ist deshalb meist neuer als das Betriebssystem — verlassen darf man sich darauf
trotzdem nicht, `minSdk` ist 24. Deshalb gilt: **jede moderne Eigenschaft muss
folgenlos ausfallen können.**

| Eingesetzt | Wofür | Fällt aus als |
|---|---|---|
| `<dialog>` + `showModal()` | Einstellungs-Sheet | — (seit Chrome 37 vorhanden) |
| `color-scheme` | Scrollbalken, Overscroll folgen dem Theme | Systemvorgabe |
| `text-wrap: pretty` / `balance` | keine Schusterjungen, ruhige Überschriften | normaler Umbruch |
| `hyphens: auto` | Silbentrennung im Blocksatz | Blocksatz ohne Trennung |
| `dvh` | Sheet-Höhe bei ein-/ausfahrenden Systemleisten | `vh`-Verhalten |
| `:has()` | markierte Segment-Schaltfläche | Zustand nur über Farbe des Labels |
| `ResizeObserver` | Tabellen-Überlauf im Reader | Hinweis „mehr rechts" fehlt |
| `useSyncExternalStore` | Einstellungen ohne Effekt-Kaskade | — (React 18+) |
| CSS-Variablen aus Java | echte Insets statt `env()` | `env(safe-area-inset-*)` |

**Bewusst nicht benutzt:** View Transitions für Routenwechsel (kollidiert mit
den bestehenden `backwards`-Animationen, siehe die Falle mit der Bottom-
Navigation) und scroll-getriebene Animationen für den Fortschrittsbalken (der
Fortschritt muss ohnehin per JavaScript gespeichert werden — zwei Mechanismen
für dieselbe Zahl wären eine Fehlerquelle). Beides steht als Notiz, damit es
nicht jemand als „vergessen" nachrüstet.

---

## 5. Rhythmus

- **Monatlich:** `npm outdated`. Patch-Versionen von React, Next und den
  Capacitor-Paketen einspielen, `npm test` + `npm run build`, fertig.
- **Quartalsweise:** Minor-Versionen, Android Studio samt AGP und Gradle-Wrapper,
  danach ein Debug-Build auf dem Gerät.
- **Zweimal jährlich, oder wenn Google eine Frist nennt:** Plattform-Sprung
  (`targetSdk`) nach dem Ablauf in Abschnitt 2.
- **Nie ohne Beleg:** Jeder dieser Läufe endet mit `npm test`, `npm run corpus`
  und `npm run reader-render`. Die drei Berichte sind eingecheckt; was sich
  ändert, steht im Diff.

## 6. Was diese Datei nicht ist

Keine Wunschliste. Funktionen stehen in `docs/ROADMAP.md`. Hier steht nur, was
von außen kommt — Plattformfristen, Bibliotheksversionen, Browsereigenschaften —
und wie die App dem zuvorkommt.
