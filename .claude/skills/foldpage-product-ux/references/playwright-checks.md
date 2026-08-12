# Verifying a UI change

No UI change is done because it looks right in the editor. Every substantial
one is driven through Playwright, at both viewports, in every state it can
reach. This file is the checklist and the mechanics.

## The runs

```bash
npm test                       # unit tests — display, motion, contrast, speech, parsing
npm run build                  # writes out/ — every check below serves that export
npm run ui:check               # console errors, page errors, failed requests, overflow
npm run ui:check -- --empty    # the same walk with an empty library
npm run ui:check -- --offline  # everything beyond the app's own origin blocked
node scripts/a11y-audit.mjs    # names, heading levels, touch targets, 200 % font, focus
npm run reader-render          # reader layout, measure, light/dark screenshots
npm run apk:debug              # on-device build; required for anything native (speech)
```

`ui:check` also takes `--shots` (a screenshot per route and viewport in
`corpus/ui-shots/`) and `--keep` (headed browser, for a look with human eyes).
It writes `corpus/ui-report.json` and exits non-zero on any finding.

`npm run build` alone is not a device test — the device keeps showing the
previous state until `cap sync` runs, which `npm run apk:debug` includes.

## The checklist

For each screen the change touches:

- [ ] mobile viewport 412 × 915 — the design shape
- [ ] desktop viewport 1280 × 900 — breakage only, not a second design
- [ ] no console errors, and console warnings read and judged
- [ ] no uncaught page errors
- [ ] no horizontal overflow at either viewport
- [ ] **loading** state seen
- [ ] **empty** state seen
- [ ] **error** state seen
- [ ] **downloading** state seen, where the screen can download anything
- [ ] **offline** state seen
- [ ] keyboard: tab order sensible, focus visible, Esc closes what opened
- [ ] every control that worked before still works
- [ ] `docs/` updated where the change touched colour, motion, speech or
      structure

## Reaching each state

The states are the part that gets skipped, so here is how each one is forced.

**Loading.** Throttle the response rather than hoping to catch the frame:

```js
await page.route("**/*", async (route) => {
  await new Promise((r) => setTimeout(r, 1200));
  return route.continue();
});
```

For app-internal loading (IndexedDB reads), `--empty` plus a fresh navigation
usually shows the skeleton; `.skeleton-card` is the existing shape and no new
spinner should be introduced beside it.

**Empty.** `npm run ui:check -- --empty` skips seeding entirely. For a single
screen, clear the store in the page: open `foldpage`, clear `articles`, reload.

**Error.** Fail the request or the API the screen depends on:

```js
await page.route("**/api/**", (route) => route.abort("failed"));
```

For speech, the native bridge is absent in the browser, so the error path is
the one a browser build already takes — check the message it produces reads as
a sentence, not as an exception.

**Downloading.** Until packs exist there is nothing real to download; drive the
component's state directly and check every visual state — offered, progress,
cancel, failed, retry, installed. A download UI shipped with only its happy
path is not shipped.

**Offline.** `npm run ui:check -- --offline` blocks every request that does not
belong to the app's own origin. That, not a dead loopback server, is what
offline means for a Capacitor app: its own files are local and present, the
network is not. A screen that goes blank under that flag has a hidden network
dependency.

## Reading the report

`corpus/ui-report.json` holds one entry per route × viewport with
`overflowPx`, `overflowCulprits`, `console`, `pageErrors` and
`failedRequests`, plus the flat `findings` list the exit code is based on.

Known instrument behaviour, so it does not get "fixed" again:

- **Aborted `HEAD` requests are ignored.** The router prefetches visible links
  and drops the request the moment a navigation starts. The first run reported
  thirteen of these as faults; the instrument was wrong, not the app.
- **Overflow caused by a pseudo-element** reports `no element found` for the
  culprit. The overflow number is still real — look for `::before` / `::after`
  and for fixed-width children.
- **Offline mode does not count failed requests**, because under that flag they
  are the app doing as it was told.
- Entry animations hold a transform while they run, which reads as overflow;
  the script waits 400 ms past load for that reason.

## When the report is clean but something is wrong

A zero means "found nothing", not "nothing there". This repo has been caught
three times by its own instruments: fifteen false "unnamed controls" from an
audit that did not know a `<label>` names its input, a focus finding that was
really a click landing before the page lived, and a speech audit that counted
correct quotation marks as errors. Before trusting a clean run, ask what the
script could not have seen — and for anything that a machine cannot judge
(order of screen-reader announcements, whether the motion feels right, whether
the copy is honest), say plainly that it was not verified.
