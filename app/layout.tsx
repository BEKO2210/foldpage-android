import type { Metadata, Viewport } from "next";
import "./globals.css";
import NativeShell from "@/components/NativeShell";
import AppNav from "@/components/AppNav";
import RouteFocus from "@/components/RouteFocus";

export const metadata: Metadata = {
  title: "FoldPage",
  description:
    "Save any article in one click. Read it clean, offline, forever.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#14171e" },
  ],
};

/** Runs before the first paint, so the chosen theme and typography are on the
    document by the time anything is drawn. Without it every launch would show
    the system theme for a frame and then correct itself — a white flash on a
    dark phone. Kept deliberately small and dependency-free; the same values are
    written by lib/display.ts once React is up. */
const APPLY_DISPLAY_PREFS = `try{
var p=JSON.parse(localStorage.getItem("fp-display")||"{}");
var s=["1rem","1.15rem","1.3rem","1.5rem"];
var l=parseInt(localStorage.getItem("fp-reader-size"),10);
var i=[0,1,2,3].indexOf(p.size)>=0?p.size:([0,1,2,3].indexOf(l)>=0?l:1);
var d=document.documentElement;
d.dataset.theme=["system","light","dark"].indexOf(p.theme)>=0?p.theme:"system";
d.dataset.align=p.align==="justify"?"justify":"left";
d.dataset.font=p.font==="sans"?"sans":"serif";
d.dataset.leading=p.leading==="airy"?"airy":"cozy";
d.style.setProperty("--reader-size",s[i]);
}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_DISPLAY_PREFS }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <AppNav />
        <RouteFocus />
        <NativeShell />
      </body>
    </html>
  );
}
