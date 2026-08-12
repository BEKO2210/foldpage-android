"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Article } from "@/lib/types";
import {
  allTags,
  deleteArticle,
  getArticle,
  listArticles,
  restoreArticle,
  updateArticle,
} from "@/lib/db";
import { indexArticle, search } from "@/lib/search";
import { Abandoned, addArticleFromUrl } from "@/lib/articles";
import { storeImagesForArticle } from "@/lib/images";
import TopBar from "./TopBar";
import SwipeRow from "./SwipeRow";
import { markNavigation } from "./RouteFocus";
import { openWithTransition } from "@/lib/viewTransition";
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

/** Cards added per step. Enough to fill a tablet in landscape twice over, so
    the next batch is always ready before the edge of the list is reached. */
const PAGE = 40;

export default function Library() {
  const router = useRouter();
  /** Which search this render belongs to. A slower earlier query used to land
      after a faster later one and put the wrong list on screen. */
  const searchRun = useRef(0);
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
  /** Articles the term only appears *inside* — the card shows nothing of the
      match, so it says where it is instead of looking like a wrong result. */
  const [bodyOnly, setBodyOnly] = useState<Set<string>>(new Set());
  /** How many cards are in the DOM. A thousand articles is a thousand cards
      with a swipe handler and three buttons each, and the browser pays for all
      of them on every render — while a phone shows about four. The list grows
      as it is scrolled instead. */
  const [window_, setWindow] = useState(PAGE);
  const sentinel = useRef<HTMLLIElement | null>(null);
  const [toast, setToast] = useState<{ text: string; undoId: string } | null>(
    null
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addingRef = useRef(false);
  const abandonRef = useRef(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slow, setSlow] = useState(false);
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
    const run = ++searchRun.current;
    if (query) {
      const hits = await search(query);
      // A search started three letters ago must not paint over this one.
      if (run !== searchRun.current) return;
      setArticles(hits.map((hit) => hit.article));
      setBodyOnly(
        new Set(hits.filter((hit) => hit.where === "body").map((hit) => hit.article.id))
      );
    } else {
      const all = await listArticles();
      if (run !== searchRun.current) return;
      setArticles(all);
      setBodyOnly(new Set());
    }
    if (run !== searchRun.current) return;
    // Not while searching. `allTags()` reads every article — bodies included —
    // and the tag list cannot change because somebody typed a letter. On a
    // thousand articles this alone was most of the time a search took.
    if (!query) setTags(await allTags());
    setLoaded(true);
  }, [query]);

  useEffect(() => {
    // The library lives in IndexedDB, so the first read can only happen
    // after mount — there is nothing to render from on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  /** `source` is stored with the article, so how a page arrived stays
      answerable later — from the share sheet, from a link handed to the app, or
      typed in by hand. Defaulting every path to "manual" made the field lie. */
  const handleAdd = useCallback(
    async (addUrl?: string, source: Article["source"] = "manual") => {
      const target = (addUrl ?? url).trim();
      if (!target || addingRef.current) return;
      addingRef.current = true;
      abandonRef.current = false;
      setBusy(true);
      setSlow(false);
      setNotice(null);
      // A page that answers in half a second needs no explanation. One that
      // takes five is where a reader starts wondering whether anything is
      // happening at all — so that is when the app says so and offers a way out.
      slowTimer.current = setTimeout(() => setSlow(true), 5000);
      try {
        const { article, duplicate } = await addArticleFromUrl(
          target,
          source,
          {},
          () => abandonRef.current
        );
        setUrl("");
        setNotice(
          duplicate ? "Already in your library." : `Saved: ${article.title}`
        );
        if (duplicate) void buzzWarning();
        else void buzzSuccess();
        await refresh();
        if (!duplicate) {
          // The text is saved and on screen; the pictures follow in the
          // background. Waiting for them would hold the "Saved" line hostage to
          // a dozen downloads, and an article whose images fail is still an
          // article — their original URLs stay in place.
          void indexArticle(article);
          void storeImagesForArticle(article.id).then((stored) => {
            // Re-index after the pictures land: the article's HTML changed, and
            // an index that describes the previous text is worse than none.
            if (stored.changed) {
              void getArticle(article.id).then((fresh) => {
                if (fresh) void indexArticle(fresh);
              });
              void refresh();
            }
          });
        }
      } catch (e) {
        if (e instanceof Abandoned) {
          setNotice("Stopped — nothing was saved.");
        } else {
          void buzzWarning();
          setNotice(e instanceof Error ? e.message : "Could not save that page");
        }
      } finally {
        if (slowTimer.current) clearTimeout(slowTimer.current);
        setSlow(false);
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
      if (cold) await handleAdd(cold[0], "share");
      const handle = await ShareTarget.addListener("shared", ({ value }) => {
        const warm = value?.match(URL_IN_TEXT);
        if (warm) void handleAdd(warm[0], "share");
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
      void handleAdd(match[0], "share");
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

  // A new list — different tab, different search, different tag — starts at the
  // top again. Derived during render rather than reset in an effect: an effect
  // would paint the old window once and then correct it, which is a visible
  // flash of a thousand cards.
  const listKey = `${tab}|${query}|${tagFilter ?? ""}`;
  const [windowKey, setWindowKey] = useState(listKey);
  if (windowKey !== listKey) {
    setWindowKey(listKey);
    setWindow(PAGE);
  }

  const shown = useMemo(() => visible.slice(0, window_), [visible, window_]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || shown.length >= visible.length) return;
    // IntersectionObserver rather than a scroll listener: it fires once when
    // the end of the list comes into view, and costs nothing while it does not.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setWindow((current) => current + PAGE);
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown.length, visible.length]);

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

  /** Every one of these used to end in refresh(), which reads the whole
      library out of IndexedDB, re-runs the search and rebuilds every card — for
      a star. With a hundred articles that is felt; the write already returns
      the updated record, so the list is patched in place instead. Only the tag
      list still needs a second look, because a change can add or retire one. */
  const patchLocal = useCallback((id: string, next: Article | undefined) => {
    if (!next) return;
    setArticles((current) =>
      current.map((article) => (article.id === id ? next : article))
    );
  }, []);

  /** `on` decides the haptic: setting a flag thumps, clearing it answers
      lighter, so favourite and archive are distinguishable by feel alone. */
  async function toggle(a: Article, patch: Partial<Article>, on: boolean) {
    void (on ? commit() : uncommit());
    patchLocal(a.id, await updateArticle(a.id, patch));
  }

  async function removeWithUndo(a: Article) {
    void discard();
    await deleteArticle(a.id);
    setArticles((current) => current.filter((article) => article.id !== a.id));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text: `Deleted “${truncate(a.title, 40)}”`, undoId: a.id });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  async function undoDelete(id: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
    void commit();
    await restoreArticle(id);
    // The article has to come back in its place in the order, and only the
    // database knows where that is — the one case where a full read is right.
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
        {/* The library had no heading at all: its cards started at h3, under
            nothing. Visually the tabs and the bottom bar already say where you
            are, so this says it only to a screen reader — and gives focus
            somewhere to land after a route change. */}
        <h1 className="sr-only" data-route-heading tabIndex={-1}>
          {query ? `Search results for ${query}` : `${TAB_META[tab].label} — your library`}
        </h1>
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
        {busy && slow && (
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }} role="status">
            This one is taking longer than usual.{" "}
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                abandonRef.current = true;
                setNotice("Stopping…");
              }}
            >
              Stop waiting
            </button>
          </p>
        )}
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

        {/* A search field over an empty library is a control for something that
            does not exist yet. It appears with the first article — and stays
            while a search is running, so clearing the box never yanks the field
            out from under the cursor. */}
        {(articles.length > 0 || query) && (
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
        )}

        {tags.length > 0 && (
          <section className="tag-filter mb-4" aria-labelledby="tag-filter-label">
            <div className="tag-filter-heading">
              <span id="tag-filter-label" className="sr-only">
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

        {/* The live region is always here, and only its text changes.
            A region that is inserted at the same moment as its first message is
            a region several screen readers never announce — they watch what
            they were given, not what arrives. Empty, it collapses to nothing
            (`.status-line:empty`), so the layout is unchanged. */}
        <p className="status-line text-sm mb-3" style={{ color: "var(--muted)" }} role="status">
          {loaded && query
            ? visible.length === 0
              ? `Nothing matches “${query}”.`
              : `${visible.length} match${visible.length === 1 ? "" : "es"} for “${query}”.`
            : ""}
        </p>

        {!loaded && (
          <ul className="state-in grid grid-cols-1 sm:grid-cols-2 gap-4 list-none p-0 m-0" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="skeleton-card" />
            ))}
          </ul>
        )}

        {busy && <div className="skeleton-card mb-3" aria-hidden="true" />}

        {loaded && visible.length === 0 && (
          <div className="state-in text-center py-16" style={{ color: "var(--muted)" }}>
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
          {shown.map((a, i) => (
            <li key={a.id} className="card-in" style={{ ["--i" as string]: i }}>
              <SwipeRow
                archiveLabel={a.state === "inbox" ? "Archive" : "To inbox"}
                onArchive={() =>
                  void toggle(
                    a,
                    { state: a.state === "inbox" ? "archived" : "inbox" },
                    a.state === "inbox"
                  )
                }
                onDelete={() => void removeWithUndo(a)}
              >
                <div className={`card ${a.progress >= 0.98 ? "is-read" : ""}`}>
              <p
                className="text-xs uppercase tracking-widest mb-1"
                style={{ color: "var(--muted)", fontFamily: "var(--sans)" }}
              >
                {a.siteName ?? hostnameOf(a.canonicalUrl)} · {a.readingMin} min
                {a.progress > 0 && a.progress < 0.98
                  ? ` · ${Math.round(a.progress * 100)}%`
                  : ""}
              </p>
              <h2 className="text-lg font-semibold leading-snug m-0 mb-1">
                <Link
                  href={`/read/?id=${a.id}`}
                  className="cardlink no-underline"
                  style={{ color: "var(--ink)" }}
                  onClick={(e) => {
                    markNavigation();
                    // The title is what travels, so it is the element that
                    // carries the name — not the card, which changes shape
                    // entirely and would stretch into the whole article.
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    // Remember where the shelf was before leaving it, so
                    // coming back does not start at the top of a long list.
                    try {
                      sessionStorage.setItem(scrollKey(tab), String(window.scrollY));
                    } catch {
                      /* private mode: the list simply starts at the top */
                    }
                    openWithTransition(e.currentTarget, () =>
                      router.push(`/read/?id=${a.id}`)
                    );
                  }}
                >
                  <Highlight text={a.title} term={query} />
                </Link>
              </h2>
              <p
                className="text-sm m-0 line-clamp-2"
                style={{ color: "var(--muted)" }}
              >
                <Highlight text={a.excerpt} term={query} />
              </p>
              {bodyOnly.has(a.id) && (
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  Found in the article text
                </p>
              )}
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
                </div>
              </SwipeRow>
            </li>
          ))}
          {shown.length < visible.length && (
            <li ref={sentinel} className="list-sentinel" aria-hidden="true" />
          )}
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

/** Marks the search term without ever building HTML from it: the string is
    split and rendered as React nodes, so a term containing markup is text and
    nothing else. */
function Highlight({ text, term }: { text: string; term: string }) {
  const needle = term.trim();
  if (!needle) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const haystack = text.toLowerCase();
  const lower = needle.toLowerCase();
  let at = 0;
  let found = haystack.indexOf(lower, at);
  while (found !== -1) {
    if (found > at) parts.push(text.slice(at, found));
    parts.push(<mark key={found}>{text.slice(found, found + needle.length)}</mark>);
    at = found + needle.length;
    found = haystack.indexOf(lower, at);
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
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
