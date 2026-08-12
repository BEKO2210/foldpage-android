#!/usr/bin/env node
/** How much disk would it cost to keep an article's pictures on the phone?
 *
 *  The app promises an article that reads offline, but it stores only the
 *  addresses of its images. Before that is fixed, the price has to be known —
 *  in bytes, from real articles, not from a guess.
 *
 *  This runs the app's own extraction over the frozen corpus, collects every
 *  image the reader would show, and asks the servers how large those files are
 *  (HEAD, falling back to a ranged GET for servers that answer HEAD without a
 *  length). It writes corpus/image-budget.json.
 *
 *  It is the one script here that needs the network, and it is not part of any
 *  test run — the numbers are meant to be taken once and then argued about.
 *
 *    node scripts/image-budget.mjs [--limit N] [--per-article N]
 */

import { gunzipSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = path.resolve(import.meta.dirname, "..");
const CORPUS = path.join(ROOT, "corpus");
const SNAPSHOTS = path.join(CORPUS, "snapshots");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(args[at + 1]);
};
const ARTICLE_LIMIT = flag("limit", Infinity);
/** A single gallery-heavy page can hold 300 images; measuring all of them says
 *  more about that one page than about the corpus. */
const PER_ARTICLE = flag("per-article", 12);
const TIMEOUT_MS = 12_000;

const QUIET = new VirtualConsole();
const entries = JSON.parse(fs.readFileSync(path.join(CORPUS, "urls.json"), "utf8"));

const slug = (url) =>
  url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90)
    .toLowerCase();

/** The extraction runs in a DOM, so one is installed globally first — the same
 *  arrangement corpus.mjs uses. */
const dom = new JSDOM("", { url: "https://measure.test/", virtualConsole: QUIET });
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;
const { extractArticle } = await import(path.join(ROOT, "lib", "parse.ts"));

async function sizeOf(url) {
  const control = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const head = await fetch(url, { method: "HEAD", signal: control, redirect: "follow" });
    const length = Number(head.headers.get("content-length"));
    if (head.ok && Number.isFinite(length) && length > 0) {
      return { bytes: length, type: head.headers.get("content-type") ?? "", how: "head" };
    }
    // Servers that refuse HEAD, or answer it without a length: ask for one byte
    // and read the total out of the Content-Range header.
    const ranged = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    const range = ranged.headers.get("content-range");
    const total = Number(range?.split("/")[1]);
    if (Number.isFinite(total) && total > 0) {
      return { bytes: total, type: ranged.headers.get("content-type") ?? "", how: "range" };
    }
    return { bytes: null, type: "", how: "unknown" };
  } catch (error) {
    return { bytes: null, type: "", how: `failed: ${error.name}` };
  }
}

const perArticle = [];
let measured = 0;
let failed = 0;

for (const entry of entries.slice(0, ARTICLE_LIMIT)) {
  const file = path.join(SNAPSHOTS, `${slug(entry.url)}.html.gz`);
  if (!fs.existsSync(file)) continue;
  const html = gunzipSync(fs.readFileSync(file)).toString("utf8");
  let parsed;
  try {
    parsed = extractArticle(html, entry.finalUrl || entry.url);
  } catch {
    continue;
  }
  const doc = new JSDOM(`<div>${parsed.contentHtml}</div>`, { virtualConsole: QUIET });
  const sources = [...doc.window.document.querySelectorAll("img[src]")]
    .map((img) => img.getAttribute("src"))
    .filter((src) => src && /^https?:/i.test(src));
  const unique = [...new Set(sources)];
  const sample = unique.slice(0, PER_ARTICLE);

  const sizes = [];
  for (const src of sample) {
    const result = await sizeOf(src);
    if (result.bytes === null) failed++;
    else {
      measured++;
      sizes.push(result.bytes);
    }
  }
  const sampleBytes = sizes.reduce((sum, n) => sum + n, 0);
  const average = sizes.length ? Math.round(sampleBytes / sizes.length) : null;
  perArticle.push({
    site: entry.site,
    url: entry.url,
    words: parsed.wordCount,
    htmlBytes: Buffer.byteLength(parsed.contentHtml),
    images: unique.length,
    sampled: sample.length,
    measured: sizes.length,
    sampleBytes,
    averageImageBytes: average,
    // What the whole article would cost if the unmeasured images look like the
    // measured ones. Stated as an estimate, because that is what it is.
    estimatedBytes: average === null ? null : average * unique.length,
  });
  process.stderr.write(
    `${entry.site}: ${unique.length} images, ${sizes.length}/${sample.length} measured\n`
  );
}

const withEstimate = perArticle.filter((a) => a.estimatedBytes !== null);
const totals = withEstimate.reduce((sum, a) => sum + a.estimatedBytes, 0);
const sorted = [...withEstimate].map((a) => a.estimatedBytes).sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
const allImageBytes = perArticle.flatMap((a) =>
  a.averageImageBytes === null ? [] : [a.averageImageBytes]
);

const report = {
  measuredAt: null,
  articles: perArticle.length,
  articlesWithImages: perArticle.filter((a) => a.images > 0).length,
  imagesMeasured: measured,
  imagesFailed: failed,
  perArticleSampleCap: PER_ARTICLE,
  averageImageBytes: allImageBytes.length
    ? Math.round(allImageBytes.reduce((s, n) => s + n, 0) / allImageBytes.length)
    : null,
  medianArticleBytes: median,
  meanArticleBytes: withEstimate.length ? Math.round(totals / withEstimate.length) : 0,
  maxArticleBytes: sorted.length ? sorted[sorted.length - 1] : 0,
  note:
    "Estimates: per article, the measured images are averaged and applied to every image the reader keeps. Failed measurements are excluded, not counted as zero.",
  perArticle,
};
fs.writeFileSync(
  path.join(CORPUS, "image-budget.json"),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(JSON.stringify({ ...report, perArticle: undefined }, null, 2));
