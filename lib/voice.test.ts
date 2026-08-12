import assert from "node:assert/strict";
import test from "node:test";

const load = () => import("./voice.ts");

test("what comes back out of storage is never trusted", async () => {
  const { normalizeVoicePrefs, DEFAULT_VOICE_PREFS, RATES } = await load();

  assert.deepEqual(normalizeVoicePrefs(null), DEFAULT_VOICE_PREFS);
  assert.deepEqual(normalizeVoicePrefs("nonsense"), DEFAULT_VOICE_PREFS);
  // Out of range, wrong type, negative: each of these would otherwise reach the
  // engine as rate `undefined` or `NaN` and make the article silent.
  assert.equal(normalizeVoicePrefs({ rate: RATES.length }).rate, DEFAULT_VOICE_PREFS.rate);
  assert.equal(normalizeVoicePrefs({ rate: -1 }).rate, DEFAULT_VOICE_PREFS.rate);
  assert.equal(normalizeVoicePrefs({ rate: "2" }).rate, DEFAULT_VOICE_PREFS.rate);
  assert.equal(normalizeVoicePrefs({ pitch: 1.5 }).pitch, DEFAULT_VOICE_PREFS.pitch);
  assert.equal(normalizeVoicePrefs({ pace: "sprint" }).pace, "natural");
  assert.equal(normalizeVoicePrefs({ rate: 4 }).rate, 4);

  // A half-written voice map must not be able to hand the engine an object.
  assert.deepEqual(
    normalizeVoicePrefs({ voices: { de: "de-x", en: 7, fr: "" } }).voices,
    { de: "de-x" }
  );
  assert.deepEqual(normalizeVoicePrefs({ voices: "de" }).voices, {});
});

test("silence is part of speech, and the pace scales it", async () => {
  const { gapBefore, sentenceGap, GAP_BEFORE } = await load();

  // Nobody waits before the first word of an article.
  assert.equal(gapBefore("heading", "natural", true), 0);
  assert.equal(gapBefore("heading", "natural", false), GAP_BEFORE.heading);
  // A section title gets more air than the next paragraph of the same section.
  assert.ok(gapBefore("heading", "natural", false) > gapBefore("paragraph", "natural", false));
  // And a list runs faster than prose, because the listener knows it is a list.
  assert.ok(gapBefore("item", "natural", false) < gapBefore("paragraph", "natural", false));
  assert.ok(gapBefore("paragraph", "tight", false) < gapBefore("paragraph", "roomy", false));
  // An unknown kind must never mean "no pause at all".
  assert.equal(gapBefore("something-new", "natural", false), GAP_BEFORE.paragraph);
  // A breath inside a paragraph is shorter than the break between two.
  assert.ok(sentenceGap("natural") < gapBefore("paragraph", "natural", false));
});

test("a stored voice is found by name, not by position", async () => {
  const { voiceIndexFor, voicesFor, normalizeVoicePrefs, voiceKey } = await load();
  const voices = [
    { name: "English US", lang: "en-US", voiceURI: "en-us-x-sfg", localService: true, default: true },
    { name: "Thorsten", lang: "de-DE", voiceURI: "de-de-x-thorsten", localService: true, default: false },
    { name: "Cloud German", lang: "de-DE", voiceURI: "de-de-network", localService: false, default: false },
  ];
  const prefs = normalizeVoicePrefs({ voices: { de: "de-de-x-thorsten" } });

  assert.equal(voiceIndexFor(voices, "de-DE", prefs), 1);
  // A region the reader never opened settings for still gets their German
  // voice: the choice is stored per language.
  assert.equal(voiceKey("de-AT"), "de");
  assert.equal(voiceIndexFor(voices, "de-AT", prefs), 1);
  // Nothing chosen, or the voice uninstalled since: the device default speaks,
  // never an arbitrary other voice.
  assert.equal(voiceIndexFor(voices, "en-US", prefs), undefined);
  assert.equal(
    voiceIndexFor(voices, "de-DE", normalizeVoicePrefs({ voices: { de: "gone" } })),
    undefined
  );

  // Offering a voice that needs the network would break the one promise the
  // app makes, so it is not offered.
  assert.deepEqual(voicesFor(voices, "de-DE"), {
    voices: [voices[1]],
    matchesLanguage: true,
  });
  // Nothing installed for French: the list falls back to everything local, and
  // says that it did, so the screen can name the missing language instead of
  // offering Thorsten as if he could read it.
  assert.deepEqual(voicesFor(voices, "fr-FR"), {
    voices: [voices[0], voices[1]],
    matchesLanguage: false,
  });
});
