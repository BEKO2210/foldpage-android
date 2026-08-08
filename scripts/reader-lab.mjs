import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = new URL("../", import.meta.url);
const OUTPUT = new URL("../docs/reader-lab/", import.meta.url);
const CORPUS = new URL("../docs/reader-corpus.json", import.meta.url);
const PORT = "43153";
const BASE = `http://127.0.0.1:${PORT}`;
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 FoldPageApp/1.0";

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/reader-lab/`);
      if (response.ok) return;
    } catch {
      // Static server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Static server did not start");
}

async function putArticle(page, article) {
  await page.evaluate(async (value) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("foldpage", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("articles", { keyPath: "id" });
        store.createIndex("by-state", "state");
        store.createIndex("by-addedAt", "addedAt");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("articles", "readwrite");
        transaction.objectStore("articles").put(value);
        transaction.oncomplete = () => {
          request.result.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, article);
}

async function measure(page) {
  return page.evaluate(async () => {
    const root = document.querySelector("article.reader");
    if (!root) throw new Error("Reader did not render");
    const content = root.lastElementChild;
    if (!content) throw new Error("Article body is missing");

    const textNodes = [];
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if ((node.textContent || "").trim().length >= 4) textNodes.push(node);
    }
    const firstText = textNodes.find((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getClientRects().length > 0;
    });
    let firstTextTop = content.getBoundingClientRect().top;
    if (firstText) {
      const range = document.createRange();
      range.selectNodeContents(firstText);
      firstTextTop = range.getClientRects()[0]?.top ?? firstTextTop;
    }

    const foreignPattern = /Pfadnavigation|Startseite|Home\s*>|Menue|Newsletter|Anzeige|Teilen|Drucken/i;
    let leadingForeign = 0;
    for (const block of content.children) {
      const text = (block.textContent || "").trim();
      const links = block.querySelectorAll("a").length;
      const foreign = !text || (links > 3 && text.length < 120) || foreignPattern.test(text);
      if (!foreign) break;
      leadingForeign += 1;
    }

    const tables = [];
    for (const table of content.querySelectorAll("table")) {
      const scrollTarget = table.parentElement?.scrollWidth > table.parentElement?.clientWidth
        ? table.parentElement
        : table;
      scrollTarget.scrollLeft = 200;
      const before = scrollTarget.scrollLeft;
      window.scrollBy(0, 400);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      window.scrollBy(0, -400);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      tables.push({
        spalten: Math.max(0, ...[...table.rows].map((row) => row.cells.length)),
        zeilen: table.rows.length,
        scrollbar: scrollTarget.scrollWidth > scrollTarget.clientWidth,
        scrollLeftNachVertikalemScrollen: scrollTarget.scrollLeft,
        scrollLeftVorVertikalemScrollen: before,
        springt: scrollTarget.scrollLeft !== before,
      });
    }

    const images = [...content.querySelectorAll("img")];
    const imageMetrics = images.map((img) => {
      const rect = img.getBoundingClientRect();
      const style = getComputedStyle(img);
      return {
        broken: img.complete && img.naturalWidth === 0,
        wide: rect.right > content.getBoundingClientRect().right + 0.5,
        noSpace: parseFloat(style.marginTop) < 8 && parseFloat(style.marginBottom) < 8,
      };
    });

    const paragraph = [...content.querySelectorAll("p")].find(
      (item) => (item.textContent || "").trim().length >= 120
    );
    let charsPerLine = null;
    if (paragraph) {
      const style = getComputedStyle(paragraph);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
      const lines = Math.max(1, Math.round(paragraph.getBoundingClientRect().height / lineHeight));
      charsPerLine = Math.round((paragraph.textContent || "").trim().length / lines);
    }

    const links = [...content.querySelectorAll("a")];
    const accentUnderlines = links.map((link) => {
      const style = getComputedStyle(link);
      return style.textDecorationLine.includes("underline") &&
        style.textDecorationColor !== style.color;
    });

    return {
      vorlaufPx: Math.round(firstTextTop - content.getBoundingClientRect().top),
      fuehrendeFremdbloecke: leadingForeign,
      tabellen: tables,
      bilder: {
        gesamt: images.length,
        kaputt: imageMetrics.filter((item) => item.broken).length,
        breiterAlsSpalte: imageMetrics.filter((item) => item.wide).length,
        ohneAbstand: imageMetrics.filter((item) => item.noSpace).length,
      },
      seitenUeberlauf: document.documentElement.scrollWidth > innerWidth,
      zeichenProZeile: charsPerLine,
      linksImText: {
        anzahl: links.length,
        alleMitAkzentUnterstreichung: accentUnderlines.every(Boolean),
      },
    };
  });
}

function markdown(entries) {
  const foreign = new Set(entries.filter((e) => e.fuehrendeFremdbloecke > 0).map((e) => e.quelle)).size;
  const jumping = new Set(entries.filter((e) => e.tabellen.some((t) => t.springt)).map((e) => e.quelle)).size;
  const overflow = new Set(entries.filter((e) => e.seitenUeberlauf).map((e) => e.quelle)).size;
  const articles = new Set(entries.map((e) => e.quelle)).size;
  const lines = [
    "# Reader-Lab: Ausgangsbefund",
    "",
    `Gemessen: **${articles} Artikel**. Davon ${foreign} mit führenden Fremdblöcken, ${jumping} mit springenden Tabellen und ${overflow} mit Seitenüberlauf.`,
    "",
    "Viewport: 412 × 915 CSS-Pixel, DPR 2. Jeder Artikel wurde in hellem und dunklem Theme gemessen.",
    "",
    "| Quelle | Theme | Vorlauf px | Fremdblöcke | Tabellen | Bilder (kaputt/breit/ohne Abstand) | Seitenüberlauf | Zeichen/Zeile | Links (Akzent) |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const e of entries) {
    lines.push(`| ${e.quelle} | ${e.theme} | ${e.vorlaufPx} | ${e.fuehrendeFremdbloecke} | ${e.tabellen.length} | ${e.bilder.gesamt} (${e.bilder.kaputt}/${e.bilder.breiterAlsSpalte}/${e.bilder.ohneAbstand}) | ${e.seitenUeberlauf ? "ja" : "nein"} | ${e.zeichenProZeile ?? "–"} | ${e.linksImText.anzahl} (${e.linksImText.alleMitAkzentUnterstreichung ? "ja" : "nein"}) |`);
  }
  lines.push("", "Die vollständigen Tabellen-Einzelwerte stehen in `reader-lab/report.json`.", "");
  return lines.join("\n");
}

run("npm", ["run", "build"]);
await mkdir(OUTPUT, { recursive: true });
const corpus = JSON.parse(await readFile(CORPUS, "utf8"));
const server = spawn("python3", ["-m", "http.server", PORT, "--directory", "out"], {
  cwd: ROOT,
  stdio: "ignore",
});

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    userAgent: USER_AGENT,
  });
  const entries = [];
  for (let index = 0; index < corpus.length; index += 1) {
    const item = corpus[index];
    process.stdout.write(`[${index + 1}/${corpus.length}] ${item.quelle}\n`);
    const response = await context.request.get(item.url, {
      headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "de;q=0.9,en;q=0.8" },
      timeout: 30000,
    });
    if (!response.ok()) throw new Error(`${item.quelle}: HTTP ${response.status()}`);
    const html = await response.text();
    const finalUrl = response.url();
    const page = await context.newPage();
    await page.goto(`${BASE}/reader-lab/`);
    await page.waitForFunction(() => typeof window.readerLabExtract === "function");
    const parsed = await page.evaluate(({ htmlValue, url }) => window.readerLabExtract(htmlValue, url), {
      htmlValue: html,
      url: finalUrl,
    });
    const now = Date.now();
    const id = `reader-lab-${index}`;
    await putArticle(page, {
      ...parsed,
      id,
      url: finalUrl,
      readingMin: Math.max(1, Math.ceil(parsed.wordCount / 220)),
      state: "inbox",
      favorite: false,
      progress: 0,
      tags: [],
      source: "manual",
      addedAt: now,
      readAt: null,
      modifiedAt: now,
      deleted: false,
    });
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`${BASE}/read/?id=${id}`);
      await page.waitForSelector("article.reader > div:last-child");
      await page.waitForTimeout(1000);
      const values = await measure(page);
      entries.push({ url: item.url, finalUrl, quelle: item.quelle, merkmale: item.merkmale, theme, ...values });
      await page.screenshot({
        path: fileURLToPath(new URL(`${item.quelle}-${theme}.png`, OUTPUT)),
      });
    }
    await page.close();
  }
  await writeFile(new URL("report.json", OUTPUT), `${JSON.stringify(entries, null, 2)}\n`);
  await writeFile(new URL("../READER-LAB.md", OUTPUT), markdown(entries));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
