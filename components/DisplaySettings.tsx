"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  TEXT_SIZES,
  getPrefs,
  getServerPrefs,
  savePrefs,
  subscribePrefs,
  type DisplayPrefs,
} from "@/lib/display";
import { tap } from "@/lib/native";

/** Reads the stored look and keeps every mounted copy of this control in step.
    Two screens offer the same settings — the reader's sheet and the settings
    page — and a change in one has to show in the other without a reload.

    `useSyncExternalStore` rather than state plus an effect: the settings live
    outside React (localStorage, plus the attributes on <html> that the
    stylesheet reads), and this is the subscription primitive built for exactly
    that. It also gives the static export a defined first render. */
export function useDisplayPrefs(): [DisplayPrefs, (patch: Partial<DisplayPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);

  const update = useCallback((patch: Partial<DisplayPrefs>) => {
    savePrefs({ ...getPrefs(), ...patch });
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

/** The whole look of the app in one control set: theme, text size, typeface,
    alignment and line spacing. Used by the reader sheet and the settings page,
    so there is one implementation and one wording for both. */
export default function DisplaySettings({ preview = true }: { preview?: boolean }) {
  const [prefs, update] = useDisplayPrefs();

  return (
    <div>
      <Segmented
        label="Theme"
        name="fp-theme"
        value={prefs.theme}
        onChange={(theme) => update({ theme })}
        options={[
          { value: "system", label: "System", hint: "Follow the phone's setting" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
      <Segmented
        label="Text size"
        name="fp-size"
        value={prefs.size}
        onChange={(size) => update({ size })}
        options={TEXT_SIZES.map((_, index) => ({
          value: index,
          label: ["XS", "S", "M", "L"][index],
          hint: `Size ${index + 1} of ${TEXT_SIZES.length}`,
        }))}
      />
      <Segmented
        label="Typeface"
        name="fp-font"
        value={prefs.font}
        onChange={(font) => update({ font })}
        options={[
          { value: "serif", label: "Serif" },
          { value: "sans", label: "Sans" },
        ]}
      />
      <Segmented
        label="Alignment"
        name="fp-align"
        value={prefs.align}
        onChange={(align) => update({ align })}
        options={[
          { value: "left", label: "Ragged right" },
          { value: "justify", label: "Justified" },
        ]}
      />
      <Segmented
        label="Line spacing"
        name="fp-leading"
        value={prefs.leading}
        onChange={(leading) => update({ leading })}
        options={[
          { value: "cozy", label: "Normal" },
          { value: "airy", label: "Airy" },
        ]}
      />
      {preview && (
        <p className="setting-preview" aria-hidden="true">
          The quick brown fox jumps over the lazy dog, and the paragraph runs on
          just long enough to show what the setting does to a real line of text.
        </p>
      )}
    </div>
  );
}
