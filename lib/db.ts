"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Article } from "./types";

/** One image file, kept once no matter how many articles show it.
 *
 *  The key is the SHA-256 of the image URL, so two articles that carry the
 *  same picture share the stored copy without anything having to keep a
 *  mapping. `url` stays with it purely so a stored blob can be traced back to
 *  where it came from. */
export interface StoredImage {
  key: string;
  url: string;
  blob: Blob;
  bytes: number;
  type: string;
  savedAt: number;
}

interface FoldPageDB extends DBSchema {
  articles: {
    key: string;
    value: Article;
    indexes: { "by-state": string; "by-addedAt": number };
  };
  images: {
    key: string;
    value: StoredImage;
  };
  /** The word index. One record per (term, article), so adding an article is a
      run of puts and removing one is a range delete over the `by-id` index —
      no array to read, rewrite and hope nothing wrote in between. */
  postings: {
    key: [string, string];
    value: { term: string; id: string };
    indexes: { "by-id": string };
  };
}

let dbPromise: Promise<IDBPDatabase<FoldPageDB>> | null = null;

/** Every upgrade here is additive: it creates what is missing and touches no
    article, so a library written by any earlier version opens unchanged and
    simply lacks what the new store would hold — no pictures yet, no index yet.
    Both are filled in afterwards, in the background or on request. */
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<FoldPageDB>("foldpage", 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore("articles", { keyPath: "id" });
          store.createIndex("by-state", "state");
          store.createIndex("by-addedAt", "addedAt");
        }
        if (oldVersion < 2) {
          db.createObjectStore("images", { keyPath: "key" });
        }
        if (oldVersion < 3) {
          const postings = db.createObjectStore("postings", {
            keyPath: ["term", "id"],
          });
          postings.createIndex("by-id", "id");
        }
      },
    });
  }
  return dbPromise;
}

/* ---------- word index ---------- */

/** Replace everything the index knows about one article. Runs in a single
    transaction, so a search never sees an article half-indexed. */
export async function putPostings(id: string, terms: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("postings", "readwrite");
  const existing = await tx.store.index("by-id").getAllKeys(id);
  await Promise.all(existing.map((key) => tx.store.delete(key)));
  for (const term of terms) tx.store.put({ term, id });
  await tx.done;
}

export async function dropPostings(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("postings", "readwrite");
  const keys = await tx.store.index("by-id").getAllKeys(id);
  await Promise.all(keys.map((key) => tx.store.delete(key)));
  await tx.done;
}

/** Article ids carrying an exact term. */
export async function idsForTerm(term: string): Promise<Set<string>> {
  const db = await getDB();
  const keys = await db.getAllKeys(
    "postings",
    IDBKeyRange.bound([term, ""], [term, "\uffff"])
  );
  return new Set(keys.map(([, id]) => id));
}

/** Article ids carrying any term starting with `prefix` — what makes results
    appear while a word is still being typed. */
export async function idsForPrefix(prefix: string): Promise<Set<string>> {
  const db = await getDB();
  const keys = await db.getAllKeys(
    "postings",
    IDBKeyRange.bound([prefix, ""], [`${prefix}\uffff`, "\uffff"])
  );
  return new Set(keys.map(([, id]) => id));
}

/** Which articles the index has heard of. Cheap enough to ask before a search
    decides whether it can trust the index at all. */
export async function indexedIds(): Promise<Set<string>> {
  const db = await getDB();
  const ids = new Set<string>();
  let cursor = await db.transaction("postings").store.index("by-id").openKeyCursor();
  while (cursor) {
    const id = cursor.key as string;
    ids.add(id);
    // One article holds a thousand postings. Jumping past the whole run costs
    // one seek instead of a thousand steps.
    cursor = await cursor.continue(`${id}\uffff`);
  }
  return ids;
}

/* ---------- images ---------- */

export async function putImage(image: StoredImage): Promise<void> {
  const db = await getDB();
  await db.put("images", image);
}

export async function getImage(key: string): Promise<StoredImage | undefined> {
  const db = await getDB();
  return db.get("images", key);
}

export async function hasImage(key: string): Promise<boolean> {
  const db = await getDB();
  return (await db.getKey("images", key)) !== undefined;
}

export async function allImageKeys(): Promise<string[]> {
  const db = await getDB();
  return db.getAllKeys("images");
}

export async function deleteImages(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const db = await getDB();
  const tx = db.transaction("images", "readwrite");
  await Promise.all([...keys.map((key) => tx.store.delete(key)), tx.done]);
}

/** Bytes held by stored images. Read from the records rather than measured, so
    it costs one cursor instead of loading every blob into memory. */
export async function imageBytes(): Promise<{ count: number; bytes: number }> {
  const db = await getDB();
  let count = 0;
  let bytes = 0;
  let cursor = await db.transaction("images").store.openCursor();
  while (cursor) {
    count += 1;
    bytes += cursor.value.bytes ?? 0;
    cursor = await cursor.continue();
  }
  return { count, bytes };
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

/** Every article's id, newest first, without loading a single body.
 *
 *  `listArticles()` reads whole records — title, tags *and* the full stored
 *  HTML of every article. For deciding *which* articles to show, that is the
 *  expensive half of the work thrown away. */
export async function listArticleIds(): Promise<string[]> {
  const db = await getDB();
  const ids: string[] = [];
  // A *key* cursor, not a value cursor: reading `cursor.value` would load every
  // article's stored HTML, which is exactly the cost this function exists to
  // avoid. Tombstones cannot be seen from a key alone, so they are dropped when
  // the articles are actually loaded — `getArticles()` filters them.
  let cursor = await db
    .transaction("articles")
    .store.index("by-addedAt")
    .openKeyCursor(null, "prev");
  while (cursor) {
    ids.push(cursor.primaryKey);
    cursor = await cursor.continue();
  }
  return ids;
}

/** Load exactly the articles asked for, in the order given. */
export async function getArticles(ids: string[]): Promise<Article[]> {
  if (!ids.length) return [];
  const db = await getDB();
  const tx = db.transaction("articles");
  const found = await Promise.all(ids.map((id) => tx.store.get(id)));
  await tx.done;
  return found
    .filter((article): article is Article => !!article && !article.deleted)
    .map(normalize);
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

/** Where a search term was found. A hit in the body is why a card can look
    unrelated to what was typed — the list says so rather than leaving the
    reader to guess. */
export type MatchIn = "meta" | "body";

export interface SearchHit {
  article: Article;
  where: MatchIn;
}

/** Naive full-text search over title, excerpt, siteName, tags and content. */
export async function searchArticlesDetailed(query: string): Promise<SearchHit[]> {
  const q = query.toLowerCase().trim();
  const all = await listArticles();
  if (!q) return all.map((article) => ({ article, where: "meta" as const }));
  const hits: SearchHit[] = [];
  for (const article of all) {
    const meta = [
      article.title,
      article.excerpt,
      article.siteName ?? "",
      article.author ?? "",
      article.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    if (meta.includes(q)) hits.push({ article, where: "meta" });
    else if (article.contentHtml.toLowerCase().includes(q)) {
      hits.push({ article, where: "body" });
    }
  }
  return hits;
}

export async function searchArticles(query: string): Promise<Article[]> {
  return (await searchArticlesDetailed(query)).map((hit) => hit.article);
}
