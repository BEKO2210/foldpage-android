/** Voices FoldPage can fetch for itself — generated, do not edit.
 *
 *  Written by `node scripts/build-voice-catalogue.mjs` from the `tts-models`
 *  release of k2-fsa/sherpa-onnx, which is the same project whose engine the
 *  app carries. Sizes are the real archive sizes, addresses the real ones; a
 *  hand-kept list would be wrong the first time upstream changed and nobody
 *  would notice until a download failed on a stranger's phone.
 *
 *  Every entry is a quantised (`int8`) Piper voice: about a fifth of the
 *  download of the same voice unquantised, for a difference a listener does not
 *  reliably hear.
 *
 *  Generated from release `tts-models`.
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

export const VOICE_PACKS: VoicePack[] = [
  {
    "id": "vits-piper-de_DE-miro-high-int8",
    "language": "de",
    "label": "Miro",
    "bytes": 21280966,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-de_DE-miro-high-int8.tar.bz2"
  },
  {
    "id": "vits-piper-de_DE-thorsten-medium-int8",
    "language": "de",
    "label": "Thorsten",
    "bytes": 20949833,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-de_DE-thorsten-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-en_US-miro-high-int8",
    "language": "en",
    "label": "Miro",
    "bytes": 21336806,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-miro-high-int8.tar.bz2"
  },
  {
    "id": "vits-piper-en_US-amy-medium-int8",
    "language": "en",
    "label": "Amy",
    "bytes": 21028122,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-amy-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-fr_FR-miro-high-int8",
    "language": "fr",
    "label": "Miro",
    "bytes": 21268816,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-fr_FR-miro-high-int8.tar.bz2"
  },
  {
    "id": "vits-piper-fr_FR-siwis-medium-int8",
    "language": "fr",
    "label": "Siwis",
    "bytes": 20914888,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-fr_FR-siwis-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-it_IT-miro-high-int8",
    "language": "it",
    "label": "Miro",
    "bytes": 21238206,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-it_IT-miro-high-int8.tar.bz2"
  },
  {
    "id": "vits-piper-it_IT-paola-medium-int8",
    "language": "it",
    "label": "Paola",
    "bytes": 21143212,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-it_IT-paola-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-es_ES-miro-high-int8",
    "language": "es",
    "label": "Miro",
    "bytes": 21273088,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-es_ES-miro-high-int8.tar.bz2"
  },
  {
    "id": "vits-piper-es_ES-davefx-medium-int8",
    "language": "es",
    "label": "Dave",
    "bytes": 21171632,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-es_ES-davefx-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-nl_NL-miro-high-int8",
    "language": "nl",
    "label": "Miro",
    "bytes": 21359568,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-nl_NL-miro-high-int8.tar.bz2"
  },
  {
    "id": "vits-piper-nl_NL-alex-medium-int8",
    "language": "nl",
    "label": "Alex",
    "bytes": 21188402,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-nl_NL-alex-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-pt_BR-miro-high-int8",
    "language": "pt",
    "label": "Miro",
    "bytes": 21341456,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-miro-high-int8.tar.bz2"
  },
  {
    "id": "vits-piper-pt_BR-faber-medium-int8",
    "language": "pt",
    "label": "Faber",
    "bytes": 21336772,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-faber-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-pl_PL-gosia-medium-int8",
    "language": "pl",
    "label": "Gosia",
    "bytes": 21109262,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pl_PL-gosia-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-pl_PL-darkman-medium-int8",
    "language": "pl",
    "label": "Darek",
    "bytes": 21078264,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pl_PL-darkman-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-ru_RU-irina-medium-int8",
    "language": "ru",
    "label": "Irina",
    "bytes": 21149417,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-ru_RU-irina-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-ru_RU-denis-medium-int8",
    "language": "ru",
    "label": "Denis",
    "bytes": 21058905,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-ru_RU-denis-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-tr_TR-dfki-medium-int8",
    "language": "tr",
    "label": "Deniz",
    "bytes": 21135582,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-tr_TR-dfki-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-uk_UA-ukrainian_tts-medium-int8",
    "language": "uk",
    "label": "Oksana",
    "bytes": 22767075,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-uk_UA-ukrainian_tts-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-sv_SE-nst-medium-int8",
    "language": "sv",
    "label": "Elin",
    "bytes": 20972387,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-sv_SE-nst-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-da_DK-talesyntese-medium-int8",
    "language": "da",
    "label": "Freja",
    "bytes": 21025554,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-da_DK-talesyntese-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-fi_FI-harri-medium-int8",
    "language": "fi",
    "label": "Harri",
    "bytes": 20984753,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-fi_FI-harri-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-cs_CZ-jirka-medium-int8",
    "language": "cs",
    "label": "Jirka",
    "bytes": 21002417,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-cs_CZ-jirka-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-el_GR-rapunzelina-low-int8",
    "language": "el",
    "label": "Elena",
    "bytes": 21090546,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-el_GR-rapunzelina-low-int8.tar.bz2"
  },
  {
    "id": "vits-piper-hu_HU-anna-medium-int8",
    "language": "hu",
    "label": "Anna",
    "bytes": 21113090,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-hu_HU-anna-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-ro_RO-mihai-medium-int8",
    "language": "ro",
    "label": "Mihai",
    "bytes": 21081899,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-ro_RO-mihai-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-ar_JO-kareem-medium-int8",
    "language": "ar",
    "label": "Kareem",
    "bytes": 20968771,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-ar_JO-kareem-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-fa_IR-amir-medium-int8",
    "language": "fa",
    "label": "Amir",
    "bytes": 20666906,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-fa_IR-amir-medium-int8.tar.bz2"
  },
  {
    "id": "vits-piper-vi_VN-vais1000-medium-int8",
    "language": "vi",
    "label": "Linh",
    "bytes": 21574925,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-vi_VN-vais1000-medium-int8.tar.bz2"
  },
  {
    "id": "vits-icefall-zh-aishell3",
    "language": "zh",
    "label": "Xiaoyan",
    "bytes": 31559701,
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-icefall-zh-aishell3.tar.bz2"
  }
];
