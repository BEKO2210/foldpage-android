"use client";

import { useEffect, useRef, useState } from "react";
import TopBar from "@/components/TopBar";
import {
  exportHtml,
  exportJson,
  exportMarkdown,
  parseImportFile,
  type ImportRow,
} from "@/lib/importExport";
import { addArticleFromUrl } from "@/lib/articles";
import { findByUrl, listArticles, newId, saveArticle } from "@/lib/db";
import { buzzSuccess, tap } from "@/lib/native";

type ImportStatus =
  | { phase: "idle" }
  | {
      phase: "running";
      done: number;
      total: number;
      failed: number;
      current: string;
    }
  | { phase: "finished"; done: number; total: number; failed: number };

export default function SettingsPage() {
  const [status, setStatus] = useState<ImportStatus>({ phase: "idle" });
  const [stats, setStats] = useState<{ count: number; words: number } | null>(
    null
  );
  const [exported, setExported] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    listArticles().then((all) =>
      setStats({
        count: all.length,
        words: all.reduce((n, a) => n + a.wordCount, 0),
      })
    );
  }, [status]);

  async function runImport(rows: ImportRow[]) {
    cancelRef.current = false;
    let done = 0;
    let failed = 0;
    for (const row of rows) {
      if (cancelRef.current) break;
      setStatus({
        phase: "running",
        done,
        total: rows.length,
        failed,
        current: row.title,
      });
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
    void buzzSuccess();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const rows = parseImportFile(file.name, text);
    if (rows.length === 0) {
      alert(
        "No links found in that file. Expected a Pocket CSV or a bookmarks HTML export."
      );
      return;
    }
    if (
      confirm(
        `Import ${rows.length} links? Articles are downloaded one by one — keep FoldPage open while it runs.`
      )
    ) {
      void runImport(rows);
    }
  }

  async function runExport(fn: () => Promise<string>) {
    void tap();
    setExported(null);
    setExported(await fn());
  }

  return (
    <main className="w-full">
      <TopBar back={{ href: "/", label: "Library" }} />
      <div className="max-w-2xl mx-auto px-4 sm:px-5 content-pad w-full">
        <h1
          className="text-2xl font-semibold mb-5"
          style={{ fontFamily: "var(--serif)" }}
        >
          Settings
        </h1>

        <section className="section-card mb-5">
          <h2 className="text-lg font-semibold mb-2">Your library</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {stats
              ? `${stats.count} article${
                  stats.count === 1 ? "" : "s"
                } · ${stats.words.toLocaleString(
                  "de-DE"
                )} words — stored on this phone only.`
              : "…"}
          </p>
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
            This build has no account and no cloud sync. Nothing leaves the
            device except the requests that fetch the articles you save.
          </p>
        </section>

        <section className="section-card mb-5">
          <h2 className="text-lg font-semibold mb-2">Import</h2>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Bring your library along: a Pocket export (CSV or HTML) or any
            bookmarks HTML file. Unzip the Pocket ZIP first and pick the CSV
            inside.
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
                Importing {status.done + 1} of {status.total} … ({status.failed}{" "}
                failed)
              </p>
              <p className="truncate" style={{ color: "var(--muted)" }}>
                {status.current}
              </p>
              <button
                className="btn btn-quiet pressable mt-2"
                onClick={() => (cancelRef.current = true)}
              >
                Stop
              </button>
            </div>
          )}
          {status.phase === "finished" && (
            <p className="mt-4 text-sm" role="status">
              Done: {status.done} imported
              {status.failed
                ? `, ${status.failed} saved as link-only (page unreachable)`
                : ""}
              .
            </p>
          )}
        </section>

        <section className="section-card mb-5">
          <h2 className="text-lg font-semibold mb-2">Export</h2>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Your library is yours. Files land in <b>Documents</b> and the share
            sheet opens right after, so you can send them anywhere.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              className="btn btn-quiet pressable"
              onClick={() => void runExport(exportJson)}
            >
              JSON
            </button>
            <button
              className="btn btn-quiet pressable"
              onClick={() => void runExport(exportHtml)}
            >
              HTML
            </button>
            <button
              className="btn btn-quiet pressable"
              onClick={() => void runExport(exportMarkdown)}
            >
              Markdown
            </button>
          </div>
          {exported && (
            <p
              className="mt-3 text-sm break-all"
              style={{ color: "var(--muted)" }}
              role="status"
            >
              Saved to {exported}
            </p>
          )}
        </section>

        <section className="section-card">
          <h2 className="text-lg font-semibold mb-2">Save from anywhere</h2>
          <ul
            className="text-sm grid gap-2 pl-5"
            style={{ color: "var(--muted)" }}
          >
            <li>
              In any app, hit <b>Share</b> and pick <b>FoldPage</b> — the link
              is fetched and filed away for you.
            </li>
            <li>Or paste a link into the field at the top of your library.</li>
          </ul>
        </section>

        <footer className="legal-links mt-8" aria-label="Legal information">
          <a href="https://beko2210.github.io/foldpage-android/datenschutz/">
            Datenschutz
          </a>
          <span aria-hidden="true">·</span>
          <a href="https://beko2210.github.io/foldpage-android/impressum/">
            Impressum
          </a>
        </footer>
      </div>
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
