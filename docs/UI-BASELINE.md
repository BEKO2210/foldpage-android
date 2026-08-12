# UI baseline and the twenty-run log

Measured before the first change, so every later claim of "better" has
something to be better than. Instruments: `npm run ui:check` (Playwright, both
viewports), `node scripts/a11y-audit.mjs`, `npm test`, `npm run lint`,
`npm run build`. Screenshots: `corpus/ui-shots/` (`npm run ui:check -- --shots`).

## Baseline — 12 August 2026, commit `5a78364`, version 1.11.0

### Commands that exist

| Purpose | Command |
|---|---|
| Unit tests | `npm test` — 44 tests |
| Lint | `npm run lint` |
| Build (static export to `out/`) | `npm run build` |
| UI check, both viewports | `npm run ui:check` (`-- --empty`, `-- --offline`, `-- --shots`) |
| Accessibility structure | `node scripts/a11y-audit.mjs` |
| Reader layout and measure | `npm run reader-render` |
| Extraction corpus | `npm run corpus` |
| Speech text audit | `node scripts/speech-audit.mjs` |
| Device build | `npm run apk:debug` |

### Machine state at baseline

| Instrument | Result |
|---|---|
| `npm test` | 44 pass, 0 fail |
| `npm run build` | succeeds, 6 static routes (`/`, `/read`, `/settings`, `/icon.png`, `/_not-found`) |
| `npm run lint` | 0 errors, **3 warnings** (2 unused eslint-disable directives, 1 missing hook dependency in `components/VoiceOnboarding.tsx`) |
| `npm run ui:check` | 6 route/viewport passes, **no console errors, no page errors, no horizontal overflow** |
| `npm run ui:check -- --empty` | clean |
| `npm run ui:check -- --offline` | clean — nothing on any route depends on the network |
| `node scripts/a11y-audit.mjs` | no unnamed controls, no skipped heading levels, no overflow at 200 % font, focus lands on the new page's `h1` |

The floor is solid. Everything below is about the product, not about faults a
machine can see.

### Page heights at 412 px (full-page screenshot)

| Route | Mobile | Desktop |
|---|---:|---:|
| Library (3 articles) | 998 px | 900 px (3-column grid) |
| Reader | 915 px | 900 px |
| **Settings** | **3288 px** | **2922 px** |

Settings is 3.6 phone screens long, and loses only 11 % of that height on a
1280 px desktop — the widest viewport is used almost exactly like the narrowest.

### The flows that exist

1. **Save** — paste a link in the field at the top of the library, `Save`, or
   share into the app from anywhere.
2. **Library** — Inbox / Archive / Favorites (bottom nav on mobile, pill tabs on
   desktop), search, tag filter, per-card favourite / archive / delete, swipe as
   a shortcut.
3. **Read** — reader with a control bar: A−, A+, play, display settings sheet,
   favourite, mark read.
4. **Read aloud** — play from the reader bar; speed, pitch and pause length in
   Settings; the voice is chosen automatically per language.
5. **Settings** — Appearance, Your library, Reading aloud, Import, Export, Save
   from anywhere.

### Ranked weaknesses at baseline

Highest impact first. This is the queue the twenty runs work through; it is
re-ranked at every iteration rather than followed blindly.

1. **Developer terminology is on screen.** Settings shows "Android speech
   settings — Engine, speed, language and 'Listen to an example'", "If it stays
   silent", and "Index for search — makes search answer from the index instead
   of reading". The word *engine*, the name of another operating system's
   screen, and an index are things no reader should meet. Violates the product
   rule directly.
2. **There is no visible Language → Voice step.** The Voices block is a flat
   list of languages with ✓/✗ and a single "Install a voice" button that leaves
   FoldPage for Android's own speech screen. No language selection, no voice
   list scoped to a language, no in-app pack, no size, no progress, no cancel,
   no retry, no management.
3. **Settings is a 3288 px wall of five bordered cards.** Cards are used as
   default packaging rather than for discrete objects; the chip row at the top
   is a second navigation competing with the bottom bar.
4. **Desktop settings ignores the viewport.** 2922 px tall at 1280 px wide.
5. **The reader control bar is icon-only** — six glyphs, no visible labels, and
   the play control carries the entire read-aloud feature.
6. **The library's tag filter takes a full block** ("FILTER BY TAG" plus one
   chip) above the first article, on the smallest screen.
7. **No live regions on the library route** (`liveRegions: 0` in the audit) —
   search-result counts and toasts exist only once triggered; the announcement
   itself is unverified on a device.

### What a machine cannot judge here

Announcement order under TalkBack, whether the motion feels right, and whether
the copy is honest. Those stay human checks and are marked as such rather than
implied by a clean run.

## Run log

### Run 1 — baseline

Established the numbers above. No product change beyond clearing the lint
warnings so later runs start from a silent tool: the directive in
`components/VoiceOnboarding.tsx` sat above a comment rather than above the
dependency array, so it suppressed nothing. `npm run lint` is now silent.

### Run 2 — the machine stops talking to the reader

**Hypothesis:** every developer word on screen can be replaced by a sentence
about reading, with no loss of function — and the count can be measured rather
than judged.

**Instrument built:** `npm run jargon` (`scripts/jargon-audit.mjs`). It walks
the three routes in a browser, opens every `<details>` and the reading-settings
sheet, collects visible text plus `title` / `aria-label` / `placeholder`, and
matches it against a list of banned words, each with the reason it is banned.
Writes `corpus/jargon-report.json`, exits non-zero on a hit.

**Measured: 7 findings before, 0 after.**

| Was | Now |
|---|---|
| "Android does the speaking, offline, with the voices installed on this phone" | "Articles are read out on the phone itself, offline" |
| Action row "Android speech settings — Engine, speed, language" | removed; the voices block already carries that door, and only when a voice is missing |
| "Index for search — Makes search answer from the index instead of reading" | "Speed up search — Prepares older articles so searching them is instant" |
| "3 articles indexed, 41,102 terms." | "3 articles prepared — searching them is instant now." |
| "Check the voice — Walks the chain and names the first link that fails" | "Check reading aloud — Finds the point where the sound stops" |
| "Install voices — Add or repair a language's voice data" | "Repair a voice — Adds or replaces the voice files for a language" |
| "The voice itself comes from Android: whichever engine the phone is set to use does the speaking." | cut |
| Diagnosis steps: "Speech plugin loaded", "Engine answered", "Languages the engine has", "Voice for en-US", "Audio focus … held", detail "native"/"browser build" | "The voice is ready", "The voice answered", "Languages it can read" (named, not tagged), "A voice for English", "Sound is allowed to play", "this is the browser preview, which cannot speak" |
| "That voice would not speak. Voices are installed on Android's own speech screen." | "That voice would not speak. Turn the media volume up and try again, or install the voice for this language." |

**Two faults found while rewriting, both fixed:**

1. `diagnose()` reported "Spoke a test word ✓" even when the call returned in
   under 250 ms — the exact "gave up quietly" case the check exists to catch.
   The step now fails when it returns too fast to have said anything.
2. The voice check always asked about **German**, whatever the library held. It
   now asks about the first language actually in the library.

**Also:** the jargon audit's first version scanned the reader without an
article — two lines of text, reported clean. Seeded, it scans 53. Same lesson as
three times before in this repo: a clean report from an instrument that could
not see the fault is not an answer.

**Verification:** `npm run lint` silent · `npm test` 44 pass · `npm run build`
ok · `npm run ui:check` / `--empty` / `--offline` all clean · `a11y-audit` 0
unnamed, 0 heading skips, no overflow at 200 % font · settings page 3288 px →
**3165 px** on mobile.

**Not verified:** the diagnosis wording only renders after a native call, so
the audit cannot see it; it was rewritten and read by hand. A device run
(`npm run apk:debug`) has not happened this session.

**Remaining, re-ranked:** (1) no Language → Voice step and no in-app voice
packs, (2) Settings is still a 3165 px wall of five cards, (3) desktop settings
ignores its width, (4) icon-only reader bar, (5) the library's tag-filter block,
(6) no live regions on the library route.

### Run 3 — language first, then that language's voices

**Hypothesis:** the decision has an order — a reader knows their language and
does not know what a speech engine is — and a screen built in that order can
offer *more* choice than the current one while asking for less knowledge.

**Built:**

- `lib/languages.ts` — a catalogue of **60** languages with the endonym, the
  English name and a right-to-left flag, plus `searchLanguages()` matching
  either name or the code, accent-insensitively ("francais" finds Français) and
  prefix before substring ("en" offers English before Slovenian). 9 tests.
- `lib/speech.ts` — `voicesForLanguage()` merges **every installed engine's**
  voices for one language into one list, local voices only, best first;
  `chooseVoice()` stores the voice and, silently, the engine it belongs to;
  `previewVoice(lang, voiceURI)` speaks one named voice so a person can hear
  before keeping.
- `components/VoiceLanguages.tsx` — a row per language, and inside it the
  voices **for that language only**, each with "Hear it" and a radio. A
  language with none says so and offers the one action that exists. "Add a
  language" opens a search over the catalogue. Languages added by hand can be
  removed. In the reader's sheet (`only={lang}`) exactly one language is shown,
  already open, with no picker furniture.
- `VoicePrefs.languages` — the languages a reader asked for beyond what the
  library holds, normalised on the way out of storage like every other field.

**Instrument built:** `npm run voice:check` (`scripts/voice-flow-check.mjs`).
A headless browser has no voices, so it stubs a believable phone — two German
voices, three English, one Italian, one network-only — and then checks the
product rule itself: **15 checks, all passing**, including "German shows only
German voices", "a voice that needs the network is never offered", "the reader
offers the article's language only", and "a language row opens from the
keyboard".

**Two faults found by that instrument, both fixed:**

1. **The machine-named voice was winning.** With every voice rated the same —
   the normal case — the order fell back to the alphabet, so `de-DE-language`
   ("standard German voice") was offered *and automatically chosen* ahead of
   `Thorsten`. `voicesFor()` now ranks a voice somebody named above one a build
   script named, after Android's own rating rather than before it. Two tests.
2. **The way out of the reading sheet could scroll away.** The longer voice
   panel made the sheet scroll, taking "Done" with it. `.sheet-head` is sticky
   now.

**And the third instrument fault of the project:** `scripts/a11y-audit.mjs`
measured mid-animation and reported two 44 px touch targets as too small in
roughly every second run. It now waits for `document.getAnimations()`, raced
against a clock because the skeleton shimmer never finishes. Four consecutive
runs then gave the same three known findings.

**Verification:** `npm run lint` silent · `npm test` 44 → **57 pass** ·
`npm run build` ok · `ui:check` seeded/empty/offline all clean ·
`npm run jargon` clean · `npm run voice:check` 15/15 · `a11y-audit` 0 unnamed,
0 heading skips, 3 known small targets, focus on the new `h1`.

**Not verified:** anything native. The stub is a browser's `speechSynthesis`,
not Android's engines; the merge across several engines and `chooseVoice()`
writing the engine have never run on a phone. A device pass is the first thing
a later run should do.

**Remaining, re-ranked:** (1) no in-app voice packs — "Get a voice" still
leaves for the phone's own screen, which is the last standing breach of the
product rule, (2) Settings is a 3300 px wall of five cards, (3) desktop
settings ignores its width, (4) icon-only reader bar, (5) the library's
tag-filter block, (6) no live regions on the library route, (7) the language
block's own spacing and its two underlined links read heavier than they should.
