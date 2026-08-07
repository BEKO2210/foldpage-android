"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

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

export async function tap(style: ImpactStyle = ImpactStyle.Light) {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style });
  } catch {
    /* device without a vibrator */
  }
}

export async function buzzSuccess() {
  if (!isNative()) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* ignore */
  }
}

export async function buzzWarning() {
  if (!isNative()) return;
  try {
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    /* ignore */
  }
}

/* ---------- chrome ---------- */

/** Keep the status bar in step with the system theme. */
export async function applyStatusBar() {
  if (!isNative()) return;
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: dark ? "#14171e" : "#fafaf7" });
  } catch {
    /* edge-to-edge devices ignore the colour */
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
export async function saveAndShare(filename: string, mime: string, content: string) {
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
    await Share.share({ title: filename, url: written.uri, dialogTitle: "Export teilen" });
  } catch {
    /* user dismissed the sheet — the file is written either way */
  }
  return written.uri;
}

/* ---------- navigation ---------- */

/** Hardware back: leave the reader/settings first, only then close the app. */
export async function wireBackButton() {
  if (!isNative()) return;
  await App.addListener("backButton", ({ canGoBack }) => {
    if (window.location.pathname === "/" || !canGoBack) {
      void App.exitApp();
    } else {
      window.history.back();
    }
  });
}
