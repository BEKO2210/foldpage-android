---
name: foldpage-product-ux
description: This skill should be used for any product, UX, or UI work in the foldpage-android repository — whenever the task touches reading aloud, voices, languages, voice packs or downloads, speech engines, settings screens, onboarding, the reader, navigation, typography, spacing, motion, accessibility, or any user-visible copy. Trigger phrases include "add a language", "voice selection", "voice pack", "download voices", "TTS engine", "change the settings screen", "redesign this screen", "improve the reader UI", "make it look better", "new screen", "empty state", "error state", "loading state", "offline", and any request to build, restyle, or review a FoldPage screen. This skill defines the permanent product rules, the language/voice architecture, the UI quality bar, and the mandatory Playwright verification for FoldPage.
version: 1.0.0
---

# FoldPage — Product & UX Rules

FoldPage is a consumer reading app that saves articles and reads them aloud.
This skill carries the product rules that do not change between sessions. They
override generic UI advice and personal taste. When a request conflicts with a
rule here, state the conflict in one sentence, then build the version that
follows the rule.

Read this file first. Load the reference files when the task actually enters
their territory — they are detailed and only useful in context.

## 1. FoldPage is a product, not a developer tool

The person holding the phone wants an article read to them. They do not know
what a TTS engine is, and must never be asked.

**Never surface in normal user UI:**

- engine names or package ids (`com.google.android.tts`,
  `com.k2fsa.sherpa.onnx.tts.engine`, "Piper", "sherpa-onnx")
- provider, backend, model, or inference terminology ("neural engine",
  "model", "inference", "runtime", "synthesis backend")
- voice URIs, machine voice names (`de-DE-language`, `en-us-x-sfg-local`),
  quality integers, indices, BCP 47 tags shown raw
- routing decisions ("falling back to Google TTS", "selected engine 2 of 3")

Say what the listener hears instead: the language, a human voice name, or the
honest fallback wording — `prettyVoice()` in `components/VoiceSettings.tsx`
already does this and is the pattern to reuse. Engine-level facts belong in
`docs/`, code comments, and audit reports, never on screen.

Diagnostics are an exception only when the user has explicitly gone looking for
them, and even then they read as plain sentences, not as logs.

## 2. The primary flow

```
Text → Language → Voice → Generate
```

- Language is chosen **before** voice, always. Never the reverse, never both at
  once in one flat list.
- After a language is chosen, show **only** voices compatible with that
  language. Never show a voice belonging to an unrelated language, not greyed
  out, not "also available", not at the bottom of the list.
- If no compatible voice exists, say so in one sentence and offer the download
  path (section 3) — never fall back to showing foreign voices.

In today's code the language step is implicit: `article.lang` decides, one
language gets one voice, and `pickBestSetup()` chooses it. That satisfies the
flow — the ordering rule binds whenever a *visible* choice is introduced.

## 3. One coherent voice system

Internally FoldPage may use several engines, models, and providers. The user
experiences one FoldPage voice system.

- Engine selection is **automatic** (`pickBestSetup()` in `lib/voice.ts`).
- If the preferred engine or voice is unavailable, fall back automatically to
  the next best one that can actually speak the language, locally.
- Never make the user pick an engine to make sound come out.
- Never require installing a separate third-party app to obtain another
  FoldPage voice. Sending the user to Android's own speech settings is a
  legacy escape hatch, not the target — see
  `references/voice-and-language.md`.

## 4. Language architecture: many languages, small app

Design for dozens of languages, ship a small binary.

- Do **not** bundle large voice or model assets into the initial app unless
  there is a written technical justification.
- Target shape: lightweight core app + downloadable language/voice packs +
  local cache + automatic versioning/update + offline reuse after download.
- Selecting an uninstalled voice pack opens a polished download flow **inside
  FoldPage**: size before the tap, progress while it runs, cancel, retry on
  failure, resume where sensible.
- Downloaded languages are manageable from Settings: list, size, update,
  remove.

The full target architecture, the current gap, and the constraints that already
cost time (per-language engines, the Android 11 `<queries>` manifest trap,
local-only voices, IndexedDB origin lock) are in
`references/voice-and-language.md`. Read it before designing or changing
anything about voices, languages, packs, or downloads.

## 5. UI quality bar

World-class consumer software. Concretely:

- Minimal. Extremely clear hierarchy. One primary action per screen.
- Excellent typography and spacing — the reader's measure and scale already
  exist; extend them rather than inventing new values.
- Excellent motion, and honest: every animation respects
  `prefers-reduced-motion` and the values in `docs/MOTION.md`.
- No generic AI-dashboard aesthetic. No cards used as default packaging. No
  developer terminology. No clutter, no decorative badges, no unexplained
  icons.
- Mobile is first-class, not a shrunken desktop. The reference viewport is
  412 × 915.
- Accessibility is part of "done": keyboard navigation, screen-reader names,
  visible focus, contrast per `docs/CONTRAST.md`, reduced motion, touch
  targets ≥ 44 px.
- Preserve existing working functionality. A redesign that quietly drops a
  working control is a regression.

Details, the existing token/scale locations, and the copy rules are in
`references/ui-quality-bar.md`.

## 6. Verification is mandatory

Every substantial UI change is tested through Playwright before it is called
done. Not "should work" — output.

Run, in this order:

```bash
npm test                       # unit tests
npm run build                  # produces out/ — the export the checks serve
npm run ui:check               # console errors, page errors, failed requests, overflow
npm run ui:check -- --empty    # the same walk with an empty library
npm run ui:check -- --offline  # everything beyond the app's own origin blocked
```

`ui:check` runs `scripts/ui-check.mjs` from this skill: it serves the static
export and, for each route at both a mobile (412 × 915) and a desktop
(1280 × 900) viewport, reports console errors, page errors, failed requests and
horizontal overflow with the offending element. It writes
`corpus/ui-report.json` and exits non-zero on any finding. `--shots` writes a
screenshot per route and viewport; `--keep` opens a headed browser.

Also required, and not covered by the script alone:

- the existing audits when the change touches their area:
  `node scripts/a11y-audit.mjs` (structure, large font, focus),
  `npm run reader-render` (reader layout, measure, screenshots)
- **state coverage**: loading, empty, error, downloading, and offline states of
  the changed screen — each one reached and looked at, not assumed
- device build when native speech is involved: `npm run apk:debug`
  (`npm run build` alone shows the previous state on the device)

The checklist, how to force each state, and how to read the report are in
`references/playwright-checks.md`.

## 7. Working rules

- The instrument is suspect before the code is. A zero in a report means
  "found nothing", not "nothing there" — this repo has been bitten by that
  three times in one day (`docs/A11Y.md`, `docs/SPEECH.md`).
- Combine with the repo's other skills rather than replacing them:
  `superpowers:systematic-debugging` for any fault, `ui-ux-pro-max` for visual
  and motion work. This skill sets the product constraints; those skills carry
  out the work inside them.
- Keep documentation in step: colour changes update `docs/CONTRAST.md`,
  motion changes `docs/MOTION.md`, speech changes `docs/SPEECH.md`, structural
  changes `docs/ARCHITECTURE.md`.
- Never change `androidScheme` or `hostname` in `capacitor.config.ts` —
  IndexedDB hangs off the origin, and a change wipes the user's library.
- Version numbers are not bumped per run.

## Additional resources

- **`references/voice-and-language.md`** — language/voice/pack architecture,
  the download flow specification, current implementation and its gaps, the
  Android traps already paid for.
- **`references/ui-quality-bar.md`** — hierarchy, typography, spacing, motion,
  copy, accessibility, and where the existing values live in the codebase.
- **`references/playwright-checks.md`** — the verification checklist, forcing
  loading/empty/error/downloading/offline states, and extending the script.
- **`scripts/ui-check.mjs`** — console errors, page errors, failed requests and
  horizontal overflow across routes at mobile and desktop viewports.
