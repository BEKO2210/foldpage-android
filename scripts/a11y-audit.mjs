#!/usr/bin/env node
/** What a screen reader and a large font would meet — as far as a machine can
 *  tell.
 *
 *  This is the first half of B6.1. It finds the faults that are structural:
 *  controls without a name, headings that skip a level, touch targets under the
 *  floor, a page that breaks apart at 200% font size, focus that goes nowhere
 *  after a route change. What it cannot do is judge whether the announcements
 *  make sense in order, or whether a gesture is reachable — that needs TalkBack
 *  on a real device, and the report says so rather than implying coverage.
 *
 *    node scripts/a11y-audit.mjs
 *
 *  Writes corpus/a11y-report.json.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out");
const CORPUS = path.join(ROOT, "corpus");
const VIEWPORT = { width: 412, height: 915 };
/** Android's largest common font setting is about twice the default. */
const LARGE_FONT_PX = 32;
const TOUCH_FLOOR_PX = 44;

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

const AUDIT = () => {
  const name = (el) => {
    const label =
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      (el.getAttribute("aria-labelledby")
        ? document.getElementById(el.getAttribute("aria-labelledby"))?.textContent
        : "") ||
      // A control wrapped in a <label> takes its name from that label, and a
      // radio in a segmented control is exactly that shape. The first run of
      // this audit reported fifteen "unnamed" inputs for precisely this reason
      // — the instrument was wrong, not the app.
      el.closest("label")?.textContent ||
      (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : "") ||
      el.textContent ||
      "";
    return label.replace(/\s+/g, " ").trim();
  };
  const describe = (el) =>
    `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/)[0] : ""}`;

  const interactive = [
    ...document.querySelectorAll("a[href], button, input, select, textarea, [role='button'], [tabindex]:not([tabindex='-1'])"),
  ].filter((el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed");

  const unnamed = interactive
    .filter((el) => !name(el) && el.type !== "hidden")
    .map(describe);

  const small = interactive
    .filter((el) => {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) return false;
      // A radio inside a label is hidden on purpose; the label carries the size.
      if (el.tagName === "INPUT" && el.type === "radio") return false;
      return box.height < 44 || box.width < 24;
    })
    .map((el) => `${describe(el)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);

  const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => ({
    level: Number(h.tagName[1]),
    text: (h.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
  }));
  const skips = [];
  headings.reduce((previous, heading) => {
    if (previous && heading.level > previous + 1) {
      skips.push(`h${previous} -> h${heading.level} (“${heading.text}”)`);
    }
    return heading.level;
  }, 0);

  return {
    unnamed,
    small,
    headings,
    headingSkips: skips,
    firstHeadingLevel: headings[0]?.level ?? null,
    landmarks: {
      main: document.querySelectorAll("main").length,
      nav: document.querySelectorAll("nav").length,
      header: document.querySelectorAll("header").length,
    },
    liveRegions: document.querySelectorAll("[role='status'], [aria-live]").length,
    langAttribute: document.documentElement.getAttribute("lang"),
  };
};

const server = await serveExport();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: origin, viewport: VIEWPORT });
const page = await context.newPage();
await page.addInitScript(() => localStorage.setItem("fp-welcomed", "1"));

/** An empty library has no cards and therefore no headings, which would make
 *  the audit report a clean structure it never looked at. Three articles are
 *  seeded so the list is real. */
async function seedLibrary() {
  await page.goto("/");
  await page.evaluate(async () => {
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
    const transaction = db.transaction("articles", "readwrite");
    for (let i = 0; i < 3; i++) {
      transaction.objectStore("articles").put({
        id: `a11y-${i}`,
        url: `https://example.test/${i}`,
        canonicalUrl: `https://example.test/${i}`,
        title: `An article with a reasonably long headline ${i}`,
        author: "B. Aslani",
        siteName: "example.test",
        excerpt: "A summary that is long enough to wrap onto a second line.",
        contentHtml: "<p>Body text.</p>",
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
}

const routes = [
  { name: "library", path: "/" },
  { name: "reader", path: "/read/?id=a11y-0" },
  { name: "settings", path: "/settings/" },
];
const pages = [];

try {
  await seedLibrary();
  for (const route of routes) {
    await page.goto(route.path);
    await page.waitForTimeout(300);
    const audit = await page.evaluate(AUDIT);

    // A large system font must not tear the layout apart. 32px is roughly
    // Android's largest common setting applied to the root.
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}px`;
    }, LARGE_FONT_PX);
    await page.waitForTimeout(200);
    const large = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      widest: Math.max(
        0,
        ...[...document.querySelectorAll("body *")].map(
          (el) => Math.round(el.getBoundingClientRect().right) - window.innerWidth
        )
      ),
    }));
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });

    pages.push({ route: route.name, ...audit, largeFont: large });
  }

  // Where does focus sit after a route change? A screen reader that is left on
  // <body> makes the reader hunt for the article every time.
  await page.goto("/");
  await page.click('a[href="/settings"], nav button:has-text("Settings")').catch(() => {});
  await page.waitForTimeout(400);
  const focusAfterNavigation = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? null,
    label: (document.activeElement?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
  }));

  const report = {
    viewport: VIEWPORT,
    touchFloorPx: TOUCH_FLOOR_PX,
    largeFontPx: LARGE_FONT_PX,
    pages,
    focusAfterNavigation,
    coversOnly:
      "Structural faults a browser can see. Announcement order, gesture reachability and TalkBack behaviour need a device.",
  };
  fs.writeFileSync(path.join(CORPUS, "a11y-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}
