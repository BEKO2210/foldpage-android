"use client";

import { ChevronRightIcon } from "./icons";
import { tap } from "@/lib/native";

/** One action in a settings card: what it is called, what it does, one line
    each. Replaces rows of equal-looking buttons that wrapped into ragged
    two-line heaps as the screen grew — and gives every action the same
    56px-tall target instead of a word-sized one. */
export default function ActionRow({
  label,
  hint,
  onClick,
  disabled,
  busy,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  /** Shown in place of the chevron while the action runs. */
  busy?: string;
}) {
  return (
    <button
      type="button"
      className="action-row pressable"
      onClick={() => {
        void tap();
        onClick();
      }}
      disabled={disabled}
    >
      <span>
        <span className="label">{label}</span>
        {hint ? <span className="hint">{hint}</span> : null}
      </span>
      <span className="go" aria-hidden="true">
        {busy ? (
          <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{busy}</span>
        ) : (
          <ChevronRightIcon />
        )}
      </span>
    </button>
  );
}
