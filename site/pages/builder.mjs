import { breakable, formatInt, formatTokens, glyph, raw, RISK_LABEL, tpl } from "../client/tpl.mjs";
import { md, terminal } from "./parts.mjs";

const RISKS = ["read", "write", "destructive"];

/**
 * The toolset builder panel. `up` leads from the page to the site root; `showInCatalog` adds
 * the button that filters the catalog beside it to the selection.
 */
export function builder(site, { up, showInCatalog = false }) {
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
    <p class="ts-legend" id="de-legend" aria-hidden="true"><span class="ts-de" data-risk="destructive">${glyph()}3</span> Destructive tools in the toolset</p>
    <p class="ts-legend" id="ro-legend" hidden>Crossed out: the toolset has no read-only tool, so read-only mode leaves it out.</p>
  </div>
  ${showInCatalog ? raw('<button class="btn show-sel" type="button" id="show-sel">Show these tools in the catalog</button>') : ""}
  <p class="method">${md(site, site.expose.method.text.split(". ")[0] + ".", up)}</p>
</aside>`;
}

/** What the builder script needs: totals, toolsets, profiles, and per tool its set, risk and cost. */
export function builderData(site) {
  return {
    totals: site.totals,
    toolsets: site.toolsets.map(({ name, label, tools, tokens, risk }) => ({
      name,
      label,
      tools,
      tokens,
      risk,
    })),
    profiles: site.profiles.map(({ label, all, sets }) => ({ label, all, sets })),
    tools: site.tools.map(({ name, toolset, risk, tokens }) => ({ name, toolset, risk, tokens })),
  };
}
