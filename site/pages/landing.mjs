import {
  breakable,
  formatInt,
  formatTokens,
  glyph,
  mixText,
  plural,
  raw,
  RISK_LABEL,
  riskCounts,
  RISKS,
  strip,
  tpl,
} from "../client/tpl.mjs";
import { inline } from "../markdown.mjs";
import { firstFitting, ICONS, layout } from "./layout.mjs";
import { clientPanel, md, oneClick, stripKey, terminal, toolChip } from "./parts.mjs";

const UP = "";

function section(id, title, head, body) {
  return tpl`<section class="sec" id="${id}" aria-labelledby="${id}-title">
  <div class="wrap"><div class="sec-in">
    <div class="sec-head">
      <h2 id="${id}-title">${title}</h2>
      ${head}
    </div>
    <div class="sec-body">${body}</div>
  </div></div>
</section>`;
}

function hero(site) {
  const headline = site.readme.tagline.charAt(0).toUpperCase() + site.readme.tagline.slice(1) + ".";
  const tabs = site.clients.map(
    (client) => tpl`<a class="tab" href="#${client.id}">${client.short}</a>`,
  );
  return tpl`<section class="hero wrap" id="install" aria-labelledby="hero-title">
  <div class="hero-copy">
    <h1 id="hero-title">${headline}</h1>
    <p class="lead">${md(site, site.readme.intro, UP)}</p>
    <div class="ocl hero-ocl" role="group" aria-label="One-click install">${oneClick(site, Object.keys(site.installLinks))}</div>
  </div>
  <section class="setup" id="clients" aria-labelledby="setup-title">
    <h2 class="setup-title" id="setup-title">Add it to your client</h2>
    <nav class="tabs" id="client-tabs" aria-label="Clients">${tabs}</nav>
    <div class="panels">${site.clients.map((client) => clientPanel(site, client))}</div>
    <p class="setup-note">Replace <code>YOUR_BOT_TOKEN</code> with your bot's token, <a href="#quick-start">created in three steps</a>. The server runs on Node.js 22 or later.</p>
  </section>
</section>`;
}

const resultText = (text) =>
  text.startsWith("Dry run:") ? tpl`<b>Dry run:</b>${text.slice("Dry run:".length)}` : text;

function seeItWork(site) {
  const { session, demo } = site;
  const calls = session.calls.map(
    (call) => tpl`<li class="term-call">
  <div class="term-call-line"><span class="srv">discord-mcp</span> <a class="term-tool" href="tools/${call.tool}/">${breakable(call.tool)}</a></div>
  <div class="term-call-args">(${call.args.join(", ")})</div>
  <div class="term-call-res"><span class="term-tree" aria-hidden="true"></span><span>${resultText(call.result)}</span></div>
</li>`,
  );
  const body = tpl`<figure class="session">
  <div class="term">
    <div class="term-bar"><span class="term-title">Claude Code</span><span class="term-note">The same request, as the current version runs it</span></div>
    <div class="term-body">
      <p class="term-input"><span class="pm" aria-hidden="true">&gt;</span><span>${session.prompt}</span></p>
      <ol class="term-calls" aria-label="Tool calls">${calls}</ol>
    </div>
  </div>
</figure>
<div class="demo" id="demo">
  <div class="demo-act">
    <a class="btn btn-primary" id="demo-play" href="assets/demo.mp4" aria-controls="demo-video">${ICONS.play}${raw(String(ICONS.pause).replace("<svg ", "<svg hidden "))}<span>Play the recording</span></a>
    <span class="demo-size">Video, ${demo.size}</span>
    <a class="demo-full" href="${demo.video}">Watch the full one-minute demo</a>
  </div>
  <p class="demo-cap">${inline(site.readme.demo.caption)}</p>
  <div class="demo-frame" id="demo-frame" hidden>
    <video id="demo-video" width="${demo.width}" height="${demo.height}" muted loop playsinline preload="none" aria-label="${demo.alt}"><source src="assets/demo.mp4" type="video/mp4"></video>
  </div>
</div>`;
  return section(
    "see-it-work",
    "See it work",
    tpl`<p>The request from the recorded demo, with the calls the current version makes. The assistant reads the channel, previews the cleanup with a dry run that lists the message IDs, then, once you confirm, deletes those IDs and nothing else. The recording predates 2.5.0 and deletes by count.</p>`,
    body,
  );
}

function asks(site) {
  const items = site.asks.map(
    (ask) => tpl`<li class="ask">
  <h3>${ask.want}</h3>
  <p class="prompt"><span class="pm" aria-hidden="true">&gt;</span><span>${raw(ask.promptHtml)}</span></p>
  ${
    ask.tools.length
      ? tpl`<p class="uses"><span class="uses-label">${ask.recorded ? "Called in the recorded session" : "Tools for it, from their descriptions"}</span>${ask.tools.map((name) => toolChip(site, name, UP))}</p>`
      : ""
  }
</li>`,
  );
  return section(
    "what-you-can-ask",
    "What you can ask",
    tpl`<p>Ask in plain language; the assistant picks the tools.</p><a class="btn" href="recipes/">See the recipes</a>
<p class="legend" aria-hidden="true">${RISKS.map((risk) => tpl`<span data-risk="${risk}">${glyph()}${RISK_LABEL[risk]}</span>`)}</p>`,
    tpl`<ul class="asks" role="list">${items}</ul>`,
  );
}

function quickStart(site) {
  const steps = [];
  const after = [];
  for (const block of site.readme.quickStart) {
    if (block.type === "ol") {
      block.items.forEach((item, i) => {
        const [first, ...rest] = item;
        const m = /^\*\*(.+?)\*\*\s*(.*)$/.exec(first.text);
        const body = rest.map((b) =>
          b.type === "code"
            ? terminal({
                code: b.code,
                lang: b.lang,
                title: b.lang === "json" ? "MCP config" : "Invite link",
                copyLabel: b.lang === "json" ? "Copy the MCP config" : "Copy the invite link",
              })
            : tpl`<p>${md(site, b.text, UP)}</p>`,
        );
        steps.push(tpl`<li class="step">
  <span class="step-n" aria-hidden="true">${i + 1}</span>
  <div class="step-body">
    <h3>${m ? m[1].replace(/\.$/, "") : `Step ${i + 1}`}</h3>
    <p>${md(site, m ? m[2] : first.text, UP)}</p>
    ${body}
  </div>
</li>`);
      });
    } else if (block.type === "p") after.push(tpl`<p class="note">${md(site, block.text, UP)}</p>`);
  }
  return section(
    "quick-start",
    "Set it up in three steps",
    tpl`<p>A bot of your own, invited to your server, then one entry in your client's MCP config.</p><a class="btn" href="guide/">Read the full guide</a>`,
    tpl`<ol class="steps" role="list">${steps}</ol>${after}`,
  );
}

function safety(site) {
  const items = site.readme.safety.map((rule) => {
    const extra =
      rule.lead === "Clear annotations"
        ? tpl`<p class="mix">${riskCounts(site.totals.risk)}</p>`
        : "";
    return tpl`<li class="rule">
  <h3>${rule.lead}</h3>
  <p>${md(site, rule.text, UP)}</p>
  ${extra}
</li>`;
  });
  return section(
    "safety",
    "Safety",
    tpl`<p>The server acts through your bot and stops where its permissions stop. Mass actions show what they would do before they do it.</p>`,
    tpl`<ul class="rules" role="list">${items}</ul>`,
  );
}

function profiles(site) {
  const max = Math.max(...site.profiles.map((p) => p.tokens));
  const rows = site.profiles.map((p, i) => {
    const sets = p.all
      ? tpl`all ${site.totals.toolsets} toolsets`
      : tpl`<code>${raw(p.sets.join(",<wbr>"))}</code>`;
    return tpl`<label class="pf${p.checked ? " on" : ""}">
  <input type="radio" name="profile" value="${i}" data-sets="${p.all ? "all" : p.sets.join(",")}" data-tools="${p.tools}" data-tokens="${Math.round(p.tokens)}" data-ro-tools="${p.readOnly.tools}" data-ro-tokens="${Math.round(p.readOnly.tokens)}" data-max="${Math.round(max)}"${p.checked ? raw(" checked") : ""}>
  <span class="pf-name">${p.label}</span>
  <span class="pf-sets">${sets}</span>
  <span class="pf-n"><span class="pf-tools">${p.tools}</span><span class="pf-unit"> ${p.tools === 1 ? "tool" : "tools"}</span></span>
  <span class="pf-bar" aria-hidden="true"><i style="width: ${((p.tokens / max) * 100).toFixed(1)}%"></i></span>
  <span class="pf-tok"><span class="pf-tok-short" aria-hidden="true">${formatTokens(p.tokens)}</span><span class="vh pf-tok-long">about ${formatInt(Math.round(p.tokens / 100) * 100)} tokens</span></span>
</label>`;
  });
  const checked = site.profiles.find((p) => p.checked);
  const { lead, method, readOnly } = site.expose;
  return section(
    "expose-only-what-you-need",
    "Load only what you need",
    tpl`<p>${md(site, lead.text, UP)}</p><a class="btn" href="toolsets/#builder">Open the toolset builder</a>`,
    tpl`<fieldset class="pfs">
  <legend class="vh">Profiles from the README</legend>
  <div class="pf-head" aria-hidden="true"><span>Profile</span><span>Tools</span><span>Context, estimated</span></div>
  ${rows}
</fieldset>
<div class="ro-box">
  <label class="switch"><input type="checkbox" id="pf-ro"><span class="switch-ui" aria-hidden="true"></span><span>Read-only mode</span></label>
  <p class="note">${md(site, readOnly.text, UP)}</p>
</div>
<div class="pf-out">
  ${terminal({ code: "DISCORD_MCP_TOOLSETS=" + (checked.all ? "all" : checked.sets.join(",")), lang: "text", title: "Environment", copyLabel: "Copy the environment line", id: "pf-env" })}
  <p class="hint" id="pf-hint" aria-live="polite"></p>
</div>
<p class="method">${md(site, method.text.split(". ")[0] + ".", UP)}</p>`,
  );
}

function browse(site) {
  const sets = site.toolsets.map((s) => {
    const de = s.risk.destructive;
    return tpl`<li><a class="set-link" href="toolsets/${s.name}/">
  <span class="set-top"><span class="set-name">${s.label}</span><span class="set-n">${plural(s.tools, "tool")}</span><span class="set-mix">${strip(s.risk)}<span class="vh">${mixText(s.risk)}</span><span class="set-de"${de ? raw(' data-risk="destructive"') : ""} aria-hidden="true">${de} destructive</span></span></span>
  <span class="set-blurb">${s.blurb}</span>
</a></li>`;
  });
  return section(
    "tools",
    tpl`Browse all <span data-total>${site.totals.tools}</span> tools`,
    tpl`<p>Every tool documents its permissions, side effects and return shape. The catalog adds search, risk filters, and input and output schemas.</p><a class="btn" href="tools/">Open the catalog</a>`,
    tpl`<form class="find" action="tools/" method="get" role="search" aria-label="Search the catalog">
  <label class="vh" for="find-q">Search the tools by task, name or parameter</label>
  <input id="find-q" name="q" type="search" autocomplete="off" spellcheck="false" placeholder="Search by task or name">
  <button class="btn" type="submit">Search</button>
</form>
<ul class="sets" role="list" aria-label="Toolsets">${sets}</ul>
${stripKey("set-key")}`,
  );
}

export function renderLanding(site) {
  const body = [
    hero(site),
    seeItWork(site),
    asks(site),
    quickStart(site),
    safety(site),
    profiles(site),
    browse(site),
  ].join("\n");
  return layout(site, {
    path: "",
    ogType: "website",
    current: "home",
    title: `discord-mcp: ${site.readme.tagline}`,
    description: firstFitting(
      [
        site.description,
        `Connect Claude, Codex, Cursor, VS Code and any MCP client to your Discord server through your own bot: ${site.totals.tools} tools, dry runs for mass actions, read-only mode.`,
      ],
      160,
    ),
    body,
    script: "landing.js",
  });
}
