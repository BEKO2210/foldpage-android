"use client";

import { useEffect, useRef, useState } from "react";
import TopBar from "@/components/TopBar";
import DisplaySettings, { StorageSetting } from "@/components/DisplaySettings";
import VoiceSettings from "@/components/VoiceSettings";
import ActionRow from "@/components/ActionRow";
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
import {
  diagnose,
  installVoices,
  languagesInLibrary,
  type DiagnosisStep,
} from "@/lib/speech";
import { buzzSuccess } from "@/lib/native";

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
    // `status.phase` only, not the whole object: during an import a fresh
    // object is written per link, and this effect re-read the entire library
    // each time — a hundred links meant a hundred full reads.
  }, [status.phase, pruned]);

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
      one it cannot answer from the index.

      Said on screen as what the reader gets, not as what the code builds: an
      index is a data structure, and "prepared for search" is the same fact
      told to a person. */
  async function runIndex() {
    setIndexing({ phase: "running", done: 0, total: 0 });
    const result = await buildIndex((done, total) =>
      setIndexing({ phase: "running", done, total })
    );
    setIndexing({
      phase: "done",
      text: result.articles
        ? `${result.articles} article${result.articles === 1 ? "" : "s"} prepared — searching them is instant now.`
        : "Every article is already prepared.",
    });
  }

  /** Checked in the language the reader actually has articles in. It used to
      ask about German whatever the library held, so an English-only reader was
      told about a voice they would never hear. */
  async function runVoiceCheck() {
    setChecking(true);
    setVoiceCheck(null);
    try {
      const languages = await languagesInLibrary();
      setVoiceCheck(await diagnose(languages[0]?.code ?? null));
    } finally {
      setChecking(false);
    }
  }

  /* The haptic comes from ActionRow; a second pulse here made every settings
     action buzz twice, which is exactly how feedback stops meaning anything. */
  async function runExport(fn: () => Promise<string>) {
    setExported(null);
    setExported(await fn());
  }

  return (
    <main className="w-full">
      <TopBar back={{ href: "/", label: "Library" }} />
      <div className="settings-page max-w-2xl mx-auto px-4 sm:px-5 content-pad w-full">
        <h1
          className="text-2xl font-semibold mb-5"
          style={{ fontFamily: "var(--serif)" }}
          data-route-heading
          tabIndex={-1}
        >
          Settings
        </h1>

        {/* The two sections a reader opens on purpose. Side by side from a
            tablet's width up, because a 1280 px window showing one 672 px
            column of settings is a phone screen with wallpaper. Below that it
            is one column and nothing changes. */}
        <div className="settings-grid">
        <section id="s-appearance" className="settings-section">
          <h2 className="text-lg font-semibold mb-2">Appearance</h2>
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            How the app and your articles are set. The same controls sit behind
            the gear in the reader, so you can change them while reading.
          </p>
          <DisplaySettings />
        </section>

        <section id="s-reading-aloud" className="settings-section">
          <h2 className="text-lg font-semibold mb-2">Reading aloud</h2>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Articles are read out on the phone itself, offline. Speed, pitch and
            the length of the pauses are set here; each language keeps its own
            voice, so a German article and an English one never swap accents.
          </p>
          <VoiceSettings />
          {/* Fault-finding belongs one level down. Kept beside the setting it
              explains rather than on a screen of its own, but not competing
              with it: most people never need this, and the two who do need it
              at exactly this moment.

              The row that used to sit here — a second door to the phone's own
              speech screen — is gone: the voices block already carries that
              door, and it only appears when a voice is actually missing. */}
          <details className="disclosure">
            <summary>If it stays silent</summary>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Reading aloud plays on the <b>media</b> volume, not the ringer — a
              phone with the ringer up and media turned down is silent here and
              nowhere else.
            </p>
            <div className="action-list">
              <ActionRow
                label="Check reading aloud"
                hint="Finds the point where the sound stops"
                onClick={() => void runVoiceCheck()}
                disabled={checking}
                busy={checking ? "…" : undefined}
              />
              <ActionRow
                label="Repair a voice"
                hint="Adds or replaces the voice files for a language"
                onClick={() => void installVoices()}
              />
            </div>
            {voiceCheck && (
              <ul className="check-list" role="status">
                {voiceCheck.map((step) => (
                  <li key={step.label} data-ok={step.ok ? "yes" : "no"}>
                    <span className="mark" aria-hidden="true">{step.ok ? "✓" : "✗"}</span>
                    <span>
                      {step.label}
                      {step.detail ? <span className="hint"> {step.detail}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </section>
        </div>

        <section id="s-library" className="settings-section">
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
          <p className="text-sm mt-2 mb-4" style={{ color: "var(--muted)" }}>
            This build has no account and no cloud sync. Nothing leaves the
            device except the requests that fetch the articles you save.
          </p>
          <StorageSetting />
          {/* Housekeeping, and it belongs one level down: three actions a
              reader runs once a year, sitting open above the things they came
              for, is what made this screen a wall. */}
          <details className="disclosure">
            <summary>Repairs and space</summary>
            <div className="action-list">
              <ActionRow
                label="Fetch missing pictures"
                hint="For articles saved before pictures were kept"
                onClick={() => void runBackfill()}
                disabled={backfill.phase === "running"}
                busy={backfill.phase === "running" ? `${backfill.done}/${backfill.total}` : undefined}
              />
              <ActionRow
                label="Speed up search"
                hint="Prepares older articles so searching them is instant"
                onClick={() => void runIndex()}
                disabled={indexing.phase === "running"}
                busy={indexing.phase === "running" ? "…" : undefined}
              />
              <ActionRow
                label="Free up space"
                hint="Removes pictures no article refers to any more"
                onClick={() => void freeUpSpace()}
                disabled={backfill.phase === "running"}
              />
            </div>
            {indexing.phase === "running" && indexing.total > 0 && (
              <p className="text-sm mt-2" style={{ color: "var(--muted)" }} role="status">
                Preparing article {indexing.done} of {indexing.total} …
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
          </details>

          <details className="disclosure" id="s-import">
            <summary>Bring a library in</summary>
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
          </details>

          <details className="disclosure" id="s-export">
            <summary>Take your library out</summary>
            <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
              Your library is yours. Files land in <b>Documents</b> and the share
              sheet opens right after, so you can send them anywhere.
            </p>
            <div className="action-list">
              <ActionRow label="Export as JSON" hint="Everything, exactly as stored" onClick={() => void runExport(exportJson)} />
              <ActionRow label="Export as HTML" hint="Readable in any browser" onClick={() => void runExport(exportHtml)} />
              <ActionRow label="Export as Markdown" hint="Plain text with the formatting kept" onClick={() => void runExport(exportMarkdown)} />
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
          </details>
        </section>

        <section id="s-sharing" className="settings-section">
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
