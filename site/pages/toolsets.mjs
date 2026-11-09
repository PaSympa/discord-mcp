import { formatInt, formatTokens, plural, raw, tpl } from "../client/tpl.mjs";
import { builder, builderData } from "./builder.mjs";
import { toolRow } from "./catalog.mjs";
import { firstFitting, layout, REPO, SITE_URL } from "./layout.mjs";
import { terminal, toolChip } from "./parts.mjs";

const RISKS = ["read", "write", "destructive"];
const RISK_WORD = { read: "read-only", write: "write", destructive: "destructive" };

export const TOOLSETS_PATH = "toolsets/";
export const toolsetPath = (name) => `${TOOLSETS_PATH}${name}/`;

const mixText = (set) =>
  RISKS.filter((risk) => set.risk[risk])
    .map((risk) => `${set.risk[risk]} ${RISK_WORD[risk]}`)
    .join(", ");

/** One cell per tool, read-only first, then write, then destructive. */
const strip = (set) =>
  tpl`<span class="strip" aria-hidden="true">${RISKS.map((risk) =>
    Array.from({ length: set.risk[risk] }, () => raw(`<i data-risk="${risk}"></i>`)),
  )}</span>`;

const listOf = (items) =>
  items.length < 2
    ? items
    : [
        ...items
          .slice(0, -1)
          .flatMap((x) => [x, ", "])
          .slice(0, -1),
        " and ",
        items.at(-1),
      ];

/** Title of at most 60 characters and description of at most 160, for search results. */
export function toolsetMeta(set) {
  const count = plural(set.tools, "tool");
  return {
    title: firstFitting(
      [`${set.label} toolset: ${count} | discord-mcp`, `${set.label} toolset | discord-mcp`],
      60,
    ),
    description: firstFitting(
      [
        `${set.blurb} The ${set.label} toolset of the discord-mcp server: ${count}, ${mixText(set)}, about ${formatInt(set.tokens)} tokens of context.`,
        `${set.blurb} The ${set.label} toolset of discord-mcp: ${count}, about ${formatInt(set.tokens)} tokens.`,
        `${set.blurb} ${set.label} toolset of discord-mcp.`,
      ],
      160,
    ),
  };
}

/** The breadcrumb trail of a toolset page, shown above its title and given to search engines. */
export function toolsetTrail(set) {
  return [
    { name: "Toolsets", href: "../", url: SITE_URL + TOOLSETS_PATH },
    { name: set.label, url: SITE_URL + toolsetPath(set.name) },
  ];
}

export function breadcrumbs(trail) {
  return tpl`<nav class="crumbs" aria-label="Breadcrumb"><ol>${trail.map((step) =>
    step.href
      ? tpl`<li><a href="${step.href}">${step.name}</a></li>`
      : tpl`<li aria-current="page">${step.name}</li>`,
  )}</ol></nav>`;
}

export const breadcrumbLd = (trail) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map((step, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: step.name,
    item: step.url,
  })),
});

function readsElsewhere(site, set, up) {
  if (!set.readsElsewhere) return "";
  const { task, tools } = set.readsElsewhere;
  const home = site.toolsets.find((s) => s.name === site.byName.get(tools[0]).toolset);
  return tpl` To ${task}, <a href="${up}${toolsetPath(home.name)}">${home.label}</a> has the read-only ${tools.length === 1 ? "tool" : "tools"} ${listOf(tools.map((name) => toolChip(site, name, up)))}.`;
}

function readOnlySection(site) {
  const up = "../";
  const { totals } = site;
  const examples = site.toolsets.filter((set) => set.risk.read === 0);
  const example = examples[0];
  return tpl`<section class="tsx-ro" id="read-only" aria-labelledby="ro-h">
  <h2 id="ro-h">Read-only mode</h2>
  <p>Set <code>DISCORD_MCP_READ_ONLY=<wbr>true</code> to keep only the ${totals.risk.read} tools annotated <code>readOnlyHint: true</code>. Your assistant can then look, never change anything. The mode works inside your toolset line: it removes tools from the toolsets you picked, and never adds a toolset.</p>
  ${
    example
      ? tpl`<p>So a toolset with no read-only tool drops out entirely. ${listOf(examples.map((s) => tpl`<a href="${up}${toolsetPath(s.name)}">${s.label}</a>`))} ${examples.length === 1 ? "is" : "are"} such a toolset: every one of its ${plural(example.tools, "tool")} changes something.${readsElsewhere(site, example, up)}</p>
  <p>If nothing read-only is left in your selection, as with <code>DISCORD_MCP_TOOLSETS=<wbr>${example.name}</code> alone, the server stops at startup rather than start with no tool.</p>`
      : ""
  }
</section>`;
}

function indexEntry(set) {
  return tpl`<li class="tsx" id="ts-${set.name}">
  <div class="tsx-head">
    <h2><a href="${set.name}/">${set.label}</a></h2>
    <code>${set.name}</code>
    <span class="tsx-tok">${formatTokens(set.tokens)} tokens</span>
  </div>
  <p class="tsx-blurb">${set.blurb}</p>
  <p class="tsx-mix">${strip(set)}<span>${plural(set.tools, "tool")}: ${mixText(set)}</span>${set.risk.read ? "" : tpl`<a class="tsx-none" href="#read-only">No read-only tool</a>`}</p>
</li>`;
}

export function renderToolsets(site) {
  const { totals } = site;
  const data = raw(JSON.stringify(builderData(site)).replace(/</g, "\\u003c"));
  const body = tpl`<div class="wrap cat-top">
  <h1>Toolsets</h1>
  <p class="lead">A toolset is a group of tools you switch on together. Name the ones you want in <code>DISCORD_MCP_TOOLSETS</code> and the server loads only those; leave it unset and it loads everything. The server has <span data-total>${totals.tools}</span> tools in ${totals.toolsets} toolsets, counted from its own <code>tools/list</code>.</p>
</div>
<div class="wrap layout">
  <div class="tsx-main">
    <ol class="tsx-list" role="list">${site.toolsets.map(indexEntry)}</ol>
    <p class="tsx-key" aria-hidden="true">One mark per tool:${RISKS.map((risk) => tpl`<span class="tsx-k"><span class="strip"><i data-risk="${risk}"></i></span>${RISK_WORD[risk]}</span>`)}</p>
    ${readOnlySection(site)}
  </div>
  ${builder(site, { up: "../" })}
</div>
<script type="application/json" id="builder-data">${data}</script>`;
  return layout(site, {
    path: TOOLSETS_PATH,
    ogType: "article",
    current: "toolsets",
    title: "discord-mcp toolsets: load only what you need",
    description: firstFitting(
      [
        `The ${totals.toolsets} toolsets of the discord-mcp server, with the tools, risk and context cost of each, and a builder for your DISCORD_MCP_TOOLSETS line.`,
      ],
      160,
    ),
    body: String(body),
    script: "toolsets.js",
  });
}

function fact(term, value) {
  return tpl`<div><dt>${term}</dt><dd>${value}</dd></div>`;
}

export function renderToolsetPage(site, set) {
  const up = "../../";
  const tools = site.tools.filter((t) => t.toolset === set.name);
  const profiles = site.profiles.filter((p) => p.sets.includes(set.name));
  const trail = toolsetTrail(set);
  const dry = tools.filter((t) => t.dryRunDefault).length;
  const roFact = set.risk.read
    ? `Keeps ${set.risk.read} of its ${plural(set.tools, "tool")}`
    : "Leaves it out: no read-only tool";
  const id = tpl`<div class="tp-id">
  ${breadcrumbs(trail)}
  <h1>${set.label}</h1>
  <p class="tp-name"><code>${set.name}</code></p>
  <p class="tsp-mix">${strip(set)}</p>
  <dl class="facts">
    ${fact("Tools", tpl`${plural(set.tools, "tool")}<span class="fine">${mixText(set)}</span>`)}
    ${fact("Context cost", tpl`${formatInt(set.tokens)} tokens, estimated<span class="fine">${formatInt(set.bytes)} bytes of definitions, divided by 4</span>`)}
    ${fact("Read-only mode", roFact)}
    ${dry ? fact("Dry run by default", plural(dry, "tool")) : ""}
  </dl>
</div>`;
  const line = `DISCORD_MCP_TOOLSETS=${set.name}`;
  const roNote = set.risk.read
    ? ""
    : tpl`<div class="tsp-note" role="note">
  <p><strong>No read-only tool.</strong> Every one of its ${plural(set.tools, "tool")} changes something, so <code>DISCORD_MCP_READ_ONLY=<wbr>true</code> leaves ${set.label} out, and <code>DISCORD_MCP_TOOLSETS=<wbr>${set.name}</code> alone with read-only mode stops the server at startup.${readsElsewhere(site, set, up)}</p>
</div>`;
  const profileItems = profiles.map(
    (p) =>
      tpl`<li><span class="tsp-pf">${p.label}</span><code>${p.all ? "unset" : raw(p.sets.join(",<wbr>"))}</code><span class="tsp-pf-n">${plural(p.tools, "tool")}, ${formatTokens(p.tokens)} tokens</span></li>`,
  );
  const main = tpl`<div class="tp-main">
  <p class="desc">${set.blurb}</p>
  ${roNote}
  <section class="d-sec" aria-labelledby="tsp-tools">
    <h2 id="tsp-tools">Its ${plural(set.tools, "tool")}</h2>
    <ol class="rows" role="list">${tools.map((tool) => toolRow(tool, `${up}tools/`))}</ol>
  </section>
  <section class="d-sec" aria-labelledby="tsp-env">
    <h2 id="tsp-env">Load only this toolset</h2>
    ${terminal({ code: line, lang: "text", title: "Environment", copyLabel: `Copy the ${set.label} toolset line`, id: "tsp-line" })}
    <p class="note">${
      set.name === "discovery"
        ? tpl`Discovery finds the servers, channels and IDs the other toolsets work on.`
        : tpl`Tip: add discovery, as in <code>DISCORD_MCP_TOOLSETS=<wbr>discovery,<wbr>${set.name}</code>. Its <a href="${up}tools/discord_list_guilds/"><code>discord_list_guilds</code></a> finds the guild_id most other tools need.`
    } <a href="../#builder">Combine toolsets in the builder</a>.</p>
  </section>
  <section class="d-sec" aria-labelledby="tsp-pf">
    <h2 id="tsp-pf">README profiles that include it</h2>
    <ul class="tsp-profiles" role="list">${profileItems}</ul>
    <p class="note">The profiles come from the README section <a href="${REPO}#expose-only-what-you-need">Expose only what you need</a>.</p>
  </section>
</div>`;
  return layout(site, {
    path: toolsetPath(set.name),
    current: "",
    ...toolsetMeta(set),
    body: String(tpl`<div class="wrap tp tsp">
${id}
${main}
</div>`),
    script: "page.js",
    ogType: "article",
    jsonLd: breadcrumbLd(trail),
  });
}
