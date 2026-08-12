import assert from "node:assert/strict";
import test from "node:test";
import type { Article, ParseResult } from "./types.ts";

const saved: Article = {
  id: "keep-me",
  url: "https://example.test/artikel",
  canonicalUrl: "https://example.test/artikel",
  title: "Behind a consent wall",
  author: null,
  siteName: "example.test",
  excerpt: "Cookies zustimmen …",
  contentHtml: "<p>Cookies zustimmen</p>",
  wordCount: 29,
  readingMin: 1,
  lang: null,
  state: "archived",
  favorite: true,
  progress: 0.42,
  tags: ["werkstatt", "lesen"],
  source: "share",
  addedAt: 1_700_000_000_000,
  readAt: null,
  modifiedAt: 1_700_000_000_000,
  deleted: false,
};

const fresh: ParseResult = {
  title: "The article, this time in full",
  author: "B. Aslani",
  siteName: "Example",
  excerpt: "The real opening paragraph.",
  contentHtml: "<p>The real opening paragraph, and a great deal more.</p>",
  wordCount: 1100,
  lang: "en",
  canonicalUrl: "https://example.test/artikel?full=1",
};

test("mergeRefetch takes the new extraction and leaves the reader's own state alone", async () => {
  const { mergeRefetch } = await import("./refetch.ts");
  const patch = mergeRefetch(saved, fresh);

  // Replaced: everything that describes the page itself.
  assert.equal(patch.title, fresh.title);
  assert.equal(patch.author, fresh.author);
  assert.equal(patch.contentHtml, fresh.contentHtml);
  assert.equal(patch.wordCount, 1100);
  assert.equal(patch.readingMin, 5, "1100 words at 220 wpm");
  assert.equal(patch.lang, "en");
  assert.equal(patch.canonicalUrl, fresh.canonicalUrl);

  // Untouched: everything the reader did with it. A patch that does not name a
  // field cannot overwrite it, so the absent keys are as important as the ones
  // above — id, tags, favorite, state, source and addedAt must not appear.
  assert.equal(patch.progress, saved.progress);
  assert.equal(patch.readAt, saved.readAt);
  for (const key of ["id", "tags", "favorite", "state", "source", "addedAt", "deleted"]) {
    assert.equal(key in patch, false, `${key} must not be part of the patch`);
  }
});
