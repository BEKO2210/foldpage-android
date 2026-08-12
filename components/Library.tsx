"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Article } from "@/lib/types";
import {
  allTags,
  deleteArticle,
  listArticles,
  restoreArticle,
  searchArticles,
  updateArticle,
} from "@/lib/db";
import { addArticleFromUrl } from "@/lib/articles";
import TopBar from "./TopBar";
import Welcome from "./Welcome";
import { SECTION_EVENT } from "./AppNav";
import {
  ArchiveIcon,
  CheckIcon,
  InboxIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
  UndoIcon,
} from "./icons";
import {
  ShareTarget,
  buzzSuccess,
  buzzWarning,
  commit,
  discard,
  uncommit,
  isNative,
  tap,
} from "@/lib/native";

type Tab = "inbox" | "archived" | "favorites";

const scrollKey = (tab: Tab) => `foldpage:scroll:${tab}`;

const TAB_META: Record<
  Tab,
  { label: string; Icon: (p: { size?: number }) => React.ReactNode }
> = {
  inbox: { label: "Inbox", Icon: InboxIcon },
  archived: { label: "Archive", Icon: ArchiveIcon },
  favorites: { label: "Favorites", Icon: (p) => <StarIcon {...p} /> },
};

const EMPTY_META: Record<Tab, { title: string; description: string }> = {
  inbox: {
    title: "Your inbox is empty.",
    description:
      "Paste a link above — or share one into FoldPage from any app.",
  },
  archived: {
    title: "No archived pages yet.",
    description:
      "Archive a page from your inbox when you want to keep it out of the way.",
  },
  favorites: {
    title: "No favorites yet.",
    description: "Tap the star on any page to keep it close.",
  },
};

const URL_IN_TEXT = /https?:\/\/\S+/;

export default function Library() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [tab, setTab] = useState<Tab>("inbox");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<{ text: string; undoId: string } | null>(
    null
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addingRef = useRef(false);
  const tabRef = useRef<Tab>("inbox");

  const restoreScroll = useCallback((nextTab: Tab) => {
    const top = Number(sessionStorage.getItem(scrollKey(nextTab))) || 0;
    requestAnimationFrame(() => window.scrollTo({ top, behavior: "instant" }));
  }, []);

  const selectTab = useCallback(
    (nextTab: Tab, historyMode: "push" | "pop" = "push") => {
      sessionStorage.setItem(scrollKey(tabRef.current), String(window.scrollY));
      tabRef.current = nextTab;
      setQuery("");
      setTab(nextTab);
      if (historyMode === "push") {
        window.history.pushState(
          { ...window.history.state, foldPageSection: nextTab },
          "",
          `/?tab=${nextTab}`
        );
      }
      restoreScroll(nextTab);
    },
    [restoreScroll]
  );

  const refresh = useCallback(async () => {
    setArticles(query ? await searchArticles(query) : await listArticles());
    setTags(await allTags());
    setLoaded(true);
  }, [query]);

  useEffect(() => {
    // The library lives in IndexedDB, so the first read can only happen
    // after mount — there is nothing to render from on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const handleAdd = useCallback(
    async (addUrl?: string) => {
      const target = (addUrl ?? url).trim();
      if (!target || addingRef.current) return;
      addingRef.current = true;
      setBusy(true);
      setNotice(null);
      try {
        const { article, duplicate } = await addArticleFromUrl(target);
        setUrl("");
        setNotice(
          duplicate ? "Already in your library." : `Saved: ${article.title}`
        );
        if (duplicate) void buzzWarning();
        else void buzzSuccess();
        await refresh();
      } catch (e) {
        void buzzWarning();
        setNotice(e instanceof Error ? e.message : "Could not save that page");
      } finally {
        setBusy(false);
        addingRef.current = false;
      }
    },
    [url, refresh]
  );

  // Links shared into FoldPage from another Android app (ACTION_SEND).
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => Promise<void>) | undefined;
    (async () => {
      const pending = await ShareTarget.consume();
      const cold = pending.value?.match(URL_IN_TEXT);
      if (cold) await handleAdd(cold[0]);
      const handle = await ShareTarget.addListener("shared", ({ value }) => {
        const warm = value?.match(URL_IN_TEXT);
        if (warm) void handleAdd(warm[0]);
      });
      remove = handle.remove;
    })();
    return () => {
      void remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle ?add=<url> (share target on the web / bookmarklet) and ?tab=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    const initialTab =
      t === "archived" || t === "favorites" || t === "inbox" ? t : "inbox";
    tabRef.current = initialTab;
    // The URL is the source of truth on the first client render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab(initialTab);
    restoreScroll(initialTab);
    const raw =
      params.get("add") || params.get("url") || params.get("text") || "";
    const match = raw.match(URL_IN_TEXT);
    if (match) {
      window.history.replaceState({}, "", "/");
      void handleAdd(match[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreScroll]);

  useEffect(() => {
    const onPopState = () => {
      const t = new URLSearchParams(window.location.search).get("tab");
      selectTab(t === "archived" || t === "favorites" ? t : "inbox", "pop");
    };
    const onSection = (e: Event) => {
      const next = (e as CustomEvent<Tab>).detail;
      if (next) selectTab(next);
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener(SECTION_EVENT, onSection);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener(SECTION_EVENT, onSection);
    };
  }, [selectTab]);

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

  const emptyState =
    query || tagFilter
      ? {
          title: "No matching pages.",
          description: "Try a different search or clear the tag filter.",
        }
      : EMPTY_META[tab];

  /** `on` decides the haptic: setting a flag thumps, clearing it answers
      lighter, so favourite and archive are distinguishable by feel alone. */
  async function toggle(a: Article, patch: Partial<Article>, on: boolean) {
    void (on ? commit() : uncommit());
    await updateArticle(a.id, patch);
    await refresh();
  }

  async function removeWithUndo(a: Article) {
    void discard();
    await deleteArticle(a.id);
    await refresh();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text: `Deleted “${truncate(a.title, 40)}”`, undoId: a.id });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  async function undoDelete(id: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
    void commit();
    await restoreArticle(id);
    await refresh();
  }

  return (
    <main className="w-full">
      <Welcome />
      <TopBar
        right={
          <Link
            href="/settings"
            className="btn btn-quiet pressable no-underline text-sm desktop-tabs"
          >
            Settings
          </Link>
        }
      />
      <div className="max-w-5xl mx-auto px-4 sm:px-5 content-pad w-full">
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
          <button
            className="btn pressable"
            style={{ minWidth: "5.5rem" }}
            disabled={busy || !url.trim()}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
        {notice && (
          <p
            className="text-sm mb-3"
            style={{ color: "var(--muted)" }}
            role="status"
          >
            {notice}
          </p>
        )}

        <div
          className="desktop-tabs flex gap-2 mb-2 overflow-x-auto"
          role="tablist"
          aria-label="Library sections"
        >
          {(Object.keys(TAB_META) as Tab[]).map((t) => (
            <button
              key={t}
              className="tab pressable"
              role="tab"
              aria-selected={tab === t && !query}
              onClick={() => {
                selectTab(t);
              }}
            >
              {TAB_META[t].label} ({counts[t]})
            </button>
          ))}
        </div>

        <div className="library-search mb-3">
          <SearchIcon size={19} />
          <input
            type="search"
            placeholder="Search your library…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
          />
        </div>

        {tags.length > 0 && (
          <section className="tag-filter mb-4" aria-labelledby="tag-filter-label">
            <div className="tag-filter-heading">
              <span id="tag-filter-label" className="tag-filter-label">
                Filter by tag
              </span>
              {tagFilter && (
                <button
                  className="tag-filter-clear pressable"
                  onClick={() => {
                    void tap();
                    setTagFilter(null);
                  }}
                  aria-label={`Clear tag filter ${tagFilter}`}
                >
                  Clear <span aria-hidden="true">×</span>
                </button>
              )}
            </div>
            <div className={tagsExpanded ? "tag-filter-list expanded" : "tag-filter-list"}>
              {tags.map((t) => (
                <button
                  key={t}
                  className="chip pressable"
                  aria-pressed={tagFilter === t}
                  onClick={() => {
                    void tap();
                    setTagFilter(tagFilter === t ? null : t);
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            {tags.length > 4 && (
              <button
                className="tag-filter-toggle pressable"
                onClick={() => setTagsExpanded((expanded) => !expanded)}
                aria-expanded={tagsExpanded}
              >
                {tagsExpanded ? "Show less" : `Show all ${tags.length} tags`}
              </button>
            )}
          </section>
        )}

        {!loaded && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 list-none p-0 m-0" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="skeleton-card" />
            ))}
          </ul>
        )}

        {busy && <div className="skeleton-card mb-3" aria-hidden="true" />}

        {loaded && visible.length === 0 && (
          <div className="text-center py-16" style={{ color: "var(--muted)" }}>
            {articles.length === 0 && !query && !tagFilter && (
              /* The shelf illustration is the first-run welcome, so it stays
                 for a genuinely empty library — the per-section states below
                 carry themselves typographically. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/empty-shelf.png"
                alt=""
                width={180}
                height={180}
                className="empty-state-image mx-auto mb-5"
                style={{
                  borderRadius: "0.9rem",
                  border: "1px solid var(--line)",
                }}
              />
            )}
            <p
              className="text-lg mb-1"
              style={{ fontFamily: "var(--serif)", color: "var(--ink)" }}
            >
              {emptyState.title}
            </p>
            <p className="text-sm max-w-md mx-auto">{emptyState.description}</p>
          </div>
        )}

        <ul className="library-grid grid grid-cols-1 sm:grid-cols-2 gap-4 list-none p-0 m-0">
          {visible.map((a, i) => (
            <li
              key={a.id}
              className={`card card-in ${a.progress >= 0.98 ? "is-read" : ""}`}
              style={{ ["--i" as string]: i }}
            >
              <p
                className="text-xs uppercase tracking-widest mb-1"
                style={{ color: "var(--muted)", fontFamily: "var(--sans)" }}
              >
                {a.siteName ?? hostnameOf(a.canonicalUrl)} · {a.readingMin} min
                {a.progress > 0 && a.progress < 0.98
                  ? ` · ${Math.round(a.progress * 100)}%`
                  : ""}
              </p>
              <h3 className="text-lg font-semibold leading-snug m-0 mb-1">
                <Link
                  href={`/read/?id=${a.id}`}
                  className="cardlink no-underline"
                  style={{ color: "var(--ink)" }}
                >
                  {a.title}
                </Link>
              </h3>
              <p
                className="text-sm m-0 line-clamp-2"
                style={{ color: "var(--muted)" }}
              >
                {a.excerpt}
              </p>
              <div className="actions flex items-center justify-between mt-1">
                <div className="flex gap-1 flex-wrap">
                  {a.tags.slice(0, 3).map((t) => (
                    <span key={t} className="chip-label">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    className="iconbtn pressable"
                    aria-pressed={a.favorite}
                    aria-label={
                      a.favorite ? "Remove from favorites" : "Add to favorites"
                    }
                    onClick={() =>
                      toggle(a, { favorite: !a.favorite }, !a.favorite)
                    }
                  >
                    <StarIcon filled={a.favorite} />
                  </button>
                  <button
                    className="iconbtn pressable"
                    aria-label={
                      a.state === "inbox" ? "Archive" : "Back to inbox"
                    }
                    title={a.state === "inbox" ? "Archive" : "Back to inbox"}
                    onClick={() =>
                      toggle(
                        a,
                        { state: a.state === "inbox" ? "archived" : "inbox" },
                        a.state === "inbox"
                      )
                    }
                  >
                    {a.state === "inbox" ? <CheckIcon /> : <UndoIcon />}
                  </button>
                  <button
                    className="iconbtn pressable"
                    aria-label="Delete"
                    onClick={() => void removeWithUndo(a)}
                  >
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
