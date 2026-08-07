"use client";

import type { Article } from "./types";
import { listArticles } from "./db";

export interface ImportRow {
  url: string;
  title: string;
  tags: string[];
  archived: boolean;
  addedAt: number;
}

/** Parse a CSV line respecting quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Pocket CSV export: title,url,time_added,tags,status */
export function parsePocketCsv(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = {
    title: header.indexOf("title"),
    url: header.indexOf("url"),
    time: header.indexOf("time_added"),
    tags: header.indexOf("tags"),
    status: header.indexOf("status"),
  };
  if (idx.url === -1) return [];
  const rows: ImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const url = cols[idx.url]?.trim();
    if (!url || !/^https?:\/\//.test(url)) continue;
    rows.push({
      url,
      title: (idx.title >= 0 && cols[idx.title]?.trim()) || url,
      tags:
        idx.tags >= 0 && cols[idx.tags]
          ? cols[idx.tags].split("|").map((t) => t.trim()).filter(Boolean)
          : [],
      archived: idx.status >= 0 ? cols[idx.status]?.trim() === "archive" : false,
      addedAt: idx.time >= 0 && cols[idx.time] ? Number(cols[idx.time]) * 1000 : Date.now(),
    });
  }
  return rows;
}

/** Pocket/Instapaper HTML bookmark export (ril_export.html). */
export function parseBookmarksHtml(text: string): ImportRow[] {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const rows: ImportRow[] = [];
  doc.querySelectorAll("a[href]").forEach((a) => {
    const url = a.getAttribute("href") ?? "";
    if (!/^https?:\/\//.test(url)) return;
    const timeAdded = Number(a.getAttribute("time_added") ?? 0) * 1000;
    const tags = (a.getAttribute("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    // Pocket's export groups links under h1 "Unread" / "Read Archive"
    const section = a.closest("ul")?.previousElementSibling?.textContent?.toLowerCase() ?? "";
    rows.push({
      url,
      title: a.textContent?.trim() || url,
      tags,
      archived: section.includes("archive") || section.includes("read"),
      addedAt: timeAdded || Date.now(),
    });
  });
  return rows;
}

export function parseImportFile(filename: string, text: string): ImportRow[] {
  if (filename.toLowerCase().endsWith(".csv")) return parsePocketCsv(text);
  return parseBookmarksHtml(text);
}

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportJson() {
  const articles = await listArticles();
  download(
    `foldpage-export-${new Date().toISOString().slice(0, 10)}.json`,
    "application/json",
    JSON.stringify({ exportedAt: new Date().toISOString(), articles }, null, 2)
  );
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function exportHtml() {
  const articles = await listArticles();
  const body = articles
    .map(
      (a: Article) => `
<article>
  <h1>${esc(a.title)}</h1>
  <p><a href="${esc(a.url)}">${esc(a.url)}</a> · ${a.siteName ? esc(a.siteName) : ""} · saved ${new Date(a.addedAt).toISOString().slice(0, 10)}${a.tags.length ? " · tags: " + esc(a.tags.join(", ")) : ""}</p>
  ${a.contentHtml || `<p><em>(content not downloaded)</em></p>`}
  <hr>
</article>`
    )
    .join("\n");
  download(
    `foldpage-export-${new Date().toISOString().slice(0, 10)}.html`,
    "text/html",
    `<!doctype html><html><head><meta charset="utf-8"><title>FoldPage export</title></head><body>${body}</body></html>`
  );
}

export async function exportMarkdown() {
  const articles = await listArticles();
  const md = articles
    .map((a: Article) => {
      const div = document.createElement("div");
      div.innerHTML = a.contentHtml;
      const text = div.textContent?.trim() ?? "";
      return `# ${a.title}\n\n- URL: ${a.url}\n- Saved: ${new Date(a.addedAt).toISOString()}\n- Tags: ${a.tags.join(", ") || "—"}\n\n${text}\n\n---\n`;
    })
    .join("\n");
  download(
    `foldpage-export-${new Date().toISOString().slice(0, 10)}.md`,
    "text/markdown",
    md
  );
}
