"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  PITCHES,
  RATES,
  getServerVoicePrefs,
  getVoicePrefs,
  saveVoicePrefs,
  subscribeVoicePrefs,
  voiceKey,
  type VoicePrefs,
} from "@/lib/voice";
import {
  autoConfigure,
  languagesInLibrary,
  openSpeechSettings,
  previewVoice,
  refreshVoices,
  voiceChoices,
} from "@/lib/speech";
import { SPEECH_LANGUAGES } from "@/lib/readAloud";
import { tap } from "@/lib/native";

/** Same contract as `useDisplayPrefs`: the settings live outside React, two
    screens show them, and a change on one has to appear on the other. */
export function useVoicePrefs(): [VoicePrefs, (patch: Partial<VoicePrefs>) => void] {
  const prefs = useSyncExternalStore(
    subscribeVoicePrefs,
    getVoicePrefs,
    getServerVoicePrefs
  );
  const update = useCallback((patch: Partial<VoicePrefs>) => {
    saveVoicePrefs({ ...getVoicePrefs(), ...patch });
  }, []);
  return [prefs, update];
}

function Segmented<T extends string | number>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="setting-row">
      <span className="setting-label" id={`${name}-label`}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={`${name}-label`}>
        {options.map((option) => (
          <label key={String(option.value)} title={option.hint}>
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => {
                void tap();
                onChange(option.value);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

interface Found {
  code: string;
  label: string;
  voice: string | null;
}

/** Engines name their voices for machines: "de-DE-language",
 *  "en-us-x-sfg-local", sometimes just "de". None of that tells a reader
 *  anything, so the machine parts are dropped and what remains is either a real
 *  name or the honest answer — the phone's standard voice for that language. */
function prettyVoice(name: string, language: string): string {
  const bare = name
    .replace(/[-_](language|local|network)$/i, "")
    .replace(/^[a-z]{2,3}([-_][a-z0-9]{2,8})?[-_]x[-_]/i, "")
    .replace(/[-_]/g, " ")
    .trim();
  const looksLikeCode = /^[a-z]{2,3}( [a-z]{2,8})?$/i.test(bare);
  return looksLikeCode || !bare ? `standard ${language} voice` : bare;
}

/** How the article is read out — and that is all.
 *
 *  There used to be a language picker, an engine picker and a voice picker
 *  here, three dropdowns deep, and each one asked the reader to know something
 *  about Android that no reader should have to know. One language has one
 *  voice: the best one this phone can speak it with. The app finds it
 *  (`pickBestSetup` — every installed engine, local voices only, exact region
 *  before merely related, then Android's own quality rating) and says which one
 *  it took.
 *
 *  What is left to choose is what a person can judge by ear: how fast, how
 *  high, how much air between the sentences. */
export default function VoiceSettings({ lang = null }: { lang?: string | null }) {
  const [prefs, update] = useVoicePrefs();
  const [found, setFound] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /** The languages that will actually be read: the article's own when there is
      one, otherwise every language the library holds. Nothing to pick. */
  const look = useCallback(async () => {
    const wanted = lang
      ? [voiceKey(lang)]
      : (await languagesInLibrary()).map((entry) => entry.code);
    const codes = wanted.length ? wanted : ["en"];
    const rows: Found[] = [];
    for (const code of codes) {
      await autoConfigure(code);
      const { voices, matchesLanguage } = await voiceChoices(code);
      rows.push({
        code,
        label: SPEECH_LANGUAGES.find((entry) => entry.code === code)?.label ?? code,
        voice: matchesLanguage ? (voices[0]?.name ?? null) : null,
      });
    }
    return rows;
  }, [lang]);

  useEffect(() => {
    let alive = true;
    void look().then((rows) => {
      if (alive) setFound(rows);
    });
    return () => {
      alive = false;
    };
  }, [look]);

  async function hear(code: string) {
    if (busy) return;
    setBusy(code);
    setProblem(null);
    void tap();
    try {
      await previewVoice(code);
    } catch {
      setProblem(
        "That voice would not speak. Voices are installed on Android's own speech screen."
      );
    } finally {
      setBusy(null);
    }
  }

  const missing = (found ?? []).filter((row) => !row.voice);

  return (
    <div>
      <Segmented
        label="Speed"
        name="fp-rate"
        value={prefs.rate}
        onChange={(rate) => update({ rate })}
        options={RATES.map((rate, index) => ({
          value: index,
          label: `${rate}×`,
          hint: `Speed ${index + 1} of ${RATES.length}`,
        }))}
      />
      <Segmented
        label="Pitch"
        name="fp-pitch"
        value={prefs.pitch}
        onChange={(pitch) => update({ pitch })}
        options={PITCHES.map((_, index) => ({
          value: index,
          label: ["Low", "Normal", "High"][index],
        }))}
      />
      <Segmented
        label="Pauses"
        name="fp-pace"
        value={prefs.pace}
        onChange={(pace) => update({ pace })}
        options={[
          { value: "tight", label: "Tight", hint: "Barely a breath between paragraphs" },
          { value: "natural", label: "Natural", hint: "A breath between sentences, a longer one before a heading" },
          { value: "roomy", label: "Roomy", hint: "Time to think between paragraphs" },
        ]}
      />

      <div className="setting-row">
        <span className="setting-label">Voices</span>
        {found === null ? (
          <p className="setting-note">Asking the phone…</p>
        ) : (
          <ul className="voice-results">
            {found.map((row) => (
              <li key={row.code}>
                {/* A mark as well as a colour: both states have to survive
                    greyscale and a screen reader. */}
                <span aria-hidden="true" className={row.voice ? "is-ok" : "is-missing"}>
                  {row.voice ? "✓" : "✗"}
                </span>{" "}
                <b>{row.label}</b>{" "}
                {row.voice ? (
                  <>
                    <span className="setting-note">
                      {prettyVoice(row.voice, row.label)}
                    </span>{" "}
                    <button
                      type="button"
                      className="linkbtn pressable"
                      onClick={() => void hear(row.code)}
                      disabled={busy !== null}
                    >
                      {busy === row.code ? "Speaking…" : "Hear it"}
                    </button>
                  </>
                ) : (
                  <span className="setting-note">no voice on this phone</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {problem && (
        <p className="setting-note voice-problem" role="alert">
          {problem}
        </p>
      )}

      <div className="voice-actions">
        <button
          type="button"
          className="btn btn-quiet pressable"
          onClick={() => {
            void tap();
            setFound(null);
            void refreshVoices().then(look).then(setFound);
          }}
        >
          Look again
        </button>
        {missing.length > 0 && (
          <button
            type="button"
            className="btn pressable"
            onClick={() => void openSpeechSettings()}
          >
            Install a voice
          </button>
        )}
      </div>
    </div>
  );
}
