import { tpl } from "../client/tpl.mjs";
import { docPage, docSection, UP } from "./docs.mjs";
import { md, toolChip } from "./parts.mjs";

/**
 * Messages the page quotes, as the server or discord.js words them. A test finds each one in
 * src/ or in discord.js, so a reworded message cannot leave a stale quote here.
 */
export const QUOTES = {
  noToken: "DISCORD_TOKEN is required. Set it in your MCP client config or a .env file.",
  badToken: "An invalid token was provided.",
  notReady: "Check the token and that the Server Members / Message Content privileged intents",
  noHistory: "Without it, Discord returns no messages instead of an error",
  missingAccess:
    "Missing access; the bot is not in the guild, cannot see this channel, or lacks Read Message History to fetch a single message.",
  missingPermissions: "Missing permissions; the bot lacks the permission this action requires.",
  hidden:
    "are hidden from the bot and left out of matches, so a channel missing here may still exist.",
  allowList: "is not in the DISCORD_ALLOWED_GUILDS allow-list.",
  dmAllowList: "is not a member of any guild in the DISCORD_ALLOWED_GUILDS allow-list.",
  unknownToolset: "Invalid DISCORD_MCP_TOOLSETS: unknown toolset(s)",
  noReadOnly: "DISCORD_MCP_READ_ONLY leaves no tool to expose",
};

const said = (text) => tpl`<pre class="said"><code>${text}</code></pre>`;

export function renderTroubleshooting(site) {
  const local = new Set(["empty-messages", "finding-ids"]);
  const fromReadme = (start) =>
    site.readme.troubleshooting.find((t) => t.lead.startsWith(start)) ??
    (() => {
      throw new Error(`README Troubleshooting has no item starting "${start}".`);
    })();
  const chip = (name) => toolChip(site, name, UP);
  const item = (id, title, body) =>
    tpl`<section class="issue" id="${id}" aria-labelledby="${id}-h"><h3 id="${id}-h">${title}</h3>${body}</section>`;
  const readmeItem = (id, start, extra = "") => {
    const t = fromReadme(start);
    return item(
      id,
      md(site, t.lead, UP, local),
      tpl`<p>${md(site, t.text, UP, local)}</p>${extra}`,
    );
  };

  const connect = docSection({
    id: "connecting",
    title: "Connecting",
    intro: tpl`<p>The server starts without connecting to Discord. It connects on the first tool call, so these errors show up as the answer to your first prompt.</p>`,
    body: [
      item(
        "no-token",
        "The token is missing",
        tpl`${said(QUOTES.noToken)}<p>The client started the server without <code>DISCORD_TOKEN</code>. Check the <code>env</code> of the server entry, then restart the client. With the Claude Code plugin, the server stays off until you set the token with <code>/plugin configure discord-mcp@pasympa</code>, and the token takes effect after a restart of Claude Code.</p>`,
      ),
      item(
        "invalid-token",
        "The token is invalid",
        tpl`${said("Discord login failed: " + QUOTES.badToken)}<p>Discord refused the token. A token stops working when someone chooses <strong>Reset Token</strong> on the Bot page. Reset it once more, copy the new one into your config, and restart the client.</p>`,
      ),
      readmeItem(
        "intents",
        "Every call fails with close code",
        tpl`<p>A call can also stop after 30 seconds with a message that says: <q>${QUOTES.notReady} are enabled in the Developer Portal</q>.</p>`,
      ),
      item(
        "startup",
        "The server stops at startup",
        tpl`<p>An invalid setting stops the server before it lists any tool, with a message that names the variable:</p>${said(`${QUOTES.unknownToolset} "chanels". Known: all, ${site.toolsets.map((t) => t.name).join(", ")}.`)}${said(`${QUOTES.noReadOnly}: the toolsets in DISCORD_MCP_TOOLSETS ("channels") have no read-only tool. Add a toolset with read tools, such as discovery, or turn read-only mode off.`)}<p>Your client then shows the server as failed, and its MCP log holds the message. The <a href="${UP}configuration/">configuration reference</a> lists the accepted values.</p>`,
      ),
      item(
        "tools-twice",
        "Every tool is listed twice",
        tpl`<p>In Claude Code, the plugin and a server added with <code>claude mcp add</code> both run. Keep one. To drop the manual one, run <code>claude mcp remove discord</code>.</p>`,
      ),
    ],
  });

  const errors = docSection({
    id: "discord-errors",
    title: "Discord errors",
    intro: tpl`<p>When Discord refuses a call, the server returns its code and message, then a hint, as in <code>Discord API error 50013 (HTTP 403): Missing Permissions.</code> followed by the hint below.</p><p>In short, for 50001 and 50013: ${md(site, fromReadme("`Missing Access`").text, UP, local)}</p>`,
    body: [
      item(
        "missing-permissions",
        "50013 Missing Permissions",
        tpl`${said(QUOTES.missingPermissions)}<p>Grant the permission in Server Settings, on a role the bot holds, or in the channel's overwrites. Each tool page names the permissions it needs. When the target is a role or a member, see <a href="#role-hierarchy">role hierarchy</a>.</p>`,
      ),
      item(
        "missing-access",
        "50001 Missing Access",
        tpl`${said(QUOTES.missingAccess)}<p>Give the bot View Channel on the channel, and Read Message History to read or fetch messages. In a thread, the parent channel's permissions apply. ${chip("discord_get_channel_permissions")} shows the overwrites in place.</p>`,
      ),
      readmeItem(
        "read-message-history",
        "A read fails with",
        tpl`<p>The error names the channel: <q>${QUOTES.noHistory}</q>.</p>`,
      ),
      item(
        "role-hierarchy",
        "A role or member edit fails",
        tpl`<p>The bot can only edit, assign, remove or move roles below its own highest role. The same goes for nicknames, kicks, bans and timeouts: the member's highest role must sit below the bot's. Discord also refuses to time out the server owner or a member with Administrator. Drag the bot's role higher in <strong>Server Settings &gt; Roles</strong>; the bot cannot raise its own role.</p>`,
      ),
      item(
        "hidden-channels",
        "A channel is missing from the lists",
        tpl`<p>Discord hides from a bot the channels it cannot view: their name reads <code>___hidden___</code> and their overwrites are replaced by a single @everyone View Channel deny. From 2026-11-16, its REST channel list also omits them. ${chip("discord_list_channels")} leaves them out. ${chip("discord_audit_permissions")} and ${chip("discord_find_channel_by_name")} leave them out and count them in <code>hiddenChannels</code>; the search adds a note:</p>${said("N channel(s) " + QUOTES.hidden)}<p>${chip("discord_get_channel_permissions")}, ${chip("discord_copy_permissions")} and ${chip("discord_clone_channel")} refuse such a channel rather than act on placeholder data. Grant the bot View Channel on it.</p>`,
      ),
      item(
        "allow-list",
        "The guild is not in the allow-list",
        tpl`${said("guild_id " + QUOTES.allowList)}${said("Guild 123456789012345678 " + QUOTES.allowList)}${said("User 123456789012345678 " + QUOTES.dmAllowList)}<p>The first form answers a <code>guild_id</code> argument, the second a channel, thread, webhook or invite that belongs to another server, the third a DM to a user who is not a member of any listed server. <code>DISCORD_ALLOWED_GUILDS</code> is set and the call goes outside it. Add the server's ID to the list, or check that the ID is the one you meant. <a href="${UP}configuration/#DISCORD_ALLOWED_GUILDS">Configuration</a> covers the variable.</p>`,
      ),
      readmeItem("empty-messages", "Messages come back with empty text"),
      readmeItem("finding-ids", "Finding IDs"),
    ],
  });

  const profiles = site.profiles.filter((p) => !p.all);
  const chat = profiles[0];
  const faq = docSection({
    id: "faq",
    title: "Questions",
    body: [
      item(
        "is-it-safe",
        "Is it safe to give an assistant my server?",
        tpl`<p>The assistant acts through your bot, so it can do only what the bot's permissions allow. Mass actions such as ${chip("discord_bulk_ban")} preview by default. Every tool says whether it reads, writes or destroys, so your client can approve reads and ask before the rest; check how yours is set. To go further, turn on read-only mode, load fewer toolsets, and list your servers in <code>DISCORD_ALLOWED_GUILDS</code>. See <a href="${UP}#safety">Safety</a>.</p>`,
      ),
      item(
        "read-only",
        "Can it only read?",
        tpl`<p>Yes. <code>DISCORD_MCP_READ_ONLY=true</code> keeps the ${site.profiles[0].readOnly.tools} read-only tools and hides the others. Two of them stay sensitive: ${chip("discord_list_webhooks")} returns webhook tokens, and ${chip("discord_read_dms")} reads the bot's direct messages. Leave <code>webhooks</code> and <code>dm</code> out of your toolsets to hide them.</p>`,
      ),
      item(
        "which-permissions",
        "Which permissions should the bot get?",
        tpl`<p>The ones your tasks need. The <a href="${UP}guide/#invite-the-bot">invite link</a> asks for the permissions most tools use; untick the rest in the authorization screen. Each tool page names its own. Avoid Administrator unless a task needs it, such as pruning on a server that requires Administrator for it. Administrator ignores channel overwrites, so a mistake reaches every channel.</p>`,
      ),
      item(
        "context-cost",
        "How much context does it use?",
        tpl`<p>Every tool definition the client loads takes room in the assistant's context: about ${Math.round(site.totals.tokens / 1000)}k tokens for the full set. <code>DISCORD_MCP_TOOLSETS</code> loads only what you pick. The ${chat.label.toLowerCase()} profile, <code>${chat.sets.join(",")}</code>, loads ${chat.tools} tools for about ${Math.round(chat.tokens / 1000)}k tokens. The <a href="${UP}toolsets/">toolset builder</a> shows the cost of any mix.</p>`,
      ),
      item(
        "chatgpt-codex",
        "Does it work with ChatGPT or Codex?",
        tpl`<p>Codex, yes: the Codex CLI starts it like any local server, and Codex can also reach it over HTTP. The OpenAI Responses API reaches it over HTTP too. ChatGPT connectors need OAuth 2.1 or OpenAI's Secure MCP Tunnel, and the HTTP mode uses a static token, so it is not for ChatGPT. See <a href="${UP}guide/#remote-clients-over-http">remote clients</a>.</p>`,
      ),
      item(
        "docker",
        "Can I run it in Docker?",
        tpl`<p>Yes. The image is <code>pasympa/discord-mcp</code>. The <a href="${UP}guide/#client-docker">guide</a> has the client config, and the <a href="${UP}guide/#remote-clients-over-http">HTTP section</a> shows how to publish the port on the loopback only.</p>`,
      ),
      item(
        "affiliated",
        "Is it made by Discord?",
        tpl`<p>No. discord-mcp is an independent open-source project under the MIT license, not affiliated with or endorsed by Discord Inc.</p>`,
      ),
    ],
  });

  return docPage(site, {
    key: "troubleshooting",
    title: "Troubleshooting and questions | discord-mcp",
    description:
      "Fix the common discord-mcp errors: invalid token, intents, 50013 and 50001, role hierarchy, hidden channels, the allow-list. Answers about safety and cost.",
    lead: "What each error means and how to fix it, then answers to the questions people ask first.",
    toc: [
      { id: "connecting", label: "Connecting" },
      { id: "discord-errors", label: "Discord errors" },
      { id: "faq", label: "Questions" },
    ],
    body: [connect, errors, faq],
  });
}
