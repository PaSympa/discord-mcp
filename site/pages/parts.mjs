import { breakable, esc, glyph, raw, RISK_LABEL, tpl } from "../client/tpl.mjs";
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
  return tpl`<a class="tool" href="${up}tools/${name}/" data-risk="${tool.risk}">${glyph()}<code>${breakable(name)}</code><span class="vh"> (${RISK_LABEL[tool.risk].toLowerCase()})</span></a>`;
}

/** README links: anchors the landing has stay on the site, the rest go to GitHub. */
export function readmeLink(url, up) {
  if (/^https?:/.test(url)) return url;
  if (url.startsWith("#")) return LANDING_IDS.has(url.slice(1)) ? `${up}${url}` : `${REPO}${url}`;
  return `${REPO}/blob/main/${url}`;
}

/** Inline README Markdown, with tool names turned into catalog links. */
export function md(site, text, up) {
  return inline(text, {
    code: (code) =>
      site.byName.has(code)
        ? toolChip(site, code, up)
        : `<code>${esc(code).replace(/([/\\])/g, "$1<wbr>")}</code>`,
    link: (url) => readmeLink(url, up),
  });
}

const PLACEHOLDER = /YOUR_[A-Z_]+|\/absolute\/path\/to\/[\w/.-]+/g;

// Short words never wrap inside (a package name stays whole); long ones may break anywhere.
function codeLine(text) {
  const html = text
    .split(/( +)/)
    .map((part) => {
      if (part === "" || part.startsWith(" ")) return part;
      const inner = esc(part)
        .replace(PLACEHOLDER, (m) => `<span class="ph">${m}</span>`)
        .replace(/\?/g, "?<wbr>")
        .replace(/&amp;/g, "&amp;<wbr>");
      return part.length <= 32 ? `<span class="nw">${inner}</span>` : inner;
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
  const lines = code
    .replace(/\n+$/, "")
    .split("\n")
    .map((line) => termLine(line, shell));
  return tpl`<div class="term"${id ? raw(` id="${esc(id)}"`) : ""}>
  <div class="term-bar"><span class="term-title">${title}</span><button class="term-btn" type="button" data-copy-term aria-label="${copyLabel}">Copy</button></div>
  <pre class="term-code"><code>${lines}</code></pre>
</div>`;
}

export const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
