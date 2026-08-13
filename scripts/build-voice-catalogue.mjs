#!/usr/bin/env node
/** Build the list of voices FoldPage can offer to download.
 *
 *  Written by a script rather than by hand because every field in it is a fact
 *  that belongs to somebody else: the file name, the byte count, the address.
 *  Typing those out once means they are wrong the next time the upstream
 *  release changes, and nobody would notice until a download 404s on a
 *  stranger's phone.
 *
 *    node scripts/build-voice-catalogue.mjs
 *
 *  Reads the `tts-models` release of k2-fsa/sherpa-onnx — the same project
 *  whose engine the app carries — and writes lib/voicePacks.generated.ts.
 *
 *  Only `-int8` archives are considered. A Piper voice at medium quality is
 *  about 63 MB as float and about 21 MB quantised, and on a phone the
 *  difference is a fifth of the download for a difference in sound that a
 *  listener does not reliably hear. Two voices for five languages is then
 *  around 210 MB *if somebody downloads all of them*, and nothing at all until
 *  they do.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "lib", "voicePacks.generated.ts");
const RELEASE =
  "https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/tts-models";
const BASE =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/";

/** Two per language, and the choice is ours to make rather than the reader's.
 *
 *  Ordered best first. The names are the ones upstream uses; the label beside
 *  each is what a person sees, and it is a name rather than a description
 *  because that is what a voice is to a listener. Where a language has both, a
 *  female and a male voice are offered, so "the other one" is a real
 *  alternative and not the same voice twice. */
const WANTED = {
  de: [
    { file: "vits-piper-de_DE-thorsten-medium-int8", label: "Thorsten" },
    { file: "vits-piper-de_DE-kerstin-low-int8", label: "Kerstin" },
  ],
  en: [
    { file: "vits-piper-en_US-amy-medium-int8", label: "Amy" },
    { file: "vits-piper-en_US-ryan-medium-int8", label: "Ryan" },
  ],
  fr: [
    { file: "vits-piper-fr_FR-siwis-medium-int8", label: "Siwis" },
    { file: "vits-piper-fr_FR-tom-medium-int8", label: "Tom" },
  ],
  it: [
    { file: "vits-piper-it_IT-paola-medium-int8", label: "Paola" },
    { file: "vits-piper-it_IT-riccardo-x_low-int8", label: "Riccardo" },
  ],
  es: [
    { file: "vits-piper-es_ES-davefx-medium-int8", label: "Dave" },
    { file: "vits-piper-es_ES-sharvard-medium-int8", label: "Sharvard" },
  ],
  nl: [
    { file: "vits-piper-nl_NL-alex-medium-int8", label: "Alex" },
    { file: "vits-piper-nl_BE-nathalie-medium-int8", label: "Nathalie" },
  ],
  pt: [
    { file: "vits-piper-pt_BR-faber-medium-int8", label: "Faber" },
    { file: "vits-piper-pt_PT-tugao-medium-int8", label: "Tugão" },
  ],
  pl: [
    { file: "vits-piper-pl_PL-darkman-medium-int8", label: "Darek" },
    { file: "vits-piper-pl_PL-gosia-medium-int8", label: "Gosia" },
  ],
  ru: [
    { file: "vits-piper-ru_RU-irina-medium-int8", label: "Irina" },
    { file: "vits-piper-ru_RU-denis-medium-int8", label: "Denis" },
  ],
  tr: [{ file: "vits-piper-tr_TR-dfki-medium-int8", label: "Deniz" }],
  uk: [{ file: "vits-piper-uk_UA-ukrainian_tts-medium-int8", label: "Oksana" }],
  sv: [{ file: "vits-piper-sv_SE-nst-medium-int8", label: "Elin" }],
  da: [{ file: "vits-piper-da_DK-talesyntese-medium-int8", label: "Freja" }],
  fi: [{ file: "vits-piper-fi_FI-harri-medium-int8", label: "Harri" }],
  cs: [{ file: "vits-piper-cs_CZ-jirka-medium-int8", label: "Jirka" }],
  el: [{ file: "vits-piper-el_GR-rapunzelina-low-int8", label: "Elena" }],
  hu: [{ file: "vits-piper-hu_HU-anna-medium-int8", label: "Anna" }],
  ro: [{ file: "vits-piper-ro_RO-mihai-medium-int8", label: "Mihai" }],
  ar: [{ file: "vits-piper-ar_JO-kareem-medium-int8", label: "Kareem" }],
  fa: [{ file: "vits-piper-fa_IR-amir-medium-int8", label: "Amir" }],
  vi: [{ file: "vits-piper-vi_VN-vais1000-medium-int8", label: "Linh" }],
  zh: [{ file: "vits-icefall-zh-aishell3", label: "Xiaoyan" }],
};

const response = await fetch(RELEASE, {
  headers: { accept: "application/vnd.github+json" },
});
if (!response.ok) {
  console.error(`the release list answered with ${response.status}`);
  process.exit(1);
}
const release = await response.json();
const assets = new Map(release.assets.map((asset) => [asset.name, asset]));

const packs = [];
const missing = [];
for (const [language, choices] of Object.entries(WANTED)) {
  for (const choice of choices) {
    const name = `${choice.file}.tar.bz2`;
    const asset = assets.get(name);
    if (!asset) {
      missing.push(name);
      continue;
    }
    packs.push({
      id: choice.file,
      language,
      label: choice.label,
      bytes: asset.size,
      url: BASE + name,
    });
  }
}

const header = `/** Voices FoldPage can fetch for itself — generated, do not edit.
 *
 *  Written by \`node scripts/build-voice-catalogue.mjs\` from the \`tts-models\`
 *  release of k2-fsa/sherpa-onnx, which is the same project whose engine the
 *  app carries. Sizes are the real archive sizes, addresses the real ones; a
 *  hand-kept list would be wrong the first time upstream changed and nobody
 *  would notice until a download failed on a stranger's phone.
 *
 *  Every entry is a quantised (\`int8\`) Piper voice: about a fifth of the
 *  download of the same voice unquantised, for a difference a listener does not
 *  reliably hear.
 *
 *  Generated from release \`${release.tag_name}\`.
 */

export interface VoicePack {
  /** Stable id, also the directory the voice is unpacked into. */
  id: string;
  /** ISO 639-1 base code — the language this voice reads. */
  language: string;
  /** What a person sees. A name, not a description. */
  label: string;
  /** Size of the download in bytes. */
  bytes: number;
  url: string;
}

export const VOICE_PACKS: VoicePack[] = ${JSON.stringify(packs, null, 2)};
`;

fs.writeFileSync(OUT, header);

const total = packs.reduce((sum, pack) => sum + pack.bytes, 0);
console.log(
  `voice catalogue: ${packs.length} voices in ${new Set(packs.map((p) => p.language)).size} languages, ` +
    `${(total / 1e6).toFixed(0)} MB if every one were downloaded`
);
console.log(`written to ${path.relative(ROOT, OUT)}`);
if (missing.length) {
  console.log(`not in this release, left out: ${missing.join(", ")}`);
  process.exitCode = 1;
}
