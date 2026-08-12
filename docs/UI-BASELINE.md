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
