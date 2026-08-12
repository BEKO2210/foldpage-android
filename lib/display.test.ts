import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/** The display settings decide what the app looks like on the next launch, so
    a bad value must not be able to leave it unreadable. */
test("stored display settings are repaired, never trusted", async () => {
  const { normalizePrefs, DEFAULT_PREFS, TEXT_SIZES } = await import("./display.ts");

  assert.deepEqual(normalizePrefs(undefined), DEFAULT_PREFS);
  assert.deepEqual(normalizePrefs({}), DEFAULT_PREFS);
  assert.deepEqual(normalizePrefs("not an object"), DEFAULT_PREFS);

  assert.deepEqual(
    normalizePrefs({
      theme: "dark",
      align: "justify",
      font: "sans",
      leading: "airy",
      size: 3,
      images: "off",
    }),
    {
      theme: "dark",
      align: "justify",
      font: "sans",
      leading: "airy",
      size: 3,
      images: "off",
    }
  );

  // Values from a future version, a hand-edited store or a half-written write
  for (const bad of [-1, TEXT_SIZES.length, 1.5, "large", null, NaN]) {
    assert.equal(normalizePrefs({ size: bad }).size, DEFAULT_PREFS.size, `size ${String(bad)}`);
  }
  // A numeric string is a storage artefact, not a broken value — take it.
  assert.equal(normalizePrefs({ size: "2" }).size, 2);
  assert.equal(normalizePrefs({ theme: "sepia" }).theme, "system");
  assert.equal(normalizePrefs({ align: "center" }).align, "left");
  assert.equal(normalizePrefs({ font: "comic" }).font, "serif");
  assert.equal(normalizePrefs({ leading: "tight" }).leading, "cozy");
  assert.equal(normalizePrefs({ images: "wifi" }).images, "on");
});

/** The pre-paint script in the layout is a second implementation of the same
    defaults — it has to be, because it runs before any module is loaded. If the
    two drift apart, the first frame shows one thing and React then corrects it
    to another, which is the flash the script exists to prevent. */
test("the pre-paint script and lib/display agree on the defaults", async () => {
  const { DEFAULT_PREFS, TEXT_SIZES, STORAGE_KEY } = await import("./display.ts");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const script = layout.match(/const APPLY_DISPLAY_PREFS = `([\s\S]*?)`;/)?.[1] ?? "";

  assert.ok(script.length > 0, "the pre-paint script was renamed or removed");
  assert.match(script, new RegExp(`"${STORAGE_KEY}"`));
  assert.match(script, new RegExp(TEXT_SIZES.map((s) => `"${s}"`).join(",").replace(/\./g, "\\.")));
  assert.match(script, new RegExp(`"${DEFAULT_PREFS.theme}"`));
  assert.match(script, new RegExp(`\\?"${DEFAULT_PREFS.align}"|:"${DEFAULT_PREFS.align}"`));
  assert.match(script, new RegExp(`\\?"${DEFAULT_PREFS.font}"|:"${DEFAULT_PREFS.font}"`));
  assert.match(script, new RegExp(`\\?"${DEFAULT_PREFS.leading}"|:"${DEFAULT_PREFS.leading}"`));
  assert.match(script, new RegExp(`\\[0,1,2,3\\]`), "the size guard lists every index");
  assert.equal(TEXT_SIZES.length, 4, "add the new index to the pre-paint script too");
});

/** Each setting is an attribute on <html>; the stylesheet has to answer to all
    of them, or a control would move nothing. */
test("every display setting has a rule in the stylesheet", () => {
  const cssText = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const selector of [
    ':root[data-theme="light"]',
    ':root[data-theme="dark"]',
    ':root[data-font="sans"]',
    ':root[data-leading="airy"]',
    ':root[data-align="justify"]',
  ]) {
    assert.ok(cssText.includes(selector), `no rule for ${selector}`);
  }
  assert.match(cssText, /--reader-family/);
  assert.match(cssText, /--reader-leading/);
  assert.match(cssText, /hyphens:\s*auto/);
});
