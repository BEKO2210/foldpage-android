import test from "node:test";
import assert from "node:assert/strict";
import {
  LANGUAGES,
  baseCode,
  findLanguage,
  isRightToLeft,
  languageLabel,
  languageName,
  searchLanguages,
} from "./languages.ts";

test("every entry is a distinct lower-case code with both names", () => {
  const seen = new Set<string>();
  for (const language of LANGUAGES) {
    assert.match(language.code, /^[a-z]{2,3}$/, `bad code: ${language.code}`);
    assert.ok(!seen.has(language.code), `duplicate code: ${language.code}`);
    seen.add(language.code);
    assert.ok(language.name.length > 1, `missing name for ${language.code}`);
    assert.ok(language.endonym.length > 0, `missing endonym for ${language.code}`);
  }
  // Broad enough to be a real catalogue rather than the handful the app
  // happened to have samples for.
  assert.ok(LANGUAGES.length >= 40, `only ${LANGUAGES.length} languages`);
});

test("the base code survives every shape a tag arrives in", () => {
  assert.equal(baseCode("de"), "de");
  assert.equal(baseCode("de-DE"), "de");
  assert.equal(baseCode("de_AT"), "de");
  assert.equal(baseCode("DE"), "de");
  assert.equal(baseCode("zh-Hans-CN"), "zh");
  assert.equal(baseCode(" pt-BR "), "pt");
  assert.equal(baseCode(null), null);
  assert.equal(baseCode(""), null);
});

test("a language is found by any of its tags", () => {
  assert.equal(findLanguage("de-AT")?.name, "German");
  assert.equal(findLanguage("PT_br")?.endonym, "Português");
  assert.equal(findLanguage("xx"), null);
});

test("names fall back without ever showing a bare tag as if it were a word", () => {
  assert.equal(languageLabel("de"), "Deutsch");
  assert.equal(languageName("de"), "German");
  // An unknown tag reads as a label, not as a fault.
  assert.equal(languageLabel("xx"), "XX");
  assert.equal(languageLabel(null), "Unknown");
});

test("search finds a language by English name, endonym or code", () => {
  assert.equal(searchLanguages("german")[0].code, "de");
  assert.equal(searchLanguages("deutsch")[0].code, "de");
  assert.equal(searchLanguages("de")[0].code, "de");
  assert.equal(searchLanguages("italiano")[0].code, "it");
  assert.equal(searchLanguages("中文")[0].code, "zh");
});

test("search ignores the accents a phone keyboard makes hard to type", () => {
  assert.equal(searchLanguages("francais")[0].code, "fr");
  assert.equal(searchLanguages("turkce")[0].code, "tr");
  assert.equal(searchLanguages("espanol")[0].code, "es");
});

test("a prefix outranks a substring", () => {
  // "en" starts English and merely appears inside Slovenian; a reader typing
  // two letters means the language that begins with them.
  assert.equal(searchLanguages("en")[0].code, "en");
  const codes = searchLanguages("en").map((language) => language.code);
  assert.ok(codes.includes("sl"), "Slovenian should still be offered");
  assert.ok(codes.indexOf("en") < codes.indexOf("sl"));
});

test("an empty query returns the whole list, and a nonsense one returns none", () => {
  assert.equal(searchLanguages("").length, LANGUAGES.length);
  assert.equal(searchLanguages("   ").length, LANGUAGES.length);
  assert.deepEqual(searchLanguages("qqqzzz"), []);
});

test("right-to-left languages are marked, left-to-right ones are not", () => {
  assert.equal(isRightToLeft("ar"), true);
  assert.equal(isRightToLeft("he-IL"), true);
  assert.equal(isRightToLeft("de"), false);
  assert.equal(isRightToLeft(null), false);
});
