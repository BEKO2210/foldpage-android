#!/usr/bin/env node
/** How does the library behave once it actually holds something?
 *
 *  Everything else here is measured on a handful of articles. The app is used
 *  with a hundred or more, and that is where the shape of the code shows: the
 *  full-text search reads every stored article's HTML, and until this run every
 *  star and every archive rebuilt the entire list from IndexedDB.
 *
 *  This seeds a synthetic library into the built export and measures, in the
 *  real Chromium the WebView is close to:
 *
 *    - time from opening the library to the first card being on screen
 *    - time for a search that only hits the article bodies
 *    - time for one star toggle to show
 *
 *    node scripts/library-bench.mjs [--articles 200] [--words 900]
 *
 *  Writes corpus/library-bench.json. Not part of any test run — it is a
 *  stopwatch, and stopwatches disagree between machines.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out");
const CORPUS = path.join(ROOT, "corpus");
const VIEWPORT = { width: 412, height: 915 };

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(args[at + 1]);
};
const ARTICLES = flag("articles", 200);
const WORDS = flag("words", 900);
/** A word that appears only inside article bodies, so the search has to fall
 *  through the cheap metadata check and read the stored HTML — the expensive
 *  path, and the one worth timing. */
const BODY_ONLY_TERM = "zwischenschicht";

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

const server = await serveExport();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: origin, viewport: VIEWPORT });
const page = await context.newPage();
// The first-launch welcome covers the library and would be measured instead of
// it. Marked as seen before anything loads, the same way a returning user has
// it marked.
await page.addInitScript(() => localStorage.setItem("fp-welcomed", "1"));

try {
  await page.goto("/");
  const seeded = await page.evaluate(
    async ({ count, words, term }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("foldpage", 2);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("articles", { keyPath: "id" });
          store.createIndex("by-state", "state");
          store.createIndex("by-addedAt", "addedAt");
          request.result.createObjectStore("images", { keyPath: "key" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const filler = "Der Absatz traegt Text, damit die Suche etwas zu lesen hat. ";
      const paragraph = filler.repeat(Math.ceil(words / 10));
      const transaction = db.transaction("articles", "readwrite");
      const store = transaction.objectStore("articles");
      for (let i = 0; i < count; i++) {
        // The rare term sits in the last article only: the worst case for a
        // search that reads every body until it finds one.
        const body = i === count - 1 ? `${paragraph} ${term}` : paragraph;
        store.put({
          id: `bench-${i}`,
          url: `https://example.test/${i}`,
          canonicalUrl: `https://example.test/${i}`,
          title: `Synthetic article ${i}`,
          author: null,
          siteName: "example.test",
          excerpt: paragraph.slice(0, 200),
          contentHtml: `<p>${body}</p>`,
          wordCount: words,
          readingMin: Math.max(1, Math.round(words / 220)),
          lang: "de",
          state: i % 3 === 0 ? "archived" : "inbox",
          favorite: i % 7 === 0,
          progress: 0,
          tags: i % 5 === 0 ? ["bench"] : [],
          source: "manual",
          addedAt: 1_700_000_000_000 + i,
          readAt: null,
          modifiedAt: 1_700_000_000_000 + i,
          deleted: false,
        });
      }
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
      return count;
    },
    { count: ARTICLES, words: WORDS, term: BODY_ONLY_TERM }
  );

  // Cold open: reload so the library is read from IndexedDB exactly as it is on
  // a launch, and stop the clock when the first card is painted.
  const openStart = Date.now();
  await page.goto("/");
  await page.waitForSelector(".card");
  const openMs = Date.now() - openStart;

  // Everything saved before the word index existed is scanned, which is what
  // the seeded library looks like: measure that first.
  const searchStart = Date.now();
  await page.fill('input[type="search"]', `${BODY_ONLY_TERM} `);
  await page.waitForSelector('[role="status"]:has-text("match")');
  const searchMs = Date.now() - searchStart;

  // Then build the index over the same library and ask again. Same query, same
  // articles, same machine — the only difference is where the answer comes from.
  await page.fill('input[type="search"]', "");
  await page.waitForSelector(".card");
  const indexStart = Date.now();
  await page.goto("/settings/");
  await page.click('button:has-text("Index for search")');
  await page.waitForSelector('[role="status"]:has-text("indexed")', { timeout: 600_000 });
  const indexMs = Date.now() - indexStart;

  await page.goto("/");
  await page.waitForSelector(".card");
  const indexedSearchStart = Date.now();
  await page.fill('input[type="search"]', `${BODY_ONLY_TERM} `);
  await page.waitForSelector('[role="status"]:has-text("match")');
  const indexedSearchMs = Date.now() - indexedSearchStart;

  await page.fill('input[type="search"]', "");
  await page.waitForSelector(".card");

  // One star: the interaction that used to reload the whole library. At a
  // thousand cards the first one can be re-rendered out from under the click,
  // which is a measurement problem rather than an app problem — so a miss is
  // reported as null instead of taking the whole run down with it.
  let toggleMs = null;
  try {
    const toggleStart = Date.now();
    await page.click('.card:first-child button[aria-label="Add to favorites"]', {
      timeout: 15_000,
    });
    await page.waitForSelector('.card:first-child button[aria-label="Remove from favorites"]', {
      timeout: 15_000,
    });
    toggleMs = Date.now() - toggleStart;
  } catch {
    /* reported as null */
  }

  const report = {
    articles: seeded,
    wordsPerArticle: WORDS,
    viewport: VIEWPORT,
    openLibraryMs: openMs,
    bodySearchMs: searchMs,
    buildIndexMs: indexMs,
    bodySearchIndexedMs: indexedSearchMs,
    favouriteToggleMs: toggleMs,
    note:
      "Chromium on a development machine, not a phone. Useful as a before/after on the same machine, not as an absolute number.",
  };
  fs.writeFileSync(
    path.join(CORPUS, "library-bench.json"),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}
