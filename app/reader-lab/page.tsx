"use client";

import { useEffect } from "react";
import { extractArticle } from "@/lib/extract";

declare global {
  interface Window {
    readerLabExtract?: typeof extractArticle;
  }
}

/** Build-only harness used by scripts/reader-lab.mjs. */
export default function ReaderLabPage() {
  useEffect(() => {
    window.readerLabExtract = extractArticle;
    return () => {
      delete window.readerLabExtract;
    };
  }, []);
  return <p>Reader lab</p>;
}
