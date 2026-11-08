import {
  breakable,
  formatInt,
  formatTokens,
  glyph,
  plural,
  raw,
  RISK_LABEL,
  riskBadge,
  tpl,
} from "../client/tpl.mjs";
import { firstFitting, ICONS, layout, SEARCH_KEYS, searchHint } from "./layout.mjs";
import { md, terminal } from "./parts.mjs";

const UP = "../";
const RISKS = ["read", "write", "destructive"];

/** A catalog row. The client moves these between groups and the ranked list. */
export function toolRow(tool) {
  return tpl`<li class="row-li" id="${tool.name}" data-tool="${tool.name}" data-risk="${tool.risk}" data-set="${tool.toolset}"${tool.dryRunDefault ? raw(" data-dry") : ""}>
<a class="row" href="${tool.name}/" data-tool="${tool.name}">
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
    <h2 id="set-${set.name}-h">${set.label}</h2>
    <code>${set.name}</code>
    <span class="meta" data-meta>${plural(set.tools, "tool")}, ${formatTokens(set.tokens)} tokens</span>
  </div>
  <p class="group-blurb">${set.blurb}</p>
  <ol class="rows" role="list">${tools.map(toolRow)}</ol>
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

function builder(site) {
  const max = Math.max(...site.toolsets.map((s) => s.tokens));
  const rows = site.toolsets.map(
    (set) => tpl`<li class="ts-row on" data-set="${set.name}">
  <label>
    <input type="checkbox" value="${set.name}" checked>
    <span class="ts-name"><code>${breakable(set.name)}</code>${
      set.risk.destructive
        ? tpl`<span class="ts-de" data-risk="destructive" title="${set.risk.destructive} destructive">${glyph()}<span aria-hidden="true">${set.risk.destructive}</span><span class="vh">${set.risk.destructive} destructive</span></span>`
        : ""
    }</span>
    <span class="ts-n"><span data-n>${set.tools}</span><span class="vh" data-unit> ${set.tools === 1 ? "tool" : "tools"}</span></span>
    <span class="ts-tok"><span data-tok>${formatTokens(set.tokens)}</span><span class="vh"> tokens</span></span>
    <span class="ts-bar" aria-hidden="true"><i style="width: ${((set.tokens / max) * 100).toFixed(1)}%"></i></span>
  </label>
</li>`,
  );
  const presets = site.profiles.map(
    (p, i) =>
      tpl`<button class="chip" type="button" data-preset="${i}" aria-pressed="${p.all ? "true" : "false"}" title="${p.all ? "All toolsets" : p.sets.join(",")}">${p.label}<span class="n">${p.tools}</span></button>`,
  );
  const { totals } = site;
  return tpl`<aside class="builder" id="builder" aria-labelledby="builder-title">
  <h2 id="builder-title">Load only what you need</h2>
  <p class="sub">Tick the toolsets your assistant should see. Fewer tools leave more of its context for your conversation.</p>
  <p class="figure"><span class="big" id="b-tokens">${(totals.tokens / 1000).toFixed(1)}k</span><span class="unit">tokens of tool definitions, estimated</span></p>
  <div class="meter" id="b-meter" role="img" aria-label="All of the ${formatInt(totals.tokens)} estimated tokens selected"><i id="b-meter-fill" style="width: 100%"></i></div>
  <p class="mix" id="b-mix"><span><b>${totals.tools}</b> tools</span>${RISKS.map((risk) => tpl`<span data-risk="${risk}">${glyph()}${totals.risk[risk]} ${RISK_LABEL[risk].toLowerCase()}</span>`)}</p>
  <div class="ro-box">
    <label class="switch"><input type="checkbox" id="b-ro"><span class="switch-ui" aria-hidden="true"></span><span>Read-only mode</span></label>
    <p class="note">Keeps the ${totals.risk.read} tools annotated <code>readOnlyHint: true</code> and adds <code>DISCORD_MCP_READ_ONLY=true</code> to your line.</p>
  </div>
  <div class="env">
    <div class="env-top">
      <h3>Your configuration</h3>
      <div class="seg" role="radiogroup" aria-label="Line format">
        <label><input type="radio" name="fmt" value="env" checked><span>Env lines</span></label>
        <label><input type="radio" name="fmt" value="json"><span>JSON</span></label>
      </div>
    </div>
    ${terminal({ code: "DISCORD_MCP_TOOLSETS=all", lang: "text", title: "Environment", copyLabel: "Copy your configuration", id: "b-env" })}
    <p class="hint" id="b-hint" aria-live="polite">Same as leaving DISCORD_MCP_TOOLSETS unset: every toolset loads.</p>
  </div>
  <div class="presets">
    <h3 id="presets-title">Start from a README profile</h3>
    <div class="chips" id="presets" role="group" aria-labelledby="presets-title">${presets}</div>
  </div>
  <div class="ts">
    <h3 class="ts-title" id="ts-title">Toolsets</h3>
    <div class="ts-cols" aria-hidden="true"><span></span><span>Name</span><span>Tools</span><span>Tokens</span></div>
    <ul class="ts-list" id="ts-list" aria-labelledby="ts-title">${rows}</ul>
    <p class="ts-legend" aria-hidden="true"><span class="ts-de" data-risk="destructive">${glyph()}3</span> Destructive tools in the toolset</p>
  </div>
  <button class="btn show-sel" type="button" id="show-sel">Show these tools in the catalog</button>
  <p class="method">${md(site, site.expose.method.text.split(". ")[0] + ".", UP)}</p>
</aside>`;
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
  ${builder(site)}
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
