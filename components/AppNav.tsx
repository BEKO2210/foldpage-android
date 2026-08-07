"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArchiveIcon, InboxIcon, SettingsIcon, StarIcon } from "./icons";
import { tap } from "@/lib/native";

export type NavSection = "inbox" | "archived" | "favorites" | "settings";

/** Broadcast so the library can switch sections without a route change. */
export const SECTION_EVENT = "foldpage:section";

const ITEMS = [
  { section: "inbox", label: "Inbox", Icon: InboxIcon },
  { section: "archived", label: "Archive", Icon: ArchiveIcon },
  { section: "favorites", label: "Favorites", Icon: StarIcon },
  { section: "settings", label: "Settings", Icon: SettingsIcon },
] as const;

/** Lives in the root layout, so it is mounted once and survives every route
    change. Rendering it per page made it unmount and animate back in on every
    navigation — the bar visibly jumped. */
export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [tab, setTab] = useState<Exclude<NavSection, "settings">>("inbox");

  const syncFromUrl = useCallback(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    setTab(t === "archived" || t === "favorites" ? t : "inbox");
  }, []);

  useEffect(() => {
    // The section only exists in the URL, which is a client-side source: the
    // exported HTML is identical for every section.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [syncFromUrl, pathname]);

  const onLibrary = pathname === "/";
  const active: NavSection = pathname.startsWith("/settings")
    ? "settings"
    : tab;

  // The reader owns the bottom of the screen with its own toolbar.
  if (pathname.startsWith("/read")) return null;

  function go(section: NavSection) {
    void tap();
    if (section === "settings") {
      if (!pathname.startsWith("/settings")) router.push("/settings");
      return;
    }
    if (onLibrary) {
      setTab(section);
      window.dispatchEvent(new CustomEvent(SECTION_EVENT, { detail: section }));
    } else {
      router.push(`/?tab=${section}`);
    }
  }

  return (
    <nav className="bottomnav" aria-label="Main navigation">
      {ITEMS.map(({ section, label, Icon }) => (
        <button
          key={section}
          type="button"
          aria-current={active === section ? "page" : undefined}
          onClick={() => go(section)}
        >
          <span className="nav-ico" aria-hidden="true">
            <Icon size={22} />
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
