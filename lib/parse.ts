"use client";

import { CapacitorHttp } from "@capacitor/core";
import type { ParseResult } from "./types";
import { extractArticle } from "./extract.ts";

export { extractArticle } from "./extract.ts";

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
