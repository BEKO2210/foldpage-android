"use client";

import type { Article } from "./types";
import { findByUrl, newId, saveArticle } from "./db";
import { parseUrl } from "./parse";

export { parseUrl };

export async function addArticleFromUrl(
  url: string,
  source: Article["source"] = "manual",
  extras: Partial<Article> = {}
): Promise<{ article: Article; duplicate: boolean }> {
  const parsed = await parseUrl(url);
  const existing = await findByUrl(parsed.canonicalUrl);
  if (existing) return { article: existing, duplicate: true };

  const article: Article = {
    id: newId(),
    url,
    canonicalUrl: parsed.canonicalUrl,
    title: parsed.title,
    author: parsed.author,
    siteName: parsed.siteName,
    excerpt: parsed.excerpt,
    contentHtml: parsed.contentHtml,
    wordCount: parsed.wordCount,
    readingMin: Math.max(1, Math.round(parsed.wordCount / 220)),
    lang: parsed.lang,
    state: "inbox",
    favorite: false,
    progress: 0,
    tags: [],
    source,
    addedAt: Date.now(),
    readAt: null,
    modifiedAt: Date.now(),
    deleted: false,
    ...extras,
  };
  await saveArticle(article);
  return { article, duplicate: false };
}
