#!/usr/bin/env node
/** Every screen, with nothing but a keyboard.
 *
 *  A Bluetooth keyboard on a phone is a real case, and a tablet is a more
 *  common one than the phone-first design admits. `docs/A11Y.md` has had this
 *  as an open point since the audit was written: tab order, a focus ring you
 *  can see, and Escape closing what opened.
 *
 *    npm run build && node scripts/keyboard-check.mjs
 *
 *  Writes corpus/keyboard-report.json. Exits non-zero on any failure.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out");
const CORPUS = path.join(ROOT, "corpus");

const MIME = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

function serveExport() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const relative = pathname.replace(/^\/+/, "");
    const candidates = [
      path.join(OUT, relative),
      path.join(OUT, relative, "index.html"),
      path.join(OUT, `${relative}.html`),
    ];
    const file = candidates.find((candidate) => {
      const resolved = path.resolve(candidate);
      return (
        resolved.startsWith(`${OUT}${path.sep}`) &&
        fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()
      );
    });
    if (!file) {
      res.writeHead(404).end("not found");
      return;
    }
    res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const failures = [];
const notes = [];
const check = (ok, what) => {
  if (ok) notes.push(`ok: ${what}`);
  else failures.push(what);
};

/** What the focused element is, and whether a sighted keyboard user can tell.
 *
 *  A ring is either an outline or a box-shadow; either counts, nothing counts
 *  as nothing. The name matters as much as the ring: "button" focused with no
 *  accessible name is a dead end for everybody. */
const FOCUSED = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const style = getComputedStyle(el);
  const ring =
    (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
    (style.boxShadow !== "none" && style.boxShadow !== "");
  const name =
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    el.closest("label")?.textContent ||
    el.textContent ||
    el.getAttribute("placeholder") ||
    "";
  return {
    tag: el.tagName.toLowerCase(),
    cls: typeof el.className === "string" ? el.className.split(/\s+/)[0] : "",
    ring,
    name: name.replace(/\s+/g, " ").trim().slice(0, 40),
    hidden: el.offsetParent === null && style.position !== "fixed",
  };
};

const server = await serveExport();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
// A keyboard implies a screen with room for one. The phone shape is checked
// everywhere else; this is the tablet/desktop case.
const context = await browser.newContext({
  baseURL: origin,
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
await page.addInitScript(() => localStorage.setItem("fp-welcomed", "1"));

async function walk(route, steps) {
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  const seen = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(FOCUSED);
    if (focused) seen.push(focused);
  }
  return seen;
}

// --- the library ---
const library = await walk("/", 8);
check(library.length >= 3, `the library has a tab order — ${library.length} stops`);
check(
  library.every((stop) => stop.ring),
  `every stop shows a focus ring — ${JSON.stringify(library.filter((s) => !s.ring).map((s) => s.tag + "." + s.cls))}`
);
check(
  library.every((stop) => stop.name.length > 0),
  `every stop has a name — ${JSON.stringify(library.filter((s) => !s.name).map((s) => s.tag + "." + s.cls))}`
);
check(
  library.every((stop) => !stop.hidden),
  `focus never lands on something invisible — ${JSON.stringify(library.filter((s) => s.hidden).map((s) => s.tag + "." + s.cls))}`
);
// The first thing a keyboard reaches should be the thing the screen is for.
check(
  /url|paste|save/i.test(library[0]?.name ?? "") || library[0]?.tag === "a",
  `the first stop is the top of the page, not the middle — saw ${JSON.stringify(library[0])}`
);

// --- settings ---
const settings = await walk("/settings/", 10);
check(settings.length >= 5, `settings has a tab order — ${settings.length} stops`);
check(
  settings.every((stop) => stop.ring),
  `every settings stop shows a ring — ${JSON.stringify(settings.filter((s) => !s.ring).map((s) => s.tag + "." + s.cls))}`
);
check(
  settings.every((stop) => stop.name.length > 0),
  `every settings stop has a name — ${JSON.stringify(settings.filter((s) => !s.name).map((s) => s.tag + "." + s.cls))}`
);

// --- the reading sheet: Escape has to close it ---
await page.goto("/settings/");
await page.waitForLoadState("networkidle");
await page.evaluate(async () => {
  const open = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open("foldpage");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  let db = await open();
  for (let attempt = 0; attempt < 100 && !db.objectStoreNames.contains("articles"); attempt++) {
    db.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    db = await open();
  }
  if (!db.objectStoreNames.contains("articles")) {
    throw new Error("the app never created its database — did the page load?");
  }
  const transaction = db.transaction("articles", "readwrite");
  transaction.objectStore("articles").put({
    id: "kb-0",
    url: "https://example.test/kb",
    canonicalUrl: "https://example.test/kb",
    title: "An article to read with a keyboard",
    author: null,
    siteName: "example.test",
    excerpt: "A sentence.",
    contentHtml: "<h2>A section</h2><p>Body text, long enough to wrap.</p>",
    wordCount: 200,
    readingMin: 1,
    lang: "en",
    state: "inbox",
    favorite: false,
    progress: 0,
    tags: [],
    source: "manual",
    addedAt: 1_700_000_000_000,
    readAt: null,
    modifiedAt: 1_700_000_000_000,
    deleted: false,
  });
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
});

await page.goto("/read/?id=kb-0");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);
const sheetButton = page.locator('[aria-label="Reading settings"]:visible').first();
await sheetButton.focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
check(await page.locator("dialog[open]").count() > 0, "the reading sheet opens from the keyboard");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check(await page.locator("dialog[open]").count() === 0, "Escape closes the reading sheet");

// --- the reader's own controls ---
const reader = await walk("/read/?id=kb-0", 10);
check(
  // The accessible name, not the visible word: a screen reader is told "Read
  // aloud, about 2 minutes", which is the better sentence and the one that
  // counts here.
  reader.some((stop) => /listen|pause|read aloud/i.test(stop.name)),
  `the keyboard reaches the one control this app is for — ${JSON.stringify(reader.map((s) => s.name))}`
);
check(
  reader.every((stop) => stop.ring),
  `every reader stop shows a ring — ${JSON.stringify(reader.filter((s) => !s.ring).map((s) => s.tag + "." + s.cls))}`
);

await browser.close();
server.close();

fs.mkdirSync(CORPUS, { recursive: true });
fs.writeFileSync(
  path.join(CORPUS, "keyboard-report.json"),
  `${JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      viewport: { width: 1280, height: 900 },
      library,
      settings,
      reader,
      passed: notes,
      failures,
      coversOnly:
        "Tab order, visible focus and Escape. Whether the order makes sense to a person, and whether a screen reader announces it usefully, still needs a human.",
    },
    null,
    2
  )}\n`
);

if (!failures.length) {
  console.log(`keyboard: ${notes.length} checks, all passed.`);
} else {
  console.log(`keyboard: ${failures.length} of ${notes.length + failures.length} failed.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
