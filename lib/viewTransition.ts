"use client";

/** The one animation in the app that explains something.
 *
 *  Opening an article is a jump: the card is on the shelf, the reader is a
 *  page. A shared element carries the title from the one to the other, so the
 *  reader can see *where they went* and, when they come back, where the
 *  article came from. Everything else in this app moves because a state
 *  changed; this moves because a place changed.
 *
 *  Two things had to be settled before it could exist, both of them traps:
 *
 *  1. The reader already animates itself in (`.reader-in`, `fp-page-in`).
 *     Running both means the page slides while the title flies, which reads as
 *     two unrelated animations rather than one movement. So the entry
 *     animation is suppressed for the length of the transition, by a class on
 *     <html>.
 *  2. A view transition snapshots the *whole* page. The bottom navigation is
 *     fixed, and without a name of its own it would be part of that snapshot
 *     and cross-fade with the page behind it — the same "floating navigation"
 *     that a `fill: forwards` transform once caused. Giving it its own
 *     `view-transition-name` keeps it out of the page group: it is the same
 *     element in both states, in the same place, so it simply does not move.
 */

const NAME = "fp-article";

function motionAllowed(): boolean {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Runs `navigate` inside a view transition, with `element` as the piece that
 *  travels. Falls back to a plain navigation wherever the API is missing —
 *  Android's WebView has it, a desktop browser may not, and neither may care. */
export function openWithTransition(element: HTMLElement | null, navigate: () => void): void {
  const start = (
    document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    }
  ).startViewTransition;
  if (!start || !element || !motionAllowed()) {
    navigate();
    return;
  }
  element.style.viewTransitionName = NAME;
  document.documentElement.classList.add("vt-running");
  const transition = start.call(document, navigate);
  void transition.finished.finally(() => {
    element.style.viewTransitionName = "";
    document.documentElement.classList.remove("vt-running");
  });
}
