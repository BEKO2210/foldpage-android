import assert from "node:assert/strict";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";

/** The device runs this code inside a WebView. Node has no DOM, so jsdom
    stands in for one — DOMParser is all the extraction needs. */
before(() => {
  const dom = new JSDOM("", { url: "https://example.test/" });
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.Node = dom.window.Node;
});

const load = async () => import("./parse.ts");

const PAGE = `<!doctype html>
<html lang="de">
  <head>
    <title>Werkstattbericht</title>
    <link rel="canonical" href="/blog/werkstatt?utm_source=x" />
    <meta property="og:site_name" content="IT-Handwerk" />
  </head>
  <body>
    <article>
      <h1>Werkstattbericht</h1>
      <p>Der erste Absatz erklaert, worum es geht, und ist lang genug, dass
         Readability ihn nicht als Navigation wegwirft. Noch ein Satz dazu,
         damit die Heuristik zufrieden ist und den Block als Inhalt wertet.</p>
      <p>Ein zweiter Absatz mit einem <a href="/weiter">relativen Link</a> und
         einem <img src="../bilder/hobel.png" alt="Hobel" /> Bild, beide sollen
         nach dem Parsen absolut sein. Auch dieser Absatz braucht genug Text,
         damit er die Schwelle sicher ueberschreitet und erhalten bleibt.</p>
      <p onclick="steal()">Ein Absatz mit einem Inline-Handler, der nach dem
         Sanitizing verschwunden sein muss, waehrend der Text bleibt. Auch hier
         genug Fuelltext, damit der Absatz die Readability-Schwelle nimmt.</p>
      <p><a href="javascript:alert(1)">Boeser Link</a> in einem Absatz, der
         ebenfalls lang genug ist, um als Inhalt gewertet zu werden, damit der
         Sanitizer ueberhaupt an dem Link vorbeikommt und ihn entschaerft.</p>
      <script>window.pwned = true;</script>
    </article>
  </body>
</html>`;

test("assertFetchable rejects what the app must not fetch", async () => {
  const { assertFetchable } = await load();

  assert.equal(
    assertFetchable("https://example.com/a").href,
    "https://example.com/a"
  );

  assert.throws(() => assertFetchable("nope"), /Not a valid URL/);
  assert.throws(() => assertFetchable("file:///etc/passwd"), /http\(s\)/);
  assert.throws(() => assertFetchable("javascript:alert(1)"), /http\(s\)/);

  for (const bad of [
    "http://localhost/x",
    "http://127.0.0.1/x",
    "http://10.1.2.3/x",
    "http://192.168.0.5/x",
    "http://172.20.0.1/x",
    "http://169.254.169.254/latest/meta-data/",
    "http://nas.local/x",
    "http://[::1]/x", // bracketed IPv6 — the guard has to unwrap it
  ]) {
    assert.throws(
      () => assertFetchable(bad),
      /private addresses/,
      `should refuse ${bad}`
    );
  }
});

test("extractArticle produces a stored article from a real page", async () => {
  const { extractArticle } = await load();
  const result = extractArticle(PAGE, "https://example.test/blog/werkstatt");

  assert.equal(result.title, "Werkstattbericht");
  assert.equal(result.lang, "de");
  assert.ok(result.wordCount > 40, `wordCount was ${result.wordCount}`);
  assert.ok(result.excerpt.length > 0);

  // canonical is resolved against the final URL, not left relative
  assert.equal(
    result.canonicalUrl,
    "https://example.test/blog/werkstatt?utm_source=x"
  );

  // relative targets became absolute
  assert.match(result.contentHtml, /https:\/\/example\.test\/weiter/);
  assert.match(
    result.contentHtml,
    /https:\/\/example\.test\/bilder\/hobel\.png/
  );
  assert.doesNotMatch(result.contentHtml, /src="\.\.\//);
  assert.match(result.contentHtml, /reader-image-fluid/);
  assert.match(result.contentHtml, /aspect-ratio: 16 \/ 9/);
});

test("extractArticle strips everything executable", async () => {
  const { extractArticle } = await load();
  const { contentHtml } = extractArticle(
    PAGE,
    "https://example.test/blog/werkstatt"
  );

  assert.doesNotMatch(contentHtml, /<script/i);
  assert.doesNotMatch(contentHtml, /window\.pwned/);
  assert.doesNotMatch(contentHtml, /onclick/i);
  assert.doesNotMatch(contentHtml, /javascript:/i);
  // the text around the stripped attributes survives
  assert.match(contentHtml, /Inline-Handler/);
  assert.match(contentHtml, /Boeser Link/);
});

test("extractArticle prepares images and promotes likely captions", async () => {
  const { extractArticle } = await load();
  const result = extractArticle(
    `<html><head><title>Bilderprobe</title></head><body><article>
      <p>Dieser längere Einleitungstext sorgt dafür, dass Readability den Inhalt sicher als Artikel erkennt und die folgenden Bilder bei der Extraktion erhält.</p>
      <p><img src="hero.jpg" width="1200" height="800" alt="Aufmacher"></p>
      <p>Foto: Beispielredaktion</p>
      <p><img src="tracking.gif" width="1" height="1" alt=""></p>
      <p>Dieser normale Folgeabsatz endet mit einem Punkt und darf deshalb nicht versehentlich als Bildunterschrift umgebaut werden.</p>
    </article></body></html>`,
    "https://example.test/story"
  );

  const dom = new JSDOM(`<body>${result.contentHtml}</body>`);
  const images = [...dom.window.document.querySelectorAll("img")];
  assert.equal(images.length, 1);
  assert.equal(images[0].getAttribute("loading"), "lazy");
  assert.equal(images[0].getAttribute("decoding"), "async");
  assert.equal(images[0].style.aspectRatio, "1200 / 800");
  assert.ok(images[0].closest("figure"));
  assert.equal(images[0].closest("figure")?.querySelector("figcaption")?.textContent, "Foto: Beispielredaktion");
  assert.match(result.contentHtml, /normale Folgeabsatz/);
});

test("extractArticle removes chrome only from article edges", async () => {
  const { extractArticle } = await load();
  const result = extractArticle(
    `<html lang="de"><head><title>Randprobe</title></head><body><article>
      <nav><a href="/">Home</a><a href="/thema">Thema</a><a href="/rubrik">Rubrik</a></nav>
      <div>
        <p>Als bevorzugte Quelle auf Google hinzufügen</p>
        <p>Der eigentliche Artikel beginnt hier und enthält genug Text, damit
        Readability ihn sicher als Inhalt erkennt. Das Seitenmöbel im selben
        Wrapper darf nicht dazu führen, dass dieser Absatz verloren geht.</p>
        <p>Auch ein zweiter, ausreichend langer Absatz bleibt vollständig
        erhalten. Er erwähnt eine Navigation mitten im Inhalt, die keinesfalls
        anhand eines bloßen Stichworts entfernt werden darf.</p>
        <p>Startseite</p>
      </div>
      <reader-gift></reader-gift>
    </article></body></html>`,
    "https://example.test/randprobe"
  );

  assert.doesNotMatch(result.contentHtml, /<nav|reader-gift|bevorzugte Quelle|Startseite/i);
  assert.match(result.contentHtml, /eigentliche Artikel beginnt hier/);
  assert.match(result.contentHtml, /Navigation mitten im Inhalt/);
  assert.equal(result.wordCount, 55);
});

test("extractArticle reports the failures the UI shows", async () => {
  const { extractArticle } = await load();

  assert.throws(
    () => extractArticle("   ", "https://example.test/"),
    /came back empty/
  );
  // a page with no prose at all — the "nicht lesbar" case
  assert.throws(
    () =>
      extractArticle(
        "<html><body><img src='x.png'></body></html>",
        "https://example.test/"
      ),
    /Could not extract a readable article/
  );
});
