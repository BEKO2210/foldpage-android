import Link from "next/link";
import { ArchiveIcon, InboxIcon, SettingsIcon, StarIcon } from "./icons";

export type NavSection = "inbox" | "archived" | "favorites" | "settings";

const ITEMS = [
  { section: "inbox", label: "Inbox", Icon: InboxIcon },
  { section: "archived", label: "Archive", Icon: ArchiveIcon },
  { section: "favorites", label: "Favorites", Icon: StarIcon },
  { section: "settings", label: "Settings", Icon: SettingsIcon },
] as const;

export default function BottomNav({
  active,
  onNavigate,
  onLeave,
}: {
  active: NavSection;
  onNavigate?: (section: Exclude<NavSection, "settings">) => void;
  onLeave?: () => void;
}) {
  return (
    <nav className="bottomnav" aria-label="Main navigation">
      {ITEMS.map(({ section, label, Icon }) => {
        const content = (
          <>
            <span className="nav-ico" aria-hidden="true">
              <Icon size={22} />
            </span>
            {label}
          </>
        );
        const current = active === section ? "page" : undefined;

        if (section !== "settings" && onNavigate) {
          return (
            <button
              key={section}
              type="button"
              aria-current={current}
              onClick={() => onNavigate(section)}
            >
              {content}
            </button>
          );
        }

        const href = section === "settings" ? "/settings" : `/?tab=${section}`;
        return (
          <Link
            key={section}
            href={href}
            aria-current={current}
            onClick={onLeave}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
