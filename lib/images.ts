"use client";

import { CapacitorHttp } from "@capacitor/core";
import {
  allImageKeys,
  deleteImages,
  getArticle,
  getImage,
  hasImage,
  listAllRaw,
  putImage,
  updateArticle,
} from "./db";
import { isNative } from "./native";
import {
  LIMITS,
  markStoredImages,
  pickImageUrls,
  storedKeysIn,
} from "./imagePlan";

export { LIMITS, markStoredImages, pickImageUrls, storedKeysIn };

/** Stable name for a stored image: the SHA-256 of its URL, hex.
 *
 *  Two articles carrying the same picture land on the same key without any
 *  bookkeeping, and the key can always be recomputed from the URL that is
 *  still in the article — nothing has to be kept in step. */
export async function imageKey(url: string): Promise<string> {
  const bytes = new TextEncoder().encode(url);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: type || "application/octet-stream" });
}

/** Fetch one image as a blob.
 *
 *  Native goes through CapacitorHttp, which answers with base64 and is not
 *  subject to the CORS rules a WebView `fetch` would hit — the same reason the
 *  article itself is fetched that way. The browser build uses `fetch`, where
 *  a cross-origin refusal is simply an image that stays remote. */
async function fetchImage(url: string): Promise<Blob | null> {
  try {
    if (isNative()) {
      const response = await CapacitorHttp.get({
        url,
        responseType: "blob",
        connectTimeout: 10_000,
        readTimeout: 20_000,
      });
      if (response.status < 200 || response.status >= 300) return null;
      const type = String(
        response.headers?.["Content-Type"] ?? response.headers?.["content-type"] ?? ""
      ).split(";")[0];
      if (typeof response.data !== "string") return null;
      return base64ToBlob(response.data, type);
    }
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

export interface StoreResult {
  stored: number;
  skipped: number;
  bytes: number;
  changed: boolean;
}

/** Put an article's pictures on the phone and note in its HTML where they went.
 *
 *  Runs after the article is already saved, never as part of saving it: the
 *  reader should see the text as soon as it is extracted, not after a dozen
 *  images have been dragged over a mobile connection. Every failure here is
 *  survivable — the original `src` stays in place, so an image that could not
 *  be stored simply loads from the network as before.
 *
 *  Limits come from docs/IMAGE-STORAGE.md, where they are argued from measured
 *  sizes rather than picked. */
export async function storeImagesForArticle(id: string): Promise<StoreResult> {
  const result: StoreResult = { stored: 0, skipped: 0, bytes: 0, changed: false };
  const article = await getArticle(id);
  if (!article?.contentHtml) return result;

  const urls = pickImageUrls(article.contentHtml);
  if (!urls.length) return result;

  const keyed = new Map<string, string>();
  let budget = LIMITS.perArticleBytes;

  for (const url of urls) {
    const key = await imageKey(url);
    if (await hasImage(key)) {
      // Already on the device from another article — nothing to fetch, but the
      // reader still has to be told which key belongs to this src.
      keyed.set(url, key);
      continue;
    }
    if (budget <= 0) {
      result.skipped += 1;
      continue;
    }
    const blob = await fetchImage(url);
    if (!blob || blob.size === 0) {
      result.skipped += 1;
      continue;
    }
    if (blob.size > LIMITS.perImageBytes || blob.size > budget) {
      // An unscaled original, or the one image that would blow the article's
      // budget. Left remote rather than dropped: it still shows online.
      result.skipped += 1;
      continue;
    }
    await putImage({
      key,
      url,
      blob,
      bytes: blob.size,
      type: blob.type,
      savedAt: Date.now(),
    });
    budget -= blob.size;
    result.stored += 1;
    result.bytes += blob.size;
    keyed.set(url, key);
  }

  if (!keyed.size) return result;
  const html = markStoredImages(article.contentHtml, keyed);
  if (html !== article.contentHtml) {
    await updateArticle(id, { contentHtml: html });
    result.changed = true;
  }
  return result;
}

/** Hand the reader a URL it can put in an <img>. The object URL belongs to the
    document that made it, so the caller has to revoke it — see the reader. */
export async function objectUrlFor(key: string): Promise<string | null> {
  const image = await getImage(key);
  return image ? URL.createObjectURL(image.blob) : null;
}

/** Throw away images no article refers to any more.
 *
 *  Deliberately counted against `listAllRaw()`, which includes the tombstones
 *  of deleted articles: a deletion is undoable here, and an undo that brought
 *  back an article without its pictures would be a worse bug than a few
 *  kilobytes held too long. An image is only unreferenced once its article is
 *  really gone. */
export async function pruneImages(): Promise<{ removed: number; bytes: number }> {
  const articles = await listAllRaw();
  const referenced = new Set<string>();
  for (const article of articles) {
    if (!article.contentHtml) continue;
    for (const key of storedKeysIn(article.contentHtml)) referenced.add(key);
  }
  const keys = await allImageKeys();
  const orphans = keys.filter((key) => !referenced.has(key));
  let bytes = 0;
  for (const key of orphans) {
    const image = await getImage(key);
    bytes += image?.bytes ?? 0;
  }
  await deleteImages(orphans);
  return { removed: orphans.length, bytes };
}
