import Link from "next/link";
import { ArchiveIcon, InboxIcon, SettingsIcon, StarIcon } from "./icons";

/** Link-based bottom navigation for pages outside the library (e.g. Settings).
    The library itself renders its own button-based variant with live counts. */
export default function BottomNav({ active }: { active?: "settings" }) {
  return (
    <nav className="bottomnav" aria-label="Main navigation">
      <Link href="/?tab=inbox">
        <span className="nav-ico" aria-hidden="true">
          <InboxIcon size={22} />
        </span>
        Inbox
      </Link>
      <Link href="/?tab=archived">
        <span className="nav-ico" aria-hidden="true">
          <ArchiveIcon size={22} />
        </span>
        Archive
      </Link>
      <Link href="/?tab=favorites">
        <span className="nav-ico" aria-hidden="true">
          <StarIcon size={22} />
        </span>
        Favorites
      </Link>
      <Link href="/settings" aria-current={active === "settings" ? "page" : undefined}>
        <span className="nav-ico" aria-hidden="true">
          <SettingsIcon size={22} />
        </span>
        Settings
      </Link>
    </nav>
  );
}
