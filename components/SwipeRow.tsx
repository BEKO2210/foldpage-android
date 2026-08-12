"use client";

import { useRef, useState } from "react";

/** Swipe a card sideways to archive or delete it.
 *
 *  On a phone the alternative is hitting a 44 px icon exactly; a swipe is the
 *  gesture the platform has trained everyone to expect. Two rules keep it from
 *  becoming a trap:
 *
 *  - It has to be committed. A short drag springs back, so brushing a card
 *    while scrolling costs nothing.
 *  - Nothing it does is final. Archiving is a toggle and deleting keeps its
 *    undo toast, which is why the destructive direction is allowed at all.
 *
 *  The buttons stay exactly where they were. This is a shortcut, never the only
 *  way — a swipe cannot be performed by a screen reader, a keyboard, or anyone
 *  whose hands do not do fine gestures, and removing the buttons would take the
 *  action away from them.
 *
 *  Pointer events rather than touch events: one code path covers finger, mouse
 *  and stylus, and `setPointerCapture` means a drag that leaves the element
 *  still ends up here instead of being lost. */
const COMMIT_PX = 96;
/** Below this the gesture is read as a scroll and left alone. */
const SLOP_PX = 12;

export default function SwipeRow({
  children,
  onArchive,
  onDelete,
  archiveLabel,
}: {
  children: React.ReactNode;
  onArchive: () => void;
  onDelete: () => void;
  /** "Archive" or "Back to inbox" — the row says what will happen, and that
      depends on where the article currently sits. */
  archiveLabel: string;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const decided = useRef<"horizontal" | "vertical" | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    decided.current = null;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const deltaX = e.clientX - start.current.x;
    const deltaY = e.clientY - start.current.y;
    if (!decided.current) {
      if (Math.abs(deltaX) < SLOP_PX && Math.abs(deltaY) < SLOP_PX) return;
      // Whichever axis moved further wins, once and for the whole gesture — a
      // drag that keeps changing its mind is how a list becomes unscrollable.
      decided.current = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
      if (decided.current === "horizontal") {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (decided.current !== "horizontal") return;
    setDx(deltaX);
  }

  function end() {
    const travelled = dx;
    start.current = null;
    decided.current = null;
    setDragging(false);
    setDx(0);
    if (travelled >= COMMIT_PX) onArchive();
    else if (travelled <= -COMMIT_PX) onDelete();
  }

  const intent = dx >= COMMIT_PX ? "archive" : dx <= -COMMIT_PX ? "delete" : "none";

  return (
    <div
      className={`swipe ${dragging ? "is-dragging" : ""}`}
      data-intent={intent}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {/* Announced by the buttons on the card, not by this layer: a screen
          reader user never sees a swipe and should not hear its scenery. */}
      <div className="swipe-hint" aria-hidden="true">
        <span className="lead">{archiveLabel}</span>
        <span className="trail">Delete</span>
      </div>
      <div
        className="swipe-card"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
