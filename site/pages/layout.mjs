import { raw, tpl } from "../client/tpl.mjs";

export const REPO = "https://github.com/PaSympa/discord-mcp";
export const NPM = "https://www.npmjs.com/package/@pasympa/discord-mcp";
export const SITE_URL = process.env.SITE_URL || "https://pasympa.github.io/discord-mcp/";
if (!/^https:\/\/[^/]+\/(.+\/)?$/.test(SITE_URL))
  throw new Error(`SITE_URL must be an https URL ending with a slash, not ${SITE_URL}.`);
export const FONTS = {
  text: "assets/fonts/bricolage-grotesque-latin.woff2",
  mono: "assets/fonts/jetbrains-mono-latin.woff2",
};
/** Ctrl+K, or Cmd+K on Apple systems: the script relabels the hint there. */
export const SEARCH_KEYS = "Control+K";
export const searchHint = () => raw('<kbd data-shortcut aria-hidden="true">Ctrl K</kbd>');

const icon = (body) => raw(`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`);
export const ICONS = {
  search: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  theme: icon(
    '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none"/>',
  ),
  github: icon(
    '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  ),
  menu: icon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
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
 * Wraps a page body in the shared head, header and footer. `path` is the page's URL below
 * the site root ("" for the home page, "tools/x/" for a folder). Every link is relative to
 * it, so the site works under any base path, /discord-mcp/ on GitHub Pages included. A page
 * served at any address, like 404.html, passes `base`: the root path its links start from,
 * and `indexed: false`, which drops the canonical URL and asks crawlers not to index it.
 */
export function layout(
  site,
  {
    path,
    base,
    indexed = true,
    current,
    title,
    description,
    body,
    script,
    searchButton,
    ogType,
    jsonLd,
  },
) {
  const up = base ?? "../".repeat(path.split("/").length - 1);
  const canonical = SITE_URL + path;
  const og = site.ogImage;
  const ld = jsonLd
    ? tpl`<script type="application/ld+json">${raw(JSON.stringify(jsonLd).replace(/</g, "\\u003c"))}</script>`
    : "";
  const nav = [
    ["tools", `${up}tools/`, "Tools"],
    ["builder", `${up}tools/#builder`, "Toolsets"],
    ["install", `${up}#install`, "Install"],
  ];
  const label = tpl`${ICONS.search}<span class="lbl">Search <span data-total>${site.totals.tools}</span> tools</span>${searchHint()}`;
  const search = searchButton
    ? tpl`<button class="search-btn" type="button" id="search-jump" aria-keyshortcuts="${SEARCH_KEYS}">${label}</button>`
    : tpl`<a class="search-btn" href="${up}tools/#q" aria-keyshortcuts="${SEARCH_KEYS}">${label}</a>`;
  const indexing = indexed
    ? tpl`<link rel="canonical" href="${canonical}">
<meta property="og:url" content="${canonical}">`
    : tpl`<meta name="robots" content="noindex">`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${tpl`${title}`}</title>
<meta name="description" content="${tpl`${description}`}">
${tpl`${indexing}
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="discord-mcp">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${SITE_URL}${og.path}">
<meta property="og:image:width" content="${og.width}">
<meta property="og:image:height" content="${og.height}">
<meta property="og:image:alt" content="${og.alt}">
<meta name="twitter:card" content="summary_large_image">`}
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${tpl`${site.favicon}`}">
<link rel="apple-touch-icon" href="${up}${site.touchIcon}">
<link rel="preload" href="${up}${FONTS.text}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${up}${FONTS.mono}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${up}assets/site.css">
<script>try{var t=localStorage.getItem("dmcp-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>
<script defer src="${up}assets/${script}"></script>
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${tpl`<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="${up || "./"}" aria-label="discord-mcp home"${current === "home" ? raw(' aria-current="page"') : ""}>${site.logo}<span>discord-mcp</span></a>
    <button class="icon-btn menu-btn" type="button" id="menu-btn" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">${ICONS.menu}</button>
    <nav class="nav" id="site-nav" aria-label="Site">
      ${nav.map(([key, href, label]) => tpl`<a href="${href}"${key === current ? raw(' aria-current="page"') : ""}>${label}</a>`)}
      <a href="${REPO}#readme">README</a>
      <a class="nav-gh" href="${REPO}">GitHub</a>
    </nav>
    <div class="top-actions">
      ${search}
      <button class="icon-btn" type="button" id="theme-btn" aria-label="Color theme: follows your system">${ICONS.theme}</button>
      <a class="icon-btn gh-btn" href="${REPO}" aria-label="discord-mcp on GitHub">${ICONS.github}</a>
    </div>
  </div>
</header>`}
<main id="main">
${body}
</main>
${tpl`<footer class="foot">
  <div class="wrap foot-in">
    <p>discord-mcp ${site.version} is open source under the MIT license: <a href="${REPO}">GitHub</a>, <a href="${NPM}">npm</a>. Tool counts and token figures come from the server's own <code>tools/list</code>: <span data-total>${site.totals.tools}</span> tools in ${site.totals.toolsets} toolsets, also published as <a href="${up}tools.json">tools.json</a> and <a href="${up}llms.txt">llms.txt</a>. Fonts: Bricolage Grotesque and JetBrains Mono, under the <a href="${up}assets/fonts/OFL.txt">SIL Open Font License</a>.</p>
    <p>Not affiliated with Discord.</p>
  </div>
</footer>`}
<p class="vh" id="announce" aria-live="polite"></p>
</body>
</html>
`;
}

/** Cuts text to at most `max` characters at a word boundary, marking the cut with an ellipsis. */
export function fit(text, max) {
  if (text.length <= max) return text;
  let cut = text.slice(0, max - 1);
  if (/\S/.test(text[max - 1])) cut = cut.replace(/\s+\S*$/, "");
  return cut.replace(/[\s,;:]+$/, "") + "\u2026";
}

/** The first candidate that fits in `max` characters, else the last one cut to fit. */
export const firstFitting = (candidates, max) =>
  candidates.find((text) => text.length <= max) ?? fit(candidates.at(-1), max);
