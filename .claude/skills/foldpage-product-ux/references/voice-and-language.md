# Language, voice, and packs

Everything needed before designing or changing how FoldPage speaks. Read the
target first, then the current state, then the traps — several of them have
already cost a day.

## The target architecture

### Layers

1. **Core app** — small. Reader, library, speech player, settings. No bundled
   voice or model assets beyond what a bare install needs to speak at all
   (which, on Android, is the system engine — zero bytes shipped).
2. **Language packs** — a language's voice or voices, downloaded on demand,
   versioned, cached locally, reused offline afterwards.
3. **Selection layer** — maps `article.lang` to an installed pack, resolves the
   concrete engine and voice inside it automatically, falls back without asking.

### Rules that bind the design

- Design the catalogue for **many** languages. Anything that only works for two
  or three (hardcoded pairs, a switch statement, a two-item picker) is wrong
  even if it ships fine today.
- Do **not** bundle gigantic voice/model assets into the initial application
  unless technically justified — and if justified, the justification is written
  down in `docs/ARCHITECTURE.md`, not left in a commit message.
- Prefer: lightweight core + downloadable packs + local cache + automatic
  versioning/update + offline reuse after download.
- A pack, once downloaded, works with no network. FoldPage never sends article
  text off the device; a "voice" that needs the network breaks that promise and
  is filtered out (`localService !== false` in `voicesFor()`).

### The catalogue entry

Whatever the source of packs turns out to be, each entry needs, at minimum:

| field | why |
|---|---|
| language tag (BCP 47) | matching against `article.lang`, never shown raw |
| human language label | what the user reads ("German", "English") |
| human voice name | what the user reads; machine names get cleaned first |
| download size in bytes | shown **before** the tap, not after |
| version | drives automatic update detection |
| installed / cached state | drives the Settings list and the pack picker |

### The download flow

Selecting a language or voice that is not installed must open a polished flow
**inside FoldPage**. Never bounce the user to a third-party app to obtain
another FoldPage voice.

States the flow must have, all of them designed, not just the happy one:

- **offered** — name, human size ("48 MB"), one primary action ("Download")
- **downloading** — determinate progress where the size is known,
  indeterminate only where it genuinely is not; a working **Cancel**
- **failed** — one plain sentence on what happened, a **Retry**, and the app
  still usable
- **installed** — quiet confirmation, the voice immediately usable, no restart
- **update available** — same flow, but never blocking playback

Copy rule: no byte counts without units, no HTTP status codes, no engine
package names, no "manifest", "endpoint", "checksum".

### Settings

Downloaded languages are managed from Settings: the list of installed packs,
each with its size, an update action when a newer version exists, and a remove
action. Removing the pack for a language present in the library warns once
about what will happen to those articles' playback, then obeys.

## Current implementation (August 2026)

Files: `lib/voice.ts` (preferences, gaps, selection), `lib/speech.ts` (player),
`components/VoiceSettings.tsx` (settings UI), `components/VoiceOnboarding.tsx`,
`lib/readAloud.ts` (text for the ear, `SPEECH_LANGUAGES`),
`android/app/src/main/java/de/ithandwerk/foldpage/SpeechPlugin.java` (engines,
media session). Measurements and their provenance: `docs/SPEECH.md`.

What already matches the target:

- **No pickers.** The language/engine/voice dropdowns were removed. One
  language gets one voice — the best the phone can speak it with. Only speed,
  pitch and pause length are user choices, because those can be judged by ear.
- **Automatic selection.** `pickBestSetup(offers, lang, defaultEngine)` takes
  engines that actually have a *local* voice for the language, prefers the
  device default among them, otherwise the best-rated voice (Android's own
  `Voice.getQuality()`). Region-exact before merely related.
- **Per-language engine and voice.** `VoicePrefs.engines` and `.voices` are
  keyed by the base language (`voiceKey()`), because one phone has one default
  engine and a library has several languages.
- **Resolution by `voiceURI`, not index.** The plugin takes an index into its
  own list, so the index is resolved fresh every time; an uninstalled voice
  means "no index" and the device default speaks, rather than an arbitrary
  other voice reading the article in the wrong language.
- **Machine names cleaned** before display (`prettyVoice()`), falling back to
  "standard <language> voice".

Where the current state falls short of the target — the work this skill exists
to guide:

1. **No in-app packs.** "Install a voice" calls `openSpeechSettings()`, which
   opens Android's own speech settings. That is exactly the third-party detour
   rule 15 forbids. It stays only until an in-app pack flow exists; do not
   build new UI that depends on it.
2. **No size, progress, cancel, retry** anywhere, because there is no download
   the app owns.
3. **No pack management in Settings** — only a per-language found/missing list.
4. **No versioning or update path** for voices.

When implementing packs, `docs/ROADMAP.md` section D0 holds the evaluated
options (RHVoice, sherpa-onnx/Piper, MediaPipe) and the reasoning for the
current engine-per-language approach. Check it before re-evaluating anything.

## Traps already paid for

- **Android 11 hides engines.** Without
  `<queries><intent><action android:name="android.intent.action.TTS_SERVICE"/>`
  in the manifest, Android reports **exactly one** engine — the default —
  however many are installed. No error, no log line.
- **Remote voices exist and must be filtered.** `localService !== false`.
- **`en` resolves to `en-US`.** An American article read by the highest-rated
  Australian voice is worse than a plain American one — region-exact wins
  before quality (`byQuality()`).
- **The engine's own latency is length-proportional** (~7 % of the utterance).
  Splitting a paragraph into sentences therefore costs nothing and moves the
  silence to where a person breathes. Do not "optimise" that back into whole
  paragraphs.
- **Pause values are measured, not tasted** — `GAP_BEFORE`, `SENTENCE_GAP` in
  `lib/voice.ts`, provenance in `docs/SPEECH.md`. Changing them means measuring
  again.
- **`androidScheme` / `hostname` in `capacitor.config.ts` are frozen.**
  IndexedDB hangs off the origin; changing either wipes the user's library. A
  pack cache stored in IndexedDB or the Filesystem plugin inherits that
  constraint.
- **Hand-edited preferences must not silence the app.** `normalizeVoicePrefs()`
  drops anything that is not a pair of strings. Any new preference field gets
  the same treatment.
- **Speech text is not display text.** `forTheEar()` in `lib/readAloud.ts`
  changes only what is spoken; the article on screen stays untouched. Audit
  with `node scripts/speech-audit.mjs`.
