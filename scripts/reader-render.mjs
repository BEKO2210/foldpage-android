#!/usr/bin/env node
/** Render the table-bearing corpus articles in the production export.
 *  This complements corpus.mjs: extraction is measured in jsdom, while this
 *  script measures the real reader layout in Chromium. */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { JSDOM } from "jsdom";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out");
const CORPUS = path.join(ROOT, "corpus");
const SCREENSHOTS = path.join(CORPUS, "screenshots");
const VIEWPORT = { width: 412, height: 915 };
const THEMES = ["light", "dark"];

const slug = (url) =>
  url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90)
    .toLowerCase();

const MIME = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
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
      return resolved.startsWith(`${OUT}${path.sep}`) && fs.statSync(resolved, { throwIfNoEntry: false })?.isFile();
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

function storedArticle(parsed, entry, id) {
  return {
    ...parsed,
    id,
    url: entry.url,
    readingMin: Math.max(1, Math.ceil(parsed.wordCount / 220)),
    state: "inbox",
    favorite: false,
    progress: 0,
    tags: [],
    source: "manual",
    addedAt: 1,
    readAt: null,
    modifiedAt: 1,
    deleted: false,
  };
}

async function seed(page, article) {
  await page.goto("/");
  await page.evaluate(async (value) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("foldpage", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("articles", { keyPath: "id" });
        store.createIndex("by-state", "state");
        store.createIndex("by-addedAt", "addedAt");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("articles", "readwrite");
      transaction.objectStore("articles").put(value);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, article);
}

async function measurePage(page, hasTable) {
  if (hasTable) await page.waitForSelector(".tablewrap");
  await page.waitForLoadState("networkidle").catch(() => {});
  return page.evaluate(async () => {
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const wrappers = [...document.querySelectorAll(".tablewrap")];
    wrappers[0]?.scrollIntoView({ block: "center" });
    await settle();
    const before = wrappers.map((wrapper) => {
      wrapper.scrollLeft = Math.min(200, wrapper.scrollWidth - wrapper.clientWidth);
      return wrapper.scrollLeft;
    });
    await settle();
    const startY = window.scrollY;
    window.scrollTo(0, startY + 400);
    await settle();
    window.scrollTo(0, startY);
    await settle();
    const column = document.querySelector("article.reader")?.clientWidth ?? innerWidth;
    const imgs = [...document.querySelectorAll("article.reader img")];
    return {
      // Der Korpus liegt offline. Entfernte Bilder werden deshalb nie geladen,
      // und alles, was erst nach dem Laden bekannt ist - kaputt, zu breit,
      // Zaehlpixel - ist hier NICHT messbar. `unloaded` haelt fest, wie viele
      // Bilder aus diesem Grund ungeprueft blieben, damit ein leeres
      // Fehlerprotokoll nicht mit "geprueft und in Ordnung" verwechselt wird.
      images: {
        total: imgs.length,
        unloaded: imgs.filter((i) => !i.complete).length,
        broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
        decorative: imgs.filter((i) => i.naturalWidth > 0 && i.naturalWidth < 100).length,
        tooWide: imgs.filter((i) => i.getBoundingClientRect().width > column + 1).length,
      },
      pageOverflow: document.documentElement.scrollWidth !== innerWidth,
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      overflowElements: [...document.querySelectorAll("body *")]
        .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 5)
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          right: Math.round(element.getBoundingClientRect().right),
          scrollWidth: element.scrollWidth,
        })),
      tables: wrappers.map((wrapper, index) => ({
        before: before[index],
        after: wrapper.scrollLeft,
        stable: wrapper.scrollLeft === before[index],
      })),
    };
  });
}

if (!fs.existsSync(path.join(OUT, "read", "index.html"))) {
  throw new Error("Missing built export. Run npm run build first.");
}

const dom = new JSDOM("", { url: "https://corpus.test/" });
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;
const { extractArticle } = await import(path.join(ROOT, "lib/parse.ts"));
const entries = JSON.parse(fs.readFileSync(path.join(CORPUS, "urls.json"), "utf8"));
const articles = entries.flatMap((entry, index) => {
  const file = path.join(CORPUS, "snapshots", `${slug(entry.url)}.html.gz`);
  if (!fs.existsSync(file)) return [];
  const html = gunzipSync(fs.readFileSync(file)).toString("utf8");
  const parsed = extractArticle(html, entry.finalUrl || entry.url);
  const hasTable = parsed.contentHtml.includes("<table");
  const hasImage = parsed.contentHtml.includes("<img");
  if (!hasTable && !hasImage) return [];
  return [{ entry, hasTable, article: storedArticle(parsed, entry, `render-${index}`) }];
});

fs.rmSync(SCREENSHOTS, { recursive: true, force: true });
fs.mkdirSync(SCREENSHOTS, { recursive: true });
const server = await serveExport();
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const theme of THEMES) {
    for (const { entry, article, hasTable } of articles) {
      const context = await browser.newContext({
        baseURL: origin,
        colorScheme: theme,
        deviceScaleFactor: 2,
        viewport: VIEWPORT,
      });
      const page = await context.newPage();
      await seed(page, article);
      await page.goto(`/read/?id=${article.id}`);
      const measurement = await measurePage(page, hasTable);
      // Screenshots nur fuer Tabellenartikel - sonst waechst das Repo um 70 PNG je Lauf.
      let screenshot = null;
      if (hasTable) {
        screenshot = path.join("screenshots", theme, `${slug(entry.url)}.png`);
        fs.mkdirSync(path.dirname(path.join(CORPUS, screenshot)), { recursive: true });
        await page.screenshot({ path: path.join(CORPUS, screenshot) });
      }
      results.push({ site: entry.site, url: entry.url, theme, screenshot, ...measurement });
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

const failures = results.flatMap((result) => [
  ...(result.pageOverflow ? [`${result.site}/${result.theme}: page overflow`] : []),
  ...(result.images?.broken ? [`${result.site}/${result.theme}: ${result.images.broken} broken images`] : []),
  ...(result.images?.tooWide ? [`${result.site}/${result.theme}: ${result.images.tooWide} images wider than the column`] : []),
  ...(result.images?.decorative ? [`${result.site}/${result.theme}: ${result.images.decorative} decorative images left`] : []),
  ...result.tables.flatMap((table, index) =>
    table.stable ? [] : [`${result.site}/${result.theme}/table-${index + 1}: ${table.before} -> ${table.after}`]
  ),
]);
const report = {
  viewport: { ...VIEWPORT, deviceScaleFactor: 2 },
  themes: THEMES,
  articles: articles.length,
  renders: results.length,
  tablesChecked: results.reduce((sum, result) => sum + result.tables.length, 0),
  imagesTotal: results.reduce((sum, r) => sum + (r.images?.total ?? 0), 0),
  imagesUnloaded: results.reduce((sum, r) => sum + (r.images?.unloaded ?? 0), 0),
  hinweis:
    "Bildpruefungen (kaputt, zu breit, Zaehlpixel) greifen nur bei geladenen Bildern. Der Korpus ist offline, imagesUnloaded nennt die ungeprueften.",
  failures,
  results,
};
fs.writeFileSync(path.join(CORPUS, "reader-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
if (failures.length) process.exitCode = 1;
