#!/usr/bin/env node
/** The product rule, checked by a machine: a language shows its own voices and
 *  nobody else's.
 *
 *  "Only German voices under German" is the kind of promise that holds on the
 *  day it is written and quietly breaks two refactors later, because on the
 *  developer's phone the list is short and the fault does not show. So it is
 *  measured instead: a stubbed set of voices in three languages, then every
 *  language row opened in turn, and every name in it checked against the
 *  language it sits under.
 *
 *    npm run build && node scripts/voice-flow-check.mjs
 *
 *  Also captures corpus/ui-shots/voices-*.png, which is the only way to see
 *  this screen populated — a headless browser has no voices of its own.
 *
 *  Writes corpus/voice-flow-report.json. Exits non-zero on any failure.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out");
const CORPUS = path.join(ROOT, "corpus");
const SHOTS = path.join(CORPUS, "ui-shots");

/** A believable phone: two German voices, three English ones with the machine
 *  names engines really use, one Italian, and a remote voice that must never be
 *  offered because the app promises to work offline. */
const VOICES = [
  { name: "Thorsten", lang: "de-DE", voiceURI: "de-thorsten", localService: true, default: true },
  { name: "de-DE-language", lang: "de-DE", voiceURI: "de-language", localService: true, default: false },
  { name: "Aria", lang: "en-US", voiceURI: "en-aria", localService: true, default: false },
  { name: "en-us-x-sfg-local", lang: "en-US", voiceURI: "en-sfg", localService: true, default: false },
  { name: "Daniel", lang: "en-GB", voiceURI: "en-daniel", localService: true, default: false },
  { name: "Elsa", lang: "it-IT", voiceURI: "it-elsa", localService: true, default: false },
  { name: "Cloud Voice", lang: "de-DE", voiceURI: "de-cloud", localService: false, default: false },
  // Dutch exists here for one reason: it is the only language whose *only*
  // voice carries a machine name, so the welcome screen has no human-named
  // alternative to fall back on. Without it the machine-name check below can
  // pass while doing nothing — which it did, and a sabotage run proved it.
  { name: "nl-nl-x-dnb-local", lang: "nl-NL", voiceURI: "nl-dnb", localService: true, default: false },
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

/** Names an engine gives its voices. A device run found two of them on the
 *  welcome screen — "en-us-x-msm00013-local" and a bare "de" — in a build where
 *  every banned *word* had already been cleared. `prettyVoiceName()` exists to
 *  turn these into "standard English voice"; these patterns are the check that
 *  it was actually called, and they live here rather than in the jargon audit
 *  because only this script has voices at all. */
const MACHINE_NAMES = [
  [/\b[a-z]{2,3}[-_][a-z]{2,3}[-_]x[-_][a-z0-9]{3,}/i, "a voice name written for a machine"],
  [/\b[a-z]{2,3}[-_][A-Z]{2}[-_](language|local|network)\b/, "a voice name written for a machine"],
  [/\b[a-z]{2,}\d{3,}\b/i, "a serial number standing in for a voice name"],
];

const failures = [];
const notes = [];
const check = (ok, what) => {
  if (ok) notes.push(`ok: ${what}`);
  else failures.push(what);
  return ok;
};

const server = await serveExport();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL: origin,
  viewport: { width: 412, height: 915 },
});
const page = await context.newPage();

await page.addInitScript((voices) => {
  // Init scripts run on *every* document, so simply clearing the flag before a
  // navigation would be undone by this line on arrival — which is exactly what
  // happened, and the welcome pass silently checked the library instead.
  if (localStorage.getItem("fp-want-welcome") !== "1") {
    localStorage.setItem("fp-welcomed", "1");
  }
  // The browser build reads window.speechSynthesis; a headless browser has no
  // voices at all, so the screen could only ever be seen empty without this.
  const list = voices.map((voice) => ({ ...voice }));
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices: () => list,
      speak: () => {},
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      speaking: false,
      paused: false,
      pending: false,
    },
  });
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
}, VOICES);

await page.goto("/settings/");
await page.waitForLoadState("networkidle");

const languageRow = (name) =>
  page.locator(".language-row").filter({ has: page.getByText(name, { exact: true }) });

// An empty library means one row, English, which is the honest default: the app
// is in English and nothing has been saved yet.
await page.waitForSelector(".language-row");
check(
  (await page.locator(".language-row").count()) === 1,
  "an empty library offers exactly one language row"
);

// --- a control that does nothing is not shown ---
// Pitch is a number the phone's engines take and a downloaded model has no use
// for. With a phone voice chosen it is there; the check below proves it goes
// when a downloaded voice is the one reading.
check(
  (await page.getByText("Pitch", { exact: true }).count()) > 0,
  "pitch is offered while the phone's own voice is doing the reading"
);

// --- a language nobody added cannot be "removed" ---
// The first row on a fresh install is a guess at the phone's language. It was
// never in the stored list, so a Remove there did nothing while looking like it
// would.
check(
  (await page.getByRole("button", { name: /^Remove / }).count()) === 0,
  "the guessed language offers no Remove"
);

// --- add a language by searching for it, in the language's own name ---
await page.getByRole("button", { name: "Add a language" }).click();
await page.locator("#fp-language-search").fill("deutsch");
const firstResult = page.locator(".language-result").first();
check(
  (await firstResult.innerText()).includes("Deutsch"),
  'searching "deutsch" offers German first'
);
await firstResult.click();
await page.waitForTimeout(500);
check(
  (await languageRow("Deutsch").count()) === 1,
  "the chosen language appears as a row"
);

// --- the rule itself: German shows German voices and nothing else ---
const germanVoices = await languageRow("Deutsch").locator(".voice-name").allInnerTexts();
check(germanVoices.length > 0, "German offers at least one voice");
check(
  germanVoices.every((name) => !/aria|daniel|elsa|sfg/i.test(name)),
  `German shows only German voices — saw ${JSON.stringify(germanVoices)}`
);
check(
  germanVoices.every((name) => !/cloud/i.test(name)),
  "a voice that needs the network is never offered"
);
check(
  germanVoices.some((name) => name === "standard German voice"),
  `a machine-named voice is renamed for a person — saw ${JSON.stringify(germanVoices)}`
);

// --- add a second language and check its list is its own ---
await page.getByRole("button", { name: "Add a language" }).click();
await page.locator("#fp-language-search").fill("italian");
await page.locator(".language-result").first().click();
await page.waitForTimeout(500);
const italianVoices = await languageRow("Italiano").locator(".voice-name").allInnerTexts();
check(
  italianVoices.length === 1 && italianVoices[0] === "Elsa",
  `Italian shows exactly its own voice — saw ${JSON.stringify(italianVoices)}`
);

// --- choosing a voice sticks, and is what the row then says ---
// Only one row is open at a time, so adding Italian closed German. Re-opening
// it is part of the check rather than a workaround: a row has to come back
// with its voices.
await languageRow("Deutsch").locator(".language-head").click();
await page.waitForTimeout(400);
const pick = languageRow("Deutsch").locator(".voice-pick").first();
await pick.click();
await page.waitForTimeout(300);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("fp-voice") ?? "{}"));
check(
  stored.voices?.de === "de-thorsten",
  `the choice is remembered per language — stored ${JSON.stringify(stored.voices)}`
);
await languageRow("Deutsch").locator(".language-head").click();
await page.waitForTimeout(300);
check(
  (await languageRow("Deutsch").locator(".language-voice").innerText()).includes("Thorsten"),
  "the closed row names the voice it will read with"
);

// --- keyboard: the row opens with the keyboard alone ---
await languageRow("Italiano").locator(".language-head").focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
check(
  (await languageRow("Italiano").locator(".language-head").getAttribute("aria-expanded")) === "true",
  "a language row opens from the keyboard"
);

fs.mkdirSync(SHOTS, { recursive: true });
await page.screenshot({ path: path.join(SHOTS, "voices-mobile.png"), fullPage: true });
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(SHOTS, "voices-desktop.png"), fullPage: true });

// --- removing a language leaves no trace ---
await page.setViewportSize({ width: 412, height: 915 });
await languageRow("Italiano").getByRole("button", { name: /^Remove/ }).click();
await page.waitForTimeout(500);
check(
  (await languageRow("Italiano").count()) === 0,
  "a language added by hand can be removed again"
);

// --- no machine name ever reaches the screen ---
// The stub deliberately carries "de-DE-language" and "en-us-x-sfg-local": if
// any of them is rendered as-is, this fails.
for (const where of [".voice-name", ".language-voice", ".voice-results li"]) {
  const texts = await page.locator(where).allInnerTexts();
  for (const text of texts) {
    const bad = MACHINE_NAMES.find(([pattern]) => pattern.test(text));
    check(!bad, `no machine voice name on screen (${where}) — saw ${JSON.stringify(text)}`);
  }
}

// --- the welcome screen, which is where a device found exactly that fault ---
await page.evaluate(async () => {
  localStorage.setItem("fp-want-welcome", "1");
  localStorage.removeItem("fp-welcomed");
  // A Dutch article, so the welcome screen reports the one language whose only
  // voice is machine-named.
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("foldpage");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = db.transaction("articles", "readwrite");
  transaction.objectStore("articles").put({
    id: "flow-nl",
    url: "https://example.test/nl",
    canonicalUrl: "https://example.test/nl",
    title: "Een artikel in het Nederlands",
    author: null,
    siteName: "example.test",
    excerpt: "Een zin.",
    contentHtml: "<p>Een alinea.</p>",
    wordCount: 100,
    readingMin: 1,
    lang: "nl",
    state: "inbox",
    favorite: false,
    progress: 0,
    tags: [],
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
await page.goto("/");
await page.waitForLoadState("networkidle");
const next = page.getByRole("button", { name: "Next" });
if (await next.count()) {
  await next.click();
  await page.waitForTimeout(1500);
}
const welcomeLines = (await page.locator(".voice-results li").allInnerTexts()).map((line) =>
  line.replace(/\s+/g, " ").trim()
);
check(welcomeLines.length > 0, `the welcome screen reports what it found — saw ${welcomeLines.length} rows`);
check(
  welcomeLines.some((line) => line.includes("standard Dutch voice")),
  `the welcome screen prettifies a machine-named voice — saw ${JSON.stringify(welcomeLines)}`
);
for (const line of welcomeLines) {
  const bad = MACHINE_NAMES.find(([pattern]) => pattern.test(line));
  check(!bad, `the welcome screen names voices for people — saw ${JSON.stringify(line)}`);
}
await page.screenshot({ path: path.join(SHOTS, "voices-welcome.png"), fullPage: true });
await page.evaluate(() => {
  localStorage.removeItem("fp-want-welcome");
  localStorage.setItem("fp-welcomed", "1");
});

// --- and it goes when a downloaded voice is the one reading ---
// Stored directly, because the browser preview cannot install a voice. What is
// under test is the rule, not the download: a model has the pitch it was
// trained with, and a slider that moves nothing is a lie.
await page.evaluate(() => {
  const prefs = JSON.parse(localStorage.getItem("fp-voice") || "{}");
  // Every language on this screen, not just one: the control is offered while
  // *any* language is still read by a phone voice, which is the point of it.
  prefs.voices = {
    ...(prefs.voices || {}),
    en: "foldpage:some-downloaded-voice",
    de: "foldpage:some-downloaded-voice",
    nl: "foldpage:some-downloaded-voice",
    it: "foldpage:some-downloaded-voice",
  };
  localStorage.setItem("fp-voice", JSON.stringify(prefs));
});
await page.goto("/settings/");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(700);
check(
  (await page.getByText("Pitch", { exact: true }).count()) === 0,
  "pitch is not offered when a downloaded voice is doing the reading"
);
await page.evaluate(() => {
  const prefs = JSON.parse(localStorage.getItem("fp-voice") || "{}");
  delete prefs.voices.en;
  delete prefs.voices.nl;
  localStorage.setItem("fp-voice", JSON.stringify(prefs));
});

// --- inside the reader, only the article's own language is on offer ---
// Reading aloud happens in one language at a time. Offering a picker for the
// other four while somebody is listening to a German article is furniture, not
// a choice.
await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("foldpage");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = db.transaction("articles", "readwrite");
  transaction.objectStore("articles").put({
    id: "flow-de",
    url: "https://example.test/de",
    canonicalUrl: "https://example.test/de",
    title: "Ein Artikel auf Deutsch",
    author: null,
    siteName: "example.test",
    excerpt: "Ein Satz.",
    contentHtml: "<p>Ein Absatz, lang genug zum Umbrechen.</p>",
    wordCount: 200,
    readingMin: 1,
    lang: "de",
    state: "inbox",
    favorite: false,
    progress: 0,
    tags: [],
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
await page.goto("/read/?id=flow-de");
await page.waitForLoadState("networkidle");
await page.locator('[aria-label="Reading settings"]:visible').first().click();
await page.getByRole("tab", { name: "Voice" }).click();
await page.waitForTimeout(600);
const readerRows = await page.locator(".language-row .language-name").allInnerTexts();
check(
  readerRows.length === 1 && readerRows[0] === "Deutsch",
  `the reader offers the article's language only — saw ${JSON.stringify(readerRows)}`
);
check(
  (await page.getByRole("button", { name: "Add a language" }).count()) === 0,
  "the reader does not offer to add other languages"
);
check(
  (await page.locator(".language-row .voice-name").count()) > 0,
  "the reader's language opens on its voices rather than on a row to tap"
);
await page.screenshot({ path: path.join(SHOTS, "voices-reader.png") });

// --- the reader's primary action is the one the app is for ---
await page.getByRole("button", { name: "Done" }).click();
await page.waitForTimeout(300);
const listen = page.locator(".readerbar .listenbtn");
check(await listen.isVisible(), "the reader carries a labelled listen control");
check(
  (await listen.innerText()).trim() === "Listen",
  `the control says what it does — saw ${JSON.stringify((await listen.innerText()).trim())}`
);
const listenBox = await listen.boundingBox();
check(
  !!listenBox && listenBox.height >= 48 && listenBox.width >= 100,
  `it is the largest control in the bar — ${JSON.stringify(listenBox)}`
);
const barButtons = await page.locator(".readerbar button").count();
check(barButtons === 4, `the bar holds four controls, not six — saw ${barButtons}`);
// Every other control in the bar keeps a real name for a screen reader.
const named = await page.locator(".readerbar button").evaluateAll((buttons) =>
  buttons.every((button) => (button.getAttribute("aria-label") || button.textContent || "").trim().length > 2)
);
check(named, "every control in the bar has a name");

await browser.close();
server.close();

fs.mkdirSync(CORPUS, { recursive: true });
fs.writeFileSync(
  path.join(CORPUS, "voice-flow-report.json"),
  `${JSON.stringify(
    { ranAt: new Date().toISOString(), voices: VOICES, passed: notes, failures },
    null,
    2
  )}\n`
);

if (!failures.length) {
  console.log(`voice-flow: ${notes.length} checks, all passed.`);
} else {
  console.log(`voice-flow: ${failures.length} of ${notes.length + failures.length} failed.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
