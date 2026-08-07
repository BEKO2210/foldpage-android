"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Article } from "./types";

interface FoldPageDB extends DBSchema {
  articles: {
    key: string;
    value: Article;
    indexes: { "by-state": string; "by-addedAt": number };
  };
}

let dbPromise: Promise<IDBPDatabase<FoldPageDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<FoldPageDB>("foldpage", 1, {
      upgrade(db) {
        const store = db.createObjectStore("articles", { keyPath: "id" });
        store.createIndex("by-state", "state");
        store.createIndex("by-addedAt", "addedAt");
      },
    });
  }
  return dbPromise;
}

/** Backfill fields added after the first release. */
function normalize(a: Article): Article {
  return {
    ...a,
    modifiedAt: a.modifiedAt ?? a.addedAt,
    deleted: a.deleted ?? false,
    tags: a.tags ?? [],
  };
}

export async function saveArticle(article: Article): Promise<void> {
  const db = await getDB();
  await db.put("articles", normalize(article));
}

export async function getArticle(id: string): Promise<Article | undefined> {
  const db = await getDB();
  const a = await db.get("articles", id);
  return a && !a.deleted ? normalize(a) : a ? undefined : undefined;
}

/** Soft delete: keeps a tombstone so the deletion syncs to other devices.
    Content stays locally so an Undo can restore it losslessly. */
export async function deleteArticle(id: string): Promise<void> {
  const db = await getDB();
  const a = await db.get("articles", id);
  if (!a) return;
  await db.put("articles", {
    ...normalize(a),
    deleted: true,
    modifiedAt: Date.now(),
  });
}

export async function restoreArticle(id: string): Promise<void> {
  const db = await getDB();
  const a = await db.get("articles", id);
  if (!a) return;
  await db.put("articles", { ...normalize(a), deleted: false, modifiedAt: Date.now() });
}

export async function hardDelete(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("articles", id);
}

/** All articles including tombstones — for sync. */
export async function listAllRaw(): Promise<Article[]> {
  const db = await getDB();
  return (await db.getAll("articles")).map(normalize);
}

export async function listArticles(): Promise<Article[]> {
  const all = await listAllRaw();
  return all.filter((a) => !a.deleted).sort((a, b) => b.addedAt - a.addedAt);
}

export async function findByUrl(canonicalUrl: string): Promise<Article | undefined> {
  const all = await listArticles();
  return all.find((a) => a.canonicalUrl === canonicalUrl || a.url === canonicalUrl);
}

export async function updateArticle(
  id: string,
  patch: Partial<Article>
): Promise<Article | undefined> {
  const db = await getDB();
  const current = await db.get("articles", id);
  if (!current) return undefined;
  const next = { ...normalize(current), ...patch, modifiedAt: Date.now() };
  await db.put("articles", next);
  return next;
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function allTags(): Promise<string[]> {
  const all = await listArticles();
  const tags = new Set<string>();
  all.forEach((a) => a.tags.forEach((t) => tags.add(t)));
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/** Naive full-text search over title, excerpt, siteName, tags and content. */
export async function searchArticles(query: string): Promise<Article[]> {
  const q = query.toLowerCase().trim();
  if (!q) return listArticles();
  const all = await listArticles();
  return all.filter((a) => {
    const haystack = [a.title, a.excerpt, a.siteName ?? "", a.author ?? "", a.tags.join(" ")]
      .join(" ")
      .toLowerCase();
    if (haystack.includes(q)) return true;
    return a.contentHtml.toLowerCase().includes(q);
  });
}
