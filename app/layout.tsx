import type { Metadata, Viewport } from "next";
import "./globals.css";
import NativeShell from "@/components/NativeShell";
import AppNav from "@/components/AppNav";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <AppNav />
        <NativeShell />
      </body>
    </html>
  );
}
