/**
 * Flowdeck — safe markdown → HTML renderer  (src/lib/markdown.ts)
 *
 * Security model — user input can NEVER inject raw HTML:
 *   1. Every fragment of source text is HTML-escaped (& < > " ') the moment
 *      it is read; markdown transforms only ever run on escaped text, so
 *      user content can never open or close a tag or an attribute.
 *   2. The only markup in the output is generated below, and it all uses
 *      inline styles — the HTML is injected via dangerouslySetInnerHTML,
 *      where Tailwind preflight resets (e.g. `list-style:none` on <ul>)
 *      would otherwise strip list markers and margins.
 *   3. Links become <a> only for http(s) URLs; every other scheme
 *      (javascript:, data:, …) stays as literal, escaped text.
 *
 * Supported syntax: #/##/### headings · **bold** · *italic* · `code` ·
 * ~~strike~~ · ``` fenced blocks · "- " / "1. " lists (one nesting level,
 * [ ]/[x] task checkboxes) · "> " quotes · --- rules ·
 * [text](https://…) links · | pipe | tables |.
 * Blank lines separate blocks; single newlines become <br>.
 *
 * Exports: renderMarkdown(md) → HTML string, stripMarkdown(md) → plain
 * text excerpt (first ~200 chars) for previews.
 */

/* ═══════════════════════════════ escaping ═══════════════════════════════ */

/** Escape everything that could break out of text content or attributes. */
function escapeHtml(s: string): string {
  return s
    .replace(/\u0000/g, "") // NUL doubles as our code-span placeholder separator
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ════════════════════════════════ styles ════════════════════════════════ */

const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const CODE_STYLE = `font-family:${MONO};font-size:.85em;background:color-mix(in srgb, var(--text) 7%, transparent);padding:1px 4px;border-radius:4px`;
const PRE_STYLE = `font-family:${MONO};font-size:.85em;line-height:1.45;background:color-mix(in srgb, var(--text) 5%, transparent);border:1px solid var(--border-c);border-radius:var(--app-radius,8px);padding:10px 12px;margin:8px 0;overflow-x:auto;white-space:pre`;
const H_STYLE: Record<1 | 2 | 3, string> = {
  1: "font-size:1.25em;font-weight:700;margin:16px 0 6px;line-height:1.3",
  2: "font-size:1.1em;font-weight:600;margin:14px 0 5px;line-height:1.3",
  3: "font-size:1em;font-weight:600;margin:12px 0 4px;line-height:1.3",
};
const P_STYLE = "margin:6px 0";
const HR_STYLE = "border:none;border-top:1px solid var(--border-c);margin:12px 0";
const QUOTE_STYLE = "border-left:3px solid var(--accent);color:var(--text-muted);margin:8px 0;padding:2px 10px";
const UL_STYLE = "margin:6px 0;padding-left:1.5em;list-style:disc";
const OL_STYLE = "margin:6px 0;padding-left:1.5em;list-style:decimal";
const UL_NESTED_STYLE = "margin:2px 0 0;padding-left:1.3em;list-style:circle";
const OL_NESTED_STYLE = "margin:2px 0 0;padding-left:1.3em;list-style:decimal";
const LI_STYLE = "margin:2px 0";
const TH_STYLE = "border:1px solid var(--border-c);padding:4px 8px;text-align:left;font-weight:600";
const TD_STYLE = "border:1px solid var(--border-c);padding:4px 8px;text-align:left";
const LINK_STYLE = "color:var(--accent)";
const CHECKED_GLYPH = '<span style="color:var(--accent);margin-right:6px;user-select:none">\u2611</span>';
const UNCHECKED_GLYPH = '<span style="color:var(--text-muted);margin-right:6px;user-select:none">\u2610</span>';

/* ════════════════════════════ inline transforms ═════════════════════════ */

/**
 * Inline markdown → HTML. `escaped` must ALREADY be HTML-escaped.
 * Code spans are stashed behind NUL placeholders first so no other rule can
 * reach inside them; they are restored last.
 */
function inline(escaped: string): string {
  const code: string[] = [];
  let t = escaped.replace(/`([^`\n]+)`/g, (_m, c: string) => {
    code.push(`<code style="${CODE_STYLE}">${c}</code>`);
    return `\u0000${code.length - 1}\u0000`;
  });

  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<b style="font-weight:600">$1</b>'); // bold
  t = t.replace(/~~([^~\n]+)~~/g, '<s style="text-decoration:line-through;opacity:.6">$1</s>'); // strike
  t = t.replace(/\*([^*\n]+)\*/g, '<i style="font-style:italic">$1</i>'); // italic (after bold)

  // links — only http(s); every other scheme stays literal escaped text
  t = t.replace(/\[([^\]\n]*)\]\(([^)\s]+)\)/g, (m, txt: string, url: string) =>
    /^https?:\/\//i.test(url)
      ? `<a href="${url}" style="${LINK_STYLE}" target="_blank" rel="noopener noreferrer">${txt}</a>`
      : m);

  // restore code spans
  return t.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => code[Number(i)] ?? "");
}

/* ═════════════════════════════ block detection ══════════════════════════ */

const FENCE_RE = /^\s*```/;
const HEADING_RE = /^\s{0,3}(#{1,3})\s+(.*)$/;
const HR_RE = /^\s{0,3}(-{3,}|\*{3,})\s*$/;
const QUOTE_RE = /^\s{0,3}>/;
/** A list line of any indent: [1]=indent, [2]=marker, [3]=text. */
const LIST_LINE_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
/** Top-level list item (indent < 2 spaces) — the only list block entry point. */
const TOP_LIST_RE = /^ {0,1}(?:[-*+]|\d+\.)\s+/;
const TABLE_ROW_RE = /^\s*\|/;

/** Split a table row into trimmed cells (leading/trailing pipes dropped). */
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((cell) => cell.trim());
}

/** True for `| --- | :---: |` style separator rows. */
function isSeparatorRow(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

/** Does `lines[i]` start a new block (interrupting a paragraph)? */
function startsBlock(lines: string[], i: number): boolean {
  const l = lines[i];
  if (FENCE_RE.test(l) || HEADING_RE.test(l) || HR_RE.test(l) || QUOTE_RE.test(l) || LIST_LINE_RE.test(l)) return true;
  if (TABLE_ROW_RE.test(l)) return isSeparatorRow(lines[i + 1] ?? "");
  return false;
}

/* ═════════════════════════════ list rendering ═══════════════════════════ */

/** `- [ ]` / `- [x]` prefix → glyph + remaining text. */
function parseCheckbox(text: string): { glyph: string; text: string } {
  const m = text.match(/^\[( |x|X)\]\s*(.*)$/);
  if (!m) return { glyph: "", text };
  return { glyph: m[1] === " " ? UNCHECKED_GLYPH : CHECKED_GLYPH, text: m[2] };
}

/** Flat nested list (one level only) from pre-trimmed child lines. */
function renderNestedList(childLines: string[]): string {
  const ordered = /^\d+\.\s+/.test(childLines[0] ?? "");
  const tag = ordered ? "ol" : "ul";
  const style = ordered ? OL_NESTED_STYLE : UL_NESTED_STYLE;
  const lis = childLines
    .map((l) => {
      const { glyph, text } = parseCheckbox(l.replace(/^(?:[-*+]|\d+\.)\s+/, ""));
      return `<li style="${LI_STYLE}">${glyph}${inline(escapeHtml(text))}</li>`;
    })
    .join("");
  return `<${tag} style="${style}">${lis}</${tag}>`;
}

/** Parse a list block starting at `start`; returns its HTML and next index. */
function renderList(lines: string[], start: number): { html: string; next: number } {
  const ordered = /^\s{0,1}\d+\.\s+/.test(lines[start]);
  const tag = ordered ? "ol" : "ul";
  const style = ordered ? OL_STYLE : UL_STYLE;

  const items: { text: string; children: string[] }[] = [];
  let i = start;

  while (i < lines.length) {
    const m = lines[i].match(LIST_LINE_RE);
    if (m) {
      if (m[1].length < 2 || items.length === 0) {
        // top-level item
        items.push({ text: m[3], children: [] });
      } else {
        // nested item (indent >= 2) — one nesting level, deeper indents flatten
        items[items.length - 1].children.push(lines[i].trim());
      }
      i++;
      continue;
    }
    // indented continuation text folds into the current item
    if (items.length > 0 && /^\s{2,}\S/.test(lines[i])) {
      items[items.length - 1].text += ` ${lines[i].trim()}`;
      i++;
      continue;
    }
    break; // blank line or any other block ends the list
  }

  const lis = items
    .map((it) => {
      const { glyph, text } = parseCheckbox(it.text);
      const nested = it.children.length > 0 ? renderNestedList(it.children) : "";
      return `<li style="${LI_STYLE}">${glyph}${inline(escapeHtml(text))}${nested}</li>`;
    })
    .join("");

  return { html: `<${tag} style="${style}">${lis}</${tag}>`, next: i };
}

/* ═════════════════════════════ table rendering ══════════════════════════ */

function renderTable(header: string[], body: string[][]): string {
  const th = header.map((c) => `<th style="${TH_STYLE}">${inline(escapeHtml(c))}</th>`).join("");
  const rows = body.map((r) => `<tr>${r.map((c) => `<td style="${TD_STYLE}">${inline(escapeHtml(c))}</td>`).join("")}</tr>`).join("");
  return `<table style="border-collapse:collapse;margin:8px 0"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}

/* ═════════════════════════════ main renderer ════════════════════════════ */

/** Markdown → HTML (safe: escape-first, inline-styled output). */
export function renderMarkdown(md: string): string {
  if (!md) return "";
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* blank line — block separator */
    if (line.trim() === "") {
      i++;
      continue;
    }

    /* fenced code block (content is escaped, never transformed) */
    if (FENCE_RE.test(line)) {
      i++;
      const buf: string[] = [];
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume the closing fence, if any
      out.push(`<pre style="${PRE_STYLE}">${escapeHtml(buf.join("\n"))}</pre>`);
      continue;
    }

    /* horizontal rule */
    if (HR_RE.test(line)) {
      out.push(`<hr style="${HR_STYLE}">`);
      i++;
      continue;
    }

    /* heading (h1–h3) */
    const h = line.match(HEADING_RE);
    if (h) {
      const lvl = h[1].length as 1 | 2 | 3;
      out.push(`<h${lvl} style="${H_STYLE[lvl]}">${inline(escapeHtml(h[2].trim()))}</h${lvl}>`);
      i++;
      continue;
    }

    /* blockquote (consecutive "> " lines, single newlines → <br>) */
    if (QUOTE_RE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        buf.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
        i++;
      }
      out.push(`<blockquote style="${QUOTE_STYLE}">${inline(escapeHtml(buf.join("\n"))).replace(/\n/g, "<br>")}</blockquote>`);
      continue;
    }

    /* table: header row + separator row + body rows */
    if (TABLE_ROW_RE.test(line) && isSeparatorRow(lines[i + 1] ?? "")) {
      const header = splitTableRow(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
        body.push(splitTableRow(lines[i]));
        i++;
      }
      out.push(renderTable(header, body));
      continue;
    }

    /* list (top-level item starts it; one nesting level supported) */
    if (TOP_LIST_RE.test(line)) {
      const res = renderList(lines, i);
      out.push(res.html);
      i = res.next;
      continue;
    }

    /* paragraph — single newlines become <br>, blank line closes it */
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines, i)) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p style="${P_STYLE}">${inline(escapeHtml(buf.join("\n"))).replace(/\n/g, "<br>")}</p>`);
  }

  return out.join("\n");
}

/* ═════════════════════════════ plain-text excerpt ═══════════════════════ */

/**
 * Markdown → plain text excerpt (first ~200 chars) for previews and search.
 * Strips all syntax, collapses whitespace, appends an ellipsis when cut.
 */
export function stripMarkdown(md: string): string {
  if (!md) return "";
  let t = md.replace(/\r\n?/g, "\n");

  t = t.replace(/```[^\n]*\n?[\s\S]*?```/g, " "); // fenced code blocks
  t = t.replace(/```[\s\S]*$/g, " "); // unterminated fence → rest of text
  t = t.replace(/`([^`\n]+)`/g, "$1"); // inline code → its text
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, ""); // heading markers
  t = t.replace(/^\s{0,3}>+\s?/gm, ""); // quote markers
  t = t.replace(/^\s{0,3}(-{3,}|\*{3,})\s*$/gm, " "); // horizontal rules
  t = t.replace(/^\s*\|?[ :|-]*-{3,}[ :|-]*$/gm, " "); // table separator rows
  t = t.replace(/^[ \t]*\|/gm, ""); // leading table pipes
  t = t.replace(/\|[ \t]*$/gm, ""); // trailing table pipes
  t = t.replace(/\|/g, " "); // inner pipes → spaces
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1"); // images → alt text
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // links → their text
  t = t.replace(/^\s*(?:[-*+]|\d+\.)\s+\[[ xX]\]\s*/gm, ""); // checkbox markers
  t = t.replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, ""); // list markers
  t = t.replace(/(\*\*|__)(?=\S)(.+?\S)\1/g, "$2"); // bold
  t = t.replace(/\*([^*\n]+)\*/g, "$1"); // italic
  t = t.replace(/__([^_\n]+)__/g, "$1"); // underscore "bold"
  t = t.replace(/~~(?=\S)(.+?\S)~~/g, "$1"); // strike

  t = t.replace(/\s+/g, " ").trim();
  if (t.length > 200) {
    const cut = t.slice(0, 200);
    const lastSpace = cut.lastIndexOf(" ");
    t = `${(lastSpace > 160 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  }
  return t;
}
