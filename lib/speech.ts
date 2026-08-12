"use client";

import { holdAudioFocus, isNative, releaseAudioFocus } from "./native";
import { speechLanguage, spokenBlocks, wrapEngine, type SpokenBlock } from "./readAloud";

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
}

type Listener = (state: SpeechState) => void;

class Player {
  private blocks: SpokenBlock[] = [];
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
    };
  }

  private emit() {
    const snapshot = this.state;
    this.listeners.forEach((listener) => listener(snapshot));
  }

  /** Load an article. Keeps the position if it is the same text, so leaving the
      settings sheet does not restart the article. */
  load(contentHtml: string, lang: string | null) {
    const blocks = spokenBlocks(contentHtml);
    const same =
      blocks.length === this.blocks.length &&
      blocks.every((block, i) => block.text === this.blocks[i]?.text);
    if (!same) {
      this.stop();
      this.at = -1;
    }
    this.blocks = blocks;
    this.lang = speechLanguage(lang);
    this.emit();
  }

  async toggle(): Promise<void> {
    if (this.playing) this.stop();
    else await this.play();
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

    for (let i = from; i < this.blocks.length; i++) {
      if (run !== this.token) return; // stopped, or another play() took over
      this.at = i;
      this.emit();
      try {
        await this.speakOne(this.blocks[i].text);
      } catch (e) {
        if (run !== this.token) return;
        this.playing = false;
        this.error =
          e instanceof Error && e.message
            ? e.message
            : "This phone could not read the article out";
        this.emit();
        return;
      }
    }
    if (run !== this.token) return;
    this.playing = false;
    this.at = -1;
    void releaseAudioFocus();
    this.emit();
  }

  private async speakOne(text: string): Promise<void> {
    if (isNative()) {
      // A block that never comes back would freeze the reader in "playing" with
      // no way out but leaving the article. Sixty seconds is longer than any
      // paragraph takes and shorter than a user's patience.
      await withTimeout(
        (await engine()).tts.speak({
          text,
          ...(this.lang ? { lang: this.lang } : {}),
          rate: 1,
          pitch: 1,
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
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.lang) utterance.lang = this.lang;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve(); // a skipped block must not end the run
      synth.speak(utterance);
    });
  }

  stop() {
    this.token += 1;
    this.playing = false;
    void releaseAudioFocus();
    if (isNative()) void engine().then(({ tts }) => tts.stop()).catch(() => {});
    else globalThis.speechSynthesis?.cancel();
    this.emit();
  }

  /** Start at a block the reader tapped. */
  async playFrom(index: number) {
    this.stop();
    await this.play(index);
  }
}

/** One player for the app: two articles speaking at once is never wanted, and a
    single instance makes that impossible rather than unlikely. */
export const speech = new Player();

/** Android ships engines but not necessarily the voice for a language. Asking
    first means the app can say so instead of reading German in an English
    accent. */
export async function languageAvailable(lang: string | null): Promise<boolean> {
  const tag = speechLanguage(lang);
  if (!tag || !isNative()) return true;
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
      setTimeout(() => reject(new Error(`${what} did not answer within ${ms} ms`)), ms)
    ),
  ]);
}

export interface DiagnosisStep {
  label: string;
  ok: boolean;
  detail: string;
}

/** Ask the engine, step by step, and report what it says.
 *
 *  Exists because "nothing happens" is not a fault report: the speaking runs
 *  through a plugin, a system service and a voice pack, and any of the three
 *  can be missing without a word of explanation. Each step here is one link in
 *  that chain, and the first one that fails is the answer. */
export async function diagnose(sampleLang: string | null): Promise<DiagnosisStep[]> {
  const steps: DiagnosisStep[] = [];
  const note = (label: string, ok: boolean, detail = "") =>
    steps.push({ label, ok, detail });

  note("Running in the app", isNative(), isNative() ? "native" : "browser build");

  let tts: Awaited<ReturnType<typeof engine>>["tts"] | null = null;
  try {
    tts = (await withTimeout(engine(), 5000, "Loading the plugin")).tts;
    note("Speech plugin loaded", true, "");
  } catch (e) {
    note("Speech plugin loaded", false, e instanceof Error ? e.message : String(e));
    return steps;
  }

  let languages: string[] = [];
  try {
    languages = (
      await withTimeout(tts.getSupportedLanguages(), 5000, "The engine")
    ).languages;
    note("Engine answered", languages.length > 0, `${languages.length} languages`);
  } catch (e) {
    note("Engine answered", false, e instanceof Error ? e.message : String(e));
    return steps;
  }

  if (languages.length) {
    note("Languages the engine has", true, languages.slice(0, 6).join(", "));
  }

  const wanted = speechLanguage(sampleLang) ?? "en-US";
  try {
    const { supported } = await withTimeout(
      tts.isLanguageSupported({ lang: wanted }),
      5000,
      "The engine"
    );
    note(`Voice for ${wanted}`, supported, supported ? "installed" : "not installed");
  } catch (e) {
    note(`Voice for ${wanted}`, false, e instanceof Error ? e.message : String(e));
  }

  // The only step that proves anything: does a word actually come out. With
  // focus held, for the same reason the article needs it.
  const focus = await holdAudioFocus();
  note("Audio focus", focus, focus ? "held" : "refused — playback will be muted");
  const started = Date.now();
  try {
    await withTimeout(
      tts.speak({ text: "FoldPage", lang: wanted, rate: 1, pitch: 1, volume: 1 }),
      15000,
      "Speaking"
    );
    const took = Date.now() - started;
    note(
      "Spoke a test word",
      true,
      // An engine that returns instantly has not spoken; it has given up
      // quietly, which is exactly the failure this whole check is for.
      took < 250
        ? `returned after ${took} ms — that is not long enough to say a word, so the engine gave up quietly. Check the media volume and the engine on Android's own speech screen.`
        : `${took} ms — if you heard nothing, it is the media volume, not the app`
    );
  } catch (e) {
    note("Spoke a test word", false, e instanceof Error ? e.message : String(e));
  }
  void releaseAudioFocus();
  return steps;
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
