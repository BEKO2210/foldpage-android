#!/usr/bin/env node
/** What the speech engine actually gets handed, measured instead of guessed.
 *
 *  Reading aloud can only be judged by ear, and an ear is not available in a
 *  test run — but most of what makes a synthetic voice sound wrong is visible
 *  in the string before it is spoken: a heading with no full stop is read flat
 *  and runs into the next paragraph, a bullet character is pronounced, a bare
 *  URL is spelled out letter by letter, a footnote marker becomes "bracket one
 *  bracket".
 *
 *  So this script runs the app's own extraction over the corpus snapshots, asks
 *  lib/readAloud.ts for exactly the blocks the player would speak, and counts
 *  the findings per article. Same snapshots plus same code always give the same
 *  numbers, which is what makes a before/after diff mean anything.
 *
 *      node scripts/speech-audit.mjs        → corpus/speech-report.json
 */

import { gunzipSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const ROOT = path.resolve(import.meta.dirname, "..");
const CORPUS = path.join(ROOT, "corpus");
const SNAPSHOTS = path.join(CORPUS, "snapshots");
const URLS = path.join(CORPUS, "urls.json");
const OUT = path.join(CORPUS, "speech-report.json");

function slug(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .slice(0, 90);
}

/** Sentence-ending punctuation across the languages the corpus holds, closing
    quotes and brackets included — a paragraph may well end on `…"` or `!»`. */
const ENDS_SENTENCE = /[.!?…:;][")'»”’\]]*$/;

/** Characters that are furniture in print and noise out loud. */
const LEADING_MARKER = /^[•·▪◦‣●○*+\-–—]\s|^\d+[.)]\s/;

const CHECKS = [
  {
    id: "heading-without-stop",
    why: "an engine drops no pitch and takes no breath, so the title runs into the section",
    hit: (block) => block.kind === "heading" && !ENDS_SENTENCE.test(block.text),
  },
  {
    id: "glued-quote",
    why: "a closing quote stuck to the next word is spoken as one word",
    // Only the unambiguous pair is checked. » « and “ each open in one
    // language and close in another, so a letter next to them proves nothing:
    // the first two versions of this check counted 53 correct German
    // guillemets and then 46 correct English opening quotes as findings.
    hit: (block) => /”[A-Za-zÄÖÜäöü]|[A-Za-zÄÖÜäöü]„/.test(block.text),
  },
  {
    id: "leading-marker",
    why: "the bullet or number is pronounced before the sentence starts",
    hit: (block) => LEADING_MARKER.test(block.text),
  },
  {
    id: "orphan-punctuation",
    why: "a space before a full stop is read as a pause plus a separate breath",
    hit: (block) => /\s[.,;:!?]/.test(block.text),
  },
  {
    id: "spoken-url",
    why: "a bare address is spelled out character by character",
    hit: (block) => /https?:\/\/|\bwww\.\w/i.test(block.text),
  },
  {
    // Narrowed after the first run: any pair of brackets was too much. An
    // engine says "[Update] the story" the way a person would; it is the
    // footnote and the wiki edit link that turn into noise.
    id: "footnote-marker",
    why: "a footnote number in the middle of a sentence is read as bracket-one-bracket",
    hit: (block) => /\[\d{1,3}\]|\[(?:Bearbeiten|edit)\b/i.test(block.text),
  },
  {
    // Four letters was too eager: HTTP, NASA and CDU are acronyms, and every
    // engine says them the way a person would. Six upper-case letters in a row
    // is a headline shouting, and that is what gets spelled out.
    id: "shouty",
    why: "many engines spell long all-caps runs letter by letter",
    hit: (block) => /\b[A-ZÄÖÜ]{6,}\b/.test(block.text),
  },
  {
    id: "run-on-utterance",
    why: "over 400 characters in one utterance is a long way from the next breath",
    hit: (block) => block.parts.some((part) => part.length > 400),
  },
];

async function main() {
  const dom = new JSDOM("", { url: "https://corpus.test/" });
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.Node = dom.window.Node;

  const { extractArticle } = await import(path.join(ROOT, "lib/parse.ts"));
  const { spokenBlocks } = await import(path.join(ROOT, "lib/readAloud.ts"));

  const list = JSON.parse(fs.readFileSync(URLS, "utf8"));
  const articles = [];
  const totals = Object.fromEntries(CHECKS.map((check) => [check.id, 0]));
  const examples = {};

  for (const entry of list) {
    const file = path.join(SNAPSHOTS, `${slug(entry.url)}.html.gz`);
    if (!fs.existsSync(file)) continue;
    let article;
    try {
      article = extractArticle(
        gunzipSync(fs.readFileSync(file)).toString("utf8"),
        entry.url
      );
    } catch {
      continue; // paywalled or empty — the corpus report is where that belongs
    }
    const blocks = spokenBlocks(article.contentHtml);
    const found = {};
    for (const block of blocks) {
      for (const check of CHECKS) {
        if (!check.hit(block)) continue;
        found[check.id] = (found[check.id] ?? 0) + 1;
        totals[check.id] += 1;
        if (!examples[check.id]) {
          examples[check.id] = {
            site: entry.site,
            kind: block.kind,
            text: block.text.slice(0, 120),
          };
        }
      }
    }
    articles.push({
      site: entry.site,
      url: entry.url,
      blocks: blocks.length,
      kinds: blocks.reduce((acc, block) => {
        acc[block.kind] = (acc[block.kind] ?? 0) + 1;
        return acc;
      }, {}),
      findings: found,
    });
  }

  const blocks = articles.reduce((sum, a) => sum + a.blocks, 0);
  const report = {
    generatedFrom: `${articles.length} snapshots`,
    blocks,
    findings: totals,
    findingsPerThousandBlocks: Object.fromEntries(
      Object.entries(totals).map(([id, count]) => [
        id,
        blocks ? Math.round((count / blocks) * 1000) : 0,
      ])
    ),
    why: Object.fromEntries(CHECKS.map((check) => [check.id, check.why])),
    examples,
    articles,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`${articles.length} articles, ${blocks} spoken blocks`);
  for (const check of CHECKS) {
    console.log(`  ${String(totals[check.id]).padStart(5)}  ${check.id}`);
  }
  console.log(`\nwritten: ${path.relative(ROOT, OUT)}`);
}

await main();
