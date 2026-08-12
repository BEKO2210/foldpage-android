"use client";

import { useEffect, useRef } from "react";
import DisplaySettings from "./DisplaySettings";

/** The reader's settings, in a bottom sheet.
 *
 *  A real <dialog>: it brings the focus trap, the Esc key and inertness of the
 *  page behind it, none of which is worth reimplementing. `showModal()` cannot
 *  be set declaratively, hence the effect. The hardware back button closes it
 *  instead of leaving the article — see wireBackButton() in lib/native.ts. */
export default function DisplaySheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="display-sheet-title"
      onClose={onClose}
      onClick={(e) => {
        // A click that lands on the dialog element itself is a click on the
        // backdrop: the content sits in the child below.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet-head">
        <h2 id="display-sheet-title">Reading</h2>
        <button type="button" className="sheet-close pressable" onClick={onClose}>
          Done
        </button>
      </div>
      <DisplaySettings />
    </dialog>
  );
}
