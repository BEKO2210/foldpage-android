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
