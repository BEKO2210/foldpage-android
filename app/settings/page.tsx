"use client";

import { useRef, useState } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import AuthPanel from "@/components/AuthPanel";
import { exportHtml, exportJson, exportMarkdown, parseImportFile, type ImportRow } from "@/lib/importExport";
import { addArticleFromUrl } from "@/lib/articles";
import { findByUrl, newId, saveArticle } from "@/lib/db";

type ImportStatus =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number; failed: number; current: string }
  | { phase: "finished"; done: number; total: number; failed: number };

export default function SettingsPage() {
  const [status, setStatus] = useState<ImportStatus>({ phase: "idle" });
  const cancelRef = useRef(false);

  async function runImport(rows: ImportRow[]) {
    cancelRef.current = false;
    let done = 0;
    let failed = 0;
    for (const row of rows) {
      if (cancelRef.current) break;
      setStatus({ phase: "running", done, total: rows.length, failed, current: row.title });
      try {
        const existing = await findByUrl(row.url);
        if (!existing) {
          try {
            await addArticleFromUrl(row.url, "import", {
              tags: row.tags,
              state: row.archived ? "archived" : "inbox",
              addedAt: row.addedAt,
            });
          } catch {
            await saveArticle({
              id: newId(),
              url: row.url,
              canonicalUrl: row.url,
              title: row.title,
              author: null,
              siteName: hostnameOf(row.url),
              excerpt: "(content could not be downloaded — open the original)",
              contentHtml: "",
              wordCount: 0,
              readingMin: 1,
              lang: null,
              state: row.archived ? "archived" : "inbox",
              favorite: false,
              progress: 0,
              tags: row.tags,
              source: "import",
              addedAt: row.addedAt,
              readAt: null,
              modifiedAt: Date.now(),
              deleted: false,
            });
            failed++;
          }
        }
      } catch {
        failed++;
      }
      done++;
    }
    setStatus({ phase: "finished", done, total: rows.length, failed });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const rows = parseImportFile(file.name, text);
    if (rows.length === 0) {
      alert("No links found in that file. Expected a Pocket CSV or HTML export.");
      return;
    }
    if (confirm(`Import ${rows.length} links? Articles are downloaded one by one — you can keep the tab open in the background.`)) {
      void runImport(rows);
    }
  }

  return (
    <main className="w-full">
      <TopBar back={{ href: "/", label: "Library" }} />
      <div className="max-w-2xl mx-auto px-4 sm:px-5 content-pad w-full">
        <h1 className="text-2xl font-semibold mb-8" style={{ fontFamily: "var(--serif)" }}>
          Settings
        </h1>

        <section className="section-card mb-5">
          <h2 className="text-lg font-semibold mb-2">Sync between devices</h2>
          <AuthPanel />
        </section>

        <section className="section-card mb-5">
          <h2 className="text-lg font-semibold mb-2">Import</h2>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Bring your library back: upload a Pocket export (CSV or HTML) or any bookmarks HTML file.
            Unzip the Pocket ZIP first and pick the CSV inside.
          </p>
          <input
            type="file"
            accept=".csv,.html,text/csv,text/html"
            onChange={onFile}
            disabled={status.phase === "running"}
            aria-label="Import file"
          />
          {status.phase === "running" && (
            <div className="mt-4 text-sm" role="status">
              <p>
                Importing {status.done + 1} of {status.total} … ({status.failed} failed)
              </p>
              <p className="truncate" style={{ color: "var(--muted)" }}>{status.current}</p>
              <button className="btn btn-quiet mt-2" onClick={() => (cancelRef.current = true)}>
                Stop
              </button>
            </div>
          )}
          {status.phase === "finished" && (
            <p className="mt-4 text-sm" role="status">
              Done: {status.done} imported{status.failed ? `, ${status.failed} saved as link-only (page unreachable)` : ""}.
            </p>
          )}
        </section>

        <section className="section-card mb-5">
          <h2 className="text-lg font-semibold mb-2">Export</h2>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Your library is yours — take it anywhere, anytime.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-quiet" onClick={() => void exportJson()}>JSON</button>
            <button className="btn btn-quiet" onClick={() => void exportHtml()}>HTML</button>
            <button className="btn btn-quiet" onClick={() => void exportMarkdown()}>Markdown</button>
          </div>
        </section>

        <section className="section-card">
          <h2 className="text-lg font-semibold mb-2">Save from anywhere</h2>
          <ul className="text-sm grid gap-2 pl-5" style={{ color: "var(--muted)" }}>
            <li>
              <b>Android:</b> install FoldPage (browser menu → “Add to Home screen”) — it appears in the
              share sheet.
            </li>
            <li>
              <b>Desktop:</b> install the browser extension (chrome://extensions → Developer mode →
              “Load unpacked” → the <code>extension/</code> folder from the repo) — one click saves the
              current tab.
            </li>
            <li>
              <b>iPhone:</b> use the bookmarklet — create any bookmark, then edit its address to:{" "}
              <code style={{ wordBreak: "break-all" }}>
                javascript:location.href=&apos;https://app-foldpage.it-handwerk-stuttgart.de/?add=&apos;+encodeURIComponent(location.href)
              </code>
            </li>
          </ul>
        </section>
      </div>
      <BottomNav active="settings" />
    </main>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
