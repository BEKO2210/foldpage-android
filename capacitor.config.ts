import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "de.ithandwerk.foldpage",
  appName: "FoldPage",
  webDir: "out",
  /** The whole library lives in IndexedDB, which is keyed by origin. Pinning
      the scheme here means an app update can never silently hand the WebView
      a different origin and orphan everything the user saved. */
  server: {
    androidScheme: "https",
    hostname: "localhost",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#fafaf7",
    // No remote code runs here, so leave the inspector shut on shipped builds.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      // NativeShell hides this as soon as React paints; the duration is only
      // the backstop for a WebView that never gets that far.
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      backgroundColor: "#fafaf7",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      // Icon style only. Under SDK 36 Android enforces edge-to-edge, so
      // `overlaysWebView` and `backgroundColor` are no-ops — the page pads
      // itself with env(safe-area-inset-*) instead.
      style: "LIGHT",
    },
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
