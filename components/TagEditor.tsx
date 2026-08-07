"use client";

import { useState } from "react";

export default function TagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function add() {
    const t = input.trim().toLowerCase().slice(0, 100);
    setInput("");
    if (t && !tags.includes(t)) onChange([...tags, t]);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((t) => (
        <button
          key={t}
          className="chip"
          aria-pressed="true"
          title={`Remove tag ${t}`}
          onClick={() => onChange(tags.filter((x) => x !== t))}
        >
          {t} ✕
        </button>
      ))}
      <input
        className="input"
        style={{ width: "9rem", padding: "0.3rem 0.6rem", fontSize: "0.85rem" }}
        placeholder="+ tag"
        value={input}
        maxLength={100}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        aria-label="Add tag"
      />
    </div>
  );
}
