import type { NextConfig } from "next";

/** Static export: the whole app ships inside the APK and is served by
    Capacitor's local server. No Node runtime on the device, so there are
    no route handlers — article extraction happens in the WebView instead. */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
