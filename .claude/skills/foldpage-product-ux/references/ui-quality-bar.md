# The UI quality bar

The target is world-class consumer software: minimal, with an extremely clear
hierarchy, excellent typography, spacing and motion. This file says what that
means concretely in this codebase, and where the existing values live so new
work extends them instead of inventing a second system.

## Where the system already is

| Concern | Location |
|---|---|
| Colour tokens, light/dark, forced themes | `app/globals.css` `:root`, `@media (prefers-color-scheme: dark)`, `[data-theme]` |
| Duration and easing tokens | `--dur-fast: 150ms`, `--dur-med: 250ms`, `--ease-out`, `--ease-spring` |
| Typography families | `--serif`, `--sans`; reader overrides `--reader-family`, `--reader-leading` |
| Contrast, checked in CI | `docs/CONTRAST.md` ← read by `lib/contrast.test.ts` |
| Every animation, checked in CI | `docs/MOTION.md` ← read by `lib/motion.test.ts` |
| Accessibility findings and deliberate exceptions | `docs/A11Y.md` |
| Reader layout and measure | `docs/READER-LAB.md`, `scripts/reader-render.mjs` |

Changing a colour means updating `docs/CONTRAST.md`; changing an animation
means updating `docs/MOTION.md`. The tests read those documents, so a change
made only in CSS fails the suite — by design.

## Hierarchy and layout

- One primary action per screen, visually unmistakable. Everything else is
  quieter (`.btn-quiet`, `.linkbtn`), not merely smaller.
- Group by meaning, not by container. **Cards are not default packaging** — a
  card is justified when its content is a discrete object the user acts on (an
  article). Settings rows, states and explanations are not cards.
- No decorative badges, no icon without a name a screen reader can read, no
  chrome that exists to fill space.
- Vertical rhythm comes from a small set of spacing steps already in use;
  reuse them rather than adding one-off pixel values.
- Mobile is the reference, not a fallback: 412 × 915 is the design viewport,
  and the desktop check exists to catch breakage, not to define the layout.

## Typography

- The reader's measure is guarded: paragraphs must not exceed ~75 characters
  per line (`MAX_CHARS_PER_LINE` in `scripts/reader-render.mjs`). A lost
  `max-width` or a font swap that widens the column fails the render run.
- Two families only — `--serif` for reading, `--sans` for the interface. A
  third family needs a written reason.
- Line length, leading and size in the reader are user-controlled
  (`lib/display.ts`); new reader styling must survive every combination, not
  only the default.
- Real text at real length in every mock-up. Long headlines, long site names
  and long voice names are the normal case, not the edge case.

## Motion

- Only two durations, `150ms` for feedback and `250ms` for arrival.
- `--ease-spring` is reserved for something *appearing* or being *committed* —
  never hover, never scroll.
- Every animation respects `prefers-reduced-motion`; the test enforces it.
- Page wrappers animate with `backwards` fill so a lingering transform cannot
  become the containing block for fixed children. This has already broken the
  settings sheet once.
- Motion explains a relationship (this came from that) or confirms an action.
  Motion that only decorates gets cut.

## Copy

- Plain sentences, no jargon, no developer terminology, no log lines.
- Never an engine name, package id, model name, voice URI, quality number, or
  raw language tag on screen (see `SKILL.md` §1).
- Errors say what happened and what to do next, in one or two sentences:
  "That voice would not speak." — not a status code.
- Empty states say what will be here and how to put something here.
- Numbers get units and human scale ("48 MB", "2 min read").

## Accessibility — part of "done", not a later pass

- Every control has an accessible name. A radio inside a `<label>` takes its
  name from the label; the audit script knows that now, after reporting fifteen
  false positives once.
- Touch targets ≥ 44 px high. Where the real target is larger than the measured
  box (a card link with an `::after` overlay), record it in `docs/A11Y.md`
  rather than "fixing" it again next time.
- Heading levels never skip. Library `h1 → h2`, reader `h1 → h2`, settings
  `h1 → h2`.
- Focus is visible, and after a route change it lands on the new page's
  heading (`components/RouteFocus.tsx`).
- Gestures are shortcuts, never the only path: anything reachable by swipe is
  also reachable by a button.
- Layout survives 200 % system font size — the audit tests at 32 px root.
- State is never carried by colour alone: pair it with a mark or a word.
- Contrast per `docs/CONTRAST.md`, in both themes.

## Preserving what works

A redesign that removes a working control is a regression, not a
simplification. Before restyling a screen, list the actions it currently
supports, and check each one still exists and still works after the change.
When a control genuinely should go, say so explicitly and say where its
function moved.

## Anti-patterns, stated plainly

- Generic AI-dashboard look: dense grids of stat cards, gradient hero panels,
  purple-on-dark, icon+number tiles.
- A settings screen that mirrors the data model instead of the user's mental
  model.
- Progressive disclosure used as an excuse to hide the primary action.
- Toasts used to report things the user did not do.
- Loading spinners where a skeleton (`.skeleton-card`) already exists.
- Adding a preference instead of choosing a good default. FoldPage removed
  three pickers on purpose; the burden of proof is on adding one back.
