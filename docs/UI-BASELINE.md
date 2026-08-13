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

### Run 4 — the settings screen stops being a wall

**Hypothesis:** the length was never the controls, it was the packaging and the
order. Removing both should cut the screen by a third without removing a single
thing a reader can do.

**Changed:**

| | Before | After |
|---|---|---|
| Sections | five bordered cards, all open | four sections, hairline rules, no borders |
| Order | Appearance, Your library, Reading aloud, Import, Export, Sharing | Appearance, **Reading aloud**, Your library, Save from anywhere |
| Rare actions | three maintenance rows and two whole sections, always open | three disclosures: "Repairs and space", "Bring a library in", "Take your library out" |
| Index | a row of six anchor chips above everything | gone — it existed because the page was too long to scroll blind |
| "Store pictures" | inside Appearance | inside Your library, where the space it costs is reported |
| Desktop | one 672 px column, 2922 px tall | two columns from 900 px up for the two sections people come for; the rest keeps a single column's measure |

**Measured:**

| | Baseline | Run 4 |
|---|---:|---:|
| Settings, mobile 412 px | 3288 px | **2284 px** (−31 %) |
| Settings, desktop 1280 px | 2922 px | **1505 px** (−49 %) |

**Kept:** every action. Import, export, backfill, index, prune, the voice
check, the repair path — all still there, one level down where they belong.
`ui:check` and the a11y audit confirm nothing broke reaching them.

**Verification:** `npm run lint` silent · `npm test` 57 pass · `npm run build`
ok · `ui:check` seeded/empty/offline clean · `npm run jargon` clean ·
`npm run voice:check` 15/15 · `a11y-audit` 0 unnamed, 0 heading skips, 3 known
small targets, no overflow at 200 % font.

**Remaining, re-ranked:** (1) no in-app voice packs — still the one breach of
the product rule, and it needs native work rather than a screen, (2) the reader
control bar is six unlabelled glyphs and one of them is the whole read-aloud
feature, (3) the library's tag-filter block eats the top of the smallest
screen, (4) no live regions on the library route, (5) `Appearance` is still six
segmented controls in a row, (6) loading and error states of the language list
have never been seen by a human — only their code paths.

### Run 5 — the reader gets one primary action

**Hypothesis:** the app's whole purpose was one of six identical glyphs, so it
read as one of six equal options. Giving it a word and a size, and moving the
two least-used glyphs to where their setting already lives, makes the main flow
obvious without adding anything to the screen.

**Changed:** the reader bar is `[▶ Listen] [reading settings] [★] [✓]` — four
controls instead of six. The listen control is a 48 px pill with a label that
turns into "Pause" (and goes quiet — outline instead of fill — while speaking,
because the article is what deserves the attention then). A− and A+ are gone
from the bar; text size lives in the reading-settings sheet beside the typeface
and the line spacing, one tap away, where it belongs with them.

**Kept:** every function. Nothing else moved; the same sheet, favourite and
archive, with their names unchanged for a screen reader.

**Measured** — five new checks in `npm run voice:check`, now **20 passing**:
the control is visible, says "Listen", is at least 48 × 100 px, the bar holds
four controls, and every one of them has an accessible name.

**Verification:** `npm run lint` silent · `npm test` 57 pass · `npm run build`
ok · `ui:check` seeded/empty/offline clean · `npm run jargon` clean ·
`npm run voice:check` 20/20 · `a11y-audit` 0 unnamed, 0 heading skips, 3 known
small targets.

**Remaining, re-ranked:** (1) in-app voice packs (native work), (2) the
library's tag-filter block eats the top of the smallest screen, (3) no live
regions on the library route, (4) `Appearance` is six segmented controls in a
row, (5) the loading and error states of the language list have never been seen
by a human, (6) nothing has been run on a device this session.

### Run 6 — the phone answers back

The device was plugged in mid-run, so this iteration is the one the browser
checks could not do: a real S23 Ultra, real speech engines, real insets.

**Installed side by side, not over the top.** The phone carries the Play test
build, signed with a different key, so `adb install` refused and the only way
through would have been uninstalling — which deletes the library, because
IndexedDB lives in the app's data directory. Instead the debug build now
carries `applicationIdSuffix ".debug"`: `de.ithandwerk.foldpage.debug` installs
beside the real app and touches nothing of its.

**Three faults found on the device, none of them visible in a browser:**

1. **The welcome screen printed machine voice names.** "✓ English
   en-us-x-msm00013-local Hear it" and "✓ Deutsch de Hear it" — exactly what
   `prettyVoiceName()` exists to prevent, in a build where every banned *word*
   had already been cleared. `VoiceOnboarding` never called it.
2. **`prettyVoiceName()` was not enough either.** Stripping "en-us-x-" and
   "-local" leaves "msm00013", which is not a language code, so it was shown as
   if it were somebody's name. A leftover containing digits is a serial number:
   `hasHumanName()` now says so, with the device's own string as a test.
3. **Scrolled content ran over the status bar.** Found because the "Add a
   language" button appeared over the clock. Not a compositing artefact — asked
   the page itself through the DevTools protocol: the button sits at viewport
   `y = 7` with `position: static`, while the sticky header sticks at
   `top: 35.7 px`, below the inset. Nothing was painting the strip the app is
   drawn behind on an edge-to-edge Android. One `body::before` fills it.

**And a fourth fault, in the instrument:** the machine-name patterns were added
to the jargon audit, where they matched nothing — a browser has no voices, so
that audit can never see a voice name. They live in `voice:check` now, which
stubs a phone. Proved by sabotage: with the prettifier removed the run fails on
exactly those checks; restored, it passes. The stub gained a Dutch voice whose
*only* name is machine-written, because with a human-named alternative in the
list the check could pass while doing nothing — which it did, at first.

**Also this run:** the search field no longer sits over an empty library; the
"FILTER BY TAG" caption is spoken rather than shouted (the chips are visibly
chips); and the library and reader carry **persistent live regions** — a region
inserted together with its first message is one several screen readers never
announce. Library 0 → 1, reader 0 → 2.

**Verification:** `npm run lint` silent · `npm test` 57 pass · `npm run build`
ok · `ui:check` seeded/empty/offline clean · `npm run jargon` clean ·
`npm run voice:check` **24/24** · `a11y-audit` 0 unnamed, 0 skips, 3 known
small targets · and on the device: welcome screen reads "standard German voice"
/ "standard English voice", the status-bar strip is clean while scrolling.

**Remaining, re-ranked:** (1) in-app voice packs — native work, still the one
breach, (2) `Appearance` is six segmented controls in a row, (3) settings has
no live region at rest, (4) perceived latency and rerenders have not been
measured this session, (5) the reader has not been driven through a full
read-aloud on the device this run.

### Run 7 — the article gets its own typography back, and the chain is proven

**Found by reading a real article on the phone:** an extracted article had no
structure at all. Measured through the DevTools protocol rather than guessed:

```
.reader p   → margin-top 0px, margin-bottom 0px
.reader h2  → font-size 16.56px, font-weight 400   (body: 16.56px)
```

Tailwind's preflight zeroes margins and makes headings inherit the body's size
and weight, and nothing had put them back. So every saved article was one
unbroken column, with section headings set in body type and no gap between
paragraphs. On the app's central surface.

**Restored, all in `em` so it scales with the four reader sizes:** paragraphs
`0.85em` apart; `h2` at `1.3em`/700, `h3` at `1.12em`/700, `1.7em` of air above
a heading against `0.45em` below — that difference is what says "a new part
starts here"; lists get their markers and indent back; `blockquote`, `pre` and
`hr` get room. `npm run reader-render`: **148 renders, 0 failures**, measure
guard unchanged.

**Two instruments were broken and are fixed:** `reader-render.mjs` opened
IndexedDB at version 2 and died on the app's schema 3 (`VersionError`), and it
never dismissed the welcome screen, so the library that creates the database
never mounted. Both were silent until this run needed them.

**The read-aloud chain, end to end on the S23 Ultra:** a real article saved
from a link (the 404 path checked first — "Page answered with 404", a plain
sentence), opened, `Listen` tapped. `dumpsys media_session` shows FoldPage
`active=true`, `state=PLAYING(3)` with the article title as metadata; the
in-app control turns into a quiet `Pause`; the live region reads "Reading part
1 of 13"; the spoken paragraph is tinted (measured 8.4:1 against the dark
theme, so it stays legible).

**And an open question in `docs/SPEECH.md` is now answered:** tapping **Pause**
in FoldPage's media notification really does stop the player —
`PLAYING(3)` → `PAUSED(2)`, and the button in the app follows. What still does
not arrive is an outside `cmd media_session dispatch pause`, which matches the
documented consequence of holding transient audio focus.

**Verification:** `npm run lint` silent · `npm test` 57 pass · `npm run build`
ok · `ui:check` seeded/empty/offline clean · `jargon` clean · `voice:check`
24/24 · `reader-render` 148/0 · on the device: paragraphs separated, headings
visibly headings, reading aloud runs and pauses from the notification.

### Run 9 — the voices reach the screen, and the article is read by one

The pack layer from run 8 is now a thing a person can use, and the article
actually goes through it.

**On screen**, inside a language row, two labelled groups:

```
BETTER VOICES YOU CAN ADD
  Thorsten   20 MB download        [Add]
  Kerstin    20 MB download        [Add]
ALREADY ON THIS PHONE
  ( ) standard German voice        Hear it
```

Downloading shows the name, a bar, `4.1 MB of 20 MB` and **Cancel**; a failure
turns into one plain sentence and **Try again**; an installed voice is a radio
like any other, with **Remove**. Choosing one stores it in the same place as any
phone voice, under an id that says where it came from, so nothing else in the
app has to know packs exist.

**Routing**, verified on the S23 Ultra by reading a German article aloud:

```
pluginId: FoldPageVoicePacks, methodName: speak
methodData: {"id":"vits-piper-de_DE-kerstin-low-int8",
             "text":"Zudem konkurrieren die generierten Songs mit menschlicher Musik.","speed":1}
```

Sentence by sentence, through FoldPage's own engine, with a voice FoldPage
fetched. Pausing stops it — `pause()` silences the pack as well as the system
engine.

**Three faults the phone showed, and what they cost:**

1. **Six rows reading "standard German voice".** Several installed engines each
   offer a machine-named voice, and every one of them prettifies to the same
   sentence. Six identical labels are not six choices. The list arrives
   best-first, so the first of each name is kept and the rest dropped.
2. **No grouping.** Downloadable and installed voices sat in one list, and the
   only clue which was which was the button on the right. Two small labels fix
   it; they are `aria-hidden`, because the radio group already carries its name
   and a screen reader would otherwise hear it twice.
3. **A system-green Win95 trough.** `accent-color` is ignored on `<progress>`
   in this WebView. The bar is now two elements with `role="progressbar"`: the
   app's own colour, a light band travelling along the fill so a slow download
   still looks alive, and the width still telling the truth.

**Also:** there is no default language any more. A fresh install showed an
English row to everybody; it now guesses the *phone's* language and shows
nothing at all when that language is not one FoldPage knows. English is never
added on top.

**Verification:** `npm run lint` silent · `npm test` 58 pass · `npm run build`
ok · `ui:check` clean · `jargon` clean · `voice:check` 24/24 · and on the
device: download with a real bar, cancel, install, selection, and an article
read by the downloaded voice.

**Remaining:** nothing manages storage across languages in Settings, and the
packs have not been tried on a slow or interrupted connection. (The reader's
own sheet *does* offer packs — an earlier note here said otherwise and was
wrong; it was written from the code rather than from the screen.)

### Run 10 — the parts that only fail on somebody's real phone

**Hearing a downloaded voice before keeping it.** Installed packs had a Remove
and no way to listen. Worse, `previewVoice()` did not know packs existed: it
handed `foldpage:…` to the phone's engine, which does not know that name and
would have answered with some other voice — a preview of the wrong thing.
Both fixed; pack rows now read `Hear it   Remove`.

**A failed download used to delete a working voice.** The first version
unpacked into the target directory and, on any error, deleted it. So asking for
a voice on a bad connection could cost the reader the voice they already had.
Installs are atomic now: unpack beside it, swap into place, and on failure
delete only what this download made. `list()` also sweeps `.new` and `.part`
left behind by a process killed mid-install.

Measured on the phone, with a URL that cannot exist:

```
fehlermeldung: "the download answered with 404"
nochInstalliert: ["vits-piper-de_DE-thorsten-medium-int8"]
```

**An uninstalled speech engine made the app silent.** Two speech apps were
removed from the phone; the system's own default still named one of them, and
FoldPage's stored per-language choice pointed at another. Nothing on screen
said so — the article simply did not speak. `autoConfigure()` now drops a
stored engine that is no longer installed and picks again, and `play()` runs
that check before the first word rather than discovering it mid-article.

Proved by breaking it on purpose: with `engines.de = "com.beispiel.geloescht"`
stored, pressing Listen healed the choice to `com.google.android.tts` and the
article spoke.

**Storage** is reported where it can be acted on: "Downloaded voices take up
70 MB on this phone. Each one can be removed under its language."

**And the end of the chain, on the device:** with Thorsten chosen in the
reader's own sheet, the article is read by FoldPage's engine —

```
pluginId: FoldPageVoicePacks, methodName: speak
{"id":"vits-piper-de_DE-thorsten-medium-int8","text":"Suno räumt ein, dass …"}
```

No other application involved, offline, with the app's own voice.

**Verification:** `npm run lint` silent · `npm test` 58 pass · `npm run build`
ok · `ui:check` clean · `jargon` clean · `voice:check` 24/24 · plus the four
device checks above. The instruments' database wait was also raised from 4 s to
10 s after the jargon audit failed once under load — a seed that gives up early
reports a clean screen it never saw.

### Run 11 — the voice was never audible, and the reason was one missing wait

**The fault.** FoldPage's own voice produced audio and nobody heard it. Not a
volume problem and not a routing problem: `play()` wrote the samples into the
`AudioTrack` buffer and returned as soon as they were *queued*, then stopped and
released the track. The next sentence arrived, flushed what was still playing,
and the article ran silently to the end.

Measurable from the beginning and missed anyway — the first device run reported
"3.61 s of audio produced in 1.8 s", which is exactly the shape of audio that
was never played. A call that returns faster than the sound it makes has not
made a sound.

```
before   3.61 s of audio, call returned after 1,775 ms   → nothing heard
after    3.29 s of audio, call returned after 5,106 ms   → heard to the end
```

`play()` now waits for the playback head to reach the last sample.

**The second half of the same problem.** With the wait in place, synthesis and
playback are strictly in turn: half a second of silence per second of speech
while the model works. So the plugin has two threads now — one that makes
sentences, one that plays them — and the player asks for the *next* sentence
before waiting on the current one. Measured on the phone, from the bridge log:

```
prepare  +0 ms      ← the next sentence starts being made …
speak    +0 ms      ← … as this one starts being heard
prepare  +5604 ms   ← the pair repeats only when the sentence has finished
speak    +1 ms
prepare  +5697 ms
speak    +1 ms
```

Nothing waits for the model any more; the only silence between two sentences is
the one `SENTENCE_GAP` puts there on purpose.

**Verification:** `npm test` 58 pass · `npm run build` ok · `ui:check` clean ·
`jargon` clean · `voice:check` 24/24 · `a11y-audit` unchanged · and on the
phone, an article read end to end in FoldPage's own voice — confirmed by ear.

### Run 12 — the wait before the first word

**Measured before changing anything**, on the phone, with the plugin reporting
its own synthesis time:

| | synthesis | audio |
|---|---:|---:|
| first sentence, model not yet in memory | **1,338 ms** | 1.54 s |
| any sentence after that | 328 ms | 2.23 s |

So the wait a reader feels after pressing Listen is almost entirely the model
being loaded — one second of silence, once per article, with nothing on screen
to say why.

**Changed:** the first sentence is made when the *article* opens, not when the
reader presses play. That spends the second while nobody is waiting for it, and
it only happens for a language whose voice FoldPage carries. On the device:

```
03:01:03  prepare  {"text":"Der KI-Musikgenerator Suno steht in der Kritik."}   ← article opened
03:01:09  prepare  {"text":"Das Startup soll unrechtmäßig …"}                    ← Listen pressed:
03:01:09  speak    {"text":"Der KI-Musikgenerator Suno steht in der Kritik."}       the next one is
                                                                                    started, the first
                                                                                    one is already made
```

Measured end to end for a prepared sentence: **`synthMs: 0`**, and the call
takes 1,714 ms for 1,693 ms of audio — **21 ms** of anything that is not sound.

**And where the wait is still real** — the reader who presses Listen a second
after opening — the reader now says so: "Getting the voice ready…" in the same
live region that later reports which part is being read. A screen that says
nothing for a second looks broken rather than busy.

**Cost, stated plainly:** an article opened and never listened to spends about
a second of one core. It happens only when a downloaded voice is the chosen one
for that language.

**Verification:** `npm test` 58 pass · lint silent · build ok · `jargon` clean ·
`ui:check` clean · plus the device measurements above.
