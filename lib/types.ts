export type ArticleState = "inbox" | "archived";

export interface Article {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  siteName: string | null;
  excerpt: string;
  contentHtml: string; // sanitized reader HTML, stored locally
  wordCount: number;
  readingMin: number;
  lang: string | null;
  state: ArticleState;
  favorite: boolean;
  progress: number; // 0..1
  tags: string[];
  source: "manual" | "import" | "share";
  addedAt: number; // epoch ms
  readAt: number | null;
  modifiedAt: number; // epoch ms, bumped on every change (sync conflict resolution)
  deleted: boolean; // soft delete, propagated by sync
}

export interface ParseResult {
  title: string;
  author: string | null;
  siteName: string | null;
  excerpt: string;
  contentHtml: string;
  wordCount: number;
  lang: string | null;
  canonicalUrl: string;
}
