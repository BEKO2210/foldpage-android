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
  type EngineVoice,
  type VoicePrefs,
} from "@/lib/voice";
import {
  previewVoice,
  refreshVoices,
  speech,
  speechEngines,
  voiceChoices,
} from "@/lib/speech";
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

/** The engine's own name, so the default one is named rather than implied. */
function labelOf(
  engines: { packageName: string; label: string }[],
  packageName: string
): string {
  return engines.find((engine) => engine.packageName === packageName)?.label ?? packageName;
}

/** Speed, pitch, breathing room and the voice itself.
 *
 *  Speed and pitch are segmented rather than sliders on purpose: a slider on a
 *  phone is a drag with no announced value, while these are six and three
 *  exclusive choices that a screen reader can read out as "3 of 6". The voice
 *  is the one place a dropdown is right — a phone can carry two dozen of them
 *  and the names are long.
 *
 *  `lang` is the article being read, so the list offers the voices that can
 *  actually say it and the sample is spoken in that language. Without one (the
 *  settings screen), the device's own languages are offered and the sample is
 *  English, which is the language of the app. */
export default function VoiceSettings({ lang = null }: { lang?: string | null }) {
  const [prefs, update] = useVoicePrefs();
  const [voices, setVoices] = useState<EngineVoice[] | null>(null);
  /** False when the list shown is a fallback: the engine has voices, but none
      of them for this article's language. */
  const [matches, setMatches] = useState(true);
  const [busy, setBusy] = useState(false);
  const [engines, setEngines] = useState<{ packageName: string; label: string }[]>([]);
  const [defaultEngine, setDefaultEngine] = useState<string | null>(null);
  const key = voiceKey(lang);
  const chosenEngine = prefs.engines[key] ?? "";

  useEffect(() => {
    let alive = true;
    void speechEngines().then((found) => {
      if (!alive) return;
      setEngines(found.engines);
      setDefaultEngine(found.defaultEngine);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void voiceChoices(lang).then((list) => {
      if (!alive) return;
      setVoices(list.voices);
      setMatches(list.matchesLanguage);
    });
    return () => {
      alive = false;
    };
  }, [lang, chosenEngine]);

  async function hear() {
    if (busy) return;
    setBusy(true);
    void tap();
    try {
      await previewVoice(lang);
    } finally {
      setBusy(false);
    }
  }

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
        <label className="setting-label" htmlFor="fp-engine">
          Engine{lang ? ` for ${lang}` : ""}
        </label>
        <select
          id="fp-engine"
          className="voice-select"
          value={prefs.engines[key] ?? ""}
          onChange={(e) => {
            void tap();
            const next = { ...prefs.engines };
            if (e.target.value) next[key] = e.target.value;
            else delete next[key];
            // The voice belongs to the engine that was left behind, so it goes
            // with it: keeping it would send a name to an engine that has never
            // heard of it, and that engine answers with its default without
            // saying so.
            const voices = { ...prefs.voices };
            delete voices[key];
            // Cleared here rather than in the effect that reloads them: an
            // effect that writes state on every run is a render loop waiting to
            // happen, and this is a thing the reader just did.
            setVoices(null);
            update({ engines: next, voices });
          }}
        >
          <option value="">
            Android&apos;s own choice{defaultEngine ? ` (${labelOf(engines, defaultEngine)})` : ""}
          </option>
          {engines.map((engine) => (
            <option key={engine.packageName} value={engine.packageName}>
              {engine.label}
            </option>
          ))}
        </select>
        <p className="setting-note">
          A phone has one default engine and a library has several languages.
          Picking one here applies to {lang ? `articles in ${lang}` : "this language"} only.
        </p>
      </div>
      <div className="setting-row">
        <label className="setting-label" htmlFor="fp-voice">
          Voice{lang ? ` for this article (${lang})` : ""}
        </label>
        <select
          id="fp-voice"
          className="voice-select"
          value={prefs.voices[key] ?? ""}
          onChange={(e) => {
            void tap();
            const next = { ...prefs.voices };
            if (e.target.value) next[key] = e.target.value;
            else delete next[key];
            update({ voices: next });
          }}
        >
          <option value="">The phone&apos;s own choice</option>
          {(voices ?? []).map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} · {voice.lang}
            </option>
          ))}
        </select>
        <p className="setting-note">
          {voices === null
            ? "Asking the engine…"
            : voices.length === 0
              ? "This phone reported no installed voices; the engine's default will read."
              : matches
                ? `${voices.length} installed ${voices.length === 1 ? "voice" : "voices"} for this language, offline.`
                : // The engine has voices, but none that can say this article.
                  // Saying which language is missing is the difference between
                  // a fault and an errand: it is fixed in Android's own speech
                  // screen, not here.
                  `No installed voice speaks ${lang}. These ${voices.length} can read other languages — add one for ${lang} in Android's speech settings.`}
        </p>
      </div>
      <div className="voice-actions">
        <button type="button" className="btn pressable" onClick={() => void hear()} disabled={busy}>
          {busy ? "Speaking…" : "Hear it"}
        </button>
        <button
          type="button"
          className="btn btn-quiet pressable"
          onClick={() => {
            void tap();
            speech.stop();
            setVoices(null);
            void refreshVoices().then(() =>
              voiceChoices(lang).then((list) => {
                setVoices(list.voices);
                setMatches(list.matchesLanguage);
              })
            );
          }}
        >
          Look again
        </button>
      </div>
    </div>
  );
}
