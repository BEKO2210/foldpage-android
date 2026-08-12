"use client";

import { FoldPageSpeech, holdAudioFocus, isNative, releaseAudioFocus } from "./native";
import {
  SPEECH_LANGUAGES,
  speechLanguage,
  spokenBlocks,
  wrapEngine,
  type SpokenBlock,
} from "./readAloud";
import {
  PITCHES,
  RATES,
  gapBefore,
  getVoicePrefs,
  sentenceGap,
  pickBestSetup,
  saveVoicePrefs,
  voiceIndexFor,
  voiceKey,
  voicesFor,
  type EngineVoice,
} from "./voice";

export { spokenBlocks, spokenMinutes, speechLanguage, wrapEngine } from "./readAloud";
export { openSpeechSettings } from "./native";
export type { SpokenBlock } from "./readAloud";

/** The plugin is loaded on demand, never at module scope.
 *
 *  It touches `window` while being evaluated, and the reader route is
 *  pre-rendered at build time where there is no window — importing it at the
 *  top of this file breaks `npm run build` outright. */
async function engine() {
  const loaded = await import("@capacitor-community/text-to-speech");
  return wrapEngine(loaded);
}

/** Reading an article out loud, one block at a time.
 *
 *  Android's own engine does the speaking — no model, no download, no gigabytes
 *  and nothing leaves the phone, which is the same bargain the rest of the app
 *  makes. The web build falls back to `speechSynthesis` so the reader can be
 *  developed in a browser; Android's WebView does not implement it, which is
 *  why the plugin exists at all.
 *
 *  The player is deliberately a plain object rather than React state: speech
 *  outlives renders, and a component that unmounts mid-sentence has to be able
 *  to stop it from a cleanup function. */
export interface SpeechState {
  playing: boolean;
  /** Index of the block being spoken, or -1. */
  at: number;
  total: number;
  error: string | null;
  /** Where the voice was when this article was last left, or -1.
   *
   *  Deliberately *not* the same field as `at`: the first version restored the
   *  remembered position into `at`, so pressing play started the voice in the
   *  middle of the article while the screen showed the top. Audio that does not
   *  match the screen is worse than no memory at all. The position is offered
   *  now, and only taken when the reader presses "Continue". */
  resumeAt: number;
}

type Listener = (state: SpeechState) => void;

/** Where the voice was, per article, so a restart does not start over.
 *
 *  In localStorage rather than IndexedDB on purpose: it is written on every
 *  block, it is worthless if it is a paragraph out of date, and it must survive
 *  a process kill that happens between two words. One key, one article — the
 *  last one that was read aloud is the only one anybody continues. */
const POSITION_KEY = "fp-speech-at";

function rememberPosition(articleId: string | null, at: number) {
  if (!articleId || typeof localStorage === "undefined") return;
  try {
    if (at <= 0) localStorage.removeItem(POSITION_KEY);
    else localStorage.setItem(POSITION_KEY, JSON.stringify({ id: articleId, at }));
  } catch {
    /* storage full: the session keeps its position anyway */
  }
}

export function rememberedPosition(articleId: string | null): number {
  if (!articleId || typeof localStorage === "undefined") return -1;
  try {
    const raw = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null");
    return raw && raw.id === articleId && Number.isInteger(raw.at) ? raw.at : -1;
  } catch {
    return -1;
  }
}

class Player {
  private blocks: SpokenBlock[] = [];
  private articleId: string | null = null;
  private title = "";
  /** True only after the reader themselves started this article.
   *
   *  The lock screen is not the only thing that can send a "play": Android's
   *  media resumption offers the last media app a play button of its own, and
   *  a stray MEDIA_BUTTON broadcast counts too. Either would make the app open
   *  and immediately start talking, which is exactly what it must never do.
   *  So a transport command may *resume* what a person began, and may never
   *  begin anything. */
  private started = false;
  /** The remembered position, kept apart from `at` on purpose — see
      SpeechState.resumeAt. */
  private resumeAt = -1;
  private lang: string | null = null;
  private at = -1;
  private playing = false;
  private token = 0;
  private error: string | null = null;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get state(): SpeechState {
    return {
      playing: this.playing,
      at: this.at,
      total: this.blocks.length,
      error: this.error,
      resumeAt: this.resumeAt,
    };
  }

  private emit() {
    const snapshot = this.state;
    this.listeners.forEach((listener) => listener(snapshot));
  }

  /** Load an article. Keeps the position if it is the same text, so leaving the
      settings sheet does not restart the article. */
  /** The article's own title, for the lock screen. */
  describe(title: string) {
    this.title = title;
  }

  load(contentHtml: string, lang: string | null, articleId: string | null = null) {
    const blocks = spokenBlocks(contentHtml);
    if (articleId !== this.articleId) this.started = false;
    const same =
      blocks.length === this.blocks.length &&
      blocks.every((block, i) => block.text === this.blocks[i]?.text);
    if (!same) {
      this.stop();
      // Where the voice was when the app was last closed. Restored as a
      // *position*, never as playback: a phone that starts talking because it
      // was unlocked is a fright, not a feature.
      const remembered = rememberedPosition(articleId);
      this.resumeAt = remembered > 0 && remembered < blocks.length ? remembered : -1;
      // Play starts at the top of the article, always. Anything else is a
      // voice reading one thing while the screen shows another.
      this.at = -1;
    }
    this.blocks = blocks;
    this.articleId = articleId;
    this.lang = speechLanguage(lang);
    this.emit();
  }

  /** True when the position came out of storage rather than out of this
      session — the reader is offered a "continue" rather than a "play". */
  get resumable(): boolean {
    return !this.playing && this.at > 0;
  }

  /** Stops the voice but keeps the article, the position and the controls.
   *
   *  The lock screen's pause used to call stop(), which released the session
   *  and cleared `started` — the notification vanished instead of flipping to
   *  a play button, and nothing outside the app could start it again. */
  pause(): void {
    this.token += 1;
    this.playing = false;
    void this.controls(false);
    void releaseAudioFocus();
    if (isNative()) {
      void engine().then(({ tts }) => tts.stop()).catch(() => {});
      void FoldPageSpeech.stop().catch(() => {});
    } else globalThis.speechSynthesis?.cancel();
    this.emit();
  }

  async toggle(): Promise<void> {
    if (this.playing) this.pause();
    else {
      this.started = true;
      await this.play();
    }
  }

  /** The reader pressing "Continue": the one way the remembered position is
      ever taken. */
  async continueFrom(): Promise<void> {
    if (this.resumeAt < 0) return;
    this.started = true;
    const from = this.resumeAt;
    this.resumeAt = -1;
    await this.play(from);
  }

  /** A play that came from outside the app — the lock screen, a headset, the
      system's media resumption. Ignored unless it continues something the
      reader started. */
  async resumeFromControls(): Promise<void> {
    if (!this.started || this.playing || !this.blocks.length) return;
    await this.play();
  }

  /** Speaks from the current position to the end.
   *
   *  Sequential rather than queued: the plugin resolves its promise when a
   *  block has finished, which is the only signal there is for "where are we".
   *  A queued batch would speak the whole article with no way to know. */
  async play(from = this.at < 0 ? 0 : this.at): Promise<void> {
    if (!this.blocks.length) return;
    const run = ++this.token;
    this.playing = true;
    this.error = null;
    this.at = from;
    this.emit();
    // Held for the whole article rather than per block: taking and giving back
    // focus between paragraphs would duck the user's music twenty times.
    await holdAudioFocus();
    void this.controls(true);

    for (let i = from; i < this.blocks.length; i++) {
      if (run !== this.token) return; // stopped, or another play() took over
      this.at = i;
      rememberPosition(this.articleId, i);
      this.emit();
      try {
        await this.speakBlock(this.blocks[i], i === from, run);
      } catch (e) {
        if (run !== this.token) return;
        this.playing = false;
        this.error =
          e instanceof Error && e.message
            ? e.message
            : "This phone could not read the article out";
        // Whatever failed, the focus and the lock-screen controls were taken by
        // this run and nobody else will give them back.
        void this.controls(false, true);
        void releaseAudioFocus();
        this.emit();
        return;
      }
    }
    if (run !== this.token) return;
    this.playing = false;
    this.at = -1;
    void this.controls(false, true);
    // Finished: nothing left to continue, so the mark goes away rather than
    // sending the next open back to the last paragraph.
    rememberPosition(this.articleId, 0);
    this.resumeAt = -1;
    void releaseAudioFocus();
    this.emit();
  }

  /** One block: a silence, then its sentences with a breath between them.
   *
   *  The silence is the whole point of doing it here rather than handing the
   *  engine one long string. Engines run a paragraph, a heading and a caption
   *  together with the same short hesitation, so an article arrives as one flat
   *  stream and a listener cannot hear where a section starts. */
  private async speakBlock(block: SpokenBlock, first: boolean, run: number) {
    const prefs = getVoicePrefs();
    await silence(gapBefore(block.kind, prefs.pace, first));
    if (run !== this.token) return;
    const between = sentenceGap(prefs.pace);
    for (let i = 0; i < block.parts.length; i++) {
      if (run !== this.token) return;
      if (i > 0) {
        await silence(between);
        if (run !== this.token) return;
      }
      await this.speakOne(block.parts[i]);
    }
  }

  private async speakOne(text: string): Promise<void> {
    if (isNative()) {
      // A block that never comes back would freeze the reader in "playing" with
      // no way out but leaving the article. Sixty seconds is longer than any
      // paragraph takes and shorter than a user's patience.
      const prefs = getVoicePrefs();
      const chosen = prefs.engines[voiceKey(this.lang)];
      if (chosen) {
        // An engine was picked for this language, so the app drives it itself
        // rather than going through the phone's default one.
        await withTimeout(
          FoldPageSpeech.speak({
            text,
            engine: chosen,
            ...(this.lang ? { lang: this.lang } : {}),
            ...(prefs.voices[voiceKey(this.lang)]
              ? { voice: prefs.voices[voiceKey(this.lang)] }
              : {}),
            rate: RATES[prefs.rate],
            pitch: PITCHES[prefs.pitch],
          }),
          60000,
          "Speaking"
        );
        return;
      }
      const voice = voiceIndexFor(await installedVoices(), this.lang, prefs);
      await withTimeout(
        (await engine()).tts.speak({
          text,
          ...(this.lang ? { lang: this.lang } : {}),
          ...(voice === undefined ? {} : { voice }),
          rate: RATES[prefs.rate],
          pitch: PITCHES[prefs.pitch],
          volume: 1,
        }),
        60000,
        "Speaking"
      );
      return;
    }
    // Browser build only.
    await new Promise<void>((resolve, reject) => {
      const synth = globalThis.speechSynthesis;
      if (!synth) {
        reject(new Error("This browser cannot read text out loud"));
        return;
      }
      const prefs = getVoicePrefs();
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.lang) utterance.lang = this.lang;
      utterance.rate = RATES[prefs.rate];
      utterance.pitch = PITCHES[prefs.pitch];
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve(); // a skipped block must not end the run
      synth.speak(utterance);
    });
  }

  /** Keeps the lock screen in step with what is audible. Failures are
      swallowed on purpose: a refused notification permission must cost the
      controls, never the article. */
  private async controls(playing: boolean, gone = false): Promise<void> {
    if (!isNative()) return;
    try {
      if (gone) await FoldPageSpeech.hideControls();
      else await FoldPageSpeech.showControls({ title: this.title, playing });
    } catch {
      /* no notification permission, or no session */
    }
  }

  stop() {
    this.token += 1;
    this.playing = false;
    this.started = false;
    void this.controls(false, true);
    void releaseAudioFocus();
    if (isNative()) {
      // Both paths, unconditionally: which one is speaking depends on a
      // setting that may have changed since this utterance started, and a stop
      // that only stops one of them is worse than no stop at all.
      void engine().then(({ tts }) => tts.stop()).catch(() => {});
      void FoldPageSpeech.stop().catch(() => {});
    } else globalThis.speechSynthesis?.cancel();
    this.emit();
  }

  /** Start at a block the reader tapped. */
  async playFrom(index: number) {
    this.stop();
    this.started = true;
    await this.play(index);
  }
}

/** One player for the app: two articles speaking at once is never wanted, and a
    single instance makes that impossible rather than unlikely. */
export const speech = new Player();

/** The lock screen, the headset button and the notification all arrive here.
 *
 *  Wired once, at module level, because the controls outlive any component: a
 *  reader who locks the phone mid-article has no mounted screen left, and the
 *  pause button on the lock screen still has to work. */
if (isNative()) {
  void FoldPageSpeech.addListener("transport", ({ action }) => {
    if (action === "play") void speech.resumeFromControls();
    else if (action === "pause") speech.pause();
    else speech.stop();
  }).catch(() => {
    /* older build without the plugin method */
  });
}

/** A pause that a stop can cut through: the loop checks its token afterwards,
    so the longest a stopped article keeps the app busy is one gap. */
function silence(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The engine's own voice list, asked once per session.
 *
 *  Once, because it is a bridge call and it is needed before *every* utterance
 *  to turn a stored voiceURI into the index the plugin wants. Asking per
 *  paragraph would put a round trip in front of each one. Installing a voice
 *  mid-article is rare enough to be worth `refreshVoices()` on the settings
 *  screen instead. */
const voiceCaches = new Map<string, Promise<EngineVoice[]>>();
let voiceCache: Promise<EngineVoice[]> | null = null;

/** The engines installed on the phone, and which one Android uses by default. */
export async function speechEngines(): Promise<{
  engines: { packageName: string; label: string }[];
  defaultEngine: string | null;
}> {
  if (!isNative()) return { engines: [], defaultEngine: null };
  try {
    return await withTimeout(FoldPageSpeech.listEngines(), 5000, "The engine list");
  } catch {
    return { engines: [], defaultEngine: null };
  }
}

/** The voices of one named engine. Cached per engine: binding to an engine
    takes about a second, and the list does not change while the app is open. */
export function voicesOfEngine(enginePackage: string): Promise<EngineVoice[]> {
  const cached = voiceCaches.get(enginePackage);
  if (cached) return cached;
  const asked = (async () => {
    try {
      const { voices } = await withTimeout(
        FoldPageSpeech.listVoices({ engine: enginePackage }),
        8000,
        "The engine"
      );
      return voices as EngineVoice[];
    } catch {
      return [];
    }
  })();
  voiceCaches.set(enginePackage, asked);
  return asked;
}

export function installedVoices(): Promise<EngineVoice[]> {
  if (!voiceCache) {
    voiceCache = (async () => {
      if (!isNative()) {
        const list = globalThis.speechSynthesis?.getVoices() ?? [];
        return list.map((voice) => ({
          name: voice.name,
          lang: voice.lang,
          voiceURI: voice.voiceURI,
          localService: voice.localService,
          default: voice.default,
        }));
      }
      try {
        const { voices } = await withTimeout(
          (await engine()).tts.getSupportedVoices(),
          5000,
          "The engine"
        );
        return voices as EngineVoice[];
      } catch {
        return []; // no list means the device default speaks, which is a voice
      }
    })();
  }
  return voiceCache;
}

export function refreshVoices(): Promise<EngineVoice[]> {
  voiceCache = null;
  voiceCaches.clear();
  return installedVoices();
}

/** The voices offered for an article's language, in the order to show them —
    and whether they can actually say it, because a list of Turkish voices for a
    German article is a fallback, not an answer. */
export async function voiceChoices(
  lang: string | null
): Promise<{ voices: EngineVoice[]; matchesLanguage: boolean }> {
  const chosen = getVoicePrefs().engines[voiceKey(lang)];
  const all = chosen && isNative() ? await voicesOfEngine(chosen) : await installedVoices();
  return voicesFor(all, speechLanguage(lang) ?? lang);
}

/** One sentence in the settings the reader just changed.
 *
 *  A speed or a pitch is not a number anybody can picture; it is a sound. The
 *  sample is a full sentence rather than a word because rate and pitch only
 *  become audible over a phrase — and it ends in a full stop so the last
 *  syllable falls the way it will in the article. */
export const VOICE_SAMPLE: Record<string, string> = {
  de: "So klingt ein Absatz aus deinem Artikel, mit dieser Stimme und diesem Tempo.",
  en: "This is how a paragraph of your article will sound, at this voice and this speed.",
  fr: "Voici comment sonnera un paragraphe de votre article, avec cette voix et à cette vitesse.",
  es: "Así sonará un párrafo de tu artículo, con esta voz y a esta velocidad.",
  it: "Ecco come suonerà un paragrafo del tuo articolo, con questa voce e a questa velocità.",
  nl: "Zo klinkt een alinea uit je artikel, met deze stem en op deze snelheid.",
  pt: "É assim que um parágrafo do seu artigo vai soar, com esta voz e a esta velocidade.",
  pl: "Tak zabrzmi akapit twojego artykułu, tym głosem i w tym tempie.",
  tr: "Makalendeki bir paragraf bu sesle ve bu hızda böyle duyulacak.",
  ru: "Так будет звучать абзац вашей статьи этим голосом и в этом темпе.",
};

/** Speaks the sample **in** the language it is written in.
 *
 *  The pair matters: a French sentence read by an English voice tells the
 *  listener nothing about the French voice, and a French voice reading English
 *  words is a party trick. So when there is no sample for a language, the
 *  preview falls back to English text *and* the English tag together, rather
 *  than sending one language's words to another language's voice. */
export function sampleFor(tag: string | null): { text: string; lang: string | null } {
  const base = (tag ?? "en").split("-")[0];
  const text = VOICE_SAMPLE[base];
  if (text) return { text, lang: tag };
  return { text: VOICE_SAMPLE.en, lang: "en-US" };
}

/** Speak the sample for a language — optionally in one particular voice.
 *
 *  `voiceURI` is what makes a *list* of voices choosable: hearing one before
 *  keeping it is the only way a person can tell them apart, and asking somebody
 *  to save a choice in order to hear it is asking them to guess. When it is
 *  left out, the voice already remembered for the language speaks, which is
 *  what the speed and pitch controls need. */
export async function previewVoice(lang: string | null, voiceURI?: string): Promise<void> {
  // A preview while an article is being read would stop the article and then
  // hand back the focus the article still needs — the reader would be left
  // with a silent play button. The article wins.
  if (speech.state.playing) speech.pause();
  const wanted = speechLanguage(lang);
  const sample = sampleFor(wanted);
  const tag = sample.lang;
  speech.stop();
  const prefs = getVoicePrefs();
  const text = sample.text;
  const remembered = prefs.voices[voiceKey(tag)];
  const useVoice = voiceURI ?? remembered;
  await holdAudioFocus();
  try {
    if (isNative()) {
      const chosen = prefs.engines[voiceKey(tag)];
      if (chosen) {
        await withTimeout(
          FoldPageSpeech.speak({
            text,
            engine: chosen,
            ...(tag ? { lang: tag } : {}),
            ...(useVoice ? { voice: useVoice } : {}),
            rate: RATES[prefs.rate],
            pitch: PITCHES[prefs.pitch],
          }),
          20000,
          "Speaking"
        );
        return;
      }
      // The plugin takes an index into its own list, so a named voice is
      // resolved the same way a remembered one is — freshly, every time.
      const all = await installedVoices();
      const named = voiceURI ? all.findIndex((entry) => entry.voiceURI === voiceURI) : -1;
      const voice = named >= 0 ? named : voiceIndexFor(all, tag, prefs);
      await withTimeout(
        (await engine()).tts.speak({
          text,
          ...(tag ? { lang: tag } : {}),
          ...(voice === undefined ? {} : { voice }),
          rate: RATES[prefs.rate],
          pitch: PITCHES[prefs.pitch],
          volume: 1,
        }),
        20000,
        "Speaking"
      );
    } else {
      const utterance = new SpeechSynthesisUtterance(text);
      if (tag) utterance.lang = tag;
      if (useVoice) {
        const match = (globalThis.speechSynthesis?.getVoices() ?? []).find(
          (entry) => entry.voiceURI === useVoice
        );
        if (match) utterance.voice = match;
      }
      utterance.rate = RATES[prefs.rate];
      utterance.pitch = PITCHES[prefs.pitch];
      globalThis.speechSynthesis?.speak(utterance);
    }
  } finally {
    void releaseAudioFocus();
  }
}

/** Android ships engines but not necessarily the voice for a language. Asking
    first means the app can say so instead of reading German in an English
    accent. */
export async function languageAvailable(lang: string | null): Promise<boolean> {
  const tag = speechLanguage(lang);
  if (!tag || !isNative()) return true;
  // An engine picked for this language answers for itself. Asking the *default*
  // engine here was wrong the moment engines became a per-language choice: the
  // reader was told no voice existed while the engine it had chosen had
  // twenty-nine of them.
  const chosen = getVoicePrefs().engines[voiceKey(tag)];
  if (chosen) {
    const { matchesLanguage } = voicesFor(await voicesOfEngine(chosen), tag);
    return matchesLanguage;
  }
  try {
    const { supported } = await (await engine()).tts.isLanguageSupported({ lang: tag });
    return supported;
  } catch {
    return true;
  }
}

/** A plugin call that never answers is the worst outcome of all: no error, no
 *  result, and a screen that says "Checking…" forever. Every call in the
 *  diagnosis is raced against the clock so a silence becomes a sentence. */
function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${what} did not answer within ${Math.round(ms / 1000)} seconds`)),
        ms
      )
    ),
  ]);
}

export interface DiagnosisStep {
  label: string;
  ok: boolean;
  detail: string;
}

/** Walk the way a word travels, step by step, and report what stops it.
 *
 *  Exists because "nothing happens" is not a fault report: the speaking runs
 *  through several parts, any of which can be missing without a word of
 *  explanation. Each step here is one of them, and the first one that fails is
 *  the answer.
 *
 *  Every line a reader sees is written as a sentence about *reading aloud*,
 *  never about the machinery: this is the one screen in the app where a person
 *  has gone looking for a fault, and even here the answer has to be usable by
 *  somebody who has never heard the word "engine". */
export async function diagnose(sampleLang: string | null): Promise<DiagnosisStep[]> {
  const steps: DiagnosisStep[] = [];
  const note = (label: string, ok: boolean, detail = "") =>
    steps.push({ label, ok, detail });
  /** An exception's own text is the last resort. It is the only place a
   *  machine word can still get through, so it is kept short and framed. */
  const because = (e: unknown) =>
    e instanceof Error && e.message ? e.message : "no reason given";

  note(
    "Reading aloud is available here",
    isNative(),
    isNative() ? "" : "this is the browser preview, which cannot speak"
  );

  let tts: Awaited<ReturnType<typeof engine>>["tts"] | null = null;
  try {
    tts = (await withTimeout(engine(), 5000, "The voice")).tts;
    note("The voice is ready", true, "");
  } catch (e) {
    note("The voice is ready", false, because(e));
    return steps;
  }

  let languages: string[] = [];
  try {
    languages = (
      await withTimeout(tts.getSupportedLanguages(), 5000, "The voice")
    ).languages;
    note(
      "The voice answered",
      languages.length > 0,
      languages.length ? `${languages.length} languages it can read` : "it knows no languages"
    );
  } catch (e) {
    note("The voice answered", false, because(e));
    return steps;
  }

  if (languages.length) {
    // Language tags are for machines. Named languages where the name is known,
    // and a count for the rest, so the line stays a sentence.
    const named = [
      ...new Set(
        languages
          .map(
            (tag) =>
              SPEECH_LANGUAGES.find((entry) => entry.code === voiceKey(tag))?.label ?? null
          )
          .filter((label): label is string => !!label)
      ),
    ];
    const rest = languages.length - named.length;
    note(
      "Languages it can read",
      true,
      named.length
        ? `${named.slice(0, 6).join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`
        : `${languages.length}`
    );
  }

  const wanted = speechLanguage(sampleLang) ?? "en-US";
  const wantedLabel =
    SPEECH_LANGUAGES.find((entry) => entry.code === voiceKey(wanted))?.label ?? "this language";
  try {
    const { supported } = await withTimeout(
      tts.isLanguageSupported({ lang: wanted }),
      5000,
      "The voice"
    );
    note(
      `A voice for ${wantedLabel}`,
      supported,
      supported ? "installed on this phone" : "not on this phone yet"
    );
  } catch (e) {
    note(`A voice for ${wantedLabel}`, false, because(e));
  }

  // The only step that proves anything: does a word actually come out. With
  // focus held, for the same reason the article needs it.
  const focus = await holdAudioFocus();
  note(
    "Sound is allowed to play",
    focus,
    focus ? "" : "another app is holding the sound, so nothing would be heard"
  );
  const started = Date.now();
  try {
    await withTimeout(
      tts.speak({ text: "FoldPage", lang: wanted, rate: 1, pitch: 1, volume: 1 }),
      15000,
      "Speaking"
    );
    const took = Date.now() - started;
    note(
      "Said a test word",
      // Returning instantly is not speaking; it is giving up quietly, which is
      // exactly the failure this whole check exists for. It was reported as a
      // success before, which made the check worse than useless.
      took >= 250,
      took < 250
        ? "it finished too fast to have said anything — turn the media volume up and try again"
        : "if you heard nothing, it is the media volume rather than the app"
    );
  } catch (e) {
    note("Said a test word", false, because(e));
  }
  void releaseAudioFocus();
  return steps;
}

/** Choose an engine and a voice for a language, without asking anybody.
 *
 *  Runs the first time an article in that language is opened, and again from
 *  the settings screen. It only ever *fills a gap*: a language the reader has
 *  already set is never overwritten, because a chosen voice outranks a
 *  measured one.
 *
 *  Returns what it settled on, so a screen can say so rather than change under
 *  the reader's hands. */
export async function autoConfigure(
  lang: string | null
): Promise<{ engine: string; voiceURI: string; label: string } | null> {
  if (!isNative()) return null;
  const key = voiceKey(speechLanguage(lang) ?? lang);
  const prefs = getVoicePrefs();
  if (prefs.engines[key]) return null;

  const { engines, defaultEngine } = await speechEngines();
  if (!engines.length) return null;
  const offers = await Promise.all(
    engines.map(async (engine) => ({
      engine: engine.packageName,
      label: engine.label,
      voices: await voicesOfEngine(engine.packageName),
    }))
  );
  const picked = pickBestSetup(offers, speechLanguage(lang) ?? lang, defaultEngine);
  if (!picked) return null;
  saveVoicePrefs({
    ...getVoicePrefs(),
    engines: { ...getVoicePrefs().engines, [key]: picked.engine },
    voices: { ...getVoicePrefs().voices, [key]: picked.voiceURI },
  });
  return {
    ...picked,
    label: offers.find((offer) => offer.engine === picked.engine)?.label ?? picked.engine,
  };
}

/** One voice offered for one language, with the machinery it happens to belong
 *  to carried alongside — never shown, only used to route the speaking. */
export interface VoiceChoice extends EngineVoice {
  /** The engine package this voice comes from. `""` in the browser preview. */
  engine: string;
}

/** Every voice on this phone that can read this language, as one list.
 *
 *  This is the whole point of the language-first screen: a phone can have two
 *  or three speech engines installed, each with its own voices, and asking a
 *  reader to know which is which is asking them to do the app's job. So all of
 *  them are asked, the answers are merged, and what comes back is simply "the
 *  voices that can read German" — best first, local only, never one giant list
 *  of every language at once.
 *
 *  Duplicates are real: two engines can carry a voice with the same identity.
 *  The first one wins, which is the better-rated one, because the list is
 *  already sorted by then. */
export async function voicesForLanguage(lang: string | null): Promise<VoiceChoice[]> {
  const tag = speechLanguage(lang) ?? lang;
  if (!isNative()) {
    const { voices, matchesLanguage } = voicesFor(await installedVoices(), tag);
    return matchesLanguage ? voices.map((voice) => ({ ...voice, engine: "" })) : [];
  }
  const { engines } = await speechEngines();
  const lists = await Promise.all(
    engines.map(async (entry) => {
      const { voices, matchesLanguage } = voicesFor(
        await voicesOfEngine(entry.packageName),
        tag
      );
      return matchesLanguage
        ? voices.map((voice) => ({ ...voice, engine: entry.packageName }))
        : [];
    })
  );
  const seen = new Set<string>();
  const merged: VoiceChoice[] = [];
  for (const voice of lists.flat()) {
    const key = `${voice.voiceURI}|${voice.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(voice);
  }
  // Android's own rating decides the order, then the name so two openings of
  // the same screen agree.
  return merged.sort(
    (a, b) => (b.quality ?? 0) - (a.quality ?? 0) || a.name.localeCompare(b.name)
  );
}

/** Keep a voice for a language: the voice the reader picked, and quietly the
 *  engine it belongs to, so the next article in that language speaks in it
 *  without anybody being asked which machinery to use. */
export function chooseVoice(lang: string | null, voice: VoiceChoice): void {
  const key = voiceKey(speechLanguage(lang) ?? lang);
  const prefs = getVoicePrefs();
  saveVoicePrefs({
    ...prefs,
    voices: { ...prefs.voices, [key]: voice.voiceURI },
    engines: voice.engine
      ? { ...prefs.engines, [key]: voice.engine }
      : prefs.engines,
  });
}

/** The languages the reader actually has articles in, most first.
 *
 *  Asked of the library rather than of the engine on purpose: a phone offers
 *  dozens of languages and a reader has two. The point of the settings screen
 *  is to set a voice for the languages that will be read, not to browse
 *  Android's catalogue.
 *
 *  Articles that never got a language (`lang: null`) are counted under the app's
 *  own language, because that is what the engine will fall back to anyway. */
export async function languagesInLibrary(): Promise<{ code: string; count: number }[]> {
  const { listArticles } = await import("./db");
  const counted = new Map<string, number>();
  for (const article of await listArticles()) {
    const code = voiceKey(speechLanguage(article.lang) ?? article.lang);
    const key = code === "default" ? "en" : code;
    counted.set(key, (counted.get(key) ?? 0) + 1);
  }
  return [...counted.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** Opens Android's own "install voice data" screen. */
export async function installVoices(): Promise<void> {
  if (!isNative()) return;
  try {
    await (await engine()).tts.openInstall();
  } catch {
    /* no engine that offers the screen */
  }
}
