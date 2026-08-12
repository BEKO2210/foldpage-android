"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Article } from "@/lib/types";
import { getArticle, updateArticle } from "@/lib/db";
import TopBar from "@/components/TopBar";
import TagEditor from "@/components/TagEditor";
import DisplaySheet from "@/components/DisplaySheet";
import { useDisplayPrefs } from "@/components/DisplaySettings";
import {
  CheckIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  StarIcon,
  UndoIcon,
} from "@/components/icons";
import { buzzSuccess, buzzWarning, commit, openExternal, tap, uncommit } from "@/lib/native";
import { refetchArticle } from "@/lib/articles";
import { objectUrlFor, storeImagesForArticle } from "@/lib/images";
import { indexArticle } from "@/lib/search";
import {
  installVoices,
  languageAvailable,
  speech,
  spokenBlocks,
  spokenMinutes,
  type SpeechState,
} from "@/lib/speech";
import { TEXT_SIZES } from "@/lib/display";
import { IMAGE_KEY_ATTR } from "@/lib/imagePlan";

/** Static export has no dynamic route segments, so the article id travels in
    the query string: /read/?id=<uuid>. */

/** Reading progress updates on every vertical scroll. Keep the injected HTML
    behind a memo boundary so those parent renders cannot recreate its table
    wrappers and reset their native scrollLeft. */
const ArticleContent = memo(function ArticleContent({
  contentHtml,
  speakingAt,
}: {
  contentHtml: string;
  /** Index of the block being read aloud, or -1. */
  speakingAt: number;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Images that were saved with the article come out of IndexedDB, not off the
  // network — that is what makes an article read offline, and it is also why
  // opening one does not tell its publisher that it is being read again. Each
  // object URL belongs to this document and is revoked on the way out.
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const created: string[] = [];
    let cancelled = false;
    void (async () => {
      const stored = [
        ...root.querySelectorAll<HTMLImageElement>(`img[${IMAGE_KEY_ATTR}]`),
      ];
      for (const img of stored) {
        const key = img.getAttribute(IMAGE_KEY_ATTR);
        if (!key) continue;
        const url = await objectUrlFor(key);
        if (!url) continue;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        created.push(url);
        img.src = url;
      }
    })();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [contentHtml]);

  useEffect(() => {
    // An image that never arrives leaves its reserved box behind as a hole in
    // the text. Only the browser knows, so it is cleared here rather than
    // during extraction.
    const images = [
      ...(contentRef.current?.querySelectorAll<HTMLImageElement>("img") ?? []),
    ];
    const dropBroken = (img: HTMLImageElement) => {
      // naturalWidth 0 means it never loaded; anything under 100px of real
      // pixels is an icon, a logo or a counting pixel. Neither is worth the
      // hole it leaves in the text. Only the browser knows either number,
      // which is why this cannot happen during extraction.
      if (img.naturalWidth === 0 || img.naturalWidth < 100) {
        (img.closest("figure") ?? img).remove();
      }
    };
    images.forEach((img) => {
      if (img.complete) dropBroken(img);
      else {
        img.addEventListener("error", () => dropBroken(img), { once: true });
        img.addEventListener("load", () => dropBroken(img), { once: true });
      }
    });

    const wrappers = [...(contentRef.current?.querySelectorAll<HTMLElement>(
      ".tablewrap"
    ) ?? [])];
    const update = (wrapper: HTMLElement) => {
      const hasOverflow = wrapper.scrollWidth > wrapper.clientWidth + 1;
      const hasMore = wrapper.scrollLeft + wrapper.clientWidth < wrapper.scrollWidth - 1;
      wrapper.classList.toggle("has-more", hasOverflow && hasMore);
    };
    const cleanups = wrappers.map((wrapper) => {
      const onScroll = () => update(wrapper);
      wrapper.addEventListener("scroll", onScroll, { passive: true });
      update(wrapper);
      return () => wrapper.removeEventListener("scroll", onScroll);
    });
    const observer = new ResizeObserver(() => wrappers.forEach(update));
    wrappers.forEach((wrapper) => observer.observe(wrapper));
    return () => {
      cleanups.forEach((cleanup) => cleanup());
      observer.disconnect();
    };
  }, [contentHtml]);

  // Follow the voice: the block being spoken is marked and kept on screen. The
  // marking is a class on the existing element rather than a re-render of the
  // article — the injected HTML must not be rebuilt, or the tables lose their
  // scroll position (see the memo boundary above).
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const spoken = [
      ...root.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption"),
    ].filter((element) => (element.textContent ?? "").trim().length >= 3);
    spoken.forEach((element, index) => {
      element.classList.toggle("is-speaking", index === speakingAt);
    });
    const current = spoken[speakingAt];
    if (!current) return;
    const box = current.getBoundingClientRect();
    // Only when it has left the comfortable middle of the screen, so a short
    // paragraph does not yank the page on every sentence.
    if (box.top < 80 || box.bottom > window.innerHeight - 120) {
      current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return () => spoken.forEach((element) => element.classList.remove("is-speaking"));
  }, [speakingAt, contentHtml]);

  return <div ref={contentRef} dangerouslySetInnerHTML={{ __html: contentHtml }} />;
});

export default function ReadPage() {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [article, setArticle] = useState<Article | null | undefined>(undefined);
  const [prefs, updatePrefs] = useDisplayPrefs();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [refetchNote, setRefetchNote] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [voice, setVoice] = useState<SpeechState>(speech.state);
  const [voiceMissing, setVoiceMissing] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sizeIdx = prefs.size;

  // Reading aloud outlives a render, so the player lives outside React and the
  // component only listens. Leaving the article stops it — speech that keeps
  // going after the reader has moved on is the worst kind of surprise.
  useEffect(() => speech.subscribe(setVoice), []);
  useEffect(() => {
    if (!article?.contentHtml) return;
    speech.load(article.contentHtml, article.lang);
    void languageAvailable(article.lang).then((ok) => setVoiceMissing(!ok));
    return () => speech.stop();
  }, [article?.id, article?.contentHtml, article?.lang]);

  useEffect(() => {
    // The id only exists in the URL of the loaded page, and the article only
    // in IndexedDB — both are client-side sources this effect has to read in.
    const q = new URLSearchParams(window.location.search).get("id");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setId(q);
    if (!q) {
      setArticle(null);
      return;
    }
    getArticle(q).then((a) => {
      setArticle(a ?? null);
      if (a) setProgress(a.progress);
    });
  }, []);

  // restore scroll position once content is rendered
  useEffect(() => {
    if (!article || article.progress <= 0) return;
    const el = document.documentElement;
    const target = article.progress * (el.scrollHeight - window.innerHeight);
    window.scrollTo({ top: target });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

  // Every typography setting reflows the article: a larger size, a different
  // typeface, wider line spacing, justified text. Holding the scroll offset
  // would drop the reader paragraphs away from where they were, so the
  // *relative* position is restored instead — two frames later, because the
  // first commits the new layout and the second paints it.
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  const layoutKey = `${prefs.size}|${prefs.font}|${prefs.leading}|${prefs.align}`;
  const firstLayout = useRef(true);
  useEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    const target = progressRef.current;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: Math.max(0, target * max) });
      })
    );
    return () => cancelAnimationFrame(raf);
  }, [layoutKey]);

  // track reading progress, persist (debounced)
  useEffect(() => {
    if (!article) return;
    const current = article;
    function onScroll() {
      const el = document.documentElement;
      const max = el.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
      setProgress(p);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void updateArticle(current.id, {
          progress: p,
          readAt: p >= 0.98 ? Date.now() : current.readAt,
        });
      }, 500);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [article]);

  // Links inside the article body go to the system browser — handled once,
  // app-wide, by wireExternalLinks() in NativeShell. A second listener here
  // would open every tapped link twice.

  function setSize(idx: number) {
    if (idx < 0 || idx >= TEXT_SIZES.length || idx === sizeIdx) return;
    updatePrefs({ size: idx });
    void tap();
  }

  async function toggleArchive() {
    if (!article) return;
    await updateArticle(article.id, {
      state: article.state === "inbox" ? "archived" : "inbox",
    });
    void buzzSuccess();
    router.push("/");
  }

  async function toggleFavorite() {
    if (!article) return;
    void (article.favorite ? uncommit() : commit());
    const next = await updateArticle(article.id, {
      favorite: !article.favorite,
    });
    if (next) setArticle(next);
  }

  async function setTags(tags: string[]) {
    if (!article) return;
    const next = await updateArticle(article.id, { tags });
    if (next) setArticle(next);
  }

  /** A page that was behind a consent wall, or timed out halfway, stays broken
      for as long as the article exists. This is the way out that does not cost
      the tags, the star or the shelf it sits on. */
  async function refetch() {
    if (!article || refetching) return;
    setRefetching(true);
    setRefetchNote(null);
    try {
      const next = await refetchArticle(article.id);
      if (next) {
        setArticle(next);
        void buzzSuccess();
        setRefetchNote(`Reloaded — ${next.wordCount.toLocaleString()} words.`);
        // The new extraction carries fresh remote URLs, so the pictures have to
        // be put on the device again before the article reads offline.
        void indexArticle(next);
        void storeImagesForArticle(next.id).then((r) => {
          if (r.changed) {
            void getArticle(next.id).then((a) => {
              if (!a) return;
              setArticle(a);
              void indexArticle(a);
            });
          }
        });
      }
    } catch (e) {
      void buzzWarning();
      setRefetchNote(
        e instanceof Error ? e.message : "Could not reload that page"
      );
    } finally {
      setRefetching(false);
    }
  }

  if (article === undefined) return null;
  if (article === null)
    return (
      <main>
        <TopBar />
        <p className="text-center py-16" style={{ color: "var(--muted)" }}>
          {id ? "Article not found." : "No article selected."}{" "}
          <Link href="/">Back to your library</Link>.
        </p>
      </main>
    );

  const sizeControls = (
    <>
      <button
        className="iconbtn pressable"
        aria-label={`Smaller text, current size ${sizeIdx + 1} of ${TEXT_SIZES.length}`}
        disabled={sizeIdx === 0}
        onClick={() => setSize(sizeIdx - 1)}
      >
        A−
      </button>
      <button
        className="iconbtn pressable"
        aria-label={`Larger text, current size ${sizeIdx + 1} of ${TEXT_SIZES.length}`}
        disabled={sizeIdx === TEXT_SIZES.length - 1}
        onClick={() => setSize(sizeIdx + 1)}
      >
        A+
      </button>
      <button
        className="iconbtn pressable"
        aria-label={
          voice.playing
            ? `Stop reading aloud, at part ${voice.at + 1} of ${voice.total}`
            : `Read aloud, about ${spokenMinutes(spokenBlocks(article.contentHtml))} minutes`
        }
        aria-pressed={voice.playing}
        onClick={() => {
          void tap();
          void speech.toggle();
        }}
        disabled={!article.contentHtml}
      >
        {voice.playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button
        className="iconbtn pressable"
        aria-label="Reading settings"
        aria-haspopup="dialog"
        onClick={() => {
          void tap();
          setSheetOpen(true);
        }}
      >
        <SettingsIcon />
      </button>
      <button
        className="iconbtn pressable"
        aria-pressed={article.favorite}
        aria-label="Favorite"
        onClick={() => void toggleFavorite()}
      >
        <StarIcon filled={article.favorite} />
      </button>
      <button
        className="iconbtn pressable"
        aria-label={article.state === "inbox" ? "Archive" : "Unarchive"}
        onClick={() => void toggleArchive()}
      >
        {article.state === "inbox" ? <CheckIcon /> : <UndoIcon />}
      </button>
    </>
  );

  return (
    <main className="w-full">
      <div
        className="progressbar"
        style={{ width: `${progress * 100}%` }}
        aria-hidden="true"
      />
      <TopBar
        back={{ href: "/", label: "Library" }}
        right={
          <span className="reader-topbar-actions flex gap-2">{sizeControls}</span>
        }
      />
      <article
        className="reader reader-in px-5 pb-28 w-full"
        /* The article's own language, so hyphenation under justified text
           breaks German words by German rules and English by English ones. */
        lang={article.lang ?? undefined}
      >
        <header className="reader-header">
          <h1 data-route-heading tabIndex={-1}>
            {article.title}
          </h1>
          <p className="reader-meta">
            {article.siteName} · {article.readingMin} min
            {article.author ? ` · ${article.author}` : ""}
          </p>
        </header>
        <p className="reader-source">
          <a
            href={article.url}
            onClick={(e) => {
              e.preventDefault();
              void openExternal(article.url);
            }}
            style={{ color: "var(--muted)" }}
          >
            View original{" "}
            <span aria-hidden="true" style={{ textDecoration: "none" }}>
              ↗
            </span>
          </a>
          <span aria-hidden="true"> · </span>
          <button
            type="button"
            className="linkbtn pressable"
            onClick={() => void refetch()}
            disabled={refetching}
          >
            {refetching ? "Reloading…" : "Reload"}
          </button>
        </p>
        {(voice.error || voiceMissing) && (
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }} role="status">
            {voice.error ??
              "This phone has no voice installed for this article's language."}{" "}
            <button type="button" className="linkbtn" onClick={() => void installVoices()}>
              Install voices
            </button>{" "}
            <Link href="/settings">Check the voice</Link>
          </p>
        )}
        {voice.playing && (
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }} role="status">
            Reading part {voice.at + 1} of {voice.total}.
          </p>
        )}
        {refetchNote && (
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }} role="status">
            {refetchNote}
          </p>
        )}
        <div className="mb-8" style={{ fontFamily: "var(--sans)" }}>
          <TagEditor tags={article.tags} onChange={(t) => void setTags(t)} />
        </div>
        {article.contentHtml ? (
          <ArticleContent contentHtml={article.contentHtml} speakingAt={voice.playing ? voice.at : -1} />
        ) : (
          <p style={{ color: "var(--muted)" }}>
            The content of this article wasn&apos;t downloaded (imported link).{" "}
            <a
              href={article.url}
              onClick={(e) => {
                e.preventDefault();
                void openExternal(article.url);
              }}
            >
              Read the original ↗
            </a>
          </p>
        )}
      </article>
      <div className="readerbar">{sizeControls}</div>
      <DisplaySheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </main>
  );
}
