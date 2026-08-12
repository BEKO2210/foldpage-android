#!/usr/bin/env node
/** Words the reader should never meet, hunted in the rendered interface.
 *
 *  FoldPage is a consumer app. A person who wants an article read aloud does
 *  not know what an engine, a plugin or an index is, and should not have to
 *  find out. Judgement about that drifts between sessions, so it is measured:
 *  this walks the real routes in a browser, takes everything a person can read
 *  — visible text, button titles, accessible names — and matches it against a
 *  list of words that betray the machine underneath.
 *
 *    npm run build && node scripts/jargon-audit.mjs
 *
 *  Writes corpus/jargon-report.json. Exits non-zero when anything is found.
 *
 *  What it cannot see: text that only appears after a native call, which in a
 *  browser build never happens. Two such places, and neither is left to hope:
 *  the **names of voices** are checked in `scripts/voice-flow-check.mjs`, which
 *  stubs a phone's voice list — a browser has none, so patterns for machine
 *  names would sit here matching nothing and reporting clean. The voice
 *  diagnosis speaks only after a native call and is read by hand.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out");
const CORPUS = path.join(ROOT, "corpus");

/** Each entry is a word or phrase, matched case-insensitively on a word
 *  boundary, with the reason it is banned. The reason is in the report so the
 *  next person does not have to guess whether a hit is real. */
const BANNED = [
  ["engine", "the machine that speaks is FoldPage's business, not the reader's"],
  ["tts", "an acronym for a thing the reader does not know exists"],
  ["provider", "internal routing"],
  ["backend", "internal routing"],
  ["inference", "internal routing"],
  ["runtime", "internal routing"],
  ["plugin", "internal structure"],
  ["native", "internal structure"],
  ["\\bapi\\b", "internal structure"],
  ["\\buri\\b", "internal structure"],
  ["package", "internal structure"],
  ["index", "a data structure, not a thing a reader wants"],
  ["indexing", "a data structure, not a thing a reader wants"],
  ["\\bterms\\b", "a search-engine word"],
  ["android", "the operating system is not the product; naming it exports our problem to the reader"],
  ["\\bcache\\b", "internal structure"],
  ["\\bdebug\\b", "developer word"],
  ["\\bnull\\b", "leaked value"],
  ["undefined", "leaked value"],
  ["\\bjson\\b", "a file format the reader asked for by name — allowed only in Export"],
];

/** Where a banned word is the reader's own vocabulary rather than ours. Export
 *  formats are chosen by name by the person exporting, so they stay. */
const ALLOWED = [
  { word: "\\bjson\\b", route: "settings", within: "Export as JSON" },
];

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

/** Everything a person can read on this screen: the visible text, plus the
 *  names and hints that only a pointer or a screen reader reaches. */
const READABLE = () => {
  for (const details of document.querySelectorAll("details")) details.open = true;
  const attributes = [];
  for (const el of document.querySelectorAll("[title], [aria-label], [placeholder]")) {
    for (const name of ["title", "aria-label", "placeholder"]) {
      const value = el.getAttribute(name);
      if (value) attributes.push(value);
    }
  }
  return {
    text: document.body.innerText,
    attributes,
  };
};

const server = await serveExport();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL: origin,
  viewport: { width: 412, height: 915 },
});
const page = await context.newPage();
await page.addInitScript(() => localStorage.setItem("fp-welcomed", "1"));

/** The reader without an article is an empty state with two lines of text, and
 *  scanning that would have reported a clean reader it never looked at. One
 *  seeded article gives the route its real furniture: the control bar, the tag
 *  field, the reading-settings sheet. */
await page.goto("/");
await page.waitForLoadState("networkidle");
await page.evaluate(async () => {
  const open = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open("foldpage");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  let db = await open();
  for (let attempt = 0; attempt < 40 && !db.objectStoreNames.contains("articles"); attempt++) {
    db.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    db = await open();
  }
  const transaction = db.transaction("articles", "readwrite");
  transaction.objectStore("articles").put({
    id: "jargon-0",
    url: "https://example.test/0",
    canonicalUrl: "https://example.test/0",
    title: "An article with a headline long enough to wrap onto a second line",
    author: "B. Aslani",
    siteName: "example.test",
    excerpt: "A summary long enough to wrap onto a second line as well.",
    contentHtml: "<h2>A section</h2><p>Body text, long enough to wrap.</p>",
    wordCount: 400,
    readingMin: 2,
    lang: "en",
    state: "inbox",
    favorite: false,
    progress: 0,
    tags: ["tag"],
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

const routes = [
  { name: "library", path: "/" },
  { name: "reader", path: "/read/?id=jargon-0" },
  { name: "settings", path: "/settings/" },
  // The first screen a new reader ever sees, and the one this audit missed
  // until a device run found machine voice names on it.
  { name: "welcome", path: "/", welcome: true },
];

const findings = [];
const scanned = [];

for (const route of routes) {
  if (route.welcome) await page.evaluate(() => localStorage.removeItem("fp-welcomed"));
  await page.goto(route.path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  // The reading-settings sheet is a dialog: its words exist only once it is
  // open, and a scan that skipped it would call the reader clean without
  // having read half of it.
  // `:visible`, because the reader carries the same controls twice — once in
  // the bottom bar for the phone, once in the top bar for the desktop — and
  // the hidden copy comes first in the document.
  if (route.welcome) {
    const next = page.getByRole("button", { name: "Next" });
    if (await next.count()) {
      await next.click();
      await page.waitForTimeout(1200);
    }
  }
  const sheet = page.locator('[aria-label="Reading settings"]:visible').first();
  if (await sheet.count()) {
    await sheet.click();
    await page.waitForTimeout(400);
  }
  const { text, attributes } = await page.evaluate(READABLE);
  const lines = [
    ...text.split("\n").map((line) => ({ where: "text", line: line.trim() })),
    ...attributes.map((value) => ({ where: "attribute", line: value.trim() })),
  ].filter((entry) => entry.line);
  scanned.push({ route: route.name, lines: lines.length });

  for (const [word, reason] of BANNED) {
    const pattern = new RegExp(word.includes("\\b") ? word : `\\b${word}\\b`, "i");
    for (const entry of lines) {
      if (!pattern.test(entry.line)) continue;
      const excused = ALLOWED.some(
        (rule) =>
          rule.route === route.name &&
          new RegExp(rule.word, "i").test(entry.line) &&
          entry.line.includes(rule.within)
      );
      if (excused) continue;
      findings.push({
        route: route.name,
        word: word.replace(/\\b/g, ""),
        reason,
        where: entry.where,
        line: entry.line.slice(0, 160),
      });
    }
  }
}

await browser.close();
server.close();

fs.mkdirSync(CORPUS, { recursive: true });
fs.writeFileSync(
  path.join(CORPUS, "jargon-report.json"),
  `${JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      scanned,
      findings,
      coversOnly:
        "Text a browser build renders. The voice diagnosis only speaks after a native call and is checked by hand.",
    },
    null,
    2
  )}\n`
);

if (!findings.length) {
  console.log(`jargon-audit: ${scanned.map((s) => `${s.route} ${s.lines} lines`).join(", ")} — nothing found.`);
} else {
  console.log(`jargon-audit: ${findings.length} finding(s).`);
  for (const finding of findings) {
    console.log(`  - ${finding.route} · “${finding.word}” · ${finding.where}: ${finding.line}`);
  }
  process.exitCode = 1;
}
