import Link from "next/link";
import { ChevronLeftIcon } from "./icons";

export default function TopBar({
  right,
  back,
}: {
  right?: React.ReactNode;
  /** Renders a back link on the left instead of the logo (label + href). */
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex items-center justify-between px-4 sm:px-5 py-1 max-w-4xl mx-auto w-full">
      {back ? (
        <Link href={back.href} className="backlink">
          <ChevronLeftIcon />
          {back.label}
        </Link>
      ) : (
        <Link href="/" className="brandlink gap-2 no-underline" style={{ color: "var(--ink)" }}>
          <span className="corner" aria-hidden="true" />
          <span className="font-bold tracking-wide text-sm uppercase">FoldPage</span>
        </Link>
      )}
      <div className="flex items-center gap-1">{right}</div>
    </header>
  );
}
