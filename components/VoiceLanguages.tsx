"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LANGUAGES,
  isRightToLeft,
  languageLabel,
  languageName,
  searchLanguages,
} from "@/lib/languages";
import { getVoicePrefs, prettyVoiceName, saveVoicePrefs, voiceKey } from "@/lib/voice";
import {
  autoConfigure,
  chooseVoice,
  installVoices,
  languagesInLibrary,
  previewVoice,
  refreshVoices,
  voicesForLanguage,
  type VoiceChoice,
} from "@/lib/speech";
import { tap } from "@/lib/native";

/** Language first, then the voices that language actually has.
 *
 *  The screen this replaces put every language in one flat list with a tick or
 *  a cross and a single button that led out of the app. It answered "is there a
 *  voice?" and nothing else — not which voice, not what it sounds like, not
 *  what to do when there are five.
 *
 *  The order here is the order of the decision: a reader picks a language,
 *  because that is the thing they know, and then hears the voices **for that
 *  language only**. Voices for other languages are never in the list — not
 *  greyed out, not at the bottom. Which speech engine a voice belongs to is
 *  never mentioned: it is stored with the choice and used to route the
 *  speaking, and that is the app's business.
 *
 *  A language with no voice on this phone is a sentence, not a dead end. */
export default function VoiceLanguages({ only = null }: { only?: string | null }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [inLibrary, setInLibrary] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [voices, setVoices] = useState<Record<string, VoiceChoice[] | "loading">>({});
  const [chosen, setChosen] = useState<Record<string, string | undefined>>({});
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [reloads, setReloads] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadVoices = useCallback(async (code: string) => {
    setVoices((previous) => ({ ...previous, [code]: "loading" }));
    // Fill the gap before showing the list: a language nobody has set yet gets
    // the best voice this phone can read it with, so the row opens on an
    // answer rather than on a question. A choice already made is never
    // overwritten — that is `autoConfigure`'s own rule.
    await autoConfigure(code);
    const found = await voicesForLanguage(code);
    setVoices((previous) => ({ ...previous, [code]: found }));
    setChosen((previous) => ({
      ...previous,
      [code]: getVoicePrefs().voices[voiceKey(code)],
    }));
  }, []);

  /** The languages worth a row: the ones the library holds, plus the ones the
      reader asked for on purpose. Nothing else — a phone speaks dozens and a
      person reads two.

      `reloads` is what a language being added or removed bumps, so the list is
      rebuilt from the stored preferences in one place instead of being patched
      by hand in three. */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const prefs = getVoicePrefs();
      // Inside the reader, the article's own language is the only one that can
      // be heard right now, so it is the only one offered — and it opens on
      // the voices rather than on a row to tap.
      const library = only ? [] : (await languagesInLibrary()).map((entry) => entry.code);
      const merged = only
        ? [voiceKey(only)]
        : [...new Set([...library, ...prefs.languages])];
      const shown = merged.length ? merged : ["en"];
      if (!alive) return;
      setInLibrary(new Set(library));
      setCodes(shown);
      setChosen(
        Object.fromEntries(shown.map((code) => [code, prefs.voices[voiceKey(code)]]))
      );
      if (only && shown[0]) {
        setOpen(shown[0]);
        void loadVoices(shown[0]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [only, reloads, loadVoices]);

  function toggle(code: string) {
    void tap();
    setProblem(null);
    if (open === code) {
      setOpen(null);
      return;
    }
    setOpen(code);
    if (!voices[code]) void loadVoices(code);
  }

  function keep(code: string, voice: VoiceChoice) {
    void tap();
    chooseVoice(code, voice);
    setChosen((previous) => ({ ...previous, [code]: voice.voiceURI }));
  }

  async function hear(code: string, voice: VoiceChoice) {
    if (speaking) return;
    setSpeaking(voice.voiceURI);
    setProblem(null);
    try {
      await previewVoice(code, voice.voiceURI);
    } catch {
      setProblem(
        "That voice would not speak. Turn the media volume up and try again."
      );
    } finally {
      setSpeaking(null);
    }
  }

  function addLanguage(code: string) {
    void tap();
    const prefs = getVoicePrefs();
    saveVoicePrefs({ ...prefs, languages: [...prefs.languages, code] });
    setAdding(false);
    setQuery("");
    setReloads((n) => n + 1);
    setOpen(code);
    void loadVoices(code);
  }

  function removeLanguage(code: string) {
    void tap();
    const prefs = getVoicePrefs();
    saveVoicePrefs({
      ...prefs,
      languages: prefs.languages.filter((entry) => entry !== code),
    });
    if (open === code) setOpen(null);
    setReloads((n) => n + 1);
  }

  const results = useMemo(() => {
    const already = new Set(codes ?? []);
    return searchLanguages(
      query,
      LANGUAGES.filter((language) => !already.has(language.code))
    ).slice(0, 8);
  }, [query, codes]);

  return (
    <div className="voice-languages">
      <div className="setting-row">
        <span className="setting-label" id="fp-languages-label">
          Languages
        </span>
        {codes === null ? (
          <p className="setting-note">Looking at your library…</p>
        ) : (
          <ul className="language-list" aria-labelledby="fp-languages-label">
            {codes.map((code) => {
              const list = voices[code];
              const current =
                Array.isArray(list) && chosen[code]
                  ? list.find((voice) => voice.voiceURI === chosen[code])
                  : undefined;
              const expanded = open === code;
              return (
                <li key={code} className="language-row">
                  <button
                    type="button"
                    className="language-head pressable"
                    aria-expanded={expanded}
                    aria-controls={`voices-${code}`}
                    onClick={() => toggle(code)}
                  >
                    <span className="language-name" lang={code}>
                      {languageLabel(code)}
                    </span>
                    <span className="language-voice">
                      {current
                        ? prettyVoiceName(current.name, languageName(code))
                        : Array.isArray(list) && list.length === 0
                          ? "no voice yet"
                          : chosen[code]
                            ? "voice set"
                            : "choose a voice"}
                    </span>
                    <span className="language-chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>

                  {expanded && (
                    <div className="language-body" id={`voices-${code}`}>
                      {list === "loading" || list === undefined ? (
                        <p className="setting-note">Asking the phone…</p>
                      ) : list.length === 0 ? (
                        <div className="voice-none">
                          <p className="setting-note">
                            No voice for {languageName(code)} on this phone yet.
                          </p>
                          <div className="voice-actions">
                            <button
                              type="button"
                              className="btn pressable"
                              onClick={() => void installVoices()}
                            >
                              Get a voice
                            </button>
                            <button
                              type="button"
                              className="btn btn-quiet pressable"
                              onClick={() => {
                                void tap();
                                void refreshVoices().then(() => loadVoices(code));
                              }}
                            >
                              Look again
                            </button>
                          </div>
                        </div>
                      ) : (
                        <ul
                          className="voice-choices"
                          role="radiogroup"
                          aria-label={`Voices for ${languageName(code)}`}
                        >
                          {list.map((voice) => (
                            <li key={`${voice.engine}|${voice.voiceURI}`}>
                              <label className="voice-pick">
                                <input
                                  type="radio"
                                  name={`voice-${code}`}
                                  checked={chosen[code] === voice.voiceURI}
                                  onChange={() => keep(code, voice)}
                                />
                                <span
                                  className="voice-name"
                                  lang={code}
                                  dir={isRightToLeft(code) ? "rtl" : undefined}
                                >
                                  {prettyVoiceName(voice.name, languageName(code))}
                                </span>
                              </label>
                              <button
                                type="button"
                                className="linkbtn pressable"
                                onClick={() => void hear(code, voice)}
                                disabled={speaking !== null}
                              >
                                {speaking === voice.voiceURI ? "Speaking…" : "Hear it"}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!only && !inLibrary.has(code) && (
                        <button
                          type="button"
                          className="linkbtn pressable language-remove"
                          onClick={() => removeLanguage(code)}
                        >
                          Remove {languageName(code)}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {problem && (
        <p className="setting-note voice-problem" role="alert">
          {problem}
        </p>
      )}

      {only ? null : adding ? (
        <div className="language-add">
          {/* Sixty languages is a list nobody scrolls. The search matches the
              English name, the name in the language itself and the code, so
              "german", "deutsch" and "de" all arrive in the same place. */}
          <label className="sr-only" htmlFor="fp-language-search">
            Search languages
          </label>
          <input
            id="fp-language-search"
            ref={searchRef}
            type="search"
            className="language-search"
            placeholder="Search languages…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setAdding(false);
                setQuery("");
              }
            }}
            autoComplete="off"
          />
          {results.length === 0 ? (
            <p className="setting-note">No language by that name.</p>
          ) : (
            <ul className="language-results">
              {results.map((language) => (
                <li key={language.code}>
                  <button
                    type="button"
                    className="language-result pressable"
                    onClick={() => addLanguage(language.code)}
                  >
                    <span lang={language.code} dir={language.rtl ? "rtl" : undefined}>
                      {language.endonym}
                    </span>
                    {language.endonym !== language.name && (
                      <span className="setting-note"> {language.name}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn btn-quiet pressable"
            onClick={() => {
              setAdding(false);
              setQuery("");
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="linkbtn pressable language-add-open"
          onClick={() => {
            void tap();
            setAdding(true);
            // The field is the only reason this opened; landing anywhere else
            // would mean a second tap to start typing.
            window.setTimeout(() => searchRef.current?.focus(), 0);
          }}
        >
          Add a language
        </button>
      )}
    </div>
  );
}
