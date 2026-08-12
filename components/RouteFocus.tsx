"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Where a screen reader lands after a route change.
 *
 *  Without this, focus stays on <body>: TalkBack starts every screen from the
 *  top of the document and the reader has to work down to the article again,
 *  every single time. Found by scripts/a11y-audit.mjs, which reported
 *  `activeElement: BODY` after navigating — see docs/A11Y.md.
 *
 *  The target is the route's own heading, marked with `data-route-heading`. It
 *  takes `tabIndex={-1}` so it can be focused programmatically without becoming
 *  a tab stop of its own.
 *
 *  Deliberately not on the first render: arriving at the app is not a
 *  navigation, and moving focus there would interrupt whatever the launcher or
 *  the share sheet was already saying. */
/** Set by whatever starts an in-app navigation, read once by this component.
    Deliberately in sessionStorage rather than in history state: a full document
    load loses the latter. */
export const NAVIGATED = "fp-navigated";

export function markNavigation() {
  try {
    sessionStorage.setItem(NAVIGATED, "1");
  } catch {
    /* private mode without storage — focus simply stays where it was */
  }
}

export default function RouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      // A static export does not always route in the client: depending on how
      // the route was reached, the same tap can produce a whole new document,
      // and then this component is mounting rather than seeing a change. The
      // flag left behind by the navigation says which of the two happened, so
      // focus lands in the same place either way.
      if (sessionStorage.getItem(NAVIGATED) !== "1") return;
      sessionStorage.removeItem(NAVIGATED);
    }
    // One frame later: the new route's heading does not exist until React has
    // committed it.
    const raf = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("[data-route-heading]");
      heading?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}
