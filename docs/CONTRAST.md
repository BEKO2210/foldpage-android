## Theme contrast audit

Ratios are calculated from the colour tokens in `app/globals.css` and enforced
by `lib/contrast.test.ts`. Normal text must meet WCAG AA at 4.5:1; card
boundaries use the 3:1 non-text threshold.

The theme has three states: follow the system, forced light, forced dark
(`data-theme` on `<html>`, written by `lib/display.ts`). A forced theme repeats
its palette in its own rule, because CSS cannot hand one rule's custom
properties to another. The test asserts that the repeated blocks are identical
to the automatic ones, so the ratios below hold in all three states and a drift
fails the run instead of shipping a half-dark theme.

| Role | Light | Dark |
| --- | ---: | ---: |
| Body on page | 15.97:1 | 14.36:1 |
| Muted copy on page | 5.74:1 | 7.04:1 |
| Body on card/input | 16.70:1 | 13.21:1 |
| Muted copy on card | 6.00:1 | 6.47:1 |
| Selected tab | 15.97:1 | 14.36:1 |
| Accent button label | 11.52:1 | 11.52:1 |
| Accent used as foreground | 4.99:1 | 12.38:1 |
| Toast copy | 15.97:1 | 15.97:1 |
| Toast action | 11.52:1 | 11.52:1 |
| Card boundary (non-text) | 3.15:1 | 3.07:1 |

The yellow accent remains a fill, underline, progress indicator, or decorative
mark. When it is a foreground, `--accent-text` darkens it on the light theme.
The toast uses fixed dark-surface tokens so its yellow action stays legible in
both themes. The Android status bar follows system theme changes, and the
empty-state illustration is theme-adjusted without changing its yellow accent.
