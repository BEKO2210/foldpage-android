import Link from "next/link";
import { ChevronLeftIcon } from "./icons";

/** The app icon, small. It used to be a bare yellow triangle, which was the
    fold without the page it is folded from — the one thing the name is about,
    with its subject missing. Same geometry as `public/icon.svg`. */
function BrandMark() {
  return (
    <svg
      className="brandmark"
      viewBox="0 0 320 352"
      width="17"
      height="19"
      aria-hidden="true"
    >
      <path d="M0 0h176l144 144v208H0z" fill="var(--ink)" />
      <path d="M176 0l144 144H176z" fill="var(--highlight)" />
      <path d="M176 144h144l-144 26z" fill="var(--paper)" opacity="0.28" />
    </svg>
  );
}

export default function TopBar({
  right,
  back,
}: {
  right?: React.ReactNode;
  /** Renders a back link on the left instead of the logo (label + href). */
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex items-center justify-between px-4 sm:px-5 py-1 max-w-5xl mx-auto w-full">
      {back ? (
        <Link href={back.href} className="backlink">
          <ChevronLeftIcon />
          {back.label}
        </Link>
      ) : (
        <Link href="/" className="brandlink gap-2 no-underline" style={{ color: "var(--ink)" }}>
          <BrandMark />
          <span className="font-bold tracking-wide text-sm uppercase">FoldPage</span>
        </Link>
      )}
      <div className="flex items-center gap-1">{right}</div>
    </header>
  );
}
