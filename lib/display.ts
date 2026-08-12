"use client";

/** Everything about how the app and the article look, in one place.
 *
 *  The values live in localStorage and are mirrored onto <html> as data
 *  attributes, so the stylesheet does the work and no component has to pass
 *  them down. `app/layout.tsx` applies the same attributes from an inline
 *  script before the first paint — without that, every launch would flash the
 *  system theme before React could correct it. */

export type ThemeChoice = "system" | "light" | "dark";
export type AlignChoice = "left" | "justify";
export type FontChoice = "serif" | "sans";
export type LeadingChoice = "cozy" | "airy";

export interface DisplayPrefs {
  theme: ThemeChoice;
  align: AlignChoice;
  font: FontChoice;
  leading: LeadingChoice;
  /** Index into the reader's four text sizes. */
  size: number;
}

export const TEXT_SIZES = ["1rem", "1.15rem", "1.3rem", "1.5rem"];

export const DEFAULT_PREFS: DisplayPrefs = {
  theme: "system",
  align: "left",
  font: "serif",
  leading: "cozy",
  size: 1,
};

export const STORAGE_KEY = "fp-display";

/** The text size shipped before this settings object existed. Read once so
    nobody's chosen size resets when they update the app. */
const LEGACY_SIZE_KEY = "fp-reader-size";

/** Fires on <window> after any change, so a screen that is already open
    follows a setting changed on another screen. */
export const DISPLAY_EVENT = "foldpage:display";

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/** Never trust what comes back out of storage: a half-written or hand-edited
    value must not be able to put the app in a state with no way back. */
export function normalizePrefs(raw: unknown): DisplayPrefs {
  const input = (raw ?? {}) as Partial<Record<keyof DisplayPrefs, unknown>>;
  // Number(null) is 0 and Number("") is 0 — both would pass the range check
  // below and silently pick the smallest text size. Only a number, or a string
  // that actually holds one, is worth coercing.
  const size =
    typeof input.size === "number" ||
    (typeof input.size === "string" && input.size.trim() !== "")
      ? Number(input.size)
      : Number.NaN;
  return {
    theme: isOneOf(input.theme, ["system", "light", "dark"] as const)
      ? input.theme
      : DEFAULT_PREFS.theme,
    align: isOneOf(input.align, ["left", "justify"] as const)
      ? input.align
      : DEFAULT_PREFS.align,
    font: isOneOf(input.font, ["serif", "sans"] as const)
      ? input.font
      : DEFAULT_PREFS.font,
    leading: isOneOf(input.leading, ["cozy", "airy"] as const)
      ? input.leading
      : DEFAULT_PREFS.leading,
    size:
      Number.isInteger(size) && size >= 0 && size < TEXT_SIZES.length
        ? size
        : DEFAULT_PREFS.size,
  };
}

export function readPrefs(): DisplayPrefs {
  if (typeof localStorage === "undefined") return DEFAULT_PREFS;
  let stored: unknown = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    /* unparseable — fall back to the defaults below */
  }
  const prefs = normalizePrefs(stored);
  if (stored === null) {
    const legacy = Number(localStorage.getItem(LEGACY_SIZE_KEY));
    if (Number.isInteger(legacy) && legacy >= 0 && legacy < TEXT_SIZES.length) {
      prefs.size = legacy;
    }
  }
  return prefs;
}

/** Writes the attributes the stylesheet reads. Kept separate from storage so
    the pre-paint script in the layout can call the same shape. */
export function applyPrefs(prefs: DisplayPrefs): void {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.align = prefs.align;
  root.dataset.font = prefs.font;
  root.dataset.leading = prefs.leading;
  root.style.setProperty("--reader-size", TEXT_SIZES[prefs.size]);
}

/** One cached object for the whole app.
 *
 *  `useSyncExternalStore` compares snapshots by identity, so this must stay the
 *  same object until something actually changes — building a fresh one per
 *  read would spin React forever. */
let snapshot: DisplayPrefs | null = null;

export function getPrefs(): DisplayPrefs {
  if (!snapshot) snapshot = readPrefs();
  return snapshot;
}

/** The value the static export was built with. The client's first render has
    to match it, so the pre-paint script — not React — is what keeps the screen
    from flashing. */
export function getServerPrefs(): DisplayPrefs {
  return DEFAULT_PREFS;
}

export function subscribePrefs(onChange: () => void): () => void {
  window.addEventListener(DISPLAY_EVENT, onChange);
  return () => window.removeEventListener(DISPLAY_EVENT, onChange);
}

export function savePrefs(prefs: DisplayPrefs): DisplayPrefs {
  const next = normalizePrefs(prefs);
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked — the session still gets the new look */
  }
  applyPrefs(next);
  window.dispatchEvent(new CustomEvent<DisplayPrefs>(DISPLAY_EVENT, { detail: next }));
  return next;
}

/** True when the app is currently painted dark — either because the user asked
    for it or because the system did. The status bar needs this. */
export function isDarkNow(theme: ThemeChoice = readPrefs().theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
