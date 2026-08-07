"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Article } from "@/lib/types";
import { allTags, deleteArticle, listArticles, restoreArticle, searchArticles, updateArticle } from "@/lib/db";
import { addArticleFromUrl } from "@/lib/articles";
import { currentUser, syncNow } from "@/lib/sync";
import TopBar from "./TopBar";
import { ArchiveIcon, CheckIcon, InboxIcon, SettingsIcon, StarIcon, TrashIcon, UndoIcon } from "./icons";

type Tab = "inbox" | "archived" | "favorites";

const TAB_META: Record<Tab, { label: string; Icon: (p: { size?: number }) => React.ReactNode }> = {
  inbox: { label: "Inbox", Icon: InboxIcon },
  archived: { label: "Archive", Icon: ArchiveIcon },
  favorites: { label: "Favorites", Icon: (p) => <StarIcon {...p} /> },
};

export default function Library() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [tab, setTab] = useState<Tab>("inbox");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<{ text: string; undoId: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setArticles(query ? await searchArticles(query) : await listArticles());
    setTags(await allTags());
    setLoaded(true);
  }, [query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // quiet auto-sync when signed in
  useEffect(() => {
    (async () => {
      const u = await currentUser();
      if (u && u.emailVerification) {
        try {
          const r = await syncNow();
          if (r.pulled > 0) await refresh();
        } catch {
          /* offline or first run — manual sync lives in Settings */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle ?add=<url> (PWA share target / bookmarklet / extension) and ?tab=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "inbox" || t === "archived" || t === "favorites") setTab(t);
    const raw = params.get("add") || params.get("url") || params.get("text") || "";
    const match = raw.match(/https?:\/\/\S+/);
    if (match) {
      window.history.replaceState({}, "", "/");
      void handleAdd(match[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(addUrl?: string) {
    const target = (addUrl ?? url).trim();
    if (!target) return;
    setBusy(true);
    setNotice(null);
    try {
      const { article, duplicate } = await addArticleFromUrl(target);
      setUrl("");
      setNotice(duplicate ? "Already in your library." : `Saved: ${article.title}`);
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save that page");
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    let list = articles;
    if (!query) {
      list =
        tab === "favorites"
          ? list.filter((a) => a.favorite)
          : list.filter((a) => a.state === tab);
    }
    if (tagFilter) list = list.filter((a) => a.tags.includes(tagFilter));
    return list;
  }, [articles, tab, query, tagFilter]);

  const counts = useMemo(
    () => ({
      inbox: articles.filter((a) => a.state === "inbox").length,
      archived: articles.filter((a) => a.state === "archived").length,
      favorites: articles.filter((a) => a.favorite).length,
    }),
    [articles]
  );

  async function toggle(a: Article, patch: Partial<Article>) {
    await updateArticle(a.id, patch);
    await refresh();
  }

  async function removeWithUndo(a: Article) {
    await deleteArticle(a.id);
    await refresh();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text: `Deleted “${truncate(a.title, 40)}”`, undoId: a.id });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  async function undoDelete(id: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
    await restoreArticle(id);
    await refresh();
  }

  return (
    <main className="w-full">
      <TopBar
        right={
          <Link href="/settings" className="btn btn-quiet no-underline text-sm desktop-tabs">
            Settings
          </Link>
        }
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-5 content-pad w-full">
        <form
          className="flex gap-2 mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAdd();
          }}
        >
          <input
            className="input"
            type="url"
            inputMode="url"
            placeholder="Paste a link to save it…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Article URL"
          />
          <button className="btn" style={{ minWidth: "5.5rem" }} disabled={busy || !url.trim()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
        {notice && (
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }} role="status">
            {notice}
          </p>
        )}

        <div className="desktop-tabs flex gap-2 mb-2 overflow-x-auto" role="tablist" aria-label="Library sections">
          {(Object.keys(TAB_META) as Tab[]).map((t) => (
            <button
              key={t}
              className="tab"
              role="tab"
              aria-selected={tab === t && !query}
              onClick={() => {
                setQuery("");
                setTab(t);
              }}
            >
              {TAB_META[t].label} ({counts[t]})
            </button>
          ))}
        </div>

        <input
          className="input mb-3"
          type="search"
          placeholder="Search your library…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search"
        />

        {tags.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto" aria-label="Filter by tag">
            {tags.map((t) => (
              <button
                key={t}
                className="chip"
                aria-pressed={tagFilter === t}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {loaded && visible.length === 0 && (
          <div className="text-center py-16" style={{ color: "var(--muted)" }}>
            {articles.length === 0 ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/empty-shelf.png"
                  alt=""
                  width={180}
                  height={180}
                  className="mx-auto mb-5"
                  style={{ borderRadius: "0.9rem", border: "1px solid var(--line)" }}
                />
                <p className="text-lg mb-1" style={{ fontFamily: "var(--serif)" }}>
                  Your shelf is empty.
                </p>
                <p className="text-sm">
                  Paste a link above — or import your Pocket export in{" "}
                  <Link href="/settings" className="underline">
                    Settings
                  </Link>
                  .
                </p>
              </>
            ) : (
              <p className="text-sm">Nothing here.</p>
            )}
          </div>
        )}

        <ul className="grid gap-3 list-none p-0 m-0">
          {visible.map((a) => (
            <li key={a.id} className={`card ${a.progress >= 0.98 ? "is-read" : ""}`}>
              <p
                className="text-xs uppercase tracking-widest mb-1"
                style={{ color: "var(--muted)", fontFamily: "var(--sans)" }}
              >
                {a.siteName ?? hostnameOf(a.canonicalUrl)} · {a.readingMin} min
                {a.progress > 0 && a.progress < 0.98 ? ` · ${Math.round(a.progress * 100)}%` : ""}
              </p>
              <h3 className="text-lg font-semibold leading-snug m-0 mb-1">
                <Link
                  href={`/read/${a.id}`}
                  className="cardlink no-underline"
                  style={{ color: "var(--ink)" }}
                >
                  {a.title}
                </Link>
              </h3>
              <p className="text-sm m-0 line-clamp-2" style={{ color: "var(--muted)" }}>
                {a.excerpt}
              </p>
              <div className="actions flex items-center justify-between mt-1">
                <div className="flex gap-1 flex-wrap">
                  {a.tags.slice(0, 3).map((t) => (
                    <span key={t} className="chip" style={{ cursor: "default", padding: "0.15rem 0.55rem", fontSize: "0.72rem" }}>
                      {t}
                    </span>
                  ))}
                </div>
                <div className="flex">
                  <button
                    className="iconbtn"
                    aria-pressed={a.favorite}
                    aria-label={a.favorite ? "Remove from favorites" : "Add to favorites"}
                    onClick={() => toggle(a, { favorite: !a.favorite })}
                  >
                    <StarIcon filled={a.favorite} />
                  </button>
                  <button
                    className="iconbtn"
                    aria-label={a.state === "inbox" ? "Archive" : "Back to inbox"}
                    title={a.state === "inbox" ? "Archive" : "Back to inbox"}
                    onClick={() => toggle(a, { state: a.state === "inbox" ? "archived" : "inbox" })}
                  >
                    {a.state === "inbox" ? <CheckIcon /> : <UndoIcon />}
                  </button>
                  <button className="iconbtn" aria-label="Delete" onClick={() => void removeWithUndo(a)}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast.text}</span>
          <button onClick={() => void undoDelete(toast.undoId)}>Undo</button>
        </div>
      )}

      <nav className="bottomnav" aria-label="Library sections">
        {(Object.keys(TAB_META) as Tab[]).map((t) => {
          const { Icon, label } = TAB_META[t];
          return (
            <button
              key={t}
              aria-selected={tab === t && !query}
              onClick={() => {
                setQuery("");
                setTab(t);
                window.scrollTo({ top: 0 });
              }}
            >
              <span className="nav-ico" aria-hidden="true">
                <Icon size={22} />
              </span>
              {label}
            </button>
          );
        })}
        <Link href="/settings">
          <span className="nav-ico" aria-hidden="true">
            <SettingsIcon size={22} />
          </span>
          Settings
        </Link>
      </nav>
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

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
