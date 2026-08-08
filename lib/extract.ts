import { Readability } from "@mozilla/readability";
import type { ParseResult } from "./types";

function sanitize(html: string, doc: Document): string {
  const container = doc.createElement("div");
  container.innerHTML = html;
  container
    .querySelectorAll("script, style, iframe, object, embed, form, link, meta")
    .forEach((el) => el.remove());
  container.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (
        name.startsWith("on") ||
        ((name === "href" || name === "src") && value.startsWith("javascript:"))
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return container.innerHTML;
}

function absolutize(doc: Document, baseUrl: string) {
  const fix = (el: Element, attr: string) => {
    const raw = el.getAttribute(attr);
    if (!raw || /^(https?:|data:|#)/i.test(raw)) return;
    try {
      el.setAttribute(attr, new URL(raw, baseUrl).toString());
    } catch {
      // Leave unparseable targets for Readability to discard.
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

/** Pure DOM extraction. This module deliberately has no Capacitor imports. */
export function extractArticle(html: string, finalUrl: string): ParseResult {
  if (!html.trim()) throw new Error("That page came back empty");
  const fallbackHost = new URL(finalUrl).hostname;
  const doc = new DOMParser().parseFromString(html, "text/html");
  absolutize(doc, finalUrl);

  const article = new Readability(doc.cloneNode(true) as Document).parse();
  if (!article || !article.content) {
    throw new Error("Could not extract a readable article from that page");
  }

  const text = article.textContent ?? "";
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const canonicalRaw = doc
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href");
  let canonicalUrl = finalUrl;
  if (canonicalRaw) {
    try {
      canonicalUrl = new URL(canonicalRaw, finalUrl).toString();
    } catch {
      // Keep the final response URL.
    }
  }

  return {
    title: article.title || fallbackHost,
    author: article.byline || null,
    siteName: article.siteName || fallbackHost.replace(/^www\./, ""),
    excerpt: (article.excerpt || text.slice(0, 300)).trim().slice(0, 500),
    contentHtml: sanitize(article.content, doc),
    wordCount,
    lang: doc.documentElement.getAttribute("lang") || null,
    canonicalUrl,
  };
}
