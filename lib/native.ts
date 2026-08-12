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
