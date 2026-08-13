"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isDarkNow } from "./display";

/** Bridge to the Kotlin side that catches Android's ACTION_SEND share intent.
    Cold start: the text is queued and picked up by consume().
    Warm start: the "shared" event fires. */
export interface ShareTargetPlugin {
  consume(): Promise<{ value: string | null }>;
  addListener(
    event: "shared",
    cb: (data: { value: string }) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

export const ShareTarget = registerPlugin<ShareTargetPlugin>("ShareTarget");

/** Screens the app can point at but not replace — see SystemSettingsPlugin. */
export interface SystemSettingsPlugin {
  openTextToSpeech(): Promise<void>;
  requestAudioFocus(): Promise<{ granted: boolean }>;
  abandonAudioFocus(): Promise<void>;
  gestureThreshold(): Promise<void>;
}

export const SystemSettings = registerPlugin<SystemSettingsPlugin>("SystemSettings");

/** Speaking through a named engine — see SpeechPlugin.java for why the app
 *  keeps its own instead of only using the phone's default one. */
export interface FoldPageSpeechPlugin {
  listEngines(): Promise<{
    engines: { packageName: string; label: string }[];
    defaultEngine: string | null;
  }>;
  listVoices(options: { engine: string }): Promise<{
    voices: {
      name: string;
      lang: string;
      voiceURI: string;
      localService: boolean;
      default: boolean;
      quality: number;
    }[];
  }>;
  showControls(options: { title: string; playing: boolean }): Promise<void>;
  hideControls(): Promise<void>;
  addListener(
    eventName: "transport",
    cb: (data: { action: "play" | "pause" | "stop" }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  speak(options: {
    text: string;
    engine: string;
    lang?: string;
    voice?: string;
    rate?: number;
    pitch?: number;
  }): Promise<void>;
  stop(): Promise<void>;
}

export const FoldPageSpeech = registerPlugin<FoldPageSpeechPlugin>("FoldPageSpeech");

/** The voices FoldPage brings itself: fetched, unpacked and spoken by the app,
 *  with no second application anywhere in the way. The native side is
 *  `android/.../VoicePackPlugin.java`; what a pack *is* lives in
 *  `lib/voicePacks.ts`. */
export interface VoicePackProgress {
  id: string;
  phase: "downloading" | "unpacking" | "installed" | "failed";
  received: number;
  total: number;
}

export interface FoldPageVoicePacksPlugin {
  list(): Promise<{ packs: { id: string; bytes: number }[] }>;
  download(options: { id: string; url: string }): Promise<{ id: string; bytes: number }>;
  cancel(options: { id: string }): Promise<void>;
  remove(options: { id: string }): Promise<void>;
  speak(options: {
    id: string;
    text: string;
    speed?: number;
    speaker?: number;
  }): Promise<{ samples: number; sampleRate: number; seconds: number }>;
  stop(): Promise<void>;
  addListener(
    event: "voicePackProgress",
    handler: (progress: VoicePackProgress) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

export const FoldPageVoicePacks =
  registerPlugin<FoldPageVoicePacksPlugin>("FoldPageVoicePacks");

/** The pulse a gesture gives the moment it commits.
 *
 *  Distinct from `tap()` on purpose: this is the platform's own gesture
 *  feedback, tuned per device, not a duration in milliseconds. The hand should
 *  know that letting go will do something — without looking. */
export async function gestureThreshold(): Promise<void> {
  if (!isNative()) return;
  try {
    await SystemSettings.gestureThreshold();
  } catch {
    // Older phone, or the effect is unavailable: a plain tap still says
    // "something changed", which is the part that matters.
    void tap(ImpactStyle.Light);
  }
}

/** Claim audio focus while an article is read out.
 *
 *  Android 16 mutes audio that another process starts on an app's behalf
 *  unless somebody holds focus — and the speech engine is another process. On
 *  a Galaxy S23 the engine synthesised the text, opened an audio track, and the
 *  system muted it; the app was told everything had gone fine. Holding focus is
 *  what makes the sound arrive. */
export async function holdAudioFocus(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const { granted } = await SystemSettings.requestAudioFocus();
    return granted;
  } catch {
    return false;
  }
}

export async function releaseAudioFocus(): Promise<void> {
  if (!isNative()) return;
  try {
    await SystemSettings.abandonAudioFocus();
  } catch {
    /* nothing held it */
  }
}

/** Android's own text-to-speech screen: engine, speed, language, and the
    "Listen to an example" button that settles whether a silent reader is the
    app's fault or the phone's. */
export async function openSpeechSettings(): Promise<void> {
  if (!isNative()) return;
  try {
    await SystemSettings.openTextToSpeech();
  } catch {
    /* no such screen on this build */
  }
}

export const isNative = () => Capacitor.isNativePlatform();

/* ---------- haptics ---------- */

/** Last resort when the plugin call resolves without the phone moving.

    `Haptics.impact` maps to the platform's own feedback constants, which the
    system silently drops when "touch feedback" is switched off — the promise
    still resolves, so there is nothing to catch. `Vibrator` is a separate
    path that is not gated by that setting, so it is what actually makes
    FoldPage vibrate on a device where the subtle route stays quiet. */
async function pulse(ms: number) {
  try {
    await Haptics.vibrate({ duration: ms });
    return;
  } catch {
    /* fall through to the web API */
  }
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* no vibrator at all */
  }
}

export async function tap(style: ImpactStyle = ImpactStyle.Medium) {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style });
  } catch {
    /* device without a vibrator */
  }
  await pulse(
    style === ImpactStyle.Heavy ? 24 : style === ImpactStyle.Medium ? 16 : 10
  );
}

export async function buzzSuccess() {
  if (!isNative()) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* ignore */
  }
  await pulse(28);
}

export async function buzzWarning() {
  if (!isNative()) return;
  try {
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    /* ignore */
  }
  await pulse(45);
}

/* The library has three verbs and each one gets its own feel, so you can tell
   what happened without looking: setting a flag lands with a medium thump,
   clearing it answers with a lighter one, and throwing something away buzzes
   like a warning. Everything else — tabs, chips, text size — is a plain tap. */

/** Turning something on: favourited, archived. */
export const commit = () => tap(ImpactStyle.Medium);

/** Turning that same thing back off: unfavourited, back to the inbox. */
export const uncommit = () => tap(ImpactStyle.Light);

/** Destructive, and always paired with an undo affordance. */
export const discard = () => buzzWarning();

/* ---------- chrome ---------- */

/** Paint the status bar in the app's own colour and keep its icons legible.

    Letting the WebView draw behind the bar left a foreign strip above the app.
    So the bar is not overlaid: it gets the page background, which makes it
    read as part of FoldPage instead of as a bar. Dark theme means light icons,
    hence the inverted-looking mapping. */
export async function applyStatusBar() {
  if (!isNative()) return;
  // The user's own choice wins over the system's: a forced light theme with a
  // dark status bar would leave a black strip above a white page.
  const dark = isDarkNow();
  const paper = dark ? "#14171e" : "#fafaf7";
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    /* platform refuses to give the strip back — the CSS inset covers it */
  }
  try {
    await StatusBar.setBackgroundColor({ color: paper });
  } catch {
    /* no-op on platforms that own the colour */
  }
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch {
    /* status bar hidden or unavailable */
  }
}

/** Reveal the WebView once the first paint is in. */
export async function hideSplash() {
  if (!isNative()) return;
  try {
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    /* already hidden by launchAutoHide */
  }
}

/** Original articles open in the system browser, never inside the app shell. */
export async function openExternal(url: string) {
  if (!isNative()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await Browser.open({ url, presentationStyle: "popover" });
}

/* ---------- files ---------- */

/** Exports land in Documents and open the Android share sheet, because a
    WebView cannot trigger a normal browser download. */
export async function saveAndShare(
  filename: string,
  mime: string,
  content: string
) {
  if (!isNative()) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return filename;
  }
  const written = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  try {
    await Share.share({
      title: filename,
      url: written.uri,
      dialogTitle: "Share export",
    });
  } catch {
    /* user dismissed the sheet — the file is written either way */
  }
  return written.uri;
}

/* ---------- navigation ---------- */

/** True for anything that must not be loaded into the app's own WebView:
    a different origin, or a scheme the shell has no business rendering. */
function isExternalUrl(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.origin !== window.location.origin;
}

/** Any link pointing off-origin leaves for the system browser, wherever it
    sits in the tree. The reader already routes its article links explicitly;
    this is the net that catches everything else, so a stray tap can never
    strand the user on a foreign page inside the app shell with no chrome. */
export function wireExternalLinks(): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    const anchor = (e.target as HTMLElement | null)?.closest?.("a");
    const href = anchor?.getAttribute("href");
    if (!href || !isExternalUrl(href)) return;
    e.preventDefault();
    void openExternal(new URL(href, window.location.href).href);
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}

/** Hardware back: leave the reader/settings first, only then close the app.
    `canGoBack` counts the WebView's own history, which on a static export
    also covers the Next.js client-side routes. */
export async function wireBackButton(): Promise<() => void> {
  if (!isNative()) return () => {};
  const handle = await App.addListener("backButton", ({ canGoBack }) => {
    // An open sheet is the innermost layer: back closes it rather than leaving
    // the article underneath it. <dialog> handles Esc itself, but Android's
    // back button never reaches that path.
    const sheet = document.querySelector<HTMLDialogElement>("dialog[open]");
    if (sheet) {
      sheet.close();
      return;
    }
    const atInitialLibraryEntry =
      isHome() && !window.history.state?.foldPageSection;
    if (!canGoBack || atInitialLibraryEntry) {
      void App.exitApp();
    } else {
      window.history.back();
    }
  });
  return () => void handle.remove();
}

/** `trailingSlash` is on, so the library route is "/" during dev and "/" or
    "/index.html" once Capacitor serves the export from disk. */
function isHome(): boolean {
  const path = window.location.pathname;
  return path === "/" || path === "/index.html";
}
