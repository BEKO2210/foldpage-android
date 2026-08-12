/** Turning a stored article into something that can be spoken.
 *
 *  Pure string work, so it can be tested without a phone. The speaking itself
 *  is in lib/speech.ts.
 *
 *  Chunking matters more than it looks: an engine handed twenty thousand
 *  characters gives back one opaque promise and no way to stop, resume or say
 *  where it is. Handed a paragraph at a time it can be paused between them, the
 *  reader can be shown where it is, and stopping is immediate. */

/** Blocks worth reading out, in the order they appear. */
const SPOKEN_TAGS = /<(p|h[1-6]|li|blockquote|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/gi;

/** Runs of whitespace and the entities the sanitizer leaves behind. */
function plainText(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    // A tag becomes a space, which leaves "the link ." wherever a sentence
    // ended inside one. Engines read that gap as a pause and the full stop as a
    // separate breath.
    // Straight quotes are left alone: the same character opens and closes, so
    // tightening the space in front of one is a coin flip.
    .replace(/\s+([.,;:!?…)\]»”])/g, "$1")
    .replace(/([(\[«„“])\s+/g, "$1")
    .trim();
}

/** An engine reading a caption or a one-word list item sounds like a stutter;
 *  below this a block is skipped. Long enough to be a sentence fragment, short
 *  enough to keep "Yes." if somebody wrote it as a paragraph. */
const MIN_SPOKEN = 3;

export interface SpokenBlock {
  /** Index among the article's spoken blocks. */
  index: number;
  text: string;
}

export function spokenBlocks(contentHtml: string): SpokenBlock[] {
  const blocks: SpokenBlock[] = [];
  for (const match of contentHtml.matchAll(SPOKEN_TAGS)) {
    const text = plainText(match[2]);
    if (text.length >= MIN_SPOKEN) blocks.push({ index: blocks.length, text });
  }
  return blocks;
}

/** What to read a German article in.
 *
 *  Engines want a BCP 47 tag; articles carry whatever their publisher wrote in
 *  `<html lang>`, which is often just "de". A bare language is completed with
 *  the region the engines actually ship, and anything unrecognisable is left to
 *  the device's own default rather than guessed at — a German article read in
 *  an English voice is worse than one read in the voice the user set. */
const REGION_FOR: Record<string, string> = {
  de: "de-DE",
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  it: "it-IT",
  nl: "nl-NL",
  pt: "pt-PT",
  pl: "pl-PL",
  tr: "tr-TR",
  ru: "ru-RU",
};

export function speechLanguage(lang: string | null): string | null {
  if (!lang) return null;
  const tag = lang.trim().toLowerCase().replace("_", "-");
  if (/^[a-z]{2,3}-[a-z0-9]{2,8}$/.test(tag)) {
    // Already regional: hand it back in the casing engines expect.
    const [base, region] = tag.split("-");
    return `${base}-${region.toUpperCase()}`;
  }
  return REGION_FOR[tag] ?? null;
}

/** How long the article takes to read out, for the button's own label. Speech
    engines land near 150 words a minute at rate 1 — slower than the 220 the
    reading time uses, because that one is for eyes. */
export function spokenMinutes(blocks: SpokenBlock[]): number {
  const words = blocks.reduce(
    (sum, block) => sum + block.text.split(/\s+/).filter(Boolean).length,
    0
  );
  return Math.max(1, Math.round(words / 150));
}

/** What `registerPlugin()` returns is a Proxy: every property access becomes a
 *  call across the bridge. That includes `.then`.
 *
 *  Returning it from an `async` function is therefore a trap with no bottom.
 *  Resolving a promise with a value makes the runtime ask that value for
 *  `.then`; the proxy answers with a *plugin method* of that name, the call
 *  goes to the native side, nothing answers it — and the `await` never
 *  returns. On the device this showed up as a check that said "Checking…" for
 *  ever and a reader that stayed silent with no error anywhere.
 *
 *  Handing it over inside a plain object costs one property access and makes
 *  the whole class of mistake impossible. Exported so a test can hold the
 *  behaviour still. */
export async function wrapEngine<T>(module: { TextToSpeech: T }): Promise<{ tts: T }> {
  return { tts: module.TextToSpeech };
}
