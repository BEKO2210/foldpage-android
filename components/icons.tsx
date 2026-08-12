/** Thin-stroke icon set, 24px grid, inherits currentColor. */

function Svg({ children, size = 20 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function InboxIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M3 13h4l2 3h6l2-3h4" />
      <path d="M5 6h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
    </Svg>
  );
}

export function ArchiveIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
      <path d="M10 13h4" />
    </Svg>
  );
}

export function StarIcon({ filled = false, size }: { filled?: boolean; size?: number }) {
  return (
    <svg
      width={size ?? 20}
      height={size ?? 20}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" />
    </svg>
  );
}

export function SettingsIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </Svg>
  );
}

export function TrashIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" />
      <path d="M10 11v5M14 11v5" />
    </Svg>
  );
}

export function CheckIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4.5 12.5l5 5L19.5 7" />
    </Svg>
  );
}

export function UndoIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M8.5 5.5L4 10l4.5 4.5" />
      <path d="M4 10h10a6 6 0 0 1 0 12h-3" />
    </Svg>
  );
}

export function ChevronLeftIcon({ size }: { size?: number }) {
  return (
    <Svg size={size ?? 18}>
      <path d="M14.5 5l-6.5 7 6.5 7" />
    </Svg>
  );
}

export function EyeIcon({ off = false, size }: { off?: boolean; size?: number }) {
  return (
    <Svg size={size ?? 18}>
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
      {off && <path d="M4 20L20 4" />}
    </Svg>
  );
}

export function ExternalIcon({ size }: { size?: number }) {
  return (
    <Svg size={size ?? 14}>
      <path d="M14 4h6v6" />
      <path d="M20 4L10 14" />
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
    </Svg>
  );
}

export function SearchIcon({ size }: { size?: number }) {
  return (
    <Svg size={size ?? 18}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </Svg>
  );
}

/** Filled rather than stroked: at 20px a stroked triangle reads as an outline
    of nothing, and this is the one control in the reader that has to be
    unmistakable at a glance. */
export function PlayIcon({ size }: { size?: number }) {
  return (
    <Svg size={size ?? 20}>
      <path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor" strokeLinejoin="round" />
    </Svg>
  );
}

export function PauseIcon({ size }: { size?: number }) {
  return (
    <Svg size={size ?? 20}>
      <path d="M9 5v14M15 5v14" strokeWidth="2.5" />
    </Svg>
  );
}
