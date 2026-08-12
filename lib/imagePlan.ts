/** Deciding *which* pictures are worth keeping, and writing the decision into
 *  the article's HTML. Pure DOM work: no database, no native bridge, so it can
 *  be tested offline — the fetching and storing lives in lib/images.ts.
 *
 *  The limits are not taste. They come from measuring the frozen corpus; the
 *  numbers and the reasoning are in docs/IMAGE-STORAGE.md. In short: the median
 *  article costs 56 KB, and a single listicle whose teaser images Readability
 *  adopts costs 5.4 MB. These three values catch that one case and leave every
 *  normal article untouched. */
export const LIMITS = {
  /** Above this, it is an unscaled original rather than an article picture. */
  perImageBytes: 2 * 1024 * 1024,
  /** Four times the 90th percentile of a measured article. */
  perArticleBytes: 4 * 1024 * 1024,
  /** Wikipedia's heaviest article holds 42; the teaser flood holds 301. */
  perArticleCount: 40,
};

/** The attribute that ties an <img> to its stored copy. The `src` deliberately
    stays the original URL: it is the provenance, and the fallback for anything
    that could not be stored. */
export const IMAGE_KEY_ATTR = "data-fp-img";

function container(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString("<div></div>", "text/html");
  const div = doc.querySelector("div") as HTMLElement;
  div.innerHTML = html;
  return div;
}

/** Every remote image the reader would show, in document order, without
    duplicates and capped at the per-article count. */
export function pickImageUrls(html: string): string[] {
  const images = [...container(html).querySelectorAll("img[src]")];
  const urls = images
    .map((img) => img.getAttribute("src") ?? "")
    .filter((src) => /^https?:/i.test(src));
  return [...new Set(urls)].slice(0, LIMITS.perArticleCount);
}

/** Note the storage key on every image whose URL was kept. Images that are not
    in the map are left exactly as they are. */
export function markStoredImages(
  html: string,
  keys: Map<string, string>
): string {
  const root = container(html);
  let touched = false;
  root.querySelectorAll("img[src]").forEach((img) => {
    const key = keys.get(img.getAttribute("src") ?? "");
    if (!key || img.getAttribute(IMAGE_KEY_ATTR) === key) return;
    img.setAttribute(IMAGE_KEY_ATTR, key);
    touched = true;
  });
  return touched ? root.innerHTML : html;
}

/** The keys an article refers to — what its stored images are, and therefore
    what may be thrown away once the article is gone. */
export function storedKeysIn(html: string): string[] {
  return [...container(html).querySelectorAll(`img[${IMAGE_KEY_ATTR}]`)]
    .map((img) => img.getAttribute(IMAGE_KEY_ATTR) ?? "")
    .filter(Boolean);
}
