"use client";

/** Voices FoldPage carries and fetches for itself.
 *
 *  A phone's own voices are what they are, and on many phones what they are is
 *  one language done well and everything else done badly. These are the other
 *  way round: the same neural voice on every phone, in the reader's language,
 *  fetched inside the app and used offline afterwards. Nothing is bundled —
 *  the whole catalogue would be 660 MB, and a reader who only ever reads German
 *  should carry 21 MB, not that.
 *
 *  The catalogue itself is generated (`lib/voicePacks.generated.ts`) from the
 *  upstream release, so the sizes and addresses in it are facts rather than
 *  recollections.
 *
 *  A chosen pack is stored in the same place as any other voice —
 *  `VoicePrefs.voices[language]` — under an id that says where it came from,
 *  so the rest of the app needs to know nothing about packs to route speech to
 *  them. */

import { FoldPageVoicePacks, isNative, type VoicePackProgress } from "./native";
import { VOICE_PACKS, type VoicePack } from "./voicePacks.generated";
import { baseCode } from "./languages";

export type { VoicePack } from "./voicePacks.generated";
export { VOICE_PACKS } from "./voicePacks.generated";

/** The prefix that marks a stored voice as one of ours rather than the
 *  phone's. Kept deliberately unlike anything an engine would produce. */
const MARK = "foldpage:";

export function packVoiceURI(id: string): string {
  return MARK + id;
}

/** The pack behind a stored voice, or null when the stored voice belongs to the
    phone. */
export function packIdOf(voiceURI: string | null | undefined): string | null {
  if (!voiceURI || !voiceURI.startsWith(MARK)) return null;
  const id = voiceURI.slice(MARK.length);
  return id || null;
}

export function findPack(id: string | null | undefined): VoicePack | null {
  if (!id) return null;
  return VOICE_PACKS.find((pack) => pack.id === id) ?? null;
}

/** What FoldPage can offer for a language — and only for that language. */
export function packsFor(lang: string | null | undefined): VoicePack[] {
  const code = baseCode(lang);
  if (!code) return [];
  return VOICE_PACKS.filter((pack) => pack.language === code);
}

/** Human size, rounded the way a download screen should round: a reader
    deciding whether to spend 21 MB does not need three decimal places. */
export function packSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Whether this build can carry packs at all. The browser preview cannot: the
 *  engine is native, and pretending otherwise would offer a reader a download
 *  that could never speak. */
export function packsAvailable(): boolean {
  return isNative();
}

export interface InstalledPack {
  id: string;
  bytes: number;
}

let installedCache: Promise<InstalledPack[]> | null = null;

export function installedPacks(refresh = false): Promise<InstalledPack[]> {
  if (!packsAvailable()) return Promise.resolve([]);
  if (refresh || !installedCache) {
    installedCache = FoldPageVoicePacks.list()
      .then((result) => result.packs ?? [])
      .catch(() => []);
  }
  return installedCache;
}

export function forgetInstalled(): void {
  installedCache = null;
}

/** Fetch a pack, reporting progress as it goes.
 *
 *  The progress listener is attached before the download starts and removed
 *  when it ends, whichever way it ends — a listener that outlives its download
 *  reports the *next* one's bytes into a screen that has moved on. */
export async function downloadPack(
  pack: VoicePack,
  onProgress?: (progress: VoicePackProgress) => void
): Promise<InstalledPack> {
  if (!packsAvailable()) throw new Error("This preview cannot install voices.");
  const handle = onProgress
    ? await FoldPageVoicePacks.addListener("voicePackProgress", (progress) => {
        if (progress.id === pack.id) onProgress(progress);
      })
    : null;
  try {
    const result = await FoldPageVoicePacks.download({ id: pack.id, url: pack.url });
    forgetInstalled();
    return result;
  } finally {
    await handle?.remove();
  }
}

export async function cancelPack(id: string): Promise<void> {
  if (!packsAvailable()) return;
  await FoldPageVoicePacks.cancel({ id });
  forgetInstalled();
}

export async function removePack(id: string): Promise<void> {
  if (!packsAvailable()) return;
  await FoldPageVoicePacks.remove({ id });
  forgetInstalled();
}

/** Speak one piece of text in a downloaded voice.
 *
 *  Resolves when the sentence has been *heard*, not when it was handed over.
 *  The difference was audible: the first version returned as soon as the
 *  samples were in the buffer, so the next sentence started immediately and
 *  flushed the one still playing — and on the phone that meant no sound at all.
 */
export async function speakWithPack(
  id: string,
  text: string,
  speed: number
): Promise<void> {
  await FoldPageVoicePacks.speak({ id, text, speed });
}

/** Make the *next* sentence while this one is still being heard.
 *
 *  Synthesis costs about half a second per second of speech. Done in turn, the
 *  reader hears a sentence, then that half second of nothing, then the next —
 *  and the pauses the app carefully measured are drowned by the ones the model
 *  needs. Fired and forgotten on purpose: if it fails, the real call will do
 *  the work and report properly. */
export function prepareWithPack(id: string, text: string, speed: number): void {
  if (!packsAvailable()) return;
  void FoldPageVoicePacks.prepare({ id, text, speed }).catch(() => {});
}

export async function stopPack(): Promise<void> {
  if (!packsAvailable()) return;
  await FoldPageVoicePacks.stop().catch(() => {});
}
