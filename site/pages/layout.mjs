import { raw, tpl } from "../client/tpl.mjs";

export const REPO = "https://github.com/PaSympa/discord-mcp";
export const NPM = "https://www.npmjs.com/package/@pasympa/discord-mcp";
export const FONTS = {
  text: "assets/fonts/bricolage-grotesque-latin.woff2",
  mono: "assets/fonts/jetbrains-mono-latin.woff2",
};

const icon = (body) => raw(`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`);
export const ICONS = {
  search: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  theme: icon(
    '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none"/>',
  ),
  github: icon(
    '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  ),
  close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
  play: icon('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  pause: icon('<path d="M9 5v14M15 5v14"/>'),
};

/** The logo as decorative inline SVG: the link around it carries the name. */
export function inlineLogo(svg) {
  return raw(
    svg
      .trim()
      .replace(/<title>[\s\S]*?<\/title>/g, "")
      .replace(' xmlns="http://www.w3.org/2000/svg"', "")
      .replace("<svg ", '<svg class="logo" aria-hidden="true" focusable="false" '),
  );
}

/**
 * Wraps a page body in the shared head, header and footer. `depth` is how many folders
 * the page sits below the site root, so every URL stays relative and the site works
 * under any base path, /discord-mcp/ on GitHub Pages included.
 */
export function layout(site, { depth, current, title, description, body, script, searchButton }) {
  const up = "../".repeat(depth);
  const nav = [
    ["tools", `${up}tools/`, "Tools"],
    ["builder", `${up}tools/#builder`, "Toolsets"],
    ["install", `${up}#install`, "Install"],
  ];
  const search = searchButton
    ? tpl`<button class="search-btn" type="button" id="search-jump">${ICONS.search}<span class="lbl">Search <span data-total>${site.totals.tools}</span> tools</span><kbd>/</kbd></button>`
    : tpl`<a class="search-btn" href="${up}tools/#search">${ICONS.search}<span class="lbl">Search <span data-total>${site.totals.tools}</span> tools</span><kbd>/</kbd></a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${tpl`${title}`}</title>
<meta name="description" content="${tpl`${description}`}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${tpl`${site.favicon}`}">
<link rel="preload" href="${up}${FONTS.text}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${up}${FONTS.mono}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${up}assets/site.css">
<script>try{var t=localStorage.getItem("dmcp-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>
<script defer src="${up}assets/${script}"></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${tpl`<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="${up || "./"}" aria-label="discord-mcp home"${current === "home" ? raw(' aria-current="page"') : ""}>${site.logo}<span>discord-mcp</span></a>
    <nav class="nav" aria-label="Site">
      ${nav.map(([key, href, label]) => tpl`<a href="${href}"${key === current ? raw(' aria-current="page"') : ""}>${label}</a>`)}
      <a href="${REPO}#readme">README</a>
    </nav>
    <div class="top-actions">
      ${search}
      <button class="icon-btn" type="button" id="theme-btn" aria-label="Color theme: follows your system">${ICONS.theme}</button>
      <a class="icon-btn" href="${REPO}" aria-label="discord-mcp on GitHub">${ICONS.github}</a>
    </div>
  </div>
</header>`}
<main id="main">
${body}
</main>
${tpl`<footer class="foot">
  <div class="wrap foot-in">
    <p>discord-mcp ${site.version} is open source under the MIT license: <a href="${REPO}">GitHub</a>, <a href="${NPM}">npm</a>. Tool counts and token figures come from the server's own <code>tools/list</code>: <span data-total>${site.totals.tools}</span> tools in ${site.totals.toolsets} toolsets. Fonts: Bricolage Grotesque and JetBrains Mono, under the <a href="${up}assets/fonts/OFL.txt">SIL Open Font License</a>.</p>
    <p>Not affiliated with Discord.</p>
  </div>
</footer>`}
<p class="vh" id="announce" aria-live="polite"></p>
</body>
</html>
`;
}
