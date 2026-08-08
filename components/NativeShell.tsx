"use client";

import { useEffect } from "react";
import {
  applyStatusBar,
  hideSplash,
  isNative,
  wireBackButton,
  wireExternalLinks,
} from "@/lib/native";

/** Everything the WebView needs to stop feeling like a WebView: status bar
    icons that follow the theme, a hardware back button that walks the app's
    own history, off-origin links handed to the system browser, and the splash
    held until React has actually painted.

    Mounted once from the root layout, renders nothing. */
export default function NativeShell() {
  useEffect(() => {
    const unwireLinks = wireExternalLinks();
    if (!isNative()) return unwireLinks;

    void applyStatusBar();
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => void applyStatusBar();
    scheme.addEventListener("change", onScheme);

    // addListener is async, so unmount may beat it — park the unsubscribe.
    let unwireBack: (() => void) | undefined;
    let unmounted = false;
    void wireBackButton().then((off) => {
      if (unmounted) off();
      else unwireBack = off;
    });

    // Two frames: the first commits the DOM, the second paints it.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => void hideSplash())
    );

    return () => {
      unmounted = true;
      cancelAnimationFrame(raf);
      scheme.removeEventListener("change", onScheme);
      unwireLinks();
      unwireBack?.();
    };
  }, []);

  return null;
}
