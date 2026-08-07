import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [
      match[1],
      match[2],
    ])
  );
}

const lightBlock = css.match(/:root\s*{([\s\S]*?)}/)?.[1] ?? "";
const darkBlock =
  css.match(/@media \(prefers-color-scheme: dark\)\s*{\s*:root\s*{([\s\S]*?)}/)?.[1] ?? "";
const light = tokens(lightBlock);
const dark = { ...light, ...tokens(darkBlock) };

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string): number {
  const [bright, dark] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a
  );
  return (bright + 0.05) / (dark + 0.05);
}

const textRoles = [
  ["body on page", "ink", "paper"],
  ["muted copy on page", "muted", "paper"],
  ["body on card/input", "ink", "card"],
  ["muted copy on card", "muted", "card"],
  ["selected tab", "paper", "ink"],
  ["accent button label", "accent-ink", "highlight"],
  ["accent used as foreground", "accent-text", "paper"],
  ["toast copy", "toast-text", "toast-bg"],
  ["toast action", "highlight", "toast-bg"],
] as const;

for (const [theme, palette] of [
  ["light", light],
  ["dark", dark],
] as const) {
  test(`${theme} theme text roles meet WCAG AA`, () => {
    for (const [role, foreground, background] of textRoles) {
      const ratio = contrast(palette[foreground], palette[background]);
      assert.ok(ratio >= 4.5, `${role}: ${ratio.toFixed(2)}:1`);
    }
  });
}

test("card boundaries meet the 3:1 non-text contrast threshold", () => {
  for (const [theme, palette] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    const ratio = contrast(palette["card-line"], palette.card);
    assert.ok(ratio >= 3, `${theme} card border: ${ratio.toFixed(2)}:1`);
  }
});
