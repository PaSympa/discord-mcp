import { raw, tpl } from "../client/tpl.mjs";
import { layout, SITE_URL } from "./layout.mjs";

/**
 * GitHub Pages serves 404.html at whatever address was missing, so its links start from the
 * site's root path. Its script reads the address and suggests the closest tool names.
 */
export function renderNotFound(site) {
  const base = new URL(SITE_URL).pathname;
  const data = {
    base,
    tools: site.tools.map(({ name, title, risk }) => ({ name, title, risk })),
  };
  const body = tpl`<div class="wrap nf">
  <h1>Page not found</h1>
  <p class="lead">Nothing is published at <code id="nf-path">this address</code>. It may hold a typo, or the page may have moved.</p>
  <section class="nf-sug" id="nf-sug" aria-labelledby="nf-sug-h" hidden>
    <h2 id="nf-sug-h">Closest tool names</h2>
    <ul class="rel" id="nf-list"></ul>
  </section>
  <form class="find nf-find" action="${base}tools/" method="get" role="search" aria-label="Search the catalog">
    <label class="vh" for="nf-q">Search the tools by task, name or parameter</label>
    <input id="nf-q" name="q" type="search" autocomplete="off" spellcheck="false" placeholder="Search by task or name">
    <button class="btn" type="submit">Search</button>
  </form>
  <p class="nf-links">Or start again from <a href="${base}">the home page</a>, or browse <a href="${base}tools/">all <span data-total>${site.totals.tools}</span> tools</a>.</p>
</div>
<script type="application/json" id="nf-data">${raw(JSON.stringify(data).replace(/</g, "\\u003c"))}</script>`;
  return layout(site, {
    path: "404.html",
    base,
    current: "",
    title: "Page not found | discord-mcp",
    description: `No page at this address on the discord-mcp site. The closest tool names, and a search over all ${site.totals.tools} tools.`,
    body: String(body),
    script: "notfound.js",
    ogType: "website",
  });
}
