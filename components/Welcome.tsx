"use client";

import { useEffect, useState } from "react";
import { tap } from "@/lib/native";

const SEEN_KEY = "fp-welcomed";

/** Shown once, on the very first launch. Without it the app opens on an empty
    shelf and never says what it is for. */
export default function Welcome() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(localStorage.getItem(SEEN_KEY) !== "1");
  }, []);

  function dismiss() {
    void tap();
    localStorage.setItem(SEEN_KEY, "1");
    setLeaving(true);
    window.setTimeout(() => setShow(false), 250);
  }

  if (!show) return null;

  return (
    <div
      className={`welcome ${leaving ? "is-leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="welcome-inner">
        <PaperMark />

        <h1 id="welcome-title" className="welcome-title">
          Save it now.
          <br />
          Read it properly.
        </h1>

        <ul className="welcome-list">
          <li style={{ ["--i" as string]: 0 }}>
            <b>Send a link over.</b> Paste it above, or hit Share in any app and
            pick FoldPage.
          </li>
          <li style={{ ["--i" as string]: 1 }}>
            <b>Get the article back.</b> Ads, banners, newsletter pop-ups and
            cookie walls stay behind. The text does not.
          </li>
          <li style={{ ["--i" as string]: 2 }}>
            <b>It stays yours.</b> Everything lives on this phone, reads
            offline, and there is no account to make.
          </li>
        </ul>

        <button className="btn pressable welcome-cta" onClick={dismiss}>
          Start reading
        </button>
      </div>
    </div>
  );
}

/** The folded page from the app icon, drawn as it unfolds. */
function PaperMark() {
  return (
    <svg
      className="welcome-mark"
      viewBox="0 0 96 120"
      width="88"
      height="110"
      aria-hidden="true"
    >
      <path
        className="wm-sheet"
        d="M6 4h58l26 26v86H6z"
        fill="var(--card)"
        stroke="var(--line)"
        strokeWidth="2"
      />
      <path className="wm-fold" d="M64 4l26 26H64z" fill="var(--highlight)" />
      <g
        className="wm-lines"
        stroke="var(--muted)"
        strokeWidth="6"
        strokeLinecap="round"
      >
        <line
          className="wm-line"
          style={{ ["--i" as string]: 0 }}
          x1="22"
          y1="58"
          x2="74"
          y2="58"
        />
        <line
          className="wm-line"
          style={{ ["--i" as string]: 1 }}
          x1="22"
          y1="76"
          x2="74"
          y2="76"
        />
      </g>
      <line
        className="wm-line wm-line-accent"
        style={{ ["--i" as string]: 2 }}
        x1="22"
        y1="94"
        x2="52"
        y2="94"
        stroke="var(--highlight)"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
