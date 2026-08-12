"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  PITCHES,
  RATES,
  getServerVoicePrefs,
  getVoicePrefs,
  saveVoicePrefs,
  subscribeVoicePrefs,
  type VoicePrefs,
} from "@/lib/voice";
import VoiceLanguages from "@/components/VoiceLanguages";
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

/** How the article is read out.
 *
 *  There used to be a language picker, an engine picker and a voice picker
 *  here, three dropdowns deep, and each one asked the reader to know something
 *  about the operating system that no reader should have to know. Then there
 *  was no choice at all: one language, one automatically chosen voice, and a
 *  tick or a cross per language.
 *
 *  Now the shape follows the decision. Speed, pitch and pauses first, because
 *  they are judged by ear and apply to every language. Then the languages, and
 *  inside a language the voices **that language** has — see
 *  `components/VoiceLanguages.tsx`. The automatic choice still happens; it is
 *  the starting point rather than the only answer. */
export default function VoiceSettings({ lang = null }: { lang?: string | null }) {
  const [prefs, update] = useVoicePrefs();

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

      <VoiceLanguages only={lang} />
    </div>
  );
}
