/** The languages FoldPage can be asked to read, and how to find one.
 *
 *  Kept apart from the voices on purpose. A voice belongs to a phone: it is
 *  installed, it can vanish with an update, and there may be twenty-nine of
 *  them for one language and none for the next. A *language* belongs to the
 *  article, and the reader picks it long before any voice exists — so the list
 *  has to be complete enough to choose from even when nothing is installed yet,
 *  and it must never be assembled from whatever the phone happens to carry.
 *
 *  Two names per language, both needed: the endonym is what a speaker of that
 *  language expects to see, and the English name is what somebody searching an
 *  English interface will type. Search matches either.
 *
 *  The list is the ISO 639-1 base code only. Regions (`de-AT`, `pt-BR`) are a
 *  voice's business, not a choice the reader should have to make — see
 *  `voiceKey()` in `lib/voice.ts`, which stores one choice per base language. */

export interface Language {
  /** ISO 639-1, lower case. */
  code: string;
  /** The name in English, for searching and for an English interface. */
  name: string;
  /** The name in the language itself. */
  endonym: string;
  /** Written right to left. The name and any sample need `dir="rtl"`. */
  rtl?: boolean;
}

/** Broad on purpose: a phone in Jakarta, Cairo or Warsaw should find its
 *  language in this list, not discover that FoldPage only thought about
 *  Europe. Nothing here promises a voice exists — that is asked of the phone,
 *  per language, when the reader opens it. */
export const LANGUAGES: Language[] = [
  { code: "af", name: "Afrikaans", endonym: "Afrikaans" },
  { code: "ar", name: "Arabic", endonym: "العربية", rtl: true },
  { code: "bg", name: "Bulgarian", endonym: "Български" },
  { code: "bn", name: "Bengali", endonym: "বাংলা" },
  { code: "bs", name: "Bosnian", endonym: "Bosanski" },
  { code: "ca", name: "Catalan", endonym: "Català" },
  { code: "cs", name: "Czech", endonym: "Čeština" },
  { code: "cy", name: "Welsh", endonym: "Cymraeg" },
  { code: "da", name: "Danish", endonym: "Dansk" },
  { code: "de", name: "German", endonym: "Deutsch" },
  { code: "el", name: "Greek", endonym: "Ελληνικά" },
  { code: "en", name: "English", endonym: "English" },
  { code: "es", name: "Spanish", endonym: "Español" },
  { code: "et", name: "Estonian", endonym: "Eesti" },
  { code: "eu", name: "Basque", endonym: "Euskara" },
  { code: "fa", name: "Persian", endonym: "فارسی", rtl: true },
  { code: "fi", name: "Finnish", endonym: "Suomi" },
  { code: "fil", name: "Filipino", endonym: "Filipino" },
  { code: "fr", name: "French", endonym: "Français" },
  { code: "gl", name: "Galician", endonym: "Galego" },
  { code: "gu", name: "Gujarati", endonym: "ગુજરાતી" },
  { code: "he", name: "Hebrew", endonym: "עברית", rtl: true },
  { code: "hi", name: "Hindi", endonym: "हिन्दी" },
  { code: "hr", name: "Croatian", endonym: "Hrvatski" },
  { code: "hu", name: "Hungarian", endonym: "Magyar" },
  { code: "id", name: "Indonesian", endonym: "Bahasa Indonesia" },
  { code: "is", name: "Icelandic", endonym: "Íslenska" },
  { code: "it", name: "Italian", endonym: "Italiano" },
  { code: "ja", name: "Japanese", endonym: "日本語" },
  { code: "km", name: "Khmer", endonym: "ភាសាខ្មែរ" },
  { code: "kn", name: "Kannada", endonym: "ಕನ್ನಡ" },
  { code: "ko", name: "Korean", endonym: "한국어" },
  { code: "lt", name: "Lithuanian", endonym: "Lietuvių" },
  { code: "lv", name: "Latvian", endonym: "Latviešu" },
  { code: "mk", name: "Macedonian", endonym: "Македонски" },
  { code: "ml", name: "Malayalam", endonym: "മലയാളം" },
  { code: "mr", name: "Marathi", endonym: "मराठी" },
  { code: "ms", name: "Malay", endonym: "Bahasa Melayu" },
  { code: "nb", name: "Norwegian", endonym: "Norsk" },
  { code: "ne", name: "Nepali", endonym: "नेपाली" },
  { code: "nl", name: "Dutch", endonym: "Nederlands" },
  { code: "pl", name: "Polish", endonym: "Polski" },
  { code: "pt", name: "Portuguese", endonym: "Português" },
  { code: "ro", name: "Romanian", endonym: "Română" },
  { code: "ru", name: "Russian", endonym: "Русский" },
  { code: "si", name: "Sinhala", endonym: "සිංහල" },
  { code: "sk", name: "Slovak", endonym: "Slovenčina" },
  { code: "sl", name: "Slovenian", endonym: "Slovenščina" },
  { code: "sq", name: "Albanian", endonym: "Shqip" },
  { code: "sr", name: "Serbian", endonym: "Српски" },
  { code: "sv", name: "Swedish", endonym: "Svenska" },
  { code: "sw", name: "Swahili", endonym: "Kiswahili" },
  { code: "ta", name: "Tamil", endonym: "தமிழ்" },
  { code: "te", name: "Telugu", endonym: "తెలుగు" },
  { code: "th", name: "Thai", endonym: "ไทย" },
  { code: "tr", name: "Turkish", endonym: "Türkçe" },
  { code: "uk", name: "Ukrainian", endonym: "Українська" },
  { code: "ur", name: "Urdu", endonym: "اردو", rtl: true },
  { code: "vi", name: "Vietnamese", endonym: "Tiếng Việt" },
  { code: "zh", name: "Chinese", endonym: "中文" },
];

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));

/** The base code, from anything an article or an engine might carry:
    `de_DE`, `de-AT`, `DE`, `zh-Hans-CN`. */
export function baseCode(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const base = tag.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  return base || null;
}

export function findLanguage(tag: string | null | undefined): Language | null {
  const code = baseCode(tag);
  return code ? (BY_CODE.get(code) ?? null) : null;
}

/** What to put on screen for a language.
 *
 *  The endonym leads, because a reader looking for their own language scans for
 *  the shape of their own word. The code is the last resort, and it appears
 *  upper-cased so that an unknown tag reads as a label rather than as a bug. */
export function languageLabel(tag: string | null | undefined): string {
  const language = findLanguage(tag);
  if (language) return language.endonym;
  const code = baseCode(tag);
  return code ? code.toUpperCase() : "Unknown";
}

/** The English name, for a sentence that has to read as English prose. */
export function languageName(tag: string | null | undefined): string {
  return findLanguage(tag)?.name ?? languageLabel(tag);
}

/** The language this phone is set to, if FoldPage knows it.
 *
 *  Used only where a first guess is needed and there is nothing better to go
 *  on. It is a *guess*, not a default: a fresh install has no library to read
 *  and no business assuming English — a phone set to Turkish belongs to
 *  somebody who reads Turkish.
 *
 *  The tag is passed in rather than read from `navigator` so this stays a pure
 *  function of a string, which is also the only way to test it. */
export function deviceLanguage(tag: string | null | undefined): string | null {
  return findLanguage(tag)?.code ?? null;
}

export function isRightToLeft(tag: string | null | undefined): boolean {
  return findLanguage(tag)?.rtl === true;
}

/** Accents are what a search box gets wrong: somebody typing "francais" or
    "turkce" on a keyboard without accents means Français and Türkçe. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Languages matching a query, best first.
 *
 *  Matches the English name, the endonym and the code, so "german", "deutsch"
 *  and "de" all find German. A name that *starts* with the query outranks one
 *  that merely contains it — typing "en" should offer English before Slovenian.
 *  An empty query returns the whole list, which is what an unfiltered picker
 *  wants. */
export function searchLanguages(query: string, list: Language[] = LANGUAGES): Language[] {
  const needle = fold(query);
  if (!needle) return [...list];
  const scored: { language: Language; score: number }[] = [];
  for (const language of list) {
    const fields = [fold(language.name), fold(language.endonym), language.code];
    let score = Number.POSITIVE_INFINITY;
    for (const field of fields) {
      if (field === needle) score = Math.min(score, 0);
      else if (field.startsWith(needle)) score = Math.min(score, 1);
      else if (field.includes(needle)) score = Math.min(score, 2);
    }
    if (Number.isFinite(score)) scored.push({ language, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.language.name.localeCompare(b.language.name))
    .map((entry) => entry.language);
}
