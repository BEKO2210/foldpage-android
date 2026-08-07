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

/** Strip scripts/styles/handlers before the HTML is stored and later
    injected with dangerouslySetInnerHTML. */
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
      if (n.startsWith("on") || ((n === "href" || n === "src") && v.startsWith("javascript:"))) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return container.innerHTML;
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
  doc.querySelectorAll("img[src], source[src], video[src]").forEach((el) => fix(el, "src"));
  doc.querySelectorAll("img[data-src]").forEach((el) => {
    const lazy = el.getAttribute("data-src");
    if (lazy && !el.getAttribute("src")) el.setAttribute("src", lazy);
    fix(el, "src");
  });
  doc.querySelectorAll("img[srcset], source[srcset]").forEach((el) => el.removeAttribute("srcset"));
}

function headerValue(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return "";
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? String(headers[key]) : "";
}

export async function parseUrl(url: string): Promise<ParseResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Not a valid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http(s) links can be saved");
  }
  if (PRIVATE_HOST.test(parsed.hostname) || parsed.hostname.endsWith(".local")) {
    throw new Error("Refusing to fetch private addresses");
  }

  let res: { data: unknown; status: number; headers?: Record<string, string>; url?: string };
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
  if (!html.trim()) throw new Error("That page came back empty");

  const doc = new DOMParser().parseFromString(html, "text/html");
  absolutize(doc, finalUrl);

  const article = new Readability(doc.cloneNode(true) as Document).parse();
  if (!article || !article.content) {
    throw new Error("Could not extract a readable article from that page");
  }

  const text = article.textContent ?? "";
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const canonicalRaw = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
  let canonicalUrl = finalUrl;
  if (canonicalRaw) {
    try {
      canonicalUrl = new URL(canonicalRaw, finalUrl).toString();
    } catch {
      /* keep finalUrl */
    }
  }

  return {
    title: article.title || parsed.hostname,
    author: article.byline || null,
    siteName: article.siteName || parsed.hostname.replace(/^www\./, ""),
    excerpt: (article.excerpt || text.slice(0, 300)).trim().slice(0, 500),
    contentHtml: sanitize(article.content, document),
    wordCount,
    lang: doc.documentElement.getAttribute("lang") || null,
    canonicalUrl,
  };
}
