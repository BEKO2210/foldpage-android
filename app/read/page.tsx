"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Article } from "@/lib/types";
import { getArticle, updateArticle } from "@/lib/db";
import TopBar from "@/components/TopBar";
import TagEditor from "@/components/TagEditor";
import { CheckIcon, StarIcon, UndoIcon } from "@/components/icons";
import { buzzSuccess, commit, openExternal, tap, uncommit } from "@/lib/native";

/** Static export has no dynamic route segments, so the article id travels in
    the query string: /read/?id=<uuid>. */
const SIZES = ["1rem", "1.15rem", "1.3rem", "1.5rem"];

export default function ReadPage() {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [article, setArticle] = useState<Article | null | undefined>(undefined);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [progress, setProgress] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const stored = localStorage.getItem("fp-reader-size");
    if (stored) setSizeIdx(Number(stored));
  }, []);

  // restore scroll position once content is rendered
  useEffect(() => {
    if (!article || article.progress <= 0) return;
    const el = document.documentElement;
    const target = article.progress * (el.scrollHeight - window.innerHeight);
    window.scrollTo({ top: target });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

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
    setSizeIdx(idx);
    localStorage.setItem("fp-reader-size", String(idx));
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

  if (article === undefined) return null;
  if (article === null)
    return (
      <main className="page-push">
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
        aria-label="Smaller text"
        disabled={sizeIdx === 0}
        onClick={() => setSize(sizeIdx - 1)}
      >
        A−
      </button>
      <button
        className="iconbtn pressable"
        aria-label="Larger text"
        disabled={sizeIdx === SIZES.length - 1}
        onClick={() => setSize(sizeIdx + 1)}
      >
        A+
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
    <main className="w-full page-push">
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
        style={{ ["--reader-size" as string]: SIZES[sizeIdx] }}
      >
        <p
          className="text-xs uppercase tracking-widest mb-2"
          style={{ color: "var(--muted)", fontFamily: "var(--sans)" }}
        >
          {article.siteName} · {article.readingMin} min
          {article.author ? ` · ${article.author}` : ""}
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2">
          {article.title}
        </h1>
        <p className="text-sm mb-4" style={{ fontFamily: "var(--sans)" }}>
          <a
            href={article.url}
            onClick={(e) => {
              e.preventDefault();
              void openExternal(article.url);
            }}
            style={{ color: "var(--muted)" }}
          >
            View original ↗
          </a>
        </p>
        <div className="mb-8" style={{ fontFamily: "var(--sans)" }}>
          <TagEditor tags={article.tags} onChange={(t) => void setTags(t)} />
        </div>
        {article.contentHtml ? (
          <div dangerouslySetInnerHTML={{ __html: article.contentHtml }} />
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
    </main>
  );
}
