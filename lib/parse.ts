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

/** Strip scripts/styles/handlers before the HTML is stored and later
    injected with dangerouslySetInnerHTML.

    `doc` must be an inert document (DOMParser output). Building this in the
    live WebView document would fetch every <img> and fire its onerror
    handler while the attributes are still on the element — i.e. run the
    page's script before we get to remove it. */
function sanitize(html: string, doc: Document): string {
  const container = doc.createElement("div");
  container.innerHTML = html;
  container
    .querySelectorAll("script, style, iframe, object, embed, form, link, meta")
    .forEach((el) => el.remove());
  container.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const n = attr.name.toLowerCase();
      const v = attr.value.trim().toLowerCase();
      if (
        n.startsWith("on") ||
        ((n === "href" || n === "src") && v.startsWith("javascript:"))
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
  prepareTables(container, doc);
  prepareImages(container, doc);
  return container.innerHTML;
}

function positiveDimension(image: HTMLImageElement, name: "width" | "height") {
  const value = Number.parseFloat(image.getAttribute(name) ?? "");
  return Number.isFinite(value) && value > 0 ? value : null;
}

function captionCandidate(image: HTMLImageElement): HTMLParagraphElement | null {
  const block =
    image.parentElement?.tagName === "P" &&
    !compactText(image.parentElement) &&
    image.parentElement.querySelectorAll("img").length === 1
      ? image.parentElement
      : image;
  const next = block.nextElementSibling;
  if (next?.tagName !== "P") return null;
  const value = compactText(next);
  if (!value || value.length >= 200) return null;
  return /^(foto|bild|quelle):/i.test(value) || !/[.!?]$/.test(value)
    ? (next as HTMLParagraphElement)
    : null;
}

/** Normalize article media before it is stored. Declared dimensions reserve
    the correct box; dimensionless images get a stable neutral ratio. */
function prepareImages(container: HTMLElement, doc: Document) {
  container.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    const source = [...doc.querySelectorAll<HTMLImageElement>("img")].find(
      (candidate) => candidate.getAttribute("src") === image.getAttribute("src")
    );
    const width =
      positiveDimension(image, "width") ??
      (source ? positiveDimension(source, "width") : null);
    const height =
      positiveDimension(image, "height") ??
      (source ? positiveDimension(source, "height") : null);
    if ((width !== null && width < 100) || (height !== null && height < 100)) {
      const emptyParent = image.parentElement;
      image.remove();
      if (emptyParent?.tagName === "P" && !compactText(emptyParent)) {
        emptyParent.remove();
      }
      return;
    }

    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
    image.classList.add("reader-image");
    if (width !== null && height !== null) {
      image.style.aspectRatio = `${width} / ${height}`;
    } else {
      image.style.aspectRatio = "16 / 9";
      image.classList.add("reader-image-fluid");
    }

    if (image.closest("figure")) return;
    const caption = captionCandidate(image);
    if (!caption) return;
    const imageBlock =
      image.parentElement?.tagName === "P" && !compactText(image.parentElement)
        ? image.parentElement
        : image;
    const figure = doc.createElement("figure");
    imageBlock.before(figure);
    figure.append(image);
    imageBlock.remove();
    const figcaption = doc.createElement("figcaption");
    figcaption.innerHTML = caption.innerHTML;
    figure.append(figcaption);
    caption.remove();
  });
}

const NUMERIC_CELL =
  /^[+\-−]?\s*\d[\d\s.,'’]*(?:\s*(?:%|‰|°|[kmcµnp]?m|[km]?g|[km]?l|[km]?w|[km]?wh|hz|[km]?bit|[kmgt]?b|[km]?bps|[a-z]{1,4}\/h|[€$£¥]))?$/i;

/** Give tables a stable scrolling parent while keeping their native layout.
    The class on numeric cells lets CSS align values without guessing from
    column position. */
function prepareTables(container: HTMLElement, doc: Document) {
  container.querySelectorAll("table").forEach((table) => {
    if (!table.parentElement?.classList.contains("tablewrap")) {
      const wrapper = doc.createElement("div");
      wrapper.className = "tablewrap";
      table.before(wrapper);
      wrapper.append(table);
    }

    table.querySelectorAll("th, td").forEach((cell) => {
      if (NUMERIC_CELL.test(cell.textContent?.trim() ?? "")) {
        cell.classList.add("numeric");
      }
    });
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

const EDGE_FURNITURE =
  /^(pfadnavigation|benachrichtigungpfeil nach links|ki-news ohne hype|als bevorzugte quelle auf google hinzufügen|zum hauptinhalt springen$|source code:|startseite$|anzeige$|top-artikel$|cookies? (zustimmen|akzeptieren)|besuchen sie golem\.de|um der nutzung von golem\.de|die zustimmung in einem iframe|der zustimmungs-dialog konnte nicht|die möglichkeit zum widerruf|… oder golem pur bestellen|mit golem pur ab|informationen auf einem gerät speichern|personalisierte anzeigen und inhalte|diesen artikel weiterlesen mit)/i;

const EDGE_WRAPPERS = new Set(["DIV", "SECTION", "ARTICLE", "MAIN"]);
const EDGE_MEDIA = "img, picture, video, audio, canvas";

function compactText(el: Element): string {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
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
    (broad && value.length > 0 && value.length < 40 && !hasMedia)
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
    author: article.byline || null,
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
