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

/** The stored HTML is injected into the app's own origin, where anything that
    runs can read the whole library. So the sanitizer is an allowlist, and this
    covers the cases a blocklist keeps missing. */
test("the sanitizer allowlist survives the cases a blocklist misses", async () => {
  const { extractArticle } = await load();
  const page = (body: string) => `<html lang="de"><head><title>Probe</title></head><body>
    <article>
      <p>Ein erster Absatz mit genug Text, damit Readability den Artikel
      sicher als Inhalt erkennt und nicht als Navigation wegwirft. Noch ein
      Satz, damit die Schwelle zuverlässig überschritten wird.</p>
      ${body}
      <p>Ein abschließender Absatz, ebenfalls lang genug, damit der Block in
      jedem Fall als Artikeltext gewertet wird und erhalten bleibt.</p>
    </article></body></html>`;
  const html = (body: string) =>
    extractArticle(page(body), "https://example.test/probe").contentHtml;

  // <base> re-points every relative URL in the app, not just in the article.
  assert.doesNotMatch(html(`<base href="https://boese.test/">`), /<base/i);

  // SVG parses markup HTML does not: <animate> can set an href after storage.
  const svg = html(
    `<p>Diagramm folgt und der Absatz ist lang genug für Readability, damit
     der Block sicher erhalten bleibt und die Grafik mit ihm.
     <svg><a href="#x"><animate attributeName="href" values="javascript:alert(1)"/></a></svg></p>`
  );
  assert.doesNotMatch(svg, /<svg|animate|javascript:/i);

  // style can cover the app's own UI with a full-screen block.
  const styled = html(
    `<p style="position:fixed;inset:0;background:#fff">Ein Absatz mit einem
     Inline-Style, der nach dem Sanitizing verschwunden sein muss, während
     sein Text vollständig erhalten bleibt und lesbar ist.</p>`
  );
  assert.doesNotMatch(styled, /position:fixed/);
  assert.match(styled, /Inline-Style/);

  // data:text/html is a document of the author's choosing; data:image is not.
  const links = html(
    `<p><a href="data:text/html;base64,PHNjcmlwdD4=">Ein Link</a> in einem
     Absatz, der lang genug ist, damit Readability ihn als Inhalt wertet und
     der Sanitizer überhaupt an dem Link vorbeikommt.</p>`
  );
  assert.doesNotMatch(links, /data:text\/html/);
  assert.match(links, /Ein Link/);

  // Source classes cannot collide with the app's own stylesheet …
  const classes = html(
    `<p class="toast bottomnav">Ein Absatz, dessen Klassen aus der Quelle
     stammen und die Namen der App tragen. Der Text bleibt, die Klassen nicht,
     und der Absatz ist lang genug für die Readability-Schwelle.</p>`
  );
  assert.doesNotMatch(classes, /class="toast/);
  // … while the reader's own classes are added after the scrub and survive.
  assert.match(
    html(`<table><tr><td>1</td><td>2</td></tr></table>`),
    /class="tablewrap"/
  );

  // A custom element keeps its text and loses its wrapper.
  const custom = html(
    `<my-widget data-src="https://boese.test/x"><p>Text aus einem eigenen
     Element, der erhalten bleiben muss, obwohl das Element selbst nicht in
     der Allowlist steht. Auch dieser Absatz ist ausreichend lang.</p></my-widget>`
  );
  assert.doesNotMatch(custom, /my-widget|data-src/);
  assert.match(custom, /Text aus einem eigenen\s+Element/);
});

test("empty blocks are dropped, deliberate ones are not", async () => {
  const { extractArticle } = await load();
  const page = `<html lang="de"><head><title>Luecken</title></head><body><article>
      <p>Ein Absatz mit genug Text, damit Readability den Artikel sicher als
      Inhalt erkennt und nicht als Navigation verwirft. Noch ein Satz dazu.</p>
      <p></p>
      <p>   </p>
      <div><p></p></div>
      <p>Ein zweiter Absatz, ebenfalls lang genug, damit er die Schwelle nimmt
      und im Ergebnis erhalten bleibt, samt allem, was zwischen ihm steht.</p>
      <p>Ein Absatz mit einem gewollten Zeilenumbruch:<br>so hier, und noch
      genug Text dahinter, damit der Block als Inhalt zaehlt und bleibt.</p>
      <hr>
      <p>Ein dritter Absatz, wieder mit ausreichend Text fuer die Heuristik,
      damit der Block als Artikelinhalt gewertet wird und stehen bleibt.</p>
    </article></body></html>`;
  const { contentHtml } = extractArticle(page, "https://example.test/luecken");

  assert.doesNotMatch(contentHtml, /<p>\s*<\/p>/, "no empty paragraph survives");
  // A <br> inside a real paragraph is a line break somebody meant, and <hr>
  // draws a rule — neither counts as empty.
  assert.match(contentHtml, /<br>/);
  assert.match(contentHtml, /<hr>/);
  assert.match(contentHtml, /dritter Absatz/);
});

test("the author is read from structured data when the byline is not in the text", async () => {
  const { extractArticle } = await load();
  const body = `<article>
      <p>Der Artikel selbst nennt keinen Autor, weil die Redaktion ihn nur im
      Kopf der Seite auszeichnet. Genug Text, damit der Block als Inhalt gilt.</p>
      <p>Ein zweiter Absatz mit ausreichend Fuelltext, damit die Extraktion
      diesen Artikel sicher als lesbaren Inhalt erkennt und behaelt.</p>
    </article>`;
  const page = (head: string) =>
    `<html lang="de"><head><title>Kopfdaten</title>${head}</head><body>${body}</body></html>`;

  assert.equal(
    extractArticle(page('<meta name="author" content="B. Aslani">'), "https://example.test/a").author,
    "B. Aslani"
  );
  assert.equal(
    extractArticle(
      page('<script type="application/ld+json">{"@type":"Article","author":{"name":"K. Mustermann"}}</script>'),
      "https://example.test/a"
    ).author,
    "K. Mustermann"
  );
  // Nested in a @graph, which is how most publishers ship it.
  assert.equal(
    extractArticle(
      page(
        '<script type="application/ld+json">{"@graph":[{"author":[{"name":"Erste Autorin"}]}]}</script>'
      ),
      "https://example.test/a"
    ).author,
    "Erste Autorin"
  );
  // Where a meta author exists, Readability already reports it as the byline
  // and this fallback never runs — worth pinning, so nobody later "fixes" a
  // precedence that is not ours to decide.
  assert.equal(
    extractArticle(
      page(
        '<script type="application/ld+json">{"author":{"name":"Aus JSON-LD"}}</script><meta name="author" content="Aus Meta">'
      ),
      "https://example.test/a"
    ).author,
    "Aus Meta"
  );
  // A URL, a wall of text, or broken JSON leaves the slot empty rather than
  // putting nonsense in the header.
  for (const head of [
    '<meta property="article:author" content="https://example.test/profile/42">',
    `<meta name="author" content="${"x".repeat(120)}">`,
    '<script type="application/ld+json">{ not json </script>',
  ]) {
    assert.equal(extractArticle(page(head), "https://example.test/a").author, null, head.slice(0, 40));
  }
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

test("English page furniture is trimmed from the edges too", async () => {
  const { extractArticle } = await load();
  const body = `<p>The article itself runs for several sentences so that
      Readability keeps it, and it carries enough text for the heuristic to be
      comfortable calling this block the content of the page.</p>
      <p>A second paragraph, also long enough to be counted, which mentions
      that reporters exist without being a staff biography itself.</p>`;
  const page = (extra: string) =>
    `<html lang="en"><head><title>Edges</title></head><body><article>${extra}</article></body></html>`;

  const bio = extractArticle(
    page(`${body}<p>Jay Peters is a senior reporter covering technology.</p>`),
    "https://example.test/a"
  ).contentHtml;
  assert.doesNotMatch(bio, /senior reporter/);
  assert.match(bio, /second paragraph/);

  const affiliate = extractArticle(
    page(`${body}<p>When you purchase through links in our articles, we may earn a small commission.</p>`),
    "https://example.test/b"
  ).contentHtml;
  assert.doesNotMatch(affiliate, /small commission/);

  const credit = extractArticle(
    page(`<p>Image Credits:Getty Images 3:48 PM PDT</p>${body}`),
    "https://example.test/c"
  ).contentHtml;
  assert.doesNotMatch(credit, /Image Credits/);

  // The words themselves are not banned — only a block that is nothing else.
  assert.match(
    extractArticle(
      page(`${body}<p>The report says that when you purchase through links like these, publishers earn money, which is the whole point of the disclosure rules it examines in detail.</p>`),
      "https://example.test/d"
    ).contentHtml,
    /disclosure rules/
  );
});

test("a paywall notice is named, not filed as an article", async () => {
  const { extractArticle } = await load();
  const wall = `<html lang="de"><head><title>Golem</title></head><body><article>
      <p>Zu Golem pur Bereits Pur-Leser? Hier anmelden. Kein aktives Abo
      gefunden. Mit Golem pur ab 3 Euro im Monat lesen Sie ohne Werbung.</p>
    </article></body></html>`;
  assert.throws(
    () => extractArticle(wall, "https://example.test/paywall"),
    /paywall or cookie notice/
  );

  // The guard needs both halves: a long article that happens to discuss
  // paywalls is an article, and a short one without the phrases is just short.
  const aboutPaywalls = `<html lang="de"><head><title>Analyse</title></head><body><article>
      <p>${"Der Text untersucht, wie Verlage mit Bezahlschranken umgehen und welche Formulierungen sie waehlen. ".repeat(12)}</p>
      <p>Cookies zustimmen ist dabei die haeufigste Aufforderung, die Leser zu
      sehen bekommen, und genau darum geht es in dieser Untersuchung.</p>
    </article></body></html>`;
  assert.ok(extractArticle(aboutPaywalls, "https://example.test/a").wordCount > 150);
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
