"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LANGUAGES,
  deviceLanguage,
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
import {
  cancelPack,
  downloadPack,
  findPack,
  installedPacks,
  packIdOf,
  packSize,
  packVoiceURI,
  packsAvailable,
  packsFor,
  removePack,
  type VoicePack,
} from "@/lib/voicePacks";

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
  /** The languages the reader asked for themselves — the only ones a "Remove"
      can honestly act on. */
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [voices, setVoices] = useState<Record<string, VoiceChoice[] | "loading">>({});
  const [chosen, setChosen] = useState<Record<string, string | undefined>>({});
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [reloads, setReloads] = useState(0);
  /** Which FoldPage voices are on the phone, and what the ones being fetched
      are doing. Kept apart from the phone's own voices because they have states
      the phone's never have: offered, downloading, failed. */
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  /** What the downloaded voices take up altogether. Asked of the phone rather
      than added up from the catalogue: an unpacked voice is bigger than its
      archive, and a number that disagrees with the phone's own storage screen
      is worse than none. */
  const [installedBytes, setInstalledBytes] = useState(0);
  const [fetching, setFetching] = useState<
    Record<string, { received: number; total: number; phase: string }>
  >({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const refreshPacks = useCallback(async () => {
    const packs = await installedPacks(true);
    setInstalled(new Set(packs.map((pack) => pack.id)));
    setInstalledBytes(packs.reduce((sum, pack) => sum + pack.bytes, 0));
  }, []);

  const loadVoices = useCallback(async (code: string) => {
    setVoices((previous) => ({ ...previous, [code]: "loading" }));
    // Fill the gap before showing the list: a language nobody has set yet gets
    // the best voice this phone can read it with, so the row opens on an
    // answer rather than on a question. A choice already made is never
    // overwritten — that is `autoConfigure`'s own rule.
    await autoConfigure(code);
    const found = await voicesForLanguage(code);
    // Three rows reading "standard German voice" are not three choices; they
    // are one choice printed three times. The list arrives best-first, so the
    // first of each name is the one worth offering and the rest are noise.
    const seen = new Set<string>();
    const distinct = found.filter((voice) => {
      const label = prettyVoiceName(voice.name, languageName(code));
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
    setVoices((previous) => ({ ...previous, [code]: distinct }));
    setChosen((previous) => ({
      ...previous,
      [code]: getVoicePrefs().voices[voiceKey(code)],
    }));
    await refreshPacks();
  }, [refreshPacks]);

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
      // Nothing to show is a real answer on a fresh install. The one guess
      // worth making is the phone's own language — English was a default in an
      // app that has no default language, and it put a row in front of readers
      // who never asked for one.
      const guess = deviceLanguage(
        typeof navigator === "undefined" ? null : navigator.language
      );
      const shown = merged.length ? merged : guess ? [guess] : [];
      if (!alive) return;
      setAdded(new Set(prefs.languages));
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

  /** Keep a FoldPage voice for this language. Stored in the same place as a
      phone voice, under an id that says where it came from — nothing else in
      the app has to know packs exist. */
  function keepPack(code: string, pack: VoicePack) {
    void tap();
    const prefs = getVoicePrefs();
    saveVoicePrefs({
      ...prefs,
      voices: { ...prefs.voices, [voiceKey(code)]: packVoiceURI(pack.id) },
    });
    setChosen((previous) => ({ ...previous, [code]: packVoiceURI(pack.id) }));
  }

  async function fetchPack(code: string, pack: VoicePack) {
    void tap();
    setFailed((previous) => {
      const next = { ...previous };
      delete next[pack.id];
      return next;
    });
    setFetching((previous) => ({
      ...previous,
      [pack.id]: { received: 0, total: pack.bytes, phase: "downloading" },
    }));
    try {
      await downloadPack(pack, (progress) =>
        setFetching((previous) => ({
          ...previous,
          [pack.id]: {
            received: progress.received,
            total: progress.total || pack.bytes,
            phase: progress.phase,
          },
        }))
      );
      await refreshPacks();
      // A voice that was fetched on purpose is the one to use.
      keepPack(code, pack);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setFailed((previous) => ({
        ...previous,
        [pack.id]:
          message === "cancelled"
            ? ""
            : "That download did not finish. Check the connection and try again.",
      }));
    } finally {
      setFetching((previous) => {
        const next = { ...previous };
        delete next[pack.id];
        return next;
      });
    }
  }

  /** Hearing a downloaded voice before keeping it — the same right the phone's
      own voices have had all along. */
  async function hearPack(code: string, pack: VoicePack) {
    if (speaking) return;
    setSpeaking(packVoiceURI(pack.id));
    setProblem(null);
    try {
      await previewVoice(code, packVoiceURI(pack.id));
    } catch {
      setProblem("That voice would not speak. Turn the media volume up and try again.");
    } finally {
      setSpeaking(null);
    }
  }

  async function dropPack(code: string, pack: VoicePack) {
    void tap();
    await removePack(pack.id);
    await refreshPacks();
    if (getVoicePrefs().voices[voiceKey(code)] === packVoiceURI(pack.id)) {
      const prefs = getVoicePrefs();
      const voices = { ...prefs.voices };
      delete voices[voiceKey(code)];
      saveVoicePrefs({ ...prefs, voices });
      setChosen((previous) => ({ ...previous, [code]: undefined }));
      void loadVoices(code);
    }
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
                      {/* The row names the voice it will read with, closed or
                          open. A pack knows its own name without asking the
                          phone, so a closed row says "Thorsten" rather than the
                          placeholder "voice set" it used to show until somebody
                          opened it. */}
                      {findPack(packIdOf(chosen[code]))?.label ??
                        (current
                          ? prettyVoiceName(current.name, languageName(code))
                          : Array.isArray(list) && list.length === 0
                            ? "no voice yet"
                            : chosen[code]
                              ? "the voice this phone uses"
                              : "choose a voice")}
                    </span>
                    <span className="language-chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>

                  {expanded && (
                    <div className="language-body" id={`voices-${code}`}>
                      {list === "loading" || list === undefined ? (
                        <p className="setting-note">Asking the phone…</p>
                      ) : list.length === 0 && packsFor(code).length === 0 ? (
                        // No voice on the phone and none FoldPage can add: the
                        // phone's own installer is the only door there is.
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
                          {/* Two groups, because they are two different kinds of
                              thing: one is here and can be picked, the other has
                              to arrive first and costs twenty megabytes. An
                              undifferentiated list made the reader work that out
                              from the buttons. */}
                          {packsAvailable() && packsFor(code).length > 0 && (
                            <li className="voice-group" aria-hidden="true">
                              {packsFor(code).every((pack) => installed.has(pack.id))
                                ? "Best for this language"
                                : "Better voices you can add"}
                            </li>
                          )}
                          {packsAvailable() &&
                            packsFor(code).map((pack) => {
                              const here = installed.has(pack.id);
                              const busy = fetching[pack.id];
                              const problem = failed[pack.id];
                              return (
                                <li key={pack.id} className="voice-pack">
                                  {here ? (
                                    <>
                                      <label className="voice-pick">
                                        <input
                                          type="radio"
                                          name={`voice-${code}`}
                                          checked={packIdOf(chosen[code]) === pack.id}
                                          onChange={() => keepPack(code, pack)}
                                        />
                                        <span className="voice-name">{pack.label}</span>
                                      </label>
                                      <button
                                        type="button"
                                        className="linkbtn pressable"
                                        onClick={() => void hearPack(code, pack)}
                                        disabled={speaking !== null}
                                      >
                                        {speaking === packVoiceURI(pack.id)
                                          ? "Speaking…"
                                          : "Hear it"}
                                      </button>
                                      <button
                                        type="button"
                                        className="linkbtn pressable voice-remove"
                                        onClick={() => void dropPack(code, pack)}
                                      >
                                        Remove
                                      </button>
                                    </>
                                  ) : busy ? (
                                    <div className="voice-progress" role="status">
                                      <span className="voice-name">{pack.label}</span>
                                      <div
                                        className="fp-bar"
                                        role="progressbar"
                                        aria-label={`Downloading ${pack.label}`}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={Math.round(
                                          (busy.received / (busy.total || pack.bytes)) * 100
                                        )}
                                      >
                                        <div
                                          className="fp-bar-fill"
                                          style={{
                                            width: `${Math.min(
                                              100,
                                              Math.round(
                                                (busy.received / (busy.total || pack.bytes)) * 100
                                              )
                                            )}%`,
                                          }}
                                        />
                                      </div>
                                      <span className="setting-note">
                                        {busy.phase === "unpacking"
                                          ? "Installing…"
                                          : `${packSize(busy.received)} of ${packSize(busy.total || pack.bytes)}`}
                                      </span>
                                      <button
                                        type="button"
                                        className="linkbtn pressable"
                                        onClick={() => void cancelPack(pack.id)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="voice-offer">
                                        <span className="voice-name">{pack.label}</span>
                                        <span className="setting-note">
                                          {problem ? problem : `${packSize(pack.bytes)} download`}
                                        </span>
                                      </span>
                                      <button
                                        type="button"
                                        className="btn btn-quiet pressable"
                                        onClick={() => void fetchPack(code, pack)}
                                      >
                                        {problem ? "Try again" : "Add"}
                                      </button>
                                    </>
                                  )}
                                </li>
                              );
                            })}
                          <li className="voice-group" aria-hidden="true">
                            Already on this phone
                          </li>
                          {list.length === 0 && (
                            <li className="voice-none">
                              <span className="setting-note">
                                {packsAvailable() && packsFor(code).length > 0
                                  ? `Nothing for ${languageName(code)} — the voice above is the one to add.`
                                  : `This phone has no voice for ${languageName(code)}, and FoldPage has none to add for it yet.`}
                              </span>
                            </li>
                          )}
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
                      {/* Only a language the reader added by hand can be taken
                          away. The library's own languages come back the moment
                          the list is rebuilt, and the first guess — the phone's
                          language — was never in the stored list at all, so
                          "Remove" did nothing and said otherwise. */}
                      {!only && added.has(code) && (
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

      {/* What the downloaded voices cost, where the reader can act on it: each
          one has a Remove inside its language. A separate storage screen would
          be a second place to keep in step for no gain. */}
      {!only && installedBytes > 0 && (
        <p className="setting-note voice-total">
          Downloaded voices take up {packSize(installedBytes)} on this phone. Each
          one can be removed under its language.
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
          className="pressable language-add-open"
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
