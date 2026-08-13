## Motion audit

All motion is defined in `app/globals.css`. The two duration tokens are
`--dur-fast: 150ms` and `--dur-med: 250ms`.

Since 12.08.2026 there is a third easing, `--ease-spring`, written as a
`linear()` curve that overshoots by six percent and settles. It is used only
where something *appears* or is *committed* — the settings sheet, the dog-ear on
a finished article — never on a hover or a scroll. A browser that does not know
`linear()` ignores the declaration and falls back to `--ease-out`.

| Selector | Motion | Duration | Delay | Fill mode |
| --- | --- | ---: | ---: | --- |
| `.btn` | filter and transform transition | 150ms | 0 | n/a |
| `.listenbtn` (the reader's primary control) | filter and transform transition | 150ms | 0 | n/a |
| `.card` | transform and border transition | 150ms | 0 | n/a |
| `.iconbtn` | color, background, and transform transition | 150ms | 0 | n/a |
| `.backlink` | color transition | 150ms | 0 | n/a |
| `.pressable` | transform and opacity transition | 150ms | 0 | n/a |
| `.toast` | `toast-in` | 250ms | 0 | none |
| `.page-enter` | `fp-page-in` | 250ms | 0 | backwards |
| `.card-in` | `fp-card-in` | 250ms | 0–100ms | backwards |
| `.page-push` | `fp-page-push` | 250ms | 0 | backwards |
| `.reader-in` | `fp-page-in` | 250ms | 40ms | backwards |
| active bottom-nav underline | `fp-nav-underline` | 150ms | 0 | backwards |
| `.sheet` | `fp-sheet-in` | 250ms | 0 | backwards |
| `.card.is-read::after` | `fp-dogear`, spring easing | 250ms | 0 | backwards |
| `.swipe-card` | transform transition, none while dragging | 150ms | 0 | n/a |
| `.segmented label` | background and colour transition | 150ms | 0 | n/a |
| `.skeleton-card` | `fp-shimmer` | 1.4s per loop | 0 | none, infinite |
| `.state-in` (loading, empty, error) | `fp-state-in`, spring easing | 250ms | 0 | backwards |
| `.language-body` (a language's voices opening) | `fp-state-in`, spring easing | 250ms | 0 | backwards |
| `.language-chevron` | rotates 90° when its row opens | 150ms | 0 | n/a |
| `.fp-bar-fill` (a voice downloading) | width follows the bytes that arrived | 250ms | 0 | n/a |
| `.fp-bar-fill` sheen | `fp-bar-sheen`, a light band travelling along the fill | 1.5s per loop | 0 | none, infinite |
| `.card:active` | sinks: translateY(1px) scale(0.995) plus a tighter shadow | 150ms | 0 | n/a |
| `.topbar.is-scrolled` | border-colour transition | 150ms | 0 | n/a |
| opening an article | view transition, shared `fp-article` title | 250ms | 0 | n/a (browser-driven) |

Page wrappers use `backwards`, so their transforms are removed when their
animations finish and they cannot remain containing blocks for fixed children.
The reading-settings sheet is a `<dialog>` and follows the same rule: it holds
a `translateY` while entering, and a lingering transform would make it the
containing block for anything fixed inside it.
Opening an article is the one place where a movement explains something rather
than decorating it: the card's title carries over into the article's heading, so
it is visible where the reader went and where they came from. Two rules keep it
from misbehaving — the reader's own entry animation is switched off for the
length of the transition (`:root.vt-running`), and the bottom navigation carries
its own `view-transition-name`, which keeps it out of the page snapshot instead
of cross-fading it over the page. Without a running API, or under
`prefers-reduced-motion`, the navigation happens plainly.

Loading, empty and error replace each other in the same place, so they share
one entry animation (`.state-in`) on the same spring as the sheet and the
dog-ear. Depth comes from state rather than decoration: a pressed card sinks a
pixel and tightens its shadow instead of merely shrinking, and the header takes
a one-pixel edge once the page has scrolled under it — an inherited shadow says
"this floats", a line says "there is more above".

The card stagger is capped at 100ms; including its 250ms animation, even the
last card settles at 350ms.

The 150–300ms range applies to finite state changes. The skeleton shimmer is a
continuous loading indicator and deliberately keeps its slower 1.4s cycle; a
300ms loop would repeat at 3.3Hz and read as flashing rather than motion.

Under `prefers-reduced-motion: reduce`, one rule disables animations and
transitions with `!important` for every element and both generated-element
pseudo-elements. `lib/motion.test.ts` verifies the rule and the timing/fill-mode
constraints from the stylesheet, including a computed zero running-motion
count for the reduced-motion override.
