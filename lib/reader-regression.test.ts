import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";

before(() => {
  const dom = new JSDOM("", { url: "https://fixture.test/" });
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.Node = dom.window.Node;
});

const fixtureDir = path.join(import.meta.dirname, "fixtures");
const fixtures = fs.readdirSync(fixtureDir).filter((name) => name.endsWith(".html"));

test("six offline reader fixtures cover the hard extraction criteria", async () => {
  assert.equal(fixtures.length, 6);
  const { extractArticle } = await import("./parse.ts");

  for (const name of fixtures) {
    const html = fs.readFileSync(path.join(fixtureDir, name), "utf8");
    const result = extractArticle(html, `https://fixture.test/${name}`);
    const dom = new JSDOM(`<main>${result.contentHtml}</main>`);
    const root = dom.window.document.querySelector("main")!;
    const first = root.firstElementChild;
    assert.ok(first, `${name}: content exists`);
    assert.doesNotMatch(first!.textContent ?? "", /Pfadnavigation|Newsletter|Anzeige/i, `${name}: no leading furniture`);
    assert.equal(root.querySelectorAll("table:not(.tablewrap table)").length, 0, `${name}: every table is isolated in a scroll wrapper`);
    for (const image of root.querySelectorAll("img")) {
      assert.match(image.getAttribute("src") ?? "", /^data:image\//, `${name}: image is offline and loadable`);
      assert.equal(image.getAttribute("loading"), "lazy", `${name}: lazy image`);
      assert.equal(image.getAttribute("decoding"), "async", `${name}: async image decode`);
      assert.ok(image.hasAttribute("width") && image.hasAttribute("height"), `${name}: intrinsic size prevents overflow/layout gaps`);
    }
  }
});

test("fixtures exercise furniture, tables, captions and tracking-pixel removal", async () => {
  const { extractArticle } = await import("./parse.ts");
  const read = (name: string) => fs.readFileSync(path.join(fixtureDir, name), "utf8");
  assert.doesNotMatch(extractArticle(read("breadcrumb.html"), "https://fixture.test/a").contentHtml, /Pfadnavigation/);
  assert.match(extractArticle(read("wide-table.html"), "https://fixture.test/b").contentHtml, /class="tablewrap"/);
  assert.match(extractArticle(read("image-caption.html"), "https://fixture.test/c").contentHtml, /<figcaption>/);
  const media = extractArticle(read("tracker-and-image.html"), "https://fixture.test/d").contentHtml;
  assert.equal((media.match(/<img/g) ?? []).length, 1);
  assert.doesNotMatch(media, /R0lGOD/);
});
