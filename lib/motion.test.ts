import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("state-change durations and card completion stay within the audit limits", () => {
  assert.match(css, /--dur-fast:\s*150ms/);
  assert.match(css, /--dur-med:\s*250ms/);
  assert.match(css, /animation:\s*fp-shimmer 1\.4s linear infinite/);
  assert.match(
    css,
    /\.card-in\s*\{[^}]*animation:\s*fp-card-in var\(--dur-med\)[^;]*backwards;[^}]*animation-delay:\s*calc\(min\(var\(--i, 0\) \* 20ms, 100ms\)\)/s
  );
  assert.equal(250 + 100, 350);
});

test("transforming entry animations do not fill forwards", () => {
  for (const selector of ["page-enter", "card-in", "page-push", "reader-in", "sheet", "state-in"]) {
    const rule = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
    assert.ok(rule, `missing .${selector}`);
    assert.match(rule[1], /animation:[^;]*backwards/);
    assert.doesNotMatch(rule[1], /\b(?:both|forwards)\b/);
  }
});

test("depth comes from state, and the header edge is a line rather than a shadow", () => {
  // A pressed card sinks instead of only shrinking. Both parts matter: the
  // shift downwards is what reads as depth, the tighter shadow is what makes
  // the shift believable.
  const pressed = css.match(/\.card:active\s*\{([^}]*)\}/);
  assert.ok(pressed, "missing .card:active");
  assert.match(pressed[1], /transform:\s*translateY\(1px\) scale\(0\.995\)/);
  assert.match(pressed[1], /box-shadow:/);

  const scrolled = css.match(/\.topbar\.is-scrolled\s*\{([^}]*)\}/);
  assert.ok(scrolled, "missing .topbar.is-scrolled");
  assert.match(scrolled[1], /border-bottom-color:\s*var\(--line\)/);
  assert.doesNotMatch(scrolled[1], /box-shadow/);

  // The three states share one curve, and it is the app's spring.
  assert.match(css, /\.state-in\s*\{[^}]*var\(--ease-spring\)/s);
});

test("reduced motion leaves no running animation or transition", () => {
  const media = css.match(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/
  );
  assert.ok(media, "missing reduced-motion media query");
  assert.match(media[1], /\*,\s*\*::before,\s*\*::after\s*\{/);
  assert.match(media[1], /animation:\s*none\s*!important/);
  assert.match(media[1], /transition:\s*none\s*!important/);

  const runningMotionProperties = ["animation", "transition"].filter(
    (property) => !new RegExp(`${property}:\\s*none\\s*!important`).test(media[1])
  );
  assert.equal(runningMotionProperties.length, 0);
});
