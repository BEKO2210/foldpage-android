#!/usr/bin/env node
/** The check every substantial UI change has to pass before it is called done.
 *
 *  It serves the static export and walks the app's routes at two shapes — the
 *  phone the app is designed for and a desktop window wide enough to expose a
 *  layout that only ever held together in one column. On each it collects the
 *  four things that are cheap to measure and expensive to miss:
 *
 *    1. console errors      — a React warning or a thrown handler nobody saw
 *    2. page errors         — an uncaught exception
 *    3. failed requests     — an asset the export forgot
 *    4. horizontal overflow — the single most common mobile layout fault,
 *                             reported with the widest offending element so the
 *                             finding points at something
 *
 *  It deliberately does not judge taste. Typography, hierarchy and motion are
 *  for eyes; this is the floor underneath them.
 *
 *    npm run build                                    # produces out/
 *    node .claude/skills/foldpage-product-ux/scripts/ui-check.mjs
 *
 *  Flags:
 *    --empty     do not seed the library — checks the empty state instead
 *    --offline   run with the network cut, after the first load
 *    --dark      run in the dark theme
 *    --shots     write a screenshot per route and viewport
 *    --keep      leave the browser open (headed) for a look
 *
 *  Writes corpus/ui-report.json. Exits non-zero when anything was found.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const OUT = path.join(ROOT, "out");
const CORPUS = path.join(ROOT, "corpus");
const SHOTS = path.join(CORPUS, "ui-shots");

const flags = new Set(process.argv.slice(2));
const EMPTY = flags.has("--empty");
const OFFLINE = flags.has("--offline");
const SHOOT = flags.has("--shots");
/** The app has a dark theme and it is the one a phone uses at night, which is
 *  when a reading app is used. Layout in the dark had only ever been looked at
 *  on the device. */
const DARK = flags.has("--dark");
const HEADED = flags.has("--keep");

/** Mobile is the design viewport, not the reduced one. Desktop is here to
 *  catch breakage — a column that never learned to stop growing, a fixed
 *  element anchored to the phone's width. */
const VIEWPORTS = [
  { name: "mobile", width: 412, height: 915 },
  { name: "desktop", width: 1280, height: 900 },
];

const MIME = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
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

/** An empty library has no cards, so a check against it would report a clean
 *  layout it never looked at. Three articles make the list real. Skipped with
 *  --empty, which is the point of that flag. */
const SEED = async (page) => {
  await page.evaluate(async () => {
    // Opened without a version on purpose: the app has already created the
    // database by the time this runs, and naming a number here means this
    // script has to be edited every time lib/db.ts gains a store. Waiting for
    // the object store is the honest version of that wait.
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
    for (let i = 0; i < 3; i++) {
      transaction.objectStore("articles").put({
        id: `ui-${i}`,
        url: `https://example.test/${i}`,
        canonicalUrl: `https://example.test/${i}`,
        title: `An article with a headline long enough to wrap onto a second line ${i}`,
        author: "B. Aslani",
        siteName: "example.test",
        excerpt: "A summary that is long enough to wrap onto a second line as well.",
        contentHtml: "<h2>A section</h2><p>Body text, long enough to wrap.</p><p>More.</p>",
        wordCount: 400,
        readingMin: 2,
        lang: "en",
        state: "inbox",
        favorite: i === 0,
        progress: 0,
        tags: ["tag"],
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
  });
};

/** Overflow, with the culprit. A bare "the page scrolls sideways" sends the
 *  next person hunting; the widest element that sticks out is a starting
 *  point. */
const OVERFLOW = () => {
  const doc = document.documentElement;
  const overflow = Math.round(doc.scrollWidth - doc.clientWidth);
  if (overflow <= 1) return { overflow: 0, culprits: [] };
  const width = doc.clientWidth;
  const culprits = [...document.querySelectorAll("body *")]
    .map((el) => {
      const box = el.getBoundingClientRect();
      return { el, past: Math.round(box.right - width), width: Math.round(box.width) };
    })
    .filter((entry) => entry.past > 1 && entry.width > 0)
    .sort((a, b) => b.past - a.past)
    .slice(0, 5)
    .map(({ el, past, width }) => {
      const cls =
        typeof el.className === "string" && el.className
          ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`
          : "";
      return `${el.tagName.toLowerCase()}${cls} — ${width}px wide, ${past}px past the edge`;
    });
  return { overflow, culprits };
};

const server = await serveExport();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: !HEADED });

const routes = [
  { name: "library", path: "/" },
  { name: "reader", path: EMPTY ? "/read/" : "/read/?id=ui-0" },
  { name: "settings", path: "/settings/" },
];

const findings = [];
const results = [];

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: viewport.width, height: viewport.height },
    // The app is a phone app first; the desktop pass is about layout, not
    // about pretending a mouse is a finger.
    hasTouch: viewport.name === "mobile",
    isMobile: viewport.name === "mobile",
    colorScheme: DARK ? "dark" : "light",
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("fp-welcomed", "1"));

  const console_ = [];
  const errors = [];
  const failed = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      console_.push({ type: message.type(), text: message.text().slice(0, 400) });
    }
  });
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 400)));
  page.on("requestfailed", (request) => {
    // The router prefetches every visible link with a HEAD request and drops
    // it the moment a navigation starts. The first run of this script reported
    // thirteen of those as faults — the instrument was wrong, not the app. An
    // aborted HEAD is therefore not a finding; anything else still is.
    if (request.method() === "HEAD" && request.failure()?.errorText === "net::ERR_ABORTED") return;
    failed.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText}`);
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  if (!EMPTY) await SEED(page);
  if (OFFLINE) {
    // Not context.setOffline(): on the device the app's own files come off
    // local storage and are there whether or not there is a network. Cutting
    // the loopback server would only prove that a web server serves nothing
    // when unplugged. What "offline" means for FoldPage is that *everything
    // beyond its own origin* is gone — so that is what gets blocked, and a
    // screen that quietly depended on the network shows it.
    await page.route("**", (route) =>
      route.request().url().startsWith(origin) ? route.continue() : route.abort()
    );
  }

  for (const route of routes) {
    const before = { console: console_.length, errors: errors.length, failed: failed.length };
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
    // One frame past load: entry animations hold a transform, and a transform
    // is exactly the kind of thing that reads as overflow while it runs.
    await page.waitForTimeout(400);

    const layout = await page.evaluate(OVERFLOW);
    // Overflow is one way a page goes sideways; being *draggable* sideways is
    // another, and a phone finds it long before a measurement does. Reported
    // from a real device: the whole library shifted, the left edge gone, and
    // nothing on screen offering a way back. Nothing in this app is read
    // sideways, so the page must refuse to move even when told to.
    const sideways = await page.evaluate(() => {
      const before = window.scrollX;
      window.scrollTo(400, window.scrollY);
      const after = window.scrollX;
      window.scrollTo(before, window.scrollY);
      return after;
    });
    if (SHOOT) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({
        path: path.join(SHOTS, `${route.name}-${viewport.name}${DARK ? "-dark" : ""}.png`),
        fullPage: true,
      });
    }

    const entry = {
      route: route.name,
      viewport: viewport.name,
      path: route.path,
      overflowPx: layout.overflow,
      sidewaysPx: sideways,
      overflowCulprits: layout.culprits,
      console: console_.slice(before.console),
      pageErrors: errors.slice(before.errors),
      failedRequests: failed.slice(before.failed),
    };
    results.push(entry);

    const where = `${route.name} @ ${viewport.name}`;
    if (entry.sidewaysPx > 0) {
      findings.push(`${where}: the page can be pushed ${entry.sidewaysPx}px sideways`);
    }
    if (entry.overflowPx > 1) {
      findings.push(`${where}: scrolls sideways by ${entry.overflowPx}px — ${entry.overflowCulprits[0] ?? "no element found"}`);
    }
    for (const error of entry.pageErrors) findings.push(`${where}: uncaught — ${error}`);
    for (const message of entry.console.filter((m) => m.type === "error")) {
      findings.push(`${where}: console error — ${message.text}`);
    }
    // Offline is a state under test, not a fault: with the network cut, a
    // failed request is the app behaving as asked.
    if (!OFFLINE) {
      for (const request of entry.failedRequests) findings.push(`${where}: request failed — ${request}`);
    }
  }

  await context.close();
}

await browser.close();
server.close();

fs.mkdirSync(CORPUS, { recursive: true });
const report = {
  ranAt: new Date().toISOString(),
  mode: { empty: EMPTY, offline: OFFLINE, dark: DARK },
  viewports: VIEWPORTS,
  results,
  findings,
};
fs.writeFileSync(path.join(CORPUS, "ui-report.json"), `${JSON.stringify(report, null, 2)}\n`);

const label = `${EMPTY ? "empty" : "seeded"}${OFFLINE ? ", offline" : ""}${DARK ? ", dark" : ""}`;
if (!findings.length) {
  console.log(`ui-check (${label}): ${results.length} route/viewport passes, nothing found.`);
  console.log("corpus/ui-report.json written. Console warnings, if any, are in it.");
} else {
  console.log(`ui-check (${label}): ${findings.length} finding(s).`);
  for (const finding of findings) console.log(`  - ${finding}`);
  console.log("corpus/ui-report.json written.");
  process.exitCode = 1;
}
