#!/usr/bin/env node
/** The reader is the product, so its output gets measured, not eyeballed.
 *
 *  This is a fixed corpus of real articles plus the metrics we judge the
 *  extraction by. Three subcommands:
 *
 *    node scripts/corpus.mjs pick     — refresh corpus/urls.json from the seed
 *                                       feeds (rarely; the corpus is meant to
 *                                       stay fixed so numbers stay comparable)
 *    node scripts/corpus.mjs fetch    — download every URL into
 *                                       corpus/snapshots/*.html.gz
 *    node scripts/corpus.mjs measure  — run the app's own extractArticle over
 *                                       the snapshots and write
 *                                       corpus/report.json + corpus/report.md
 *
 *  `measure` is offline and deterministic: same snapshots plus same lib/parse.ts
 *  always give the same report, which is what makes a diff between two branches
 *  mean something.
 */

import { createRequire } from "node:module";
import { gunzipSync, gzipSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const QUIET = new VirtualConsole();

const ROOT = path.resolve(import.meta.dirname, "..");
const CORPUS = path.join(ROOT, "corpus");
const SNAPSHOTS = path.join(CORPUS, "snapshots");
const URLS = path.join(CORPUS, "urls.json");

/** Feeds we draw article URLs from, plus a few hand-picked pages that are in
 *  the corpus for one specific reason (tables, galleries, code blocks). */
const SEEDS = [
  { site: "welt.de", feed: "https://www.welt.de/feeds/latest.rss", take: 2 },
  { site: "the-decoder.de", feed: "https://the-decoder.de/feed/", take: 3 },
  {
    site: "heise.de",
    feed: "https://www.heise.de/rss/heise-atom.xml",
    take: 2,
  },
  {
    site: "golem.de",
    feed: "https://rss.golem.de/rss.php?feed=RSS2.0",
    take: 2,
  },
  {
    site: "spiegel.de",
    feed: "https://www.spiegel.de/schlagzeilen/tops/index.rss",
    take: 2,
  },
  { site: "zeit.de", feed: "https://newsfeed.zeit.de/index", take: 2 },
  {
    site: "sueddeutsche.de",
    feed: "https://rss.sueddeutsche.de/rss/Topthemen",
    take: 1,
  },
  {
    site: "tagesschau.de",
    feed: "https://www.tagesschau.de/index~rss2.xml",
    take: 2,
  },
  { site: "netzpolitik.org", feed: "https://netzpolitik.org/feed/", take: 2 },
  { site: "t3n.de", feed: "https://t3n.de/rss.xml", take: 2 },
  { site: "arstechnica.com", feed: "https://arstechnica.com/feed/", take: 2 },
  {
    site: "theverge.com",
    feed: "https://www.theverge.com/rss/index.xml",
    take: 2,
  },
  { site: "techcrunch.com", feed: "https://techcrunch.com/feed/", take: 2 },
  { site: "bbc.co.uk", feed: "https://feeds.bbci.co.uk/news/rss.xml", take: 2 },
  {
    site: "theguardian.com",
    feed: "https://www.theguardian.com/international/rss",
    take: 2,
  },
  {
    site: "simonwillison.net",
    feed: "https://simonwillison.net/atom/everything/",
    take: 2,
  },
  {
    site: "en.wikipedia.org",
    url: "https://en.wikipedia.org/wiki/Comparison_of_web_browsers",
    why: "big multi-column tables",
  },
  {
    site: "de.wikipedia.org",
    url: "https://de.wikipedia.org/wiki/Elektroauto",
    why: "tables plus many images and captions",
  },
  {
    site: "developer.mozilla.org",
    url: "https://developer.mozilla.org/en-US/docs/Web/CSS/display",
    why: "spec tables, code blocks, deep link nesting",
  },
  {
    site: "docs.python.org",
    url: "https://docs.python.org/3/library/datetime.html",
    why: "long reference tables, code blocks, dense internal links",
  },
  // developer.android.com is deliberately absent: with our own User-Agent it
  // bounces between locales until the redirect limit trips, so it measures the
  // fetch, not the extraction. Worth a separate look, not a corpus slot.
  {
    site: "web.dev",
    url: "https://web.dev/articles/inp",
    why: "figures with captions, inline SVG",
  },
];

const UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 FoldPageApp/1.0";

const slug = (url) =>
  url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90)
    .toLowerCase();

async function get(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
      "Accept-Language": "de;q=0.9,en;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.text();
  return {
    status: res.status,
    url: res.url,
    type: res.headers.get("content-type") || "",
    body,
  };
}

/** Feed parsing without a dependency: both RSS <link>text</link> and Atom
 *  <link href="…"/> shapes, article URLs only. */
function feedLinks(xml, site, feedUrl) {
  const links = [];
  const clean = (u) =>
    u.replace(/&amp;/g, "&").replace(/#.*$/, "").replace(/\?.*$/, "");
  const rss = xml.matchAll(
    /<link>\s*(?:<!\[CDATA\[)?\s*(https?:\/\/[^\s<\]]+)/gi
  );
  for (const m of rss) links.push(m[1]);
  const atom = xml.matchAll(
    /<link[^>]+rel=["']alternate["'][^>]*href=["'](https?:\/\/[^"']+)["']/gi
  );
  for (const m of atom) links.push(m[1]);
  const atomPlain = xml.matchAll(
    /<link[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*\/>/gi
  );
  for (const m of atomPlain) links.push(m[1]);

  const seen = new Set();
  return links.map(clean).filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    let host;
    try {
      host = new URL(u).hostname;
    } catch {
      return false;
    }
    if (!host.endsWith(site.replace(/^www\./, ""))) return false;
    // A feed carries its own address and the section front page as <link>s.
    // Both parse fine and neither is an article, so both have to go.
    const bare = u.replace(/^https?:\/\//, "").replace(/[#?].*$/, "");
    const feedBare = feedUrl.replace(/^https?:\/\//, "");
    if (feedBare.startsWith(bare.replace(/\/$/, "")) || bare === feedBare)
      return false;
    const p = new URL(u).pathname.replace(/\/$/, "");
    const segments = p.split("/").filter(Boolean);
    // Either a nested path or one long slug — a bare section name is neither.
    const articleShaped =
      segments.length >= 2 || (segments[0]?.length ?? 0) >= 20;
    return articleShaped && p.length > 12 && !/\.(xml|rss|json)$/.test(p);
  });
}

async function pick() {
  const out = [];
  for (const seed of SEEDS) {
    if (seed.url) {
      out.push({ site: seed.site, url: seed.url, why: seed.why });
      console.log(`fixed  ${seed.site}  ${seed.url}`);
      continue;
    }
    try {
      const res = await get(seed.feed);
      const links = feedLinks(res.body, seed.site, seed.feed).slice(
        0,
        seed.take
      );
      if (!links.length)
        console.warn(`empty  ${seed.site}  (no links in feed)`);
      for (const url of links) {
        out.push({ site: seed.site, url });
        console.log(`feed   ${seed.site}  ${url}`);
      }
    } catch (err) {
      console.warn(`fail   ${seed.site}  ${err.message}`);
    }
  }
  fs.mkdirSync(CORPUS, { recursive: true });
  fs.writeFileSync(URLS, JSON.stringify(out, null, 2) + "\n");
  console.log(`\n${out.length} URLs → corpus/urls.json`);
}

async function fetchAll() {
  const list = JSON.parse(fs.readFileSync(URLS, "utf8"));
  fs.mkdirSync(SNAPSHOTS, { recursive: true });
  let ok = 0;
  for (const entry of list) {
    const file = path.join(SNAPSHOTS, `${slug(entry.url)}.html.gz`);
    if (fs.existsSync(file) && !process.argv.includes("--force")) {
      console.log(`cached ${entry.site}`);
      ok++;
      continue;
    }
    try {
      const res = await get(entry.url);
      if (res.status < 200 || res.status >= 300) {
        console.warn(`http${res.status} ${entry.site}  ${entry.url}`);
        continue;
      }
      fs.writeFileSync(file, gzipSync(Buffer.from(res.body, "utf8")));
      // The URL after redirects is what the device would parse against.
      entry.finalUrl = res.url;
      entry.bytes = Buffer.byteLength(res.body);
      ok++;
      console.log(`ok     ${entry.site}  ${(entry.bytes / 1024) | 0} KiB`);
    } catch (err) {
      console.warn(`fail   ${entry.site}  ${err.message}`);
    }
  }
  fs.writeFileSync(URLS, JSON.stringify(list, null, 2) + "\n");
  console.log(`\n${ok}/${list.length} snapshots in corpus/snapshots/`);
}

/* ------------------------------------------------------------------ metrics */

/** Website furniture that shows up as the first or last block of an extracted
 *  article. Matched against collapsed text, case-insensitively. */
const FURNITURE =
  /(pfadnavigation|brotkrumen|breadcrumb|startseite|zur startseite|inhaltsverzeichnis|table of contents|mehr zum thema|lesen sie auch|auch interessant|das k[oö]nnte sie auch interessieren|newsletter abonnieren|jetzt anmelden|artikel teilen|teilen per|folgen sie uns|share this|advertisement|anzeige|werbung|cookie|zustimmung|einwilligung|abonnieren sie|skip to (main )?content|zum hauptinhalt|weiterlesen mit|jetzt kostenlos testen)/i;

/** A consent or paywall interstitial that Readability mistook for the text.
 *  Only meaningful together with a low word count — a real article may well
 *  mention cookies. */
const WALL =
  /(cookies? (zustimmen|akzeptieren|accept)|einwilligung|wir und unsere partner|weiterlesen mit|jetzt kostenlos testen|subscribe to (read|continue)|enable javascript)/i;

/** Wrapper elements are fine as the first block; these are not. NAV/ASIDE and
 *  custom elements (`<devsite-progress>`) are page chrome, never prose. */
const CHROME_TAGS = new Set([
  "NAV",
  "ASIDE",
  "HEADER",
  "FOOTER",
  "MENU",
  "BUTTON",
  "SELECT",
  "SVG",
]);

const text = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();

function blockFlags(el, where) {
  const flags = [];
  if (!el) return ["missing-" + where];
  const t = text(el);
  if (CHROME_TAGS.has(el.tagName) || el.tagName.includes("-"))
    flags.push(`${where}-chrome-${el.tagName.toLowerCase()}`);
  if (FURNITURE.test(t.slice(0, 300))) flags.push(`${where}-furniture`);
  if (t.length > 0 && t.length < 40 && !el.querySelector("img, svg, video"))
    flags.push(`${where}-stub`);
  const links = el.querySelectorAll("a").length;
  const linkChars = [...el.querySelectorAll("a")].reduce(
    (n, a) => n + text(a).length,
    0
  );
  if (t.length > 0 && linkChars / t.length > 0.6 && links >= 3)
    flags.push(`${where}-link-list`);
  if (t.length === 0 && !el.querySelector("img, svg, video"))
    flags.push(`${where}-empty`);
  return flags;
}

function measureOne(entry, html, extractArticle) {
  const finalUrl = entry.finalUrl || entry.url;
  const started = process.hrtime.bigint();
  let article;
  try {
    article = extractArticle(html, finalUrl);
  } catch (err) {
    return { site: entry.site, url: entry.url, ok: false, error: err.message };
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;

  const dom = new JSDOM(`<body>${article.contentHtml}</body>`, {
    url: finalUrl,
  });
  const doc = dom.window.document;
  const body = doc.body;
  // Readability wraps its output, and most sites wrap the article again. Climb
  // through the single-child wrappers, otherwise "first block" is the wrapper
  // on nearly every page and says nothing about the reader's first screen.
  let root = body;
  while (
    root.children.length === 1 &&
    ["DIV", "SECTION", "ARTICLE", "MAIN"].includes(root.children[0].tagName)
  ) {
    root = root.children[0];
  }
  const kids = [...root.children];

  const flags = [];
  flags.push(...blockFlags(kids[0], "first"));
  flags.push(...blockFlags(kids[kids.length - 1], "last"));

  const paragraphs = [...doc.querySelectorAll("p")];
  const emptyParagraphs = paragraphs.filter(
    (p) => !text(p) && !p.querySelector("img, svg, video, iframe")
  ).length;

  const tables = [...doc.querySelectorAll("table")].map((t) => {
    const rows = [...t.rows];
    const cols = Math.max(0, ...rows.map((r) => r.cells.length));
    return {
      cols,
      rows: rows.length,
      hasThead: !!t.tHead,
      wrappedIn: t.parentElement?.tagName ?? null,
      maxCellChars: Math.max(
        0,
        ...rows.flatMap((r) => [...r.cells].map((c) => text(c).length))
      ),
      nested: !!t.querySelector("table"),
    };
  });

  const images = [...doc.querySelectorAll("img")];
  const imgSrcMissing = images.filter((i) => !i.getAttribute("src")).length;
  const imgSrcRelative = images.filter((i) => {
    const s = i.getAttribute("src") || "";
    return s && !/^(https?:|data:)/i.test(s);
  }).length;
  const imgNoAlt = images.filter((i) => !i.getAttribute("alt")?.trim()).length;
  const imgInFigure = images.filter((i) => i.closest("figure")).length;

  const anchors = [...doc.querySelectorAll("a")];
  const hrefRelative = anchors.filter((a) => {
    const h = a.getAttribute("href") || "";
    return h && !/^(https?:|mailto:|tel:|#)/i.test(h);
  }).length;
  const hrefMissing = anchors.filter((a) => !a.getAttribute("href")).length;

  const leftovers = doc.querySelectorAll(
    "script, style, iframe, object, embed, form, link, meta"
  ).length;
  const inlineHandlers = [...doc.querySelectorAll("*")].filter((el) =>
    [...el.attributes].some((a) => a.name.toLowerCase().startsWith("on"))
  ).length;

  // What the page offered, so losses are visible and not just absences.
  // Real pages ship CSS jsdom cannot parse; that is noise, not a finding.
  const source = new JSDOM(html, { url: finalUrl, virtualConsole: QUIET })
    .window.document;
  const sourceTables = [...source.querySelectorAll("table")].filter(
    (t) => t.rows.length > 1 && !t.querySelector("table")
  ).length;

  if (emptyParagraphs) flags.push("empty-paragraphs");
  if (imgSrcMissing) flags.push("img-without-src");
  if (imgSrcRelative) flags.push("img-relative-src");
  if (hrefRelative) flags.push("href-relative");
  if (leftovers) flags.push("unsanitised-node");
  if (inlineHandlers) flags.push("inline-handler");
  if (tables.some((t) => t.cols > 3)) flags.push("wide-table");
  if (tables.some((t) => t.maxCellChars > 120)) flags.push("long-cell");
  if (tables.some((t) => t.wrappedIn && t.wrappedIn !== "BODY"))
    flags.push("table-wrapped");
  if (sourceTables >= 3 && tables.length === 0) flags.push("tables-lost");
  if (images.length > 40) flags.push("image-flood");
  if (WALL.test(text(body).slice(0, 600)) && article.wordCount < 500)
    flags.push("wall-not-article");
  if (article.wordCount < 200) flags.push("suspiciously-short");
  if (!article.author) flags.push("no-author");
  if (!article.lang) flags.push("no-lang");
  const furnitureBlocks = kids.filter((k) =>
    FURNITURE.test(text(k).slice(0, 200))
  ).length;
  if (furnitureBlocks > 2) flags.push("furniture-inside");

  return {
    site: entry.site,
    url: entry.url,
    ok: true,
    ms: Math.round(ms),
    title: article.title,
    author: article.author,
    lang: article.lang,
    wordCount: article.wordCount,
    htmlBytes: Buffer.byteLength(article.contentHtml),
    blocks: kids.length,
    firstTag: kids[0]?.tagName ?? null,
    firstText: text(kids[0]).slice(0, 90),
    lastTag: kids[kids.length - 1]?.tagName ?? null,
    lastText: text(kids[kids.length - 1]).slice(0, 90),
    paragraphs: paragraphs.length,
    emptyParagraphs,
    headings: doc.querySelectorAll("h1,h2,h3,h4").length,
    figures: doc.querySelectorAll("figure").length,
    images: images.length,
    imgSrcMissing,
    imgSrcRelative,
    imgNoAlt,
    imgInFigure,
    links: anchors.length,
    hrefRelative,
    hrefMissing,
    tables,
    sourceTables,
    leftovers,
    inlineHandlers,
    furnitureBlocks,
    flags,
  };
}

async function measure() {
  // jsdom stands in for the WebView, same as lib/parse.test.ts does.
  const dom = new JSDOM("", { url: "https://corpus.test/" });
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.Node = dom.window.Node;
  const require = createRequire(import.meta.url);
  void require; // keep the ESM/CJS bridge available for future adapters

  const { extractArticle } = await import(path.join(ROOT, "lib/parse.ts"));

  const list = JSON.parse(fs.readFileSync(URLS, "utf8"));
  const results = [];
  for (const entry of list) {
    const file = path.join(SNAPSHOTS, `${slug(entry.url)}.html.gz`);
    if (!fs.existsSync(file)) {
      results.push({
        site: entry.site,
        url: entry.url,
        ok: false,
        error: "no snapshot",
      });
      continue;
    }
    const html = gunzipSync(fs.readFileSync(file)).toString("utf8");
    results.push(measureOne(entry, html, extractArticle));
  }

  const failed = results.filter((r) => !r.ok);
  const good = results.filter((r) => r.ok);
  const flagCount = {};
  for (const r of good)
    for (const f of r.flags) flagCount[f] = (flagCount[f] || 0) + 1;

  const summary = {
    articles: results.length,
    extracted: good.length,
    failed: failed.length,
    clean: good.filter((r) => !r.flags.length).length,
    medianWords: median(good.map((r) => r.wordCount)),
    withTables: good.filter((r) => r.tables.length).length,
    withImages: good.filter((r) => r.images).length,
    flags: Object.fromEntries(
      Object.entries(flagCount).sort((a, b) => b[1] - a[1])
    ),
  };

  fs.writeFileSync(
    path.join(CORPUS, "report.json"),
    JSON.stringify({ summary, results }, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(CORPUS, "report.md"),
    renderMarkdown(summary, results)
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log("\ncorpus/report.json + corpus/report.md written");
}

const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function renderMarkdown(summary, results) {
  const lines = [];
  lines.push("## Reader-Korpus", "");
  lines.push(
    `${summary.extracted}/${summary.articles} Artikel extrahiert, ` +
      `${summary.clean} davon ohne Befund. Median ${summary.medianWords} Woerter. ` +
      `${summary.withTables} mit Tabelle, ${summary.withImages} mit Bild.`,
    ""
  );
  lines.push("### Befunde nach Haeufigkeit", "");
  lines.push("| Flag | Artikel |", "| --- | --- |");
  for (const [flag, n] of Object.entries(summary.flags))
    lines.push(`| \`${flag}\` | ${n} |`);
  lines.push("", "### Pro Artikel", "");
  lines.push(
    "| Site | Woerter | erstes Element | Bilder | Tab. | Links | Befunde |",
    "| --- | ---: | --- | ---: | ---: | ---: | --- |"
  );
  for (const r of results) {
    if (!r.ok) {
      lines.push(`| ${r.site} | — | **FEHLER: ${r.error}** | — | — | — | — |`);
      continue;
    }
    const first = `${r.firstTag}: ${r.firstText.slice(0, 40)}`.replace(
      /\|/g,
      "\\|"
    );
    lines.push(
      `| ${r.site} | ${r.wordCount} | ${first} | ${r.images} | ${
        r.tables.length
      } | ${r.links} | ${r.flags.join(", ") || "—"} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

const cmd = process.argv[2];
if (cmd === "pick") await pick();
else if (cmd === "fetch") await fetchAll();
else if (cmd === "measure") await measure();
else {
  console.error("usage: node scripts/corpus.mjs pick|fetch|measure");
  process.exit(2);
}
