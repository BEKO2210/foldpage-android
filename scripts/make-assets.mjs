/**
 * Renders every icon and splash the app ships, from one mark.
 *
 *   node scripts/make-assets.mjs      (or: npm run assets)
 *
 * The geometry lives here and in `public/icon.svg`, which is the same drawing
 * for the web. Everything else — the launcher icons at five densities, the
 * adaptive layers, the splash screens, the PWA icons — is derived, so the mark
 * cannot drift between places.
 *
 * Rendered with the Chromium that Playwright already installs for the reader
 * lab. It used to use `sharp`, which was never in package.json and was missing
 * a native binary on the machine this project is built on: the script simply
 * could not run. A tool that cannot be run is not a pipeline.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const NAVY = "#1a1e26";
const PAPER = "#fafaf7";
const INK_DARK = "#14171e";
const YELLOW = "#f5d547";
const RULE = "#c9ccc4";

/** The mark, in a 512 grid: a sheet whose top-right corner is folded over.
 *
 *  The fold is a third of the sheet wide on purpose. Small marks lose their
 *  detail first, and this app is named after exactly one detail — so that
 *  detail is the one thing that has to survive at 36px. The short shadow under
 *  the crease is what makes the corner read as turned over instead of painted
 *  on; it is the only shading in the icon.
 *
 *  `outlined` adds a hairline for the light splash, where a white sheet on
 *  paper would otherwise be invisible. */
const glyph = (outlined = false) => `
  <path d="M96 80h176l144 144v208H96z" fill="${PAPER}"${
  outlined ? ` stroke="${RULE}" stroke-width="6"` : ""
}/>
  <path d="M272 80l144 144H272z" fill="${YELLOW}"/>
  <path d="M272 224h144l-144 26z" fill="#000000" opacity="0.16"/>`;

/** Glyph bounding box inside that 512 grid. */
const BOX = { x: 96, y: 80, w: 320, h: 352 };

/** Place the glyph on a `size` canvas so its height covers `heightRatio`. */
function centeredGlyph(size, heightRatio, outlined = false) {
  const scale = (size * heightRatio) / BOX.h;
  const tx = (size - BOX.w * scale) / 2 - BOX.x * scale;
  const ty = (size - BOX.h * scale) / 2 - BOX.y * scale;
  return `<g transform="translate(${tx} ${ty}) scale(${scale})">${glyph(
    outlined
  )}</g>`;
}

function svg(size, body, background) {
  const bg = background
    ? `<rect width="${size}" height="${size}" fill="${background}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${body}</svg>`;
}

const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 16, height: 16 } })
).newPage();

/** One screenshot per file. The SVG is rendered at its own pixel size with a
    transparent page behind it, so a layer without a background stays
    transparent — the adaptive foreground depends on that. */
async function render(markup, size, out) {
  await mkdir(path.dirname(out), { recursive: true });
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block}</style>${markup}`
  );
  await page.screenshot({ path: out, omitBackground: true });
}

const rounded = (size, radiusRatio = 0.1875) =>
  `<rect width="${size}" height="${size}" rx="${size * radiusRatio}" fill="${NAVY}"/>`;

/* ---------- sources @capacitor/assets would consume ---------- */

await render(
  svg(1024, `${rounded(1024)}${centeredGlyph(1024, 0.5)}`),
  1024,
  "resources/icon.png"
);
// Android masks the outer third away, so the mark stays inside the safe circle
// and the background is a flat plate.
await render(svg(1024, centeredGlyph(1024, 0.45)), 1024, "resources/icon-foreground.png");
await render(svg(1024, "", NAVY), 1024, "resources/icon-background.png");
await render(
  svg(2732, centeredGlyph(2732, 0.135, true), PAPER),
  2732,
  "resources/splash.png"
);
await render(svg(2732, centeredGlyph(2732, 0.135), INK_DARK), 2732, "resources/splash-dark.png");

/* ---------- the launcher icons themselves ---------- */

/** Densities Android expects, and the pixel size of a 48dp launcher icon at
 *  each. The adaptive layers are 108dp, which is 2.25 times that. */
const DENSITIES = [
  ["ldpi", 36],
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
];
const RES = "android/app/src/main/res";

for (const [density, size] of DENSITIES) {
  const dir = `${RES}/mipmap-${density}`;
  const legacy = svg(size, `${rounded(size)}${centeredGlyph(size, 0.5)}`);
  await render(legacy, size, `${dir}/ic_launcher.png`);
  await render(
    svg(size, `<rect width="${size}" height="${size}" rx="${size / 2}" fill="${NAVY}"/>${centeredGlyph(size, 0.46)}`),
    size,
    `${dir}/ic_launcher_round.png`
  );
  // The adaptive layers keep the legacy density size in this project's tree,
  // which is what the existing files use — the mark is sized for the safe zone
  // rather than relying on a launcher inset.
  await render(svg(size, centeredGlyph(size, 0.45)), size, `${dir}/ic_launcher_foreground.png`);
  await render(svg(size, "", NAVY), size, `${dir}/ic_launcher_background.png`);
}

/* ---------- the in-app and web copies ---------- */

for (const [size, file] of [
  [512, "public/icon-512.png"],
  [192, "public/icon-192.png"],
  [192, "app/icon.png"],
]) {
  await render(svg(size, `${rounded(size)}${centeredGlyph(size, 0.5)}`), size, file);
}

await browser.close();

/** Themed icons: Android 13+ tints a single-colour vector with the wallpaper
    palette, so the mark has to survive with no colour at all. The fold stays
    readable as a notch plus its own outline. */
await writeFile(
  `${RES}/drawable/ic_launcher_monochrome.xml`,
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/make-assets.mjs — do not hand-edit. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <!-- The sheet, with the corner cut away, then the fold as an outline: with
         one colour available, the crease has to be a line rather than a shade. -->
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M32,26h26l22,22v34h-48z" />
    <path
        android:fillColor="#FFFFFF"
        android:fillAlpha="0.55"
        android:pathData="M58,26l22,22h-22z" />
</vector>
`
);

await writeFile(
  "resources/README.md",
  "Generated by `node scripts/make-assets.mjs` from the geometry in that script\n" +
    "and `public/icon.svg`. Do not hand-edit; change the mark in both places and\n" +
    "re-run `npm run assets`, which also writes the launcher icons directly —\n" +
    "`npx @capacitor/assets generate` is no longer needed.\n"
);

console.log("assets written: resources/, android mipmaps, public/, app/icon.png");
