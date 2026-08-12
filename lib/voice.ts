"use client";

/** How the article is read out: speed, pitch, the length of the breaths, and
 *  which installed voice does the reading.
 *
 *  Stored the same way the display settings are — one JSON object in
 *  localStorage, one event, one repair function for whatever comes back out.
 *  Kept apart from `lib/display.ts` on purpose: that file is read by an inline
 *  script before the first paint and mirrored onto <html> for the stylesheet.
 *  None of that applies here, and the voice must never be able to delay a
 *  paint.
 *
 *  The chosen voice is remembered **per language**, not once for the app. A
 *  reader with German and English articles wants Thorsten for the one and an
 *  English voice for the other; one global choice would read every second
 *  article in the wrong accent. */

export const RATES = [0.7, 0.85, 1, 1.15, 1.35, 1.6] as const;
export const PITCHES = [0.85, 1, 1.15] as const;

/** How much of the base pause between blocks is actually taken. Silence is
    part of speech: without it a heading, a paragraph and a caption arrive as
    one flat stream. */
export type PaceChoice = "tight" | "natural" | "roomy";

export const PACE_FACTOR: Record<PaceChoice, number> = {
  tight: 0.4,
  natural: 1,
  roomy: 1.8,
};

/** Milliseconds of silence *before* a block, at pace "natural".
 *
 *  These are what the app *adds*, and the numbers come off the device rather
 *  than out of taste. Measured on the S23 Ultra with the neural engine
 *  (sherpa-onnx/Piper), logcat timestamps between one utterance ending and the
 *  next one being audible: the engine itself already leaves 0.2–1.5 s, because
 *  it synthesises the whole utterance before playing a sound and that takes
 *  about 7 % of the length it is about to speak.
 *
 *  The first version added 350 ms before every paragraph on top of that, which
 *  measured 1.8 s of silence between two paragraphs — a pause long enough to
 *  sound like a fault. Halved, and the shape kept: a section title still gets
 *  clearly more air than the next paragraph of the same section, list items
 *  clearly less, because that difference is what tells a listener where they
 *  are without looking. */
export const GAP_BEFORE: Record<string, number> = {
  heading: 450,
  paragraph: 180,
  item: 100,
  quote: 300,
  caption: 300,
};

/** The gap between two sentences inside one paragraph. Shorter than any block
 *  gap: it is a breath, not a break.
 *
 *  Splitting a paragraph into sentences costs nothing on top, which was worth
 *  measuring before doing it: the engine's delay grows with the length of the
 *  utterance, so three sentences pay three small delays instead of one large
 *  one. What changes is where the silence lands — at the full stops, where a
 *  person breathes — and that the first words arrive sooner. */
export const SENTENCE_GAP = 120;

export interface VoicePrefs {
  /** Index into RATES. */
  rate: number;
  /** Index into PITCHES. */
  pitch: number;
  pace: PaceChoice;
  /** BCP 47 tag → the `voiceURI` of the chosen voice. */
  voices: Record<string, string>;
  /** Language → the speech engine package that reads it.
   *
   *  The reason this exists at all: a phone has one default engine, and a
   *  library has more than one language. On Belkis' S23 the neural German
   *  engine carries a single German voice and cannot say a word of English,
   *  while Google's engine speaks both and sounds ten years older. Whichever
   *  one is made the system default, half the library gets the worse deal —
   *  unless the choice is made per language, which is what this is. */
  engines: Record<string, string>;
}

export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  rate: 2,
  pitch: 1,
  pace: "natural",
  voices: {},
  engines: {},
};

export const VOICE_STORAGE_KEY = "fp-voice";
export const VOICE_EVENT = "foldpage:voice";

export function normalizeVoicePrefs(raw: unknown): VoicePrefs {
  const input = (raw ?? {}) as Partial<Record<keyof VoicePrefs, unknown>>;
  const index = (value: unknown, length: number, fallback: number) => {
    const n = typeof value === "number" ? value : Number.NaN;
    return Number.isInteger(n) && n >= 0 && n < length ? n : fallback;
  };
  // A hand-edited or half-written entry must not be able to make every article
  // silent, so anything that is not a pair of strings is dropped rather than
  // passed to the engine.
  const stringMap = (raw: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (raw && typeof raw === "object") {
      for (const [key, value] of Object.entries(raw as object)) {
        if (typeof key === "string" && typeof value === "string" && value) {
          out[key] = value;
        }
      }
    }
    return out;
  };
  return {
    rate: index(input.rate, RATES.length, DEFAULT_VOICE_PREFS.rate),
    pitch: index(input.pitch, PITCHES.length, DEFAULT_VOICE_PREFS.pitch),
    pace:
      input.pace === "tight" || input.pace === "natural" || input.pace === "roomy"
        ? input.pace
        : DEFAULT_VOICE_PREFS.pace,
    voices: stringMap(input.voices),
    engines: stringMap(input.engines),
  };
}

export function readVoicePrefs(): VoicePrefs {
  if (typeof localStorage === "undefined") return DEFAULT_VOICE_PREFS;
  try {
    return normalizeVoicePrefs(
      JSON.parse(localStorage.getItem(VOICE_STORAGE_KEY) ?? "null")
    );
  } catch {
    return DEFAULT_VOICE_PREFS;
  }
}

let snapshot: VoicePrefs | null = null;

export function getVoicePrefs(): VoicePrefs {
  if (!snapshot) snapshot = readVoicePrefs();
  return snapshot;
}

/** The static export is built without a browser, so the first render has to be
    the defaults — same contract as the display settings. */
export function getServerVoicePrefs(): VoicePrefs {
  return DEFAULT_VOICE_PREFS;
}

export function subscribeVoicePrefs(onChange: () => void): () => void {
  window.addEventListener(VOICE_EVENT, onChange);
  return () => window.removeEventListener(VOICE_EVENT, onChange);
}

export function saveVoicePrefs(prefs: VoicePrefs): VoicePrefs {
  const next = normalizeVoicePrefs(prefs);
  snapshot = next;
  try {
    localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — the session still gets the new voice */
  }
  window.dispatchEvent(new CustomEvent<VoicePrefs>(VOICE_EVENT, { detail: next }));
  return next;
}

/** Silence before a block, in milliseconds. */
export function gapBefore(kind: string, pace: PaceChoice, first: boolean): number {
  if (first) return 0; // nobody waits before the first word
  return Math.round((GAP_BEFORE[kind] ?? GAP_BEFORE.paragraph) * PACE_FACTOR[pace]);
}

export function sentenceGap(pace: PaceChoice): number {
  return Math.round(SENTENCE_GAP * PACE_FACTOR[pace]);
}

export interface EngineVoice {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
  default: boolean;
  /** Android's own rating of the voice, 100 to 500. Absent on the web build. */
  quality?: number;
}

/** Best first.
 *
 *  Google's engine offers twenty-nine English voices on this phone and they are
 *  not equally good — the list comes back in an order that means nothing to a
 *  listener. Android rates them itself (`Voice.getQuality()`), so that rating
 *  decides, and the name breaks the tie to keep the order stable between two
 *  openings of the same screen. */
function byQuality(a: EngineVoice, b: EngineVoice): number {
  const quality = (b.quality ?? 0) - (a.quality ?? 0);
  return quality !== 0 ? quality : a.name.localeCompare(b.name);
}

/** The voices worth offering for an article in `lang`.
 *
 *  Android hands back every voice of every installed engine, several dozen on a
 *  Samsung — including remote ones that need the network, which is the one
 *  thing this app never does. So: the language first, local voices only, and
 *  the exact tag before the merely related one (an article in `de-AT` still
 *  gets the German voices, because a German voice is closer than the English
 *  default). */
export function voicesFor(
  all: EngineVoice[],
  lang: string | null
): { voices: EngineVoice[]; matchesLanguage: boolean } {
  const base = (tag: string) => tag.toLowerCase().replace("_", "-").split("-")[0];
  const local = all
    .filter((voice) => voice.localService !== false && voice.voiceURI)
    .sort(byQuality);
  if (!lang) return { voices: local, matchesLanguage: true };
  const wanted = base(lang);
  const matching = local.filter((voice) => base(voice.lang) === wanted);
  // Falling back to the whole list rather than to nothing, but saying so: the
  // reader may still want to pick something, and "no voice for this language"
  // is a sentence the screen has to be able to write.
  return matching.length
    ? { voices: matching, matchesLanguage: true }
    : { voices: local, matchesLanguage: false };
}

/** Which entry of `all` the engine should be told to use.
 *
 *  The plugin takes an **index into its own list**, not a name — so the stored
 *  choice is the `voiceURI` and the index is resolved fresh every time. An
 *  engine that was updated, or a voice that was uninstalled, then means "no
 *  index" and the device default speaks, instead of an arbitrary other voice
 *  saying the article in Turkish. */
export function voiceIndexFor(
  all: EngineVoice[],
  lang: string | null,
  prefs: VoicePrefs
): number | undefined {
  const key = voiceKey(lang);
  const wanted = prefs.voices[key];
  if (!wanted) return undefined;
  const index = all.findIndex((voice) => voice.voiceURI === wanted);
  return index >= 0 ? index : undefined;
}

/** One stored choice per language, not per region: a reader who picks a voice
    while reading a `de-DE` article means it for the `de-AT` one too. */
export function voiceKey(lang: string | null): string {
  if (!lang) return "default";
  return lang.toLowerCase().replace("_", "-").split("-")[0];
}
