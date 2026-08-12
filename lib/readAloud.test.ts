import assert from "node:assert/strict";
import test from "node:test";

const load = () => import("./readAloud.ts");

test("an article becomes the blocks a voice can be stopped between", async () => {
  const { spokenBlocks } = await load();

  const blocks = spokenBlocks(`
    <h2>Die Überschrift</h2>
    <p>Ein Absatz mit <b>Auszeichnung</b> und einem <a href="https://x.test">Link</a>.</p>
    <figure><img src="x.png"><figcaption>Foto: jemand</figcaption></figure>
    <ul><li>Erster Punkt</li><li>ok</li></ul>
    <p>   </p>
    <blockquote>Ein Zitat.</blockquote>`);

  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["heading", "paragraph", "caption", "item", "quote"]
  );
  assert.deepEqual(
    blocks.map((block) => block.text),
    [
      // The full stop is added: a heading has none in the markup, and without
      // one the engine keeps its pitch flat and walks into the next sentence.
      "Die Überschrift.",
      "Ein Absatz mit Auszeichnung und einem Link.",
      "Foto: jemand",
      "Erster Punkt",
      "Ein Zitat.",
    ]
  );
  // "ok" is two characters and an empty paragraph is none: read out, both sound
  // like the engine stuttering.
  assert.equal(blocks.length, 5);
  assert.deepEqual(
    blocks.map((block) => block.index),
    [0, 1, 2, 3, 4]
  );
});

test("entities and whitespace are spoken as text, not as markup", async () => {
  const { spokenBlocks } = await load();
  const [block] = spokenBlocks(
    "<p>Fünf &amp; sechs &#8212; mehr\n   als &quot;genug&quot;&nbsp;dafür.</p>"
  );
  assert.equal(block.text, 'Fünf & sechs — mehr als "genug" dafür.');
});

test("a paragraph is spoken sentence by sentence, and an abbreviation is not a sentence", async () => {
  const { sentences } = await load();

  assert.deepEqual(sentences("Erster Satz. Zweiter Satz!"), [
    "Erster Satz.",
    "Zweiter Satz!",
  ]);
  // Splitting here would give the listener a full stop in the middle of a
  // clause — worse than no split at all.
  assert.deepEqual(sentences("Das gilt z. B. für Autos. Und für Räder."), [
    "Das gilt z. B. für Autos.",
    "Und für Räder.",
  ]);
  assert.deepEqual(sentences("Am 3. Januar begann es. Dann kam der Rest."), [
    "Am 3. Januar begann es.",
    "Dann kam der Rest.",
  ]);
  assert.deepEqual(sentences("Dr. Meyer kam an. Er blieb."), ["Dr. Meyer kam an.", "Er blieb."]);
  // A block without a single full stop still has to come back as one utterance
  // rather than as nothing.
  assert.deepEqual(sentences("Ohne Satzzeichen"), ["Ohne Satzzeichen"]);
});

test("what the eye reads past, the ear would have to listen to", async () => {
  const { spokenBlocks } = await load();

  const [footnote] = spokenBlocks("<p>Der Wert stieg[1] deutlich an.</p>");
  assert.equal(footnote.text, "Der Wert stieg deutlich an.");

  const [wiki] = spokenBlocks("<h2>Geschichte[Bearbeiten | Quelltext bearbeiten]</h2>");
  assert.equal(wiki.text, "Geschichte.");

  // A bare address is spelled out character by character, tracking tail and
  // all. The host is the part that means something out loud.
  const [link] = spokenBlocks("<p>Mehr dazu unter https://www.zeit.de/audio/x.mp3?utm=1 heute.</p>");
  assert.equal(link.text, "Mehr dazu unter zeit.de heute.");

  // German quotation marks: „ opens and “ closes. Treating “ as an opener glued
  // the closing quote to the next word — an engine reads that as one word.
  const [quoted] = spokenBlocks("<p>Die „Rente mit 63“ fordert er heute.</p>");
  assert.equal(quoted.text, "Die „Rente mit 63“ fordert er heute.");

  const [bullet] = spokenBlocks("<li>• verkaufte Fahrzeuge</li>");
  assert.equal(bullet.text, "verkaufte Fahrzeuge");
});

test("the article's own language decides the voice, or nothing does", async () => {
  const { speechLanguage } = await load();

  assert.equal(speechLanguage("de"), "de-DE");
  assert.equal(speechLanguage("en"), "en-US");
  assert.equal(speechLanguage("de-AT"), "de-AT");
  assert.equal(speechLanguage("pt_BR"), "pt-BR");
  // Unknown or missing: the device's own default is a better answer than a
  // guess, because a German article read in an English voice is worse than one
  // read in whatever the owner chose.
  assert.equal(speechLanguage("klingon"), null);
  assert.equal(speechLanguage(null), null);
  assert.equal(speechLanguage(""), null);
});

test("the spoken length is measured for ears, not eyes", async () => {
  const { spokenBlocks, spokenMinutes } = await load();
  const words = Array.from({ length: 300 }, () => "Wort").join(" ");
  const minutes = spokenMinutes(spokenBlocks(`<p>${words}</p>`));
  // 300 words at ~150 a minute. The reading time on a card uses 220, which is
  // how fast eyes go — a voice does not.
  assert.equal(minutes, 2);
  assert.equal(spokenMinutes([]), 1);
});
