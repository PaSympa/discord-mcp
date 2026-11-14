import {
  formatInt,
  formatTokens,
  mixText,
  plural,
  riskCounts,
  strip,
  tpl,
} from "../client/tpl.mjs";
import { terminal } from "./parts.mjs";

const ALL_LINE = "DISCORD_MCP_TOOLSETS=all";

/** The README profiles as buttons that tick their toolsets in the list. */
export function presets(site) {
  const chips = site.profiles.map(
    (p, i) =>
      tpl`<button class="chip" type="button" data-preset="${i}" aria-pressed="${p.all ? "true" : "false"}" title="${p.all ? "All toolsets" : p.sets.join(",")}">${p.label}<span class="n">${p.tools}</span></button>`,
  );
  return tpl`<div class="presets">
  <p class="presets-title" id="presets-title">Start from a README profile</p>
  <div class="chips" id="presets" role="group" aria-labelledby="presets-title">${chips}</div>
</div>`;
}

/** One toolset of the list on /toolsets/: its box ticks it into the line, its title opens its page. */
export function pickRow(set, max) {
  return tpl`<li class="tsx ts-row on" id="ts-${set.name}" data-set="${set.name}">
  <label class="tsx-pick"><input type="checkbox" value="${set.name}" checked><span class="vh">Load ${set.label}</span></label>
  <div class="tsx-head">
    <h2><a href="${set.name}/">${set.label}</a></h2>
    <code>${set.name}</code>
    <span class="tsx-tok"><span data-tok>${formatTokens(set.tokens)}</span> tokens</span>
  </div>
  <p class="tsx-blurb">${set.blurb}</p>
  <p class="tsx-mix"><span class="ts-mix">${strip(set.risk)}</span><span><span data-n>${set.tools}</span><span data-unit> ${set.tools === 1 ? "tool" : "tools"}</span>: <span data-mix>${mixText(set.risk)}</span></span>${set.risk.read ? "" : tpl`<a class="tsx-none" href="#read-only">No read-only tool</a>`}<span class="ts-bar" aria-hidden="true"><i style="width: ${((set.tokens / max) * 100).toFixed(1)}%"></i></span></p>
</li>`;
}

/**
 * What the ticked toolsets come to: a summary that stays in view, then the line to paste, the
 * read-only switch and a link to the same tools in the catalog. `up` leads to the site root.
 */
export function linePanel(site, { up }) {
  const { totals } = site;
  return tpl`<aside class="builder" id="line" aria-labelledby="builder-title">
  <div class="b-head">
  <h2 id="builder-title">Your toolset line</h2>
  <p class="figure"><span class="big" id="b-tokens">${(totals.tokens / 1000).toFixed(1)}k</span><span class="unit">tokens of tool definitions, estimated</span></p>
  <div class="meter" id="b-meter" role="img" aria-label="All of the ${formatInt(totals.tokens)} estimated tokens selected"><i id="b-meter-fill" style="width: 100%"></i></div>
  <p class="mix" id="b-mix"><span><b>${totals.tools}</b> tools</span>${riskCounts(totals.risk)}</p>
  </div>
  <div class="b-body">
  <div class="env">
    <div class="env-top">
      <h3>Paste this in your config</h3>
      <div class="seg" role="radiogroup" aria-label="Line format">
        <label><input type="radio" name="fmt" value="env" checked><span>Env lines</span></label>
        <label><input type="radio" name="fmt" value="json"><span>JSON</span></label>
      </div>
    </div>
    ${terminal({ code: ALL_LINE, lang: "text", title: "Environment", copyLabel: "Copy your configuration", id: "b-env" })}
    <p class="hint" id="b-hint" aria-live="polite">Same as leaving DISCORD_MCP_TOOLSETS unset: every toolset loads.</p>
  </div>
  <div class="ro-box">
    <label class="switch"><input type="checkbox" id="b-ro"><span class="switch-ui" aria-hidden="true"></span><span>Read-only mode</span></label>
    <p class="note">Keeps the ${totals.risk.read} tools that only read. <a href="#read-only">How it works</a></p>
  </div>
  <a class="btn show-sel" id="show-cat" href="${up}tools/">See these tools in the catalog</a>
  </div>
</aside>`;
}

/** The line on narrow screens, where the panel comes after the list: it rides along with the list. */
export function lineBar(site) {
  const { totals } = site;
  return tpl`<div class="linebar" id="linebar">
  <div class="linebar-in">
    <p class="lb-what"><b id="lb-tokens">${formatTokens(totals.tokens)} tokens</b><span id="lb-count">${plural(totals.tools, "tool")} in ${plural(totals.toolsets, "toolset")}</span></p>
    <a class="btn btn-sm lb-see" href="#line">See the line</a>
    <button class="btn btn-sm btn-primary" type="button" id="lb-copy" data-copy-text="${ALL_LINE}">Copy line</button>
  </div>
</div>`;
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
