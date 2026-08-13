# Bildschirmfotos

Zwei Quellen, und sie sind **nicht** austauschbar:

- `library-*.png`, `reader-*.png`, `settings-dark.png`, `welcome-light.png` —
  aus dem Reader-Lab (`npm run reader-render`), also in Gerätegröße gerendert,
  ohne Statusleiste, in beiden Themes und reproduzierbar. **Das ist die Quelle
  für den Play-Eintrag** (C4).
- `library.png`, `reader-voice-sheet.png`, `voice-onboarding.png`,
  `settings-reading-aloud.png`, `voice-no-voice-for-language.png` — echte
  Aufnahmen vom Galaxy S23 Ultra (12.08.2026), gedacht für README und
  Dokumentation. Sie zeigen die Statusleiste des Telefons.

⚠️ Für Play taugen die Gerätebilder nur bedingt: die Statusleiste lässt sich auf
dieser One-UI-Version **nicht** über den SysUI-Demomodus säubern
(`settings put global sysui_demo_allowed 1` plus `com.android.systemui.demo`
wurde gesetzt und ignoriert — Uhrzeit, Akku und die Benachrichtigung blieben
stehen). Store-Aufnahmen kommen deshalb aus dem Reader-Lab.

## Seit 1.12 dazu: echte Gerätebilder für die README

`device-library.png`, `device-reader-playing.png`, `device-voices.png`,
`device-voices-italian.png` und `voice-download.gif` sind Aufnahmen vom Galaxy
S23 Ultra (`adb exec-out screencap`), auf 480–520 px Breite skaliert mit
`ffmpeg`. Sie zeigen, was das Reader-Lab nicht zeigen kann: die Statusleiste des
echten Geräts, das Vorlesen im Gang und den Download einer Stimme mit Balken.

Das GIF ist aus drei dieser Aufnahmen gebaut (angeboten → lädt → installiert),
Ausschnitt auf den Sprachblock, 8 fps, ~87 KB. Es ist **kein** Mitschnitt: drei
echte Zustände hintereinander, keine nachgestellte Animation.

**Für den Play-Eintrag bleiben die Reader-Lab-Bilder die Quelle** — sie sind
reproduzierbar und ohne Statusleiste.
