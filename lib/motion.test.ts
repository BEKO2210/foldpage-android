import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("motion durations and card completion stay within the audit limits", () => {
  assert.match(css, /--dur-fast:\s*150ms/);
  assert.match(css, /--dur-med:\s*250ms/);
  assert.match(css, /animation:\s*fp-shimmer 300ms linear infinite/);
  assert.match(
    css,
    /\.card-in\s*\{[^}]*animation:\s*fp-card-in var\(--dur-med\)[^;]*backwards;[^}]*animation-delay:\s*calc\(min\(var\(--i, 0\) \* 20ms, 100ms\)\)/s
  );
  assert.equal(250 + 100, 350);
});

test("transforming entry animations do not fill forwards", () => {
  for (const selector of ["page-enter", "card-in", "page-push", "reader-in"]) {
    const rule = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
    assert.ok(rule, `missing .${selector}`);
    assert.match(rule[1], /animation:[^;]*backwards/);
    assert.doesNotMatch(rule[1], /\b(?:both|forwards)\b/);
  }
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
