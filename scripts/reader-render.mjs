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
/** Two shapes, because from Android 17 on a device with a smallest width of
 *  600dp ignores whatever orientation and resizability an app declares. The
 *  phone stays the reference; the tablet catches a reader that only ever held
 *  together in one column. Screenshots are taken on the phone only — the
 *  tablet run is about numbers, not another 24 files in the repository. */
const VIEWPORTS = [
  { name: "phone", width: 412, height: 915, shots: true },
  { name: "tablet", width: 1024, height: 768, shots: false },
];
const THEMES = ["light", "dark"];
const WORST_BASELINE_SITES = new Set(["welt.de", "golem.de", "the-decoder.de"]);

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
    const reader = document.querySelector("article.reader");
    const body = reader?.querySelector(":scope > div:last-child");
    const column = reader?.clientWidth ?? innerWidth;
    const imgs = [...document.querySelectorAll("article.reader img")];
    const firstText = body?.querySelector("p, li, blockquote, pre, h2, h3");
    const links = [...(body?.querySelectorAll("a[href]") ?? [])];
    const prose = body?.querySelector("p");
    const proseStyle = prose ? getComputedStyle(prose) : null;
    const charsPerLine = prose && proseStyle
      ? Math.round(prose.textContent.length / Math.max(1, prose.getBoundingClientRect().height / parseFloat(proseStyle.lineHeight)))
      : 0;
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
      leadingForeignBlocks: [...(body?.children ?? [])].findIndex((element) => {
        const text = (element.textContent || "").replace(/\s+/g, " ").trim();
        const links = element.querySelectorAll("a").length;
        return text.length > 120 || (text.length > 30 && links < 4);
      }),
      leadPx: firstText && body ? Math.round(firstText.getBoundingClientRect().top - body.getBoundingClientRect().top) : 0,
      charsPerLine,
      textLinks: {
        total: links.length,
        allUnderlined: links.every((link) => getComputedStyle(link).textDecorationLine.includes("underline")),
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
        columns: wrapper.querySelector("tr")?.children.length ?? 0,
        rows: wrapper.querySelectorAll("tr").length,
        scrollbar: wrapper.scrollWidth > wrapper.clientWidth,
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
  return [{ entry, hasTable, hasImage, article: storedArticle(parsed, entry, `render-${index}`) }];
});

fs.rmSync(SCREENSHOTS, { recursive: true, force: true });
fs.mkdirSync(SCREENSHOTS, { recursive: true });
const server = await serveExport();
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      for (const { entry, article, hasTable } of articles) {
        const context = await browser.newContext({
          baseURL: origin,
          colorScheme: theme,
          deviceScaleFactor: 2,
          viewport: { width: viewport.width, height: viewport.height },
        });
        const page = await context.newPage();
        await seed(page, article);
        await page.goto(`/read/?id=${article.id}`);
        const measurement = await measurePage(page, hasTable);
        // Tabellenfaelle plus die drei schwersten Ausgangsbefunde dokumentieren.
        let screenshot = null;
        if (viewport.shots && (hasTable || WORST_BASELINE_SITES.has(entry.site))) {
          screenshot = path.join("screenshots", theme, `${slug(entry.url)}.png`);
          fs.mkdirSync(path.dirname(path.join(CORPUS, screenshot)), { recursive: true });
          await page.screenshot({ path: path.join(CORPUS, screenshot) });
        }
        results.push({
          site: entry.site,
          url: entry.url,
          viewport: viewport.name,
          theme,
          screenshot,
          ...measurement,
        });
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

const failures = results.flatMap((result) => {
  const where = `${result.site}/${result.viewport}/${result.theme}`;
  return [
    ...(result.pageOverflow ? [`${where}: page overflow`] : []),
    ...(result.images?.broken ? [`${where}: ${result.images.broken} broken images`] : []),
    ...(result.images?.tooWide ? [`${where}: ${result.images.tooWide} images wider than the column`] : []),
    ...(result.images?.decorative ? [`${where}: ${result.images.decorative} decorative images left`] : []),
    ...result.tables.flatMap((table, index) =>
      table.stable ? [] : [`${where}/table-${index + 1}: ${table.before} -> ${table.after}`]
    ),
  ];
});
const report = {
  viewports: VIEWPORTS.map((v) => ({ ...v, deviceScaleFactor: 2 })),
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
