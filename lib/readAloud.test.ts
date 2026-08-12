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
    blocks.map((block) => block.text),
    [
      "Die Überschrift",
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
