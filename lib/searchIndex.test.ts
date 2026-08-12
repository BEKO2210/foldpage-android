import assert from "node:assert/strict";
import test from "node:test";

const load = () => import("./searchIndex.ts");

test("words are what the index knows, in any script", async () => {
  const { tokenize } = await load();

  assert.deepEqual(tokenize("Der Löwe frisst — schnell!"), [
    "der",
    "löwe",
    "frisst",
    "schnell",
  ]);
  // Umlauts and accents are letters, not separators: a \w+ tokenizer would cut
  // "Löwe" into "l" and "we" and the article would be unfindable by its own
  // words.
  assert.deepEqual(tokenize("Größe Café naïve"), ["größe", "café", "naïve"]);
  assert.deepEqual(tokenize("O'Brien's HTTP/2 test"), [
    "o'brien's",
    "http",
    "test",
  ]);
  // Single letters and punctuation carry no narrowing power and are dropped.
  assert.deepEqual(tokenize("a b cd — ?"), ["cd"]);
  assert.deepEqual(tokenize(""), []);
});

test("an article is indexed by everything it can be recognised from", async () => {
  const { termsOf } = await load();
  const terms = new Set(
    termsOf({
      title: "Sonnenfinsternis über Hamburg",
      excerpt: "Der Mond schiebt sich davor.",
      siteName: "ndr.de",
      author: "B. Aslani",
      tags: ["astronomie"],
      contentHtml: "<p>Ein <b>partielles</b> Ereignis.</p><!-- kommentar -->",
    })
  );

  for (const word of [
    "sonnenfinsternis",
    "hamburg",
    "mond",
    "ndr",
    "aslani",
    "astronomie",
    "partielles",
    "ereignis",
  ]) {
    assert.ok(terms.has(word), `missing “${word}”`);
  }
  // Markup is not vocabulary.
  for (const noise of ["p", "b", "br", "div"]) {
    assert.equal(terms.has(noise), false, `“${noise}” came from the markup`);
  }
});

test("the query plan says what the index can and cannot answer", async () => {
  const { planQuery } = await load();

  // Still typing: the last word is a prefix, which is what makes results turn
  // up before the word is finished.
  assert.deepEqual(planQuery("sonnen"), {
    terms: [],
    prefix: "sonnen",
    scanOnly: false,
  });
  assert.deepEqual(planQuery("mond über ham"), {
    terms: ["mond", "über"],
    prefix: "ham",
    scanOnly: false,
  });
  // A finished word — the trailing space says so — is looked up exactly.
  assert.deepEqual(planQuery("mond "), {
    terms: ["mond"],
    prefix: null,
    scanOnly: false,
  });
  // Nothing the index can narrow with: read the articles instead of returning
  // less than the old search did.
  assert.equal(planQuery("a").scanOnly, true);
  assert.equal(planQuery("?").scanOnly, true);
  assert.equal(planQuery("").scanOnly, false);
});
