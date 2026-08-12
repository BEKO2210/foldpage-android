"use client";

import type { Article } from "./types";
import {
  dropPostings,
  getArticles,
  idsForPrefix,
  idsForTerm,
  indexedIds,
  listArticleIds,
  listArticles,
  putPostings,
  searchArticlesDetailed,
  type SearchHit,
} from "./db";
import { planQuery, termsOf } from "./searchIndex";

export { dropPostings };

/** Put one article into the word index. Called after it is saved and after a
    reload replaces its text — the same background moment the pictures use. */
export async function indexArticle(article: Article): Promise<number> {
  const terms = termsOf(article);
  await putPostings(article.id, terms);
  return terms.length;
}

/** Articles the index has never seen: everything saved before there was one.
    Cheap to ask, because it compares two lists of ids rather than reading
    anything an article holds. */
export async function articlesMissingFromIndex(): Promise<Article[]> {
  const [articles, known] = await Promise.all([listArticles(), indexedIds()]);
  return articles.filter((article) => !known.has(article.id));
}

export async function buildIndex(
  onProgress?: (done: number, total: number) => void,
  shouldStop?: () => boolean
): Promise<{ articles: number; terms: number; stopped: boolean }> {
  const pending = await articlesMissingFromIndex();
  let terms = 0;
  let done = 0;
  for (const article of pending) {
    if (shouldStop?.()) return { articles: done, terms, stopped: true };
    terms += await indexArticle(article);
    done += 1;
    onProgress?.(done, pending.length);
  }
  return { articles: done, terms, stopped: false };
}

/** Search, through the index where it can and by reading otherwise.
 *
 *  The index knows whole words. A query that ends mid-word is answered by a
 *  prefix range, which is what makes results appear while typing. What it
 *  cannot answer is a fragment from the *middle* of a word — the old search
 *  could, because it read every article — so those fall back to the scan
 *  rather than silently returning less. Articles the index has not seen yet
 *  are scanned too, so a library from before the index still finds everything.
 */
export async function search(query: string): Promise<SearchHit[]> {
  const plan = planQuery(query);
  if (!query.trim()) return searchArticlesDetailed("");
  if (plan.scanOnly) return searchArticlesDetailed(query);

  // Ids first, bodies later: this is the difference between a search that
  // costs the whole library and one that costs its answer. `listArticleIds()`
  // walks an index; loading happens only for what actually matched.
  const [known, allIds] = await Promise.all([indexedIds(), listArticleIds()]);
  const unindexed = allIds.filter((id) => !known.has(id));

  let matches: Set<string> | null = null;
  for (const term of plan.terms) {
    const ids = await idsForTerm(term);
    matches = intersect(matches, ids);
    if (matches.size === 0) break;
  }
  if (plan.prefix && (matches === null || matches.size > 0)) {
    matches = intersect(matches, await idsForPrefix(plan.prefix));
  }

  const matchedIds = allIds.filter((id) => matches?.has(id));
  const hits: SearchHit[] = (await getArticles(matchedIds)).map((article) => ({
    article,
    where: matchedInMeta(article, query) ? "meta" : "body",
  }));

  if (unindexed.length) {
    // Everything the index cannot vouch for is read the old way — but only the
    // articles it has never seen, not the whole library.
    const seen = new Set(hits.map((hit) => hit.article.id));
    const scanned = await scan(await getArticles(unindexed), query);
    hits.push(...scanned.filter((hit) => !seen.has(hit.article.id)));
  }
  return hits.sort((a, b) => b.article.addedAt - a.article.addedAt);
}

function intersect(current: Set<string> | null, next: Set<string>): Set<string> {
  if (current === null) return next;
  const both = new Set<string>();
  for (const id of next) if (current.has(id)) both.add(id);
  return both;
}

function metaOf(article: Article): string {
  return [
    article.title,
    article.excerpt,
    article.siteName ?? "",
    article.author ?? "",
    article.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function matchedInMeta(article: Article, query: string): boolean {
  const needle = query.toLowerCase().trim();
  if (metaOf(article).includes(needle)) return true;
  // A multi-word query rarely appears verbatim in the metadata; if every word
  // is in there, the card still shows the reader why it matched.
  return planQuery(query).terms.every((term) => metaOf(article).includes(term));
}

async function scan(articles: Article[], query: string): Promise<SearchHit[]> {
  const needle = query.toLowerCase().trim();
  const hits: SearchHit[] = [];
  for (const article of articles) {
    if (metaOf(article).includes(needle)) hits.push({ article, where: "meta" });
    else if (article.contentHtml.toLowerCase().includes(needle)) {
      hits.push({ article, where: "body" });
    }
  }
  return hits;
}
