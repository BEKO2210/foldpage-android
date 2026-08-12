"use client";

import { CapacitorHttp } from "@capacitor/core";
import { Readability } from "@mozilla/readability";
import type { ParseResult } from "./types";

/** Same extraction the web app did in /api/parse — but on the device.
    The native HTTP bridge fetches the page (no CORS, real redirects),
    the WebView's own DOMParser plus Readability do the rest. */

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 FoldPageApp/1.0",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "de;q=0.9,en;q=0.8",
};

const PRIVATE_HOST =
  /^(localhost|::1|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** URL.hostname keeps IPv6 in brackets ("[::1]"), which the guard above
    would never match. */
function bareHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

/** Elements that may carry article content. Anything not listed here is
    either dropped outright (DROPPED_TAGS) or unwrapped — its children stay,
    the element itself does not. Custom elements from the source page land in
    that second group, so `<a-gift>` loses its wrapper and keeps its text. */
const ALLOWED_TAGS = new Set([
  "P", "BR", "HR", "SPAN", "DIV", "SECTION", "ARTICLE", "MAIN", "ASIDE",
  "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI", "DL", "DT", "DD",
  "BLOCKQUOTE", "PRE", "CODE", "KBD", "SAMP", "VAR",
  "EM", "STRONG", "I", "B", "U", "S", "DEL", "INS", "SUB", "SUP", "SMALL",
  "MARK", "ABBR", "CITE", "Q", "TIME", "ADDRESS", "WBR",
  "RUBY", "RT", "RP", "DETAILS", "SUMMARY",
  "FIGURE", "FIGCAPTION", "IMG", "PICTURE", "SOURCE", "VIDEO", "AUDIO",
  "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "CAPTION",
  "COLGROUP", "COL", "A",
]);

/** Removed with their whole subtree: these execute, load, navigate, or take
    input. Unwrapping them would keep exactly the payload we are removing.

    `BASE` is in here because a single `<base href>` in stored content
    re-points every relative URL in the app itself. `SVG` and `MATH` are out
    because their parsers accept markup HTML's does not (`<animate>` setting
    an `href`, `foreignObject`), which turns an attribute allowlist into a
    guess. Article illustrations arrive as `<img>` regardless. */
const DROPPED_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "FRAME", "FRAMESET", "OBJECT", "EMBED",
  "APPLET", "FORM", "INPUT", "TEXTAREA", "SELECT", "OPTION", "OPTGROUP",
  "BUTTON", "LABEL", "FIELDSET", "LEGEND", "OUTPUT", "PROGRESS", "METER",
  "LINK", "META", "BASE", "TITLE", "HEAD", "TEMPLATE", "SLOT", "NOSCRIPT",
  "SVG", "MATH", "CANVAS", "DIALOG", "PORTAL", "MARQUEE", "TRACK", "MAP",
  "AREA", "PARAM",
]);

/** Attributes allowed on every element that survives. `class` is absent on
    purpose: the reader's own classes (`tablewrap`, `numeric`, `prose`) are
    added after this pass, so a source class can neither survive nor collide
    with the app's stylesheet. */
const GLOBAL_ATTRS = new Set(["id", "lang", "dir", "title"]);

/** Per-element additions. Anything not listed — `style`, `srcset`, `target`,
    `data-*`, `on*`, `xlink:href` — is dropped. */
const TAG_ATTRS: Record<string, string[]> = {
  A: ["href"],
  IMG: ["src", "alt", "width", "height", "loading", "decoding"],
  SOURCE: ["src", "type", "width", "height"],
  VIDEO: ["src", "poster", "controls", "width", "height"],
  AUDIO: ["src", "controls"],
  TD: ["colspan", "rowspan", "headers", "abbr"],
  TH: ["colspan", "rowspan", "headers", "scope", "abbr"],
  COL: ["span"],
  COLGROUP: ["span"],
  OL: ["start", "reversed", "type"],
  LI: ["value"],
  TIME: ["datetime"],
  DETAILS: ["open"],
  BLOCKQUOTE: ["cite"],
  Q: ["cite"],
  DEL: ["cite", "datetime"],
  INS: ["cite", "datetime"],
};

const URL_ATTRS = new Set(["href", "src", "poster", "cite"]);

/** Schemes a stored article may point at. `data:` is limited to images
    because the offline fixtures ship their pictures inline; a `data:text/html`
    link would open a document of the attacker's choosing.

    A path-relative target is refused rather than kept: absolutize() has
    already resolved every link that had a base to resolve against, so what is
    left resolves against the app's own origin — a tap would walk the WebView
    into a route that does not exist. In-page fragments are the exception,
    since footnotes depend on them. */
function isSafeUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("#")) return true;
  if (/^data:image\//i.test(v)) return true;
  return /^(https?|mailto|tel):/i.test(v);
}

function scrubAttributes(el: Element): void {
  const allowed = TAG_ATTRS[el.tagName.toUpperCase()] ?? [];
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    if (!GLOBAL_ATTRS.has(name) && !allowed.includes(name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (URL_ATTRS.has(name) && !isSafeUrl(attr.value)) {
      el.removeAttribute(attr.name);
    }
  }
}

/** Depth-first, children before parents: an element is only unwrapped once
    its own subtree is clean, so nothing dangerous is promoted into the
    container by the unwrap itself. */
function scrubTree(el: Element): void {
  for (const child of [...el.children]) {
    const tag = child.tagName.toUpperCase();
    if (DROPPED_TAGS.has(tag)) {
      child.remove();
      continue;
    }
    scrubTree(child);
    if (ALLOWED_TAGS.has(tag)) scrubAttributes(child);
    else child.replaceWith(...child.childNodes);
  }
}

/** Reduce the extracted HTML to an allowlist before it is stored and later
    injected with dangerouslySetInnerHTML.

    An allowlist rather than a list of known-bad tags and attributes: the
    stored document is rendered inside the app's own origin, where anything
    that runs can read the whole library out of IndexedDB. A blocklist is only
    as good as its last update — this one has to be extended before a new
    element or attribute can reach the reader at all.

    `doc` must be an inert document (DOMParser output). Building this in the
    live WebView document would fetch every <img> and fire its onerror
    handler while the attributes are still on the element — i.e. run the
    page's script before we get to remove it. */
/** Blocks that hold nothing at all, once everything has been cleaned.
 *
 *  Source pages are full of them — spacer paragraphs, the leftovers of a
 *  removed ad slot, an emptied wrapper — and each one renders as a gap in the
 *  middle of the article. They are dropped last, after the media pass, because
 *  that is what turns a paragraph holding one counting pixel into an empty one.
 *
 *  Only paragraph-like blocks are considered, and only when they hold neither
 *  text nor anything that draws. A `<br>` is a deliberate line break and keeps
 *  its paragraph; a `<hr>` is a rule and stays. */
const EMPTIABLE = new Set(["P", "DIV", "SECTION", "FIGURE", "BLOCKQUOTE"]);
const DRAWS = "img, picture, video, audio, table, hr, br, iframe, canvas, svg";

function dropEmptyBlocks(container: HTMLElement): void {
  // Deepest first: emptying a child can leave its parent empty in turn.
  const blocks = [...container.querySelectorAll("*")].reverse();
  for (const el of blocks) {
    if (!EMPTIABLE.has(el.tagName)) continue;
    if ((el.textContent ?? "").trim()) continue;
    if (el.querySelector(DRAWS)) continue;
    el.remove();
  }
}

function sanitize(html: string, doc: Document): string {
  const container = doc.createElement("div");
  container.innerHTML = html;
  scrubTree(container);
  prepareTables(container, doc);
  prepareMedia(container, doc);
  dropEmptyBlocks(container);
  return container.innerHTML;
}

const NUMERIC_CELL =
  /^[+\-−]?\s*\d[\d\s.,'’]*(?:\s*(?:%|‰|°|[kmcµnp]?m|[km]?g|[km]?l|[km]?w|[km]?wh|hz|[km]?bit|[kmgt]?b|[km]?bps|[a-z]{1,4}\/h|[€$£¥]))?$/i;

/** Give tables a stable scrolling parent while keeping their native layout.
    The class on numeric cells lets CSS align values without guessing from
    column position. */
/** Anything this small is a counting pixel, a share icon or a logo — never
    part of what someone came to read. */
const DECORATIVE_PX = 100;

/** Looks like a photo credit rather than a sentence of the article. */
const CAPTION_HINT = /^(foto|bild|quelle|abbildung|grafik|image|photo|credit|source)\s*[:：]/i;

/** Prepare images so they neither shift the layout nor leave holes in it.

    Two failure modes were visible in the corpus: pages that ship 300 icons
    inside the article body, and images that never load and leave a reserved
    gap behind. The first is filtered here; the second cannot be known until
    runtime, so the reader clears it after load. */
function prepareMedia(container: HTMLElement, doc: Document) {
  container.querySelectorAll("img").forEach((img) => {
    const w = Number(img.getAttribute("width"));
    const h = Number(img.getAttribute("height"));

    if ((w && w < DECORATIVE_PX) || (h && h < DECORATIVE_PX)) {
      img.remove();
      return;
    }

    // Reserving the box up front keeps the text from jumping once the image
    // arrives. Without intrinsic dimensions a neutral ratio still beats none.
    if (w && h) img.style.aspectRatio = `${w} / ${h}`;
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");

    // A caption that follows a bare image belongs to it. Pairing them means
    // the caption can be styled as one, and stays with its image.
    const parentIsFigure = img.parentElement?.tagName === "FIGURE";
    const next = img.nextElementSibling;
    if (
      !parentIsFigure &&
      next &&
      next.tagName === "P" &&
      (next.textContent ?? "").trim().length < 200 &&
      CAPTION_HINT.test((next.textContent ?? "").trim())
    ) {
      const figure = doc.createElement("figure");
      const caption = doc.createElement("figcaption");
      caption.innerHTML = next.innerHTML;
      img.before(figure);
      figure.append(img, caption);
      next.remove();
    }
  });
}

function prepareTables(container: HTMLElement, doc: Document) {
  container.querySelectorAll("table").forEach((table) => {
    if (!table.parentElement?.classList.contains("tablewrap")) {
      const wrapper = doc.createElement("div");
      wrapper.className = "tablewrap";
      table.before(wrapper);
      wrapper.append(table);
    }

    const cells = [...table.querySelectorAll("th, td")];
    cells.forEach((cell) => {
      if (NUMERIC_CELL.test(cell.textContent?.trim() ?? "")) {
        cell.classList.add("numeric");
      }
    });

    // A table whose cells hold paragraphs is not a table on a phone — it is a
    // wall of text in four-word columns. Those get stacked into labelled
    // blocks instead; real data tables keep their grid and scroll.
    const longest = cells.reduce(
      (max, cell) => Math.max(max, (cell.textContent ?? "").trim().length),
      0
    );
    if (longest > 80) {
      table.parentElement?.classList.add("prose");
      const headRow = table.querySelector("thead tr") ?? table.querySelector("tr");
      const labels = [...(headRow?.children ?? [])].map((cell) =>
        (cell.textContent ?? "").trim()
      );
      table.querySelectorAll("tbody tr, tr").forEach((row) => {
        if (row === headRow) return;
        [...row.children].forEach((cell, index) => {
          const label = labels[index];
          if (label) cell.setAttribute("data-label", label);
        });
      });
    }
  });
}

const EDGE_CHROME_TAGS = new Set([
  "NAV",
  "ASIDE",
  "HEADER",
  "FOOTER",
  "MENU",
  "BUTTON",
  "SELECT",
  "SVG",
]);

/** Text that is page furniture rather than article, matched only against the
    first and last block of what Readability returned (see cleanArticleEdges).

    The list grew out of German news sites and stayed that way far too long:
    with the corpus measuring in German too, every English source looked clean
    while carrying an affiliate disclosure or a staff biography as its last
    block. The English half was added on 12.08.2026, after the measurement was
    taught to see it. */
const EDGE_FURNITURE =
  /^(pfadnavigation|benachrichtigungpfeil nach links|ki-news ohne hype|als bevorzugte quelle auf google hinzufügen|zum hauptinhalt springen$|source code:|startseite$|anzeige$|top-artikel$|cookies? (zustimmen|akzeptieren)|besuchen sie golem\.de|um der nutzung von golem\.de|die zustimmung in einem iframe|der zustimmungs-dialog konnte nicht|die möglichkeit zum widerruf|… oder golem pur bestellen|mit golem pur ab|informationen auf einem gerät speichern|personalisierte anzeigen und inhalte|diesen artikel weiterlesen mit|image credits?:|when you (purchase|buy) through links|sofern nicht anders angegeben|the content of this page is licensed|sign up for (our|the) newsletter|follow us on|most read$|related stories$|[\p{L}.'’-]+(?: [\p{L}.'’-]+){0,2} is an? (?:senior |staff |contributing |former )*(?:reporter|editor|writer|correspondent|journalist)\b)/iu;

const EDGE_WRAPPERS = new Set(["DIV", "SECTION", "ARTICLE", "MAIN"]);
const EDGE_MEDIA = "img, picture, video, audio, canvas";

function compactText(el: Element): string {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

/** A block only survives on the strength of its media if that media is worth
    keeping. Breadcrumbs carry an icon each, and that icon was enough to make
    them look like content — the welt.de trail rendered as three links with a
    reserved image box between them. */
function onlyDecorativeMedia(el: Element): boolean {
  const media = [...el.querySelectorAll(EDGE_MEDIA)];
  if (!media.length) return false;
  return media.every((node) => {
    if (node.tagName !== "IMG") return false;
    const w = Number(node.getAttribute("width"));
    const h = Number(node.getAttribute("height"));
    return (!w && !h) || (w && w < 200) || (h && h < 200);
  });
}

function isLinkList(el: Element, value: string): boolean {
  const links = [...el.querySelectorAll("a")];
  if (links.length < 3 || !value) return false;
  const linked = links.reduce((sum, link) => sum + compactText(link).length, 0);
  return linked / value.length > 0.6;
}

/** Only classify an element after looking inside generic wrappers. A wrapper
    may start with furniture while still containing the whole article (t3n is
    exactly that shape), so removing it based on its combined text loses prose. */
function isEdgeFurniture(el: Element, broad: boolean): boolean {
  const value = compactText(el);
  const hasMedia = !!el.querySelector(EDGE_MEDIA);
  return (
    (!value && !hasMedia) ||
    EDGE_FURNITURE.test(value) ||
    ((el.tagName === "A-COLLAPSE" || el.tagName === "A-GIFT") && !hasMedia) ||
    (el.tagName.includes("-") && !value && !hasMedia) ||
    (broad && EDGE_CHROME_TAGS.has(el.tagName)) ||
    (broad && isLinkList(el, value)) ||
    (broad &&
      value.length > 0 &&
      value.length < 40 &&
      (!hasMedia || onlyDecorativeMedia(el)))
  );
}

function trimNestedEdges(el: Element): void {
  if (!EDGE_WRAPPERS.has(el.tagName)) return;

  // A boundary wrapper can contain chrome at either end even when the wrapper
  // itself is only on one edge of the Readability result.
  trimEdge(el, "first", false);
  trimEdge(el, "last", false);
}

function trimEdge(
  container: Element,
  side: "first" | "last",
  broad = true
): void {
  while (container.children.length) {
    const candidate =
      side === "first"
        ? container.firstElementChild
        : container.lastElementChild;
    if (!candidate) return;

    // Generic wrappers need their own edges cleaned before their aggregate
    // text is judged. This preserves mixed furniture/article wrappers.
    trimNestedEdges(candidate);
    if (
      candidate.tagName.includes("-") &&
      candidate.tagName !== "A-COLLAPSE" &&
      candidate.tagName !== "A-GIFT" &&
      compactText(candidate)
    ) {
      candidate.replaceWith(...candidate.childNodes);
      continue;
    }
    if (isEdgeFurniture(candidate, broad)) {
      candidate.remove();
      continue;
    }
    return;
  }
}

/** Remove page chrome that Readability retained immediately before or after
    the article. This deliberately runs after extraction: only the two edges
    are considered, never matching furniture-like words in the article body. */
function cleanArticleEdges(html: string, doc: Document): {
  html: string;
  text: string;
} {
  const container = doc.createElement("div");
  container.innerHTML = html;
  let root: Element = container;
  while (true) {
    trimEdge(root, "first");
    trimEdge(root, "last");
    if (
      root.children.length !== 1 ||
      !EDGE_WRAPPERS.has(root.firstElementChild?.tagName || "")
    ) {
      break;
    }
    root = root.firstElementChild as Element;
  }
  return { html: container.innerHTML, text: compactText(container) };
}

/** Rewrite relative img/a targets against the page URL. Readability relies on
    document.baseURI for this, which a DOMParser document does not have. */
function absolutize(doc: Document, baseUrl: string) {
  const fix = (el: Element, attr: string) => {
    const raw = el.getAttribute(attr);
    if (!raw || /^(https?:|data:|#)/i.test(raw)) return;
    try {
      el.setAttribute(attr, new URL(raw, baseUrl).toString());
    } catch {
      /* unparseable — leave as-is, Readability will drop it */
    }
  };
  doc.querySelectorAll("a[href]").forEach((el) => fix(el, "href"));
  doc
    .querySelectorAll("img[src], source[src], video[src]")
    .forEach((el) => fix(el, "src"));
  doc.querySelectorAll("img[data-src]").forEach((el) => {
    const lazy = el.getAttribute("data-src");
    if (lazy && !el.getAttribute("src")) el.setAttribute("src", lazy);
    fix(el, "src");
  });
  doc
    .querySelectorAll("img[srcset], source[srcset]")
    .forEach((el) => el.removeAttribute("srcset"));
}

function headerValue(
  headers: Record<string, string> | undefined,
  name: string
): string {
  if (!headers) return "";
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? String(headers[key]) : "";
}

/** Validate a user-supplied link and refuse the ones we will not fetch.
    Exported so the tests can cover the guard without a network call. */
export function assertFetchable(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Not a valid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http(s) links can be saved");
  }
  const host = bareHostname(parsed.hostname);
  if (PRIVATE_HOST.test(host) || host.endsWith(".local")) {
    throw new Error("Refusing to fetch private addresses");
  }
  return parsed;
}

/** An author line Readability did not find.
 *
 *  Its byline heuristic looks at the article body, which leaves every page that
 *  states its author only in the head without one — six of the corpus's 39.
 *  The structured data is right there, so it is read: JSON-LD first, because a
 *  publisher who ships it means it, then the meta tags.
 *
 *  What is rejected matters as much as what is taken: a company name that is
 *  just the site again ("web.dev"), or a whole paragraph that ended up in a
 *  meta tag, is worse in the header than an empty slot. */
function looksLikeName(value: string): boolean {
  if (!/\p{L}/u.test(value)) return false;
  // A byline can legitimately be long — thirteen names on one investigative
  // piece is real, and cutting it to the first author would quietly drop the
  // others. What is never real is a single word of sixty characters, which is
  // what a page dumps into the author tag when it means something else.
  if (value.length > 300) return false;
  return !value.split(/\s+/).some((word) => word.length > 40);
}

/** `strict` is for values taken from the head, where a publisher's own domain
    is a placeholder rather than an author. A byline Readability found is not
    held to that: "WELT" and "tagesschau.de" are how those newsrooms sign their
    pieces, and an empty header would be the worse answer. */
function cleanAuthor(
  raw: string,
  siteHost: string,
  { strict = false }: { strict?: boolean } = {}
): string | null {
  const value = raw.replace(/\s+/g, " ").trim();
  if (!value || !looksLikeName(value)) return null;
  if (strict) {
    if (value.length > 80) return null;
    const bare = value.toLowerCase().replace(/^www\./, "");
    const host = siteHost.toLowerCase().replace(/^www\./, "");
    if (bare === host || bare === host.split(".")[0]) return null;
  }
  return value;
}

function authorFromJsonLd(doc: Document, host: string): string | null {
  const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block.textContent ?? "");
    } catch {
      continue; // Half-written JSON-LD is common; it is not worth a failure.
    }
    const queue: unknown[] = [data];
    while (queue.length) {
      const node = queue.shift();
      if (Array.isArray(node)) {
        queue.push(...node);
        continue;
      }
      if (!node || typeof node !== "object") continue;
      const record = node as Record<string, unknown>;
      const author = record.author;
      if (typeof author === "string") {
        const name = cleanAuthor(author, host, { strict: true });
        if (name) return name;
      }
      for (const candidate of Array.isArray(author) ? author : [author]) {
        if (candidate && typeof candidate === "object") {
          const named = (candidate as Record<string, unknown>).name;
          if (typeof named === "string") {
            const name = cleanAuthor(named, host, { strict: true });
            if (name) return name;
          }
        }
      }
      if (record["@graph"]) queue.push(record["@graph"]);
    }
  }
  return null;
}

function authorFromMetadata(doc: Document, host = ""): string | null {
  const fromLd = authorFromJsonLd(doc, host);
  if (fromLd) return fromLd;
  const selectors = [
    'meta[name="author"]',
    'meta[property="article:author"]',
    'meta[name="citation_author"]',
    // twitter:creator holds an @handle, not a name — worse in a byline slot
    // than nothing, so it is deliberately absent.
  ];
  for (const selector of selectors) {
    const content = doc.querySelector(selector)?.getAttribute("content") ?? "";
    // article:author is often a profile URL rather than a name — a link in the
    // byline slot helps nobody.
    if (/^https?:/i.test(content.trim())) continue;
    const name = cleanAuthor(content, host, { strict: true });
    if (name) return name;
  }
  return null;
}

/** The DOM half of the extraction: everything after the bytes have arrived.
    Kept free of the native bridge so it runs — and is tested — anywhere a
    DOMParser exists. */
export function extractArticle(html: string, finalUrl: string): ParseResult {
  if (!html.trim()) throw new Error("That page came back empty");
  const fallbackHost = new URL(finalUrl).hostname;

  const doc = new DOMParser().parseFromString(html, "text/html");
  absolutize(doc, finalUrl);

  const article = new Readability(doc.cloneNode(true) as Document).parse();
  if (!article || !article.content) {
    throw new Error("Could not extract a readable article from that page");
  }

  const cleaned = cleanArticleEdges(article.content, doc);
  const text = cleaned.text;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const canonicalRaw = doc
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href");
  let canonicalUrl = finalUrl;
  if (canonicalRaw) {
    try {
      canonicalUrl = new URL(canonicalRaw, finalUrl).toString();
    } catch {
      /* keep finalUrl */
    }
  }

  return {
    title: article.title || fallbackHost,
    // Readability's byline is taken first but not taken on trust: it copies a
    // meta author verbatim, and a page that puts a whole sentence — or its own
    // domain — in that tag would otherwise print it in the header.
    author:
      cleanAuthor(article.byline ?? "", fallbackHost) ??
      authorFromMetadata(doc, fallbackHost),
    siteName: article.siteName || fallbackHost.replace(/^www\./, ""),
    excerpt: (article.excerpt || text.slice(0, 300)).trim().slice(0, 500),
    contentHtml: sanitize(cleaned.html, doc),
    wordCount,
    lang: doc.documentElement.getAttribute("lang") || null,
    canonicalUrl,
  };
}

export async function parseUrl(url: string): Promise<ParseResult> {
  const parsed = assertFetchable(url);

  let res: {
    data: unknown;
    status: number;
    headers?: Record<string, string>;
    url?: string;
  };
  try {
    res = await CapacitorHttp.get({
      url: parsed.toString(),
      headers: FETCH_HEADERS,
      responseType: "text",
      connectTimeout: 15000,
      readTimeout: 25000,
    });
  } catch {
    throw new Error("Could not reach that page");
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Page answered with ${res.status}`);
  }

  const finalUrl = res.url || parsed.toString();
  const contentType = headerValue(res.headers, "content-type");
  const html = typeof res.data === "string" ? res.data : String(res.data ?? "");
  if (contentType && !contentType.includes("html")) {
    throw new Error("That link is not an HTML page");
  }

  return extractArticle(html, finalUrl);
}
