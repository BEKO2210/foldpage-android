import type { Article, ParseResult } from "./types";

/** What a second look at the page may overwrite, and what it may not.
 *
 *  Extraction is not deterministic across time: a page behind a consent wall
 *  the first time can come back whole later, a slow page can time out halfway.
 *  So the article itself is replaceable — but everything the reader did with it
 *  is not. Tags, the star, which shelf it sits on, how far in they got and when
 *  it was saved all survive, because losing those is worse than a bad
 *  extraction. */
export function mergeRefetch(current: Article, parsed: ParseResult): Partial<Article> {
  return {
    title: parsed.title,
    author: parsed.author,
    siteName: parsed.siteName,
    excerpt: parsed.excerpt,
    contentHtml: parsed.contentHtml,
    wordCount: parsed.wordCount,
    readingMin: Math.max(1, Math.round(parsed.wordCount / 220)),
    lang: parsed.lang,
    canonicalUrl: parsed.canonicalUrl,
    // The reading position is a fraction of the article, and the article just
    // changed length — but the fraction is still the better guess of the two,
    // and it is the reader's own. Only a finished article stays finished.
    progress: current.progress,
    readAt: current.readAt,
  };
}
