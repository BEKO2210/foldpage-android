## Motion audit

All motion is defined in `app/globals.css`. The two duration tokens are
`--dur-fast: 150ms` and `--dur-med: 250ms`.

| Selector | Motion | Duration | Delay | Fill mode |
| --- | --- | ---: | ---: | --- |
| `.btn` | filter and transform transition | 150ms | 0 | n/a |
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
| `.skeleton-card` | `fp-shimmer` | 300ms per loop | 0 | none, infinite |

Page wrappers use `backwards`, so their transforms are removed when their
animations finish and they cannot remain containing blocks for fixed children.
The card stagger is capped at 100ms; including its 250ms animation, even the
last card settles at 350ms.

Under `prefers-reduced-motion: reduce`, one rule disables animations and
transitions with `!important` for every element and both generated-element
pseudo-elements. `lib/motion.test.ts` verifies the rule and the timing/fill-mode
constraints from the stylesheet, including a computed zero running-motion
count for the reduced-motion override.
