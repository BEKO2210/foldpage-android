"use client";

import { useEffect, useState } from "react";
import { SPEECH_LANGUAGES } from "@/lib/readAloud";
import {
  autoConfigure,
  languagesInLibrary,
  openSpeechSettings,
  previewVoice,
  refreshVoices,
  voiceChoices,
} from "@/lib/speech";
import { getVoicePrefs, voiceKey } from "@/lib/voice";
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
  useEffect(() => {
    let alive = true;
    void languagesInLibrary().then((found) => {
      if (!alive) return;
      const device = (navigator.language || "en").split("-")[0].toLowerCase();
      const guess = found.length
        ? found.map((entry) => entry.code)
        : [...new Set([device, "en"])].filter((code) =>
            SPEECH_LANGUAGES.some((entry) => entry.code === code)
          );
      setPicked(guess.length ? guess : ["en"]);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function setUp() {
    setBusy(true);
    void tap();
    try {
      await refreshVoices();
      const found: Result[] = [];
      for (const code of picked) {
        await autoConfigure(code);
        const key = voiceKey(code);
        const chosen = getVoicePrefs().engines[key] ?? null;
        const { voices, matchesLanguage } = await voiceChoices(code);
        const wanted = getVoicePrefs().voices[key];
        const voice = voices.find((entry) => entry.voiceURI === wanted) ?? voices[0];
        found.push({
          code,
          label: SPEECH_LANGUAGES.find((entry) => entry.code === code)?.label ?? code,
          engine: chosen,
          voice: chosen && matchesLanguage ? (voice?.name ?? null) : null,
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
      {!compact && <h2 className="onboarding-title">Which languages do you read?</h2>}
      <p className="setting-note">
        FoldPage reads articles out loud with the voices on this phone. Pick the
        languages and it sets the rest up itself.
      </p>

      <div className="lang-chips" role="group" aria-label="Languages you read">
        {SPEECH_LANGUAGES.map((entry) => {
          const on = picked.includes(entry.code);
          return (
            <button
              key={entry.code}
              type="button"
              className="chip pressable"
              aria-pressed={on}
              onClick={() => {
                void tap();
                setPicked((current) =>
                  on
                    ? current.filter((code) => code !== entry.code)
                    : [...current, entry.code]
                );
                setResults(null);
              }}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <div className="voice-actions">
        <button
          type="button"
          className="btn pressable"
          onClick={() => void setUp()}
          disabled={busy || picked.length === 0}
        >
          {busy ? "Looking…" : results ? "Check again" : "Set up the voice"}
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
                  <span className="setting-note">{result.voice}</span>{" "}
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
            voice installed. Android installs them — its speech screen has the
            engine, the languages and a “Listen to an example” button. A neural
            engine installed from there (Piper, Kokoro and the like) shows up here
            by itself the next time you check.
          </p>
          <button
            type="button"
            className="btn btn-quiet pressable"
            onClick={() => void openSpeechSettings()}
          >
            Android speech settings
          </button>
        </div>
      )}
    </div>
  );
}
