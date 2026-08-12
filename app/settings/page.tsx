"use client";

import { useEffect, useRef, useState } from "react";
import TopBar from "@/components/TopBar";
import DisplaySettings from "@/components/DisplaySettings";
import {
  exportHtml,
  exportJson,
  exportMarkdown,
  parseImportFile,
  type ImportRow,
} from "@/lib/importExport";
import { addArticleFromUrl } from "@/lib/articles";
import { findByUrl, imageBytes, listArticles, newId, saveArticle } from "@/lib/db";
import { articlesMissingImages, backfillImages, pruneImages } from "@/lib/images";
import { buildIndex } from "@/lib/search";
import { diagnose, installVoices, openSpeechSettings, type DiagnosisStep } from "@/lib/speech";
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
  const [stats, setStats] = useState<{
    count: number;
    words: number;
    images: number;
    imageBytes: number;
  } | null>(null);
  const [pruned, setPruned] = useState<string | null>(null);
  const [backfill, setBackfill] = useState<
    { phase: "idle" } | { phase: "running"; done: number; total: number } | { phase: "done"; text: string }
  >({ phase: "idle" });
  const stopBackfill = useRef(false);
  const [voiceCheck, setVoiceCheck] = useState<DiagnosisStep[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [indexing, setIndexing] = useState<
    { phase: "idle" } | { phase: "running"; done: number; total: number } | { phase: "done"; text: string }
  >({ phase: "idle" });
  const [exported, setExported] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const all = await listArticles();
      const images = await imageBytes();
      setStats({
        count: all.length,
        words: all.reduce((n, a) => n + a.wordCount, 0),
        images: images.count,
        imageBytes: images.bytes,
      });
    })();
  }, [status, pruned]);

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

  /** Pictures whose article is really gone — not merely in the undo window —
      are the only thing this removes. */
  async function freeUpSpace() {
    void tap();
    setPruned(null);
    const { removed, bytes } = await pruneImages();
    setPruned(
      removed
        ? `Removed ${removed} unused image${removed === 1 ? "" : "s"}, ${formatBytes(bytes)} freed.`
        : "Nothing to free — every stored image still belongs to an article."
    );
  }

  /** Articles saved before pictures were kept — or whose downloads failed —
      brought up to date in one pass. Explicit, so it runs even when the switch
      above says new saves should stay link-only. */
  async function runBackfill() {
    void tap();
    stopBackfill.current = false;
    const ids = await articlesMissingImages();
    if (!ids.length) {
      setBackfill({ phase: "done", text: "Every article already has its pictures." });
      return;
    }
    setBackfill({ phase: "running", done: 0, total: ids.length });
    const result = await backfillImages(
      ids,
      (done, total) => setBackfill({ phase: "running", done, total }),
      () => stopBackfill.current
    );
    setBackfill({
      phase: "done",
      text: `${result.articles} article${result.articles === 1 ? "" : "s"} processed, ${
        result.stored
      } image${result.stored === 1 ? "" : "s"} stored (${formatBytes(result.bytes)})${
        result.stopped ? " — stopped" : ""
      }.`,
    });
    setPruned(null);
  }

  /** Articles saved before there was a word index. Search still finds them
      without this — it reads them the old way — but each one it has to read is
      one it cannot answer from the index. */
  async function runIndex() {
    void tap();
    setIndexing({ phase: "running", done: 0, total: 0 });
    const result = await buildIndex((done, total) =>
      setIndexing({ phase: "running", done, total })
    );
    setIndexing({
      phase: "done",
      text: result.articles
        ? `${result.articles} article${result.articles === 1 ? "" : "s"} indexed, ${result.terms.toLocaleString()} terms.`
        : "Every article is already in the index.",
    });
  }

  async function runVoiceCheck() {
    void tap();
    setChecking(true);
    setVoiceCheck(null);
    try {
      setVoiceCheck(await diagnose("de"));
    } finally {
      setChecking(false);
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
          data-route-heading
          tabIndex={-1}
        >
          Settings
        </h1>

        <section className="section-card mb-5">
          <h2 className="text-lg font-semibold mb-2">Appearance</h2>
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            How the app and your articles are set. The same controls sit behind
            the gear in the reader, so you can change them while reading.
          </p>
          <DisplaySettings storage />
        </section>

        <section className="section-card mb-5">
          <h2 className="text-lg font-semibold mb-2">Your library</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {stats
              ? `${stats.count} article${
                  stats.count === 1 ? "" : "s"
                } · ${stats.words.toLocaleString()} words · ${
                  stats.images
                } image${stats.images === 1 ? "" : "s"} (${formatBytes(
                  stats.imageBytes
                )}) — stored on this phone only.`
              : "…"}
          </p>
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
            This build has no account and no cloud sync. Nothing leaves the
            device except the requests that fetch the articles you save.
          </p>
          <div className="flex gap-2 flex-wrap mt-3">
            <button
              className="btn btn-quiet pressable"
              onClick={() => void runBackfill()}
              disabled={backfill.phase === "running"}
            >
              Fetch missing pictures
            </button>
            <button
              className="btn btn-quiet pressable"
              onClick={() => void freeUpSpace()}
              disabled={backfill.phase === "running"}
            >
              Free up space
            </button>
            <button
              className="btn btn-quiet pressable"
              onClick={() => void runIndex()}
              disabled={indexing.phase === "running"}
            >
              {indexing.phase === "running" ? "Indexing…" : "Index for search"}
            </button>
          </div>
          {indexing.phase === "running" && indexing.total > 0 && (
            <p className="text-sm mt-2" style={{ color: "var(--muted)" }} role="status">
              Indexing article {indexing.done} of {indexing.total} …
            </p>
          )}
          {indexing.phase === "done" && (
            <p className="text-sm mt-2" style={{ color: "var(--muted)" }} role="status">
              {indexing.text}
            </p>
          )}
          {backfill.phase === "running" && (
            <div className="mt-3 text-sm" role="status">
              <p>
                Fetching pictures for article {backfill.done + 1} of {backfill.total} …
              </p>
              <button
                className="btn btn-quiet pressable mt-2"
                onClick={() => (stopBackfill.current = true)}
              >
                Stop
              </button>
            </div>
          )}
          {backfill.phase === "done" && (
            <p className="text-sm mt-2" style={{ color: "var(--muted)" }} role="status">
              {backfill.text}
            </p>
          )}
          {pruned && (
            <p className="text-sm mt-2" style={{ color: "var(--muted)" }} role="status">
              {pruned}
            </p>
          )}
        </section>

        <section className="section-card mb-5">
          <h2 className="text-lg font-semibold mb-2">Reading aloud</h2>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            The voice comes from Android, not from FoldPage: whichever engine the
            phone is set to use does the speaking. If the reader stays silent,
            this says which link in the chain is missing — and two of them are
            outside the app.
          </p>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Speech plays on the <b>media</b> volume, not the ringer. A phone with
            the ringer up and media muted is silent here and nowhere else.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              className="btn btn-quiet pressable"
              onClick={() => void runVoiceCheck()}
              disabled={checking}
            >
              {checking ? "Checking…" : "Check the voice"}
            </button>
            <button className="btn btn-quiet pressable" onClick={() => void openSpeechSettings()}>
              Android speech settings
            </button>
            <button className="btn btn-quiet pressable" onClick={() => void installVoices()}>
              Install voices
            </button>
          </div>
          {voiceCheck && (
            <ul className="text-sm mt-3 grid gap-1 pl-0" style={{ listStyle: "none" }} role="status">
              {voiceCheck.map((step) => (
                <li key={step.label}>
                  <span aria-hidden="true">{step.ok ? "✓" : "✗"}</span> {step.label}
                  {step.detail ? (
                    <span style={{ color: "var(--muted)" }}> — {step.detail}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
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

        {/* The pages themselves are German — they are the legally binding
            wording for a German publisher — but the labels that lead to them
            belong to the interface, and that is English. */}
        <footer className="legal-links mt-8" aria-label="Legal information">
          <a
            href="https://beko2210.github.io/foldpage-android/datenschutz/"
            hrefLang="de"
          >
            Privacy
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://beko2210.github.io/foldpage-android/impressum/"
            hrefLang="de"
          >
            Legal notice
          </a>
        </footer>
      </div>
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
