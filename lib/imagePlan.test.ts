import assert from "node:assert/strict";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";

before(() => {
  const dom = new JSDOM("", { url: "https://fixture.test/" });
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.Node = dom.window.Node;
});

const load = () => import("./imagePlan.ts");

test("only remote images are candidates, and never more than the cap", async () => {
  const { pickImageUrls, LIMITS } = await load();

  const html = `
    <p>Text</p>
    <img src="https://cdn.test/a.jpg">
    <img src="https://cdn.test/b.jpg">
    <img src="https://cdn.test/a.jpg">
    <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
    <img alt="no source">`;
  const urls = await pickImageUrls(html);
  assert.deepEqual(urls, ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"]);

  // The listicle case from the corpus: 301 images, of which the reader keeps a
  // bounded number. Without the cap a single article decides the disk budget
  // for the whole library.
  const flood = Array.from(
    { length: 301 },
    (_, i) => `<img src="https://cdn.test/${i}.jpg">`
  ).join("");
  assert.equal(pickImageUrls(flood).length, LIMITS.perArticleCount);
});

test("marking an image keeps its original src as the fallback", async () => {
  const { markStoredImages, storedKeysIn, IMAGE_KEY_ATTR } = await load();

  const html = `<img src="https://cdn.test/a.jpg" alt="A"><img src="https://cdn.test/b.jpg">`;
  const marked = markStoredImages(html, new Map([["https://cdn.test/a.jpg", "abc123"]]));

  assert.match(marked, /src="https:\/\/cdn\.test\/a\.jpg"/, "src must survive");
  assert.match(marked, new RegExp(`${IMAGE_KEY_ATTR}="abc123"`));
  assert.match(marked, /alt="A"/);
  // The unstored image is left exactly as it was — it still loads from the net.
  assert.doesNotMatch(
    marked.slice(marked.indexOf("b.jpg")),
    new RegExp(IMAGE_KEY_ATTR)
  );
  assert.deepEqual(storedKeysIn(marked), ["abc123"]);
});

test("marking is idempotent, so a re-run does not rewrite the article", async () => {
  const { markStoredImages } = await load();
  const keys = new Map([["https://cdn.test/a.jpg", "abc123"]]);
  const once = markStoredImages(`<img src="https://cdn.test/a.jpg">`, keys);
  const twice = markStoredImages(once, keys);
  assert.equal(twice, once);
  // Nothing to mark means the string is handed back untouched, not reserialised.
  const untouched = `<p>no pictures here</p>`;
  assert.equal(markStoredImages(untouched, keys), untouched);
});

test("the limits are the ones the measurement argued for", async () => {
  const { LIMITS } = await load();
  assert.equal(LIMITS.perImageBytes, 2 * 1024 * 1024);
  assert.equal(LIMITS.perArticleBytes, 4 * 1024 * 1024);
  assert.equal(LIMITS.perArticleCount, 40);
});
