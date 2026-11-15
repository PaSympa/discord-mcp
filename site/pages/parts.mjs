import { breakable, esc, glyph, raw, RISK_WORD, RISKS, tpl } from "../client/tpl.mjs";
import { inline } from "../markdown.mjs";
import { REPO } from "./layout.mjs";

/** Ids on the landing page that README anchors of the same name may point to. */
export const LANDING_IDS = new Set([
  "install",
  "clients",
  "see-it-work",
  "what-you-can-ask",
  "quick-start",
  "safety",
  "expose-only-what-you-need",
  "tools",
]);

export function toolChip(site, name, up) {
  const tool = site.byName.get(name);
  if (!tool) throw new Error(`Unknown tool in the site content: ${name}.`);
  return tpl`<a class="tool" href="${up}tools/${name}/" data-risk="${tool.risk}">${glyph()}<code>${breakable(name)}</code><span class="vh"> (${RISK_WORD[tool.risk]})</span></a>`;
}

/** The key of the strips: what a bar of each height stands for. */
export const stripKey = (className) =>
  tpl`<p class="strip-key ${className}" aria-hidden="true">One bar per tool:${RISKS.map((risk) => tpl`<span><span class="strip"><i data-risk="${risk}"></i></span>${RISK_WORD[risk]}</span>`)}</p>`;

/** README anchors whose content has its own place on the site. */
export const DOC_ANCHORS = {
  configuration: "configuration/",
  troubleshooting: "troubleshooting/",
  "remote-clients-over-http": "guide/#remote-clients-over-http",
  "security-over-http": "guide/#security-over-http",
  "empty-messages": "troubleshooting/#empty-messages",
};

/**
 * README links: an anchor the current page has (`local`) stays on it, then anchors the
 * landing has, then the README sections with a page of their own; the rest go to GitHub.
 */
export function readmeLink(url, up, local = new Set()) {
  if (/^https?:/.test(url)) return url;
  if (url.startsWith("#")) {
    const id = url.slice(1);
    if (local.has(id)) return url;
    if (LANDING_IDS.has(id)) return `${up}${url}`;
    if (DOC_ANCHORS[id]) return up + DOC_ANCHORS[id];
    return `${REPO}${url}`;
  }
  return `${REPO}/blob/main/${url}`;
}

/** Inline README Markdown, with tool names turned into catalog links. */
export function md(site, text, up, local) {
  return inline(text, {
    code: (code) =>
      site.byName.has(code)
        ? toolChip(site, code, up)
        : `<code>${esc(code).replace(/([/\\])/g, "$1<wbr>")}</code>`,
    link: (url) => readmeLink(url, up, local),
  });
}

const PLACEHOLDER = /YOUR_[A-Z_]+|\/absolute\/path\/to\/[\w/.-]+/g;

// Short words never wrap inside (a package name stays whole); long ones may break anywhere,
// and preferably after a comma or an equals sign.
function codeLine(text) {
  const html = text
    .split(/( +)/)
    .map((part) => {
      if (part === "" || part.startsWith(" ")) return part;
      const short = part.length <= 32;
      const inner = esc(part)
        .replace(short ? /$^/ : /([,=])/g, "$1<wbr>")
        .replace(PLACEHOLDER, (m) => `<span class="ph">${m}</span>`)
        .replace(/\?/g, "?<wbr>")
        .replace(/&amp;/g, "&amp;<wbr>");
      return short ? `<span class="nw">${inner}</span>` : inner;
    })
    .join("");
  return raw(html);
}

/** One rendered line of a terminal block; `prompt` adds a shell `$` that Copy leaves out. */
export function termLine(text, prompt = false) {
  if (prompt)
    return tpl`<span class="l" style="--i:2"><span class="pm" aria-hidden="true">$ </span>${codeLine(text)}</span>`;
  return tpl`<span class="l" style="--i:${text.search(/\S|$/)}">${codeLine(text)}</span>`;
}

/**
 * A copyable block in the terminal style: a title bar naming where the code goes, and
 * lines that wrap with a hanging indent instead of scrolling sideways.
 */
export function terminal({ code, lang, title, copyLabel, id }) {
  const shell = lang === "bash" || lang === "sh";
  // A continued or indented shell line belongs to the command above it: no prompt.
  const lines = code
    .replace(/\n+$/, "")
    .split("\n")
    .map((line, i, all) =>
      termLine(line, shell && !/^\s/.test(line) && !(all[i - 1] ?? "").endsWith("\\")),
    );
  return tpl`<div class="term"${id ? raw(` id="${esc(id)}"`) : ""}>
  <div class="term-bar"><span class="term-title">${title}</span><button class="term-btn" type="button" data-copy-term aria-label="${copyLabel}">Copy</button></div>
  <pre class="term-code"><code>${lines}</code></pre>
</div>`;
}

/** Prompt text with each #channel marked, as the landing shows its prompts. */
export const channels = (text) =>
  raw(esc(text).replace(/#[a-z0-9-]+/g, (m) => `<span class="ch">${m}</span>`));

export const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function oneClick(site, labels, { up = "", lazy = false } = {}) {
  return labels.map(
    (label) =>
      tpl`<a class="ocb" href="${site.installLinks[label]}"><img src="${up}assets/${site.buttonFiles[label]}" width="196" height="40" alt="${label}"${lazy ? raw(' loading="lazy"') : ""}></a>`,
  );
}

/**
 * One client's setup from the README: its prose and code blocks, the one-click buttons it
 * names, and the Quick start config when it has no code of its own, unless `quickConfig` is
 * false. `id` overrides the panel id and `heading` puts a heading of that level inside it.
 */
export function clientPanel(
  site,
  client,
  { up = "", id = client.id, heading, local, quickConfig = true } = {},
) {
  const parts = [];
  const prose = client.blocks.filter((b) => b.type !== "code");
  const codes = client.blocks.filter((b) => b.type === "code");
  const fileName = (prose
    .map((b) => b.text ?? b.items?.join(" ") ?? "")
    .join(" ")
    .match(/`([^`]+\.json)`/) ?? [])[1];
  const buttons = [];
  const text = JSON.stringify(client.blocks);
  if (text.includes("**Install in VS Code**"))
    buttons.push("Install in VS Code", "Install in VS Code Insiders");
  if (text.includes("**Install in Cursor**")) buttons.push("Install in Cursor");
  if (text.includes("**Install in Claude Desktop**")) buttons.push("Install in Claude Desktop");
  const titleOf = (block) =>
    block.lang === "bash" ? "Terminal" : codes.length === 1 && fileName ? fileName : "MCP config";
  const block = (b, i) =>
    terminal({
      code: b.code,
      lang: b.lang,
      title: titleOf(b),
      copyLabel: `Copy the ${client.short} ${b.lang === "bash" ? "command" : "config"}${codes.length > 1 ? ` (${i + 1} of ${codes.length})` : ""}`,
    });
  // A client without a block of its own gets the Quick start config, right after the
  // paragraph that points to it, or first when no paragraph does.
  let quick =
    quickConfig && codes.length === 0
      ? terminal({
          code: site.quickConfig,
          lang: "json",
          title: fileName ?? "MCP config",
          copyLabel: `Copy the ${client.short} config`,
        })
      : null;
  let codeIndex = 0;
  let placedButtons = false;
  for (const b of client.blocks) {
    if (b.type === "code") parts.push(block(b, codeIndex++));
    else if (b.type === "p") parts.push(tpl`<p>${md(site, b.text, up, local)}</p>`);
    else if (b.type === "ul")
      parts.push(
        tpl`<ul>${b.items.map((item) => tpl`<li>${md(site, item, up, local)}</li>`)}</ul>`,
      );
    if (b.type !== "p") continue;
    if (!placedButtons && buttons.length) {
      parts.push(tpl`<p class="ocl">${oneClick(site, buttons, { up, lazy: true })}</p>`);
      placedButtons = true;
    }
    if (quick && b.text.includes("(#quick-start)")) {
      parts.push(quick);
      quick = null;
    }
  }
  if (quick) parts.unshift(quick);
  if (heading)
    return tpl`<section class="panel" id="${id}" aria-labelledby="${id}-h"><h${heading} id="${id}-h">${client.label}</h${heading}>${parts}</section>`;
  return tpl`<section class="panel" id="${id}" aria-label="${client.label}">${parts}</section>`;
}
