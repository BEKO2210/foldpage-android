/** Turning an article into the words you can look it up by.
 *
 *  Pure string work, kept away from IndexedDB so it can be tested offline —
 *  the storage half lives in lib/db.ts, the wiring in lib/search.ts.
 *
 *  The search this replaces read every stored article's HTML on every
 *  keystroke. That is fine for twenty articles and not for a library that has
 *  been in use for a year; see docs/ROADMAP.md, B2. */

/** Two characters is where a term stops narrowing anything down: "in", "an"
 *  and "of" would each point at nearly every article and cost a lookup to say
 *  so. Single letters even more so. */
const MIN_TERM = 2;

/** Words are letters and digits in any script — German umlauts and accents
 *  included, which a naive \w+ would split in half. Apostrophes inside a word
 *  stay ("O'Brien"), everything else separates. */
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter(
    (word) => word.length >= MIN_TERM
  );
}

/** Strip tags without a DOM. The result is only ever fed to the tokenizer, so
 *  a stray angle bracket costs nothing — and this runs over every stored
 *  article, where building a document per article would not. */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ");
}

export interface IndexableArticle {
  title: string;
  excerpt: string;
  siteName: string | null;
  author: string | null;
  tags: string[];
  contentHtml: string;
}

/** Every distinct term an article can be found by. */
export function termsOf(article: IndexableArticle): string[] {
  const parts = [
    article.title,
    article.excerpt,
    article.siteName ?? "",
    article.author ?? "",
    article.tags.join(" "),
    textOf(article.contentHtml),
  ];
  return [...new Set(tokenize(parts.join(" ")))];
}

export interface QueryPlan {
  /** Terms that must all be present. */
  terms: string[];
  /** The last term is treated as a prefix, so results appear while typing
      rather than only once a word is finished. */
  prefix: string | null;
  /** True when the query cannot be answered from the index — then the caller
      falls back to reading the articles. */
  scanOnly: boolean;
}

/** What to look up for a typed query.
 *
 *  The index knows words. A query like "finster" matching *inside*
 *  "Sonnenfinsternis" is something only a scan can answer, and the plan says so
 *  rather than quietly returning less than the old search did. */
export function planQuery(query: string): QueryPlan {
  // Deliberately tested before trimming: the trailing space *is* the signal
  // that the word is finished, and trimming it away would make every query
  // look unfinished.
  const endsMidWord = /[\p{L}\p{N}]$/u.test(query);
  const tokens = tokenize(query);
  // A query that yields no usable token — one letter, punctuation — is not an
  // empty query: the old search would have matched it as a substring, so it is
  // handed to the scan rather than answered with nothing.
  if (!tokens.length) {
    return { terms: [], prefix: null, scanOnly: query.trim().length > 0 };
  }
  const prefix = endsMidWord ? tokens[tokens.length - 1] : null;
  const terms = prefix ? tokens.slice(0, -1) : tokens;
  return {
    terms,
    prefix,
    // One character is not enough for a prefix range to narrow anything, and a
    // query with no usable token at all (punctuation, a single letter) has to
    // be scanned.
    scanOnly: !terms.length && (!prefix || prefix.length < MIN_TERM),
  };
}
