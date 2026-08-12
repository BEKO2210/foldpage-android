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

/** What a block *is*, because it decides how it sounds.
 *
 *  A heading is not a paragraph: it needs a full stop it does not have in the
 *  markup, and a longer silence in front of it, or the voice runs the section
 *  title into the first sentence and the listener never hears that a new part
 *  began. */
export type BlockKind = "heading" | "paragraph" | "item" | "quote" | "caption";

function kindOf(tag: string): BlockKind {
  const name = tag.toLowerCase();
  if (name[0] === "h" && name.length === 2) return "heading";
  if (name === "li") return "item";
  if (name === "blockquote") return "quote";
  if (name === "figcaption") return "caption";
  return "paragraph";
}

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
    //
    // German is the trap here: „ opens and “ closes, which is the opposite of
    // English usage of the same glyph. Listing “ as an opener glued the closing
    // quote to the next word — the audit found „Rente mit 63“fordert, and an
    // engine reads that as one word.
    //
    // Three characters are left out of both lists entirely, and that is the
    // point rather than an omission: » « open in German and close in French,
    // and “ closes a German quotation while it opens an English one. The same
    // glyph therefore has no fixed side, and tightening either one is a coin
    // flip — the audit caught both being wrong, on Spiegel captions and on Ars
    // Technica paragraphs. Only „ (opens) and ” (closes) are unambiguous.
    .replace(/\s+([.,;:!?…)\]”])/g, "$1")
    .replace(/([(\[„])\s+/g, "$1")
    .trim();
}

/** Cleanups that belong to the *voice* and to nothing else.
 *
 *  None of this touches what is on screen: the same paragraph still shows its
 *  footnote markers and its full address. It is only the utterance that drops
 *  them, because they are furniture for the eye and noise for the ear. */
function forTheEar(text: string, kind: BlockKind): string {
  let spoken = text
    // Footnote and edit markers: "[1]", "[a]", "[Bearbeiten]". Read out, each
    // one becomes "bracket one bracket" in the middle of a sentence.
    .replace(/\s*\[(?:\d{1,3}|[a-z]|Bearbeiten[^\]]*|edit)\]/gi, "")
    // A bare address is spelled out character by character, for half a minute
    // if it carries a tracking tail. The host is the part a listener can use.
    .replace(/\bhttps?:\/\/(?:www\.)?([^\s/]+)\S*/gi, "$1")
    .replace(/\bwww\.([^\s/]+)\S*/gi, "$1")
    // Bullets and numbering that survived the markup are pronounced.
    .replace(/^[•·▪◦‣●○*+–—-]\s+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // A heading carries no punctuation, so the engine keeps its pitch flat and
  // walks straight into the first sentence of the section. One full stop is
  // the whole difference between a title and a run-on.
  if (kind === "heading" && spoken && !/[.!?…:;]["'»”’\]]*$/.test(spoken)) {
    spoken += ".";
  }
  return spoken;
}

/** Abbreviations that end in a full stop without ending a sentence. Splitting
 *  after them cuts "z. B." in half and gives the listener a hard stop in the
 *  middle of a clause. */
const ABBREVIATIONS =
  /(?:\b(?:z|d|u|s|o|ca|vgl|bzw|evtl|ggf|inkl|exkl|Nr|Abb|Bd|Jh|Mio|Mrd|Dr|Prof|Ing|St|Hr|Fr|Mr|Mrs|Ms|Jr|Sr|vs|etc|approx|est|Fig|No|Vol|pp|al|eg|ie)|\b[A-ZÄÖÜ])\.$/;

/** One block, cut into the utterances a voice should breathe between.
 *
 *  The block stays one block: the reader highlights whole paragraphs, and the
 *  index of a spoken block is the index of an element on screen. Only the
 *  *speaking* is finer, so a full stop becomes a real pause instead of the
 *  engine's own comma-length hesitation, and stopping mid-paragraph takes
 *  effect within a sentence rather than within a page. */
export function sentences(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (const piece of text.split(/(?<=[.!?…])\s+/)) {
    current = current ? `${current} ${piece}` : piece;
    // A number followed by a full stop is an ordinal in German ("3. Januar")
    // and a list number in English — never a sentence end on its own.
    const ordinal = /\s\d{1,4}\.$/.test(current) || /^\d{1,4}\.$/.test(current);
    if (ABBREVIATIONS.test(current) || ordinal) continue;
    parts.push(current);
    current = "";
  }
  if (current) parts.push(current);
  return parts.length ? parts : [text];
}

/** An engine reading a caption or a one-word list item sounds like a stutter;
 *  below this a block is skipped. Long enough to be a sentence fragment, short
 *  enough to keep "Yes." if somebody wrote it as a paragraph. */
const MIN_SPOKEN = 3;

export interface SpokenBlock {
  /** Index among the article's spoken blocks — and, because both walk the same
      elements in the same order, the index of the element on screen. */
  index: number;
  kind: BlockKind;
  /** The whole block as it is spoken. */
  text: string;
  /** The same text, cut into the utterances the player speaks one by one. */
  parts: string[];
}

export function spokenBlocks(contentHtml: string): SpokenBlock[] {
  const blocks: SpokenBlock[] = [];
  for (const match of contentHtml.matchAll(SPOKEN_TAGS)) {
    const kind = kindOf(match[1]);
    const plain = plainText(match[2]);
    // The threshold is checked on the plain text, never on the spoken one: the
    // reader marks the element with the same index, and it counts elements by
    // what they contain. Dropping a block here that the page still counts
    // would shift every highlight after it by one.
    if (plain.length < MIN_SPOKEN) continue;
    const text = forTheEar(plain, kind);
    blocks.push({ index: blocks.length, kind, text, parts: sentences(text) });
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

/** The languages FoldPage can name, in the order a European reader meets them.
 *  Used by the settings screen so a voice can be chosen for a language before
 *  the first article in it is saved. */
export const SPEECH_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "pt", label: "Português" },
  { code: "pl", label: "Polski" },
  { code: "tr", label: "Türkçe" },
  { code: "ru", label: "Русский" },
];

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
