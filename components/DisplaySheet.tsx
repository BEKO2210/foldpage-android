"use client";

import { useEffect, useRef, useState } from "react";
import DisplaySettings from "./DisplaySettings";
import VoiceSettings from "./VoiceSettings";

/** The reader's settings, in a bottom sheet.
 *
 *  A real <dialog>: it brings the focus trap, the Esc key and inertness of the
 *  page behind it, none of which is worth reimplementing. `showModal()` cannot
 *  be set declaratively, hence the effect. The hardware back button closes it
 *  instead of leaving the article — see wireBackButton() in lib/native.ts. */
export default function DisplaySheet({
  open,
  onClose,
  lang = null,
  startOn = "text",
}: {
  open: boolean;
  onClose: () => void;
  /** The article's own language, so the voice list offers what can say it. */
  lang?: string | null;
  /** Which panel to open on. The reader sends "voice" when it opened the sheet
   *  to solve a voice problem — landing on the type settings would make the
   *  reader look for the thing they were just offered. */
  startOn?: "text" | "voice";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Two panels rather than one long scroll: type settings and voice settings
  // are used at different moments, and a sheet a reader opens mid-article has
  // to fit on the screen it opens over.
  const [panel, setPanel] = useState<"text" | "voice">(startOn);
  // A sheet opened for a reason opens on that reason. Adjusted while
  // rendering rather than in an effect: React's own advice for "reset state
  // when a prop changes", and it avoids the extra pass an effect would cost.
  const [openedOn, setOpenedOn] = useState(startOn);
  if (startOn !== openedOn) {
    setOpenedOn(startOn);
    setPanel(startOn);
  }

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
      <div className="sheet-tabs" role="tablist" aria-label="Reading settings">
        <button
          type="button"
          role="tab"
          className="tab pressable"
          aria-selected={panel === "text"}
          aria-controls="sheet-panel-text"
          onClick={() => setPanel("text")}
        >
          Text
        </button>
        <button
          type="button"
          role="tab"
          className="tab pressable"
          aria-selected={panel === "voice"}
          aria-controls="sheet-panel-voice"
          onClick={() => setPanel("voice")}
        >
          Voice
        </button>
      </div>
      {panel === "text" ? (
        <div id="sheet-panel-text" role="tabpanel">
          <DisplaySettings />
        </div>
      ) : (
        <div id="sheet-panel-voice" role="tabpanel">
          <VoiceSettings lang={lang} />
        </div>
      )}
    </dialog>
  );
}
