"use client";

import { useEffect, useState } from "react";
import { deviceLanguage, languageLabel, languageName } from "@/lib/languages";
import {
  autoConfigure,
  languagesInLibrary,
  openSpeechSettings,
  previewVoice,
  refreshVoices,
  voiceChoices,
} from "@/lib/speech";
import { getVoicePrefs, prettyVoiceName, voiceKey } from "@/lib/voice";
import { tap } from "@/lib/native";

/** What the app found for one language. */
interface Result {
  code: string;
  label: string;
  engine: string | null;
  voice: string | null;
}

/** Setting the voice up, without the reader having to know what a speech
 *  engine is.
 *
 *  The problem this solves is invisible until it bites: a phone has one default
 *  speech engine, and it is frequently unable to say half of what is in the
 *  library. On this device the default is a German-only neural engine — every
 *  English article was silent, with nothing on screen to explain it.
 *
 *  So the app asks which languages will be read, looks at every installed
 *  engine, and picks the best voice for each language by itself. Only when
 *  nothing on the phone can speak a language does it ask for something: one tap
 *  to Android's own speech screen, where voices are installed. */
export default function VoiceOnboarding({
  onDone,
  compact = false,
}: {
  onDone?: () => void;
  /** Inside the settings card, the heading and the closing button belong to the
      page rather than to this control. */
  compact?: boolean;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);

  // A first guess that is right most of the time: the languages already in the
  // library, and otherwise the phone's own language plus English, which is the
  // language of the app itself.
  // This runs once on purpose. `setUp` reads the codes it is handed rather than
  // state, so listing it as a dependency would only re-run the search every
  // time a result comes back — see the disable directive on the dependency
  // array below, which has to sit on that line to have any effect at all.
  useEffect(() => {
    let alive = true;
    void languagesInLibrary().then((found) => {
      if (!alive) return;
      // The library first, and the phone's own language when there is no
      // library yet. English is not added on top: this app has no default
      // language, and a reader whose phone is Turkish was being shown an
      // English row they never asked for.
      const device = deviceLanguage(navigator.language);
      const guess = found.length
        ? found.map((entry) => entry.code)
        : device
          ? [device]
          : [];
      const codes = guess;
      setPicked(codes);
      // Run it straight away. Asking "shall I look?" is a question with one
      // sensible answer, which is not a question.
      void setUp(codes);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setUp(codes: string[] = picked) {
    setBusy(true);
    try {
      await refreshVoices();
      const found: Result[] = [];
      for (const code of codes) {
        await autoConfigure(code);
        const key = voiceKey(code);
        const chosen = getVoicePrefs().engines[key] ?? null;
        const { voices, matchesLanguage } = await voiceChoices(code);
        const wanted = getVoicePrefs().voices[key];
        const voice = voices.find((entry) => entry.voiceURI === wanted) ?? voices[0];
        found.push({
          code,
          label: languageLabel(code),
          engine: chosen,
          // `matchesLanguage` alone. Requiring a chosen *engine* on top was
          // belt and braces that cost the truth in the browser build, where
          // there are no engines at all: the screen then reported "no voice"
          // even with voices right there. On a phone the two agree — an engine
          // is only chosen when it has a local voice for the language, which is
          // the same condition.
          voice: matchesLanguage ? (voice?.name ?? null) : null,
        });
      }
      setResults(found);
    } finally {
      setBusy(false);
    }
  }

  async function hear(code: string) {
    if (speaking) return;
    setSpeaking(code);
    void tap();
    try {
      await previewVoice(code);
    } catch {
      // The engine refused. The row already says whether it has a voice at
      // all, so this needs no second message.
    } finally {
      setSpeaking(null);
    }
  }

  const missing = results?.filter((result) => !result.voice) ?? [];

  return (
    <div className="voice-onboarding">
      {!compact && <h2 className="onboarding-title">The voice is ready</h2>}
      <p className="setting-note">
        FoldPage reads your articles out loud, on this phone, offline. It picks
        the best voice each language has here — you can change it later in
        Settings.
      </p>

      <div className="voice-actions">
        <button
          type="button"
          className="btn pressable"
          onClick={() => {
            void tap();
            void setUp();
          }}
          disabled={busy || picked.length === 0}
        >
          {busy ? "Looking…" : "Check again"}
        </button>
        {onDone && (
          <button type="button" className="btn btn-quiet pressable" onClick={onDone}>
            {results ? "Done" : "Skip"}
          </button>
        )}
      </div>

      {results && (
        <ul className="voice-results" aria-live="polite">
          {results.map((result) => (
            <li key={result.code}>
              {/* A mark as well as a colour: the two states have to be told
                  apart in greyscale and by a screen reader. */}
              <span aria-hidden="true" className={result.voice ? "is-ok" : "is-missing"}>
                {result.voice ? "✓" : "✗"}
              </span>{" "}
              <b>{result.label}</b>{" "}
              {result.voice ? (
                <>
                  <span className="setting-note">
                    {prettyVoiceName(result.voice, languageName(result.code))}
                  </span>{" "}
                  <button
                    type="button"
                    className="linkbtn pressable"
                    onClick={() => void hear(result.code)}
                    disabled={speaking !== null}
                  >
                    {speaking === result.code ? "Speaking…" : "Hear it"}
                  </button>
                </>
              ) : (
                <span className="setting-note">no voice on this phone yet</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {missing.length > 0 && (
        <div className="voice-missing" role="status">
          <p className="setting-note">
            {missing.map((result) => result.label).join(", ")}:{" "}
            {missing.length === 1 ? "this language has" : "these languages have"} no
            voice on this phone yet. Adding one takes a minute, and it only has
            to happen once — a voice added this way is picked up here as soon as
            you check again.
          </p>
          <button
            type="button"
            className="btn btn-quiet pressable"
            onClick={() => void openSpeechSettings()}
          >
            Add a voice
          </button>
        </div>
      )}
    </div>
  );
}
