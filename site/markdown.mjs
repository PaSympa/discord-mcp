import { esc, raw } from "./client/tpl.mjs";

/**
 * Renders the inline Markdown the README uses: code spans, bold and links. `code` and
 * `link` let a page turn a tool name into a catalog link or move a README anchor.
 */
export function inline(
  md,
  { code = (text) => `<code>${esc(text)}</code>`, link = (url) => url } = {},
) {
  const out = md
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return String(code(part.slice(1, -1)));
      return esc(part)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(
          /\[([^\]]+)\]\(([^)\s]+)\)/g,
          (_, text, url) => `<a href="${link(url)}">${text}</a>`,
        );
    })
    .join("");
  return raw(out);
}

/** Plain text of inline Markdown: no code ticks, no bold marks, link text only. */
export function plain(md) {
  return md
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1");
}

const dedent = (lines, n) => lines.map((line) => line.slice(Math.min(n, line.search(/\S|$/))));

/**
 * Splits README Markdown into blocks: p, ul, ol (items hold nested blocks), code, table
 * and html. Enough for the README sections the site renders, not general Markdown.
 */
export function blocks(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const blank = (line) => line.trim() === "";
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) {
      i++;
      continue;
    }
    const fence = /^(\s*)```(\w*)\s*$/.exec(line);
    if (fence) {
      const indent = fence[1].length;
      const body = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      out.push({ type: "code", lang: fence[2] || "text", code: dedent(body, indent).join("\n") });
      continue;
    }
    if (line.startsWith("|")) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith("|"); i++)
        rows.push(
          lines[i]
            .trim()
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((cell) => cell.trim()),
        );
      out.push({ type: "table", head: rows[0], rows: rows.slice(2) });
      continue;
    }
    if (/^<\/?[a-z]/i.test(line.trim())) {
      out.push({ type: "html", text: line.trim() });
      i++;
      continue;
    }
    if (/^- /.test(line)) {
      const items = [];
      for (; i < lines.length && /^- /.test(lines[i]); i++) {
        let item = lines[i].slice(2);
        while (i + 1 < lines.length && /^ {2,}\S/.test(lines[i + 1]))
          item += " " + lines[++i].trim();
        items.push(item);
      }
      out.push({ type: "ul", items });
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        const body = [lines[i].replace(/^\d+\. /, "")];
        for (i++; i < lines.length && (blank(lines[i]) || /^ {3}/.test(lines[i])); i++)
          body.push(lines[i]);
        items.push(blocks(dedent(body, 3).join("\n")));
      }
      out.push({ type: "ol", items });
      continue;
    }
    const para = [];
    for (; i < lines.length && !blank(lines[i]) && !/^(\||- |\d+\. |\s*```|<)/.test(lines[i]); i++)
      para.push(lines[i].trim());
    if (para.length === 0) {
      out.push({ type: "html", text: line.trim() });
      i++;
      continue;
    }
    out.push({ type: "p", text: para.join(" ") });
  }
  return out;
}
