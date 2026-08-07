import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "de.ithandwerk.foldpage",
  appName: "FoldPage",
  webDir: "out",
  android: {
    allowMixedContent: false,
    backgroundColor: "#fafaf7",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: "#fafaf7",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: "#fafaf7",
      style: "LIGHT",
    },
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
