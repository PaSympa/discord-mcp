import { raw, tpl } from "../client/tpl.mjs";
import { docPage, docSection, readmeBlocks, UP } from "./docs.mjs";
import { channels, clientPanel, md, slug, terminal, toolChip } from "./parts.mjs";

const PORTAL = "https://discord.com/developers/applications";

const step = (n, title, body) => tpl`<li class="step">
  <span class="step-n" aria-hidden="true">${n}</span>
  <div class="step-body"><h3>${title}</h3>${body}</div>
</li>`;

const prompt = (site, text, tools) => tpl`<li class="ask">
  <p class="prompt"><span class="pm" aria-hidden="true">&gt;</span><span>${typeof text === "string" ? channels(text) : text}</span></p>
  ${tools.length ? tpl`<p class="uses">${tools.map((name) => toolChip(site, name, UP))}</p>` : ""}
</li>`;

const fileTitle = (b) =>
  b.lang === "bash" ? "Terminal" : b.lang === "toml" ? "~/.codex/config.toml" : "MCP config";

export function renderGuide(site) {
  const clientIds = site.clients.map((c) => ({ ...c, docId: "client-" + slug(c.short) }));
  const remoteIds = site.readme.remote.clients.map((c) => ({
    ...c,
    docId: "remote-" + slug(c.label),
  }));
  const local = new Set(["quick-start", "remote-clients-over-http", "security-over-http"]);
  const ro = site.profiles[0].readOnly;

  const bot = docSection({
    id: "create-the-bot",
    title: "Create the bot",
    intro: tpl`<p>The server acts through a Discord bot of your own. You create it once, in the Discord Developer Portal.</p>`,
    body: tpl`<ol class="steps doc-steps" role="list">
  ${step(1, "Create an application", tpl`<p>Open the <a href="${PORTAL}">Developer Portal</a> and sign in. Choose <strong>New Application</strong>, give it a name, and create it. The name is what your server sees.</p>`)}
  ${step(2, "Copy the token", tpl`<p>Open the <strong>Bot</strong> page. Under the token, choose <strong>Reset Token</strong> and copy the new token. Discord shows it once: keep it somewhere safe. Anyone who holds it controls the bot.</p>`)}
  ${step(3, "Turn on the two privileged intents", tpl`<p>On the same page, under <strong>Privileged Gateway Intents</strong>, turn on <strong>Server Members Intent</strong> and <strong>Message Content Intent</strong>, then save. Without Message Content, messages come back with empty text. Without Server Members, member lists fail. To run without one of them, see <a href="${UP}configuration/#DISCORD_MESSAGE_CONTENT">the intent flags</a>.</p>`)}
  ${step(4, "Note the Application ID", tpl`<p>Open <strong>General Information</strong> and copy the <strong>Application ID</strong>. The invite link below needs it.</p>`)}
</ol>`,
  });

  const invite = docSection({
    id: "invite-the-bot",
    title: "Invite it to your server",
    intro: tpl`<p>Replace <code>YOUR_CLIENT_ID</code> with the Application ID, then open the link. Pick your server and authorize. You need the Manage Server permission on that server.</p>`,
    body: tpl`${terminal({ code: site.invite.link, lang: "text", title: "Invite link", copyLabel: "Copy the invite link" })}
<p>The link asks for the ${site.invite.permissions.length} permissions the tools use. Untick the ones you do not want in the authorization screen; each tool page names the permissions it needs.</p>
<ul class="perm-list" role="list" aria-label="Permissions the invite link requests">${site.invite.permissions.map((p) => tpl`<li>${p}</li>`)}</ul>
<p class="note">Avoid Administrator unless a task needs it: pruning does on servers that require it. Administrator ignores every channel overwrite, so a mistake would reach every channel.</p>`,
  });

  const clients = docSection({
    id: "add-it-to-your-client",
    title: "Add it to your client",
    intro: tpl`<p id="quick-start">Most clients start the server with <code>npx</code> and read the same entry. Node.js 22 or later runs it; nothing else to install. Put your bot token in place of <code>YOUR_BOT_TOKEN</code>.</p>
${terminal({ code: site.quickConfig, lang: "json", title: "MCP config", copyLabel: "Copy the MCP config" })}
<nav class="doc-jump" aria-label="Clients"><ul role="list">${clientIds.map((c) => tpl`<li><a href="#${c.docId}">${c.short}</a></li>`)}<li><a href="#remote-clients-over-http">Over HTTP</a></li></ul></nav>`,
    body: clientIds.map((c) =>
      clientPanel(site, c, { up: UP, id: c.docId, heading: 3, local, quickConfig: false }),
    ),
  });

  const remote = docSection({
    id: "remote-clients-over-http",
    title: "Remote clients over HTTP",
    body: tpl`${readmeBlocks(site, site.readme.remote.intro, { local, titleOf: fileTitle, label: "HTTP" })}
${remoteIds.map(
  (c) =>
    tpl`<section class="panel" id="${c.docId}" aria-labelledby="${c.docId}-h"><h3 id="${c.docId}-h">${c.label}</h3>${readmeBlocks(site, c.blocks, { local, titleOf: fileTitle, label: c.label })}</section>`,
)}
<section class="panel" id="security-over-http" aria-labelledby="security-over-http-h"><h3 id="security-over-http-h">Security over HTTP</h3>
<ul>${site.readme.remote.security.map((s) => tpl`<li><strong>${s.lead}.</strong> ${md(site, s.text, UP, local)}</li>`)}</ul></section>`,
  });

  const check = docSection({
    id: "check-that-it-works",
    title: "Check that it works",
    intro: tpl`<p>Restart your client so it starts the server, then ask:</p>`,
    body: tpl`<ul class="asks doc-asks" role="list">
  ${prompt(site, "List my Discord servers.", ["discord_list_guilds"])}
  ${prompt(site, "What channels does my server have?", ["discord_list_channels"])}
</ul>
<p>Your server in the answer means the token, the intents and the invite are right. An empty list means the bot is in no server yet: open the invite link again. An error names what is missing; <a href="${UP}troubleshooting/">Troubleshooting</a> explains each one.</p>`,
  });

  const first = docSection({
    id: "first-prompts-to-try",
    title: "First prompts to try",
    intro: tpl`<p>Ask in plain language. The assistant picks the tools. Most clients ask you before each write unless you allow it; check how yours is set.</p>`,
    body: tpl`<ul class="asks doc-asks" role="list">${site.asks.map((a) => prompt(site, raw(a.promptHtml), a.tools))}</ul>
<p><a href="${UP}recipes/">Recipes</a> walk through these tasks step by step, with the prompts, the tools and the safety notes.</p>`,
  });

  const next = docSection({
    id: "next-steps",
    title: "Next steps",
    body: tpl`<ul class="doc-next" role="list">
  <li><a href="${UP}toolsets/">Load only the toolsets you need</a>. The full set costs about ${Math.round(site.totals.tokens / 1000)}k tokens of context; a chat assistant needs a fraction of it.</li>
  <li><a href="${UP}configuration/#DISCORD_MCP_READ_ONLY">Turn on read-only mode</a> to keep the ${ro.tools} read-only tools and nothing else.</li>
  <li><a href="${UP}configuration/#DISCORD_ALLOWED_GUILDS">Limit the server to some guilds</a> when the bot sits in more than one.</li>
</ul>`,
  });

  return docPage(site, {
    key: "guide",
    title: "Getting started guide | discord-mcp",
    description:
      "Create a Discord bot, invite it to your server and connect it to Claude, Codex, Cursor, VS Code or any MCP client, step by step.",
    lead: "From a new Discord bot to your first prompt: create it, invite it, connect your client, then ask.",
    toc: [
      { id: "create-the-bot", label: "Create the bot" },
      { id: "invite-the-bot", label: "Invite it" },
      { id: "add-it-to-your-client", label: "Add it to your client" },
      { id: "remote-clients-over-http", label: "Remote clients over HTTP" },
      { id: "check-that-it-works", label: "Check that it works" },
      { id: "first-prompts-to-try", label: "First prompts to try" },
      { id: "next-steps", label: "Next steps" },
    ],
    body: [bot, invite, clients, remote, check, first, next],
  });
}
