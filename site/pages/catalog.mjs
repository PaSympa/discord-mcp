import {
  breakable,
  formatInt,
  formatTokens,
  glyph,
  plural,
  raw,
  RISK_LABEL,
  riskBadge,
  RISKS,
  strip,
  tpl,
} from "../client/tpl.mjs";
import { firstFitting, ICONS, layout, SEARCH_KEYS, searchHint } from "./layout.mjs";
import { builder } from "./builder.mjs";

const UP = "../";

/**
 * A tool row. The catalog script moves these between groups and the ranked list; `prefix`
 * leads from the page to the tool pages' folder.
 */
export function toolRow(tool, prefix = "") {
  return tpl`<li class="row-li" id="${tool.name}" data-tool="${tool.name}" data-risk="${tool.risk}" data-set="${tool.toolset}"${tool.dryRunDefault ? raw(" data-dry") : ""}>
<a class="row" href="${prefix}${tool.name}/" data-tool="${tool.name}">
  ${riskBadge(tool.risk)}
  <span class="row-main">
    <span class="row-head"><span class="row-title">${tool.title}</span>${tool.dryRunDefault ? tpl`<span class="dry">Dry run by default</span>` : ""}</span>
    <code class="row-name">${breakable(tool.name)}</code>
    <span class="row-purpose">${tool.purpose}</span>
    <span class="why"></span>
  </span>
  <span class="row-tok" title="${formatInt(tool.bytes)} bytes divided by 4">${formatTokens(tool.tokens)} tokens</span>
</a>
</li>`;
}

function group(site, set) {
  const tools = site.tools.filter((t) => t.toolset === set.name);
  return tpl`<section class="group" id="set-${set.name}" aria-labelledby="set-${set.name}-h">
  <div class="group-head">
    <h2 id="set-${set.name}-h"><a href="${UP}toolsets/${set.name}/">${set.label}</a></h2>
    <code>${set.name}</code>
    ${strip(set.risk)}
    <span class="meta" data-meta>${plural(set.tools, "tool")}, ${formatTokens(set.tokens)} tokens</span>
  </div>
  <p class="group-blurb">${set.blurb}</p>
  <ol class="rows" role="list">${tools.map((tool) => toolRow(tool))}</ol>
</section>`;
}

function facets(site) {
  const riskChips = RISKS.map(
    (risk) =>
      tpl`<button class="chip" type="button" data-risk="${risk}" aria-pressed="false">${glyph()}${RISK_LABEL[risk]}<span class="n">${site.totals.risk[risk]}</span></button>`,
  );
  const dry = tpl`<button class="chip" type="button" data-dry aria-pressed="false">Dry run by default<span class="n">${site.totals.dryRunDefaults}</span></button>`;
  const setChips = site.toolsets.map(
    (set) =>
      tpl`<button class="chip" type="button" data-set="${set.name}" aria-pressed="false">${set.label}<span class="n">${set.tools}</span></button>`,
  );
  const options = site.toolsets.map(
    (set) => tpl`<option value="${set.name}">${set.label} (${set.tools})</option>`,
  );
  return tpl`<div class="facets">
  <div class="facet" role="group" aria-labelledby="f-risk">
    <span class="facet-label" id="f-risk">Risk</span>
    <div class="chips" id="risk-chips">${riskChips}${dry}</div>
  </div>
  <div class="facet" role="group" aria-labelledby="f-set">
    <span class="facet-label" id="f-set">Toolset</span>
    <div class="chips set-chips" id="set-chips">${setChips}</div>
    <label class="vh" for="set-select">Toolset</label>
    <select class="set-select" id="set-select"><option value="">All toolsets</option>${options}<option value="*" hidden disabled>Several toolsets</option></select>
  </div>
</div>`;
}

/** What the catalog script needs, as compact JSON: definitions, toolsets and profiles. */
function payload(site) {
  const data = {
    totals: site.totals,
    toolsets: site.toolsets.map(({ name, label, blurb, tools, bytes, tokens, risk }) => ({
      name,
      label,
      blurb,
      tools,
      bytes,
      tokens,
      risk,
    })),
    profiles: site.profiles.map(({ label, all, sets }) => ({ label, all, sets })),
    tools: site.tools.map(
      ({
        name,
        title,
        toolset,
        risk,
        purpose,
        dryRunDefault,
        crossReferences,
        permissions,
        bytes,
        tokens,
        definition,
      }) => ({
        name,
        title,
        toolset,
        risk,
        purpose,
        dryRunDefault,
        crossReferences,
        permissions,
        bytes,
        tokens,
        definition,
      }),
    ),
  };
  return raw(JSON.stringify(data).replace(/</g, "\\u003c"));
}

export function renderCatalog(site) {
  const { totals } = site;
  const body = tpl`<div class="wrap cat-top">
  <h1>Tools</h1>
  <p class="lead"><span data-total>${totals.tools}</span> tools in ${totals.toolsets} toolsets, generated from the server's own <code>tools/list</code>: what each one can change, what it returns, and what it costs in context. <a href="#builder">Build a toolset line</a> to load only what you need.</p>
</div>
<div class="wrap layout">
  <section class="catalog" id="catalog" aria-label="Tool catalog">
    <div class="search" id="search">
      ${ICONS.search}
      <label class="vh" for="q">Search tools by task, name or parameter</label>
      <input id="q" type="search" autocomplete="off" spellcheck="false" placeholder="Search by task or name" data-wide-placeholder="Search by task or name, for example: ban a member" aria-keyshortcuts="${SEARCH_KEYS}">
      ${searchHint()}
    </div>
    ${facets(site)}
    <div class="count-row">
      <p class="count" id="count" aria-live="polite">Showing all <span data-total>${totals.tools}</span> tools</p>
      <button class="clear" type="button" id="clear" hidden>Clear filters</button>
    </div>
    <p class="mode-note" id="mode-note" hidden>No tool matches every word. These match some of them.</p>
    <ol class="rows ranked" id="ranked" role="list" aria-label="Best matches" hidden></ol>
    <div id="groups">${site.toolsets.map((set) => group(site, set))}</div>
    <div class="empty" id="empty" hidden>
      <p id="empty-msg">No tool matches.</p>
      <button class="btn" type="button" id="empty-clear">Clear search and filters</button>
    </div>
  </section>
  ${builder(site, { up: UP, showInCatalog: true })}
</div>
<dialog id="tool" aria-labelledby="dlg-title">
  <div class="dlg">
    <div class="dlg-head">
      <button class="icon-btn dlg-close" type="button" id="dlg-close" aria-label="Close tool details">${ICONS.close}</button>
      <div id="dlg-head"></div>
    </div>
    <div class="dlg-body" id="dlg-body"></div>
  </div>
</dialog>
<script type="application/json" id="catalog-data">${payload(site)}</script>`;
  return layout(site, {
    path: "tools/",
    ogType: "article",
    current: "tools",
    title: "discord-mcp tool catalog",
    description: firstFitting(
      [
        `All ${totals.tools} tools of the discord-mcp server: what each one can change, its parameters and output, and a toolset builder that estimates context cost.`,
      ],
      160,
    ),
    body: String(body),
    script: "catalog.js",
    searchButton: true,
  });
}
