import { tpl } from "../client/tpl.mjs";
import { docPage, docSection, UP } from "./docs.mjs";
import { REPO } from "./layout.mjs";

export function renderPrivacy(site) {
  const config = (name) => tpl`<a href="${UP}configuration/#${name}"><code>${name}</code></a>`;

  const short = docSection({
    id: "in-short",
    title: "In short",
    body: tpl`<ul>
  <li>The server runs on your machine, or on a host you run. There is no discord-mcp service in between.</li>
  <li>It connects to Discord with your own bot token. Discord data reaches your assistant only when it calls a tool.</li>
  <li>It sends nothing to the maintainer. It has no telemetry, no analytics, no crash reports and no account.</li>
  <li>It writes nothing to disk. Its memory cache of servers, channels and members follows Discord's updates and is gone when it stops.</li>
  <li>What a tool returns goes to your AI client, and from there to the client's model provider.</li>
</ul>`,
  });

  const connects = docSection({
    id: "what-it-connects-to",
    title: "What the server connects to",
    body: tpl`<ul>
  <li><strong>Discord.</strong> The REST API and the gateway, signed with your bot token. The bot sees only the servers it was invited to, within the permissions you gave it.</li>
  <li><strong>Image URLs you give it.</strong> A role icon, a webhook avatar or an event cover passed by URL is downloaded from that URL, then uploaded to Discord. Embed images and a webhook message's avatar URL are passed to Discord, which fetches them itself.</li>
  <li><strong>The package registry, at launch.</strong> <code>npx</code> downloads the package from npm, and Docker pulls the image from Docker Hub. The plugin pins the exact version it runs.</li>
</ul>
<p>Nothing else. The server's icon is a link to an image on GitHub, which your client may load to show it.</p>`,
  });

  const token = docSection({
    id: "your-bot-token",
    title: "Your bot token",
    body: tpl`<ul>
  <li><strong>Claude Code plugin.</strong> Claude Code asks for the token in a masked field and keeps it in your system's secure credential store, such as the macOS keychain, not in <code>settings.json</code>.</li>
  <li><strong>Claude Desktop bundle.</strong> The install screen asks for it as a sensitive field.</li>
  <li><strong>Other clients.</strong> The token sits in the client's config file, in the environment, or in a <code>.env</code> file, as plain text. Keep those files out of version control and readable only by you.</li>
</ul>
<p>The server sends the token to Discord only. If it leaks, reset it on the Bot page of the Discord Developer Portal.</p>`,
  });

  const assistant = docSection({
    id: "what-your-assistant-sees",
    title: "What your assistant sees",
    body: tpl`<p>Tool results enter your conversation: messages, usernames, member lists, roles, audit log entries. Your AI client sends the conversation to its model provider, such as Anthropic for Claude. That provider's privacy policy and retention rules apply to it, not this page. Check them before you read a private server with an assistant.</p>
<p>To limit what reaches the conversation, load only the toolsets you need with ${config("DISCORD_MCP_TOOLSETS")}, restrict the servers with ${config("DISCORD_ALLOWED_GUILDS")}, or turn on ${config("DISCORD_MCP_READ_ONLY")}. The bot's own Discord permissions are the outer limit.</p>
<p>The server prints startup lines and errors to stderr. Your client may save them in its own log files.</p>`,
  });

  const http = docSection({
    id: "http-mode",
    title: "HTTP mode",
    body: tpl`<p>HTTP mode is opt-in, for <a href="${UP}guide/#remote-clients-over-http">remote clients</a>. The server then listens on <code>127.0.0.1</code> by default, and every request needs the bearer token you set. Anyone who holds that token can use the bot through the server. If you open it beyond loopback, put it behind HTTPS. HTTP mode adds no other destination. The <a href="${UP}configuration/#http-mode">HTTP settings</a> list each variable.</p>`,
  });

  const website = docSection({
    id: "this-website",
    title: "This website",
    body: tpl`<p>These pages are static files served by GitHub Pages. They load no third-party script, font or image, and set no cookie. The theme you pick is saved in your browser under <code>dmcp-theme</code> and never leaves it. As the host, GitHub may log visits under its own privacy statement.</p>`,
  });

  const contact = docSection({
    id: "contact",
    title: "Contact",
    body: tpl`<p>Ask questions or report a problem in <a href="${REPO}/issues">GitHub issues</a>. Report a security issue privately through <a href="${REPO}/security/advisories/new">a security advisory</a>. Changes to this page are in the repository history.</p>`,
  });

  return docPage(site, {
    key: "privacy",
    title: "Privacy | discord-mcp",
    description:
      "What the discord-mcp server connects to, where your bot token is stored, what your AI client sees, and what this website loads.",
    lead: "The server runs on your machine and works with Discord through your own bot. Nothing comes back to the maintainer.",
    toc: [
      { id: "in-short", label: "In short" },
      { id: "what-it-connects-to", label: "What it connects to" },
      { id: "your-bot-token", label: "Your bot token" },
      { id: "what-your-assistant-sees", label: "What your assistant sees" },
      { id: "http-mode", label: "HTTP mode" },
      { id: "this-website", label: "This website" },
      { id: "contact", label: "Contact" },
    ],
    body: [short, connects, token, assistant, http, website, contact],
  });
}
