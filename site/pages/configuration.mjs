import { breakable, tpl } from "../client/tpl.mjs";
import { docPage, docSection, UP } from "./docs.mjs";
import { md, terminal } from "./parts.mjs";

const EXAMPLE = {
  DISCORD_TOKEN: "YOUR_BOT_TOKEN",
  DISCORD_MCP_TOOLSETS: "discovery,messages",
  DISCORD_MCP_READ_ONLY: "true",
  DISCORD_ALLOWED_GUILDS: "YOUR_GUILD_ID",
};
const PACKAGE = "@pasympa/discord-mcp";

/** JSON with each array of plain values on one line, as the README writes `args`. */
const json = (value) =>
  JSON.stringify(value, null, 2).replace(
    /\[\s+([^[\]{}]*?)\s+\]/g,
    (_, inner) => `[${inner.split(/,\s+/).join(", ")}]`,
  );

const jsonConfig = (env, command = "npx", args = ["-y", PACKAGE]) =>
  json({ mcpServers: { discord: { command, args, env } } });

/**
 * A shell command with one flag and its variable per line. On a narrow screen a line can
 * still wrap, but its closing backslash stays with the text before it.
 */
const command = (start, flag) =>
  [
    start,
    ...Object.entries(EXAMPLE).map(([k, v]) => `${flag} ${k}=${v}`),
    `-- npx -y ${PACKAGE}`,
  ].join(" \\\n  ");

function variable(site, v, local) {
  const setting = (label, s) =>
    s
      ? tpl`<div><dt>${label}</dt><dd>${s.title} <code>${s.key}</code></dd></div>`
      : tpl`<div><dt>${label}</dt><dd>Not offered: set it in the environment</dd></div>`;
  const same = v.plugin?.key === v.bundle?.key && v.plugin?.title === v.bundle?.title;
  const settings =
    !v.plugin && !v.bundle
      ? ""
      : same
        ? setting("Plugin and bundle", v.plugin)
        : [setting("Claude Code plugin", v.plugin), setting("Claude Desktop bundle", v.bundle)];
  return tpl`<section class="env" id="${v.name}" aria-labelledby="${v.name}-h">
  <h3 id="${v.name}-h"><code>${breakable(v.name)}</code></h3>
  <p>${md(site, v.text, UP, local)}</p>
  <dl class="facts env-facts">
    <div><dt>Default</dt><dd>${md(site, v.fallback, UP, local)}</dd></div>
    ${settings}
  </dl>
</section>`;
}

export function renderConfiguration(site) {
  const { variables, notes } = site.config;
  const local = new Set(variables.map((v) => v.name));
  const http = variables.filter((v) => /^DISCORD_MCP_(TRANSPORT|HTTP_)/.test(v.name));
  const main = variables.filter((v) => !http.includes(v));
  const term = (code, lang, title, what) =>
    terminal({ code, lang, title, copyLabel: `Copy the ${what}` });

  const vars = docSection({
    id: "variables",
    title: "Environment variables",
    intro: tpl`<p>The server reads its settings from environment variables when it starts. Only <code>DISCORD_TOKEN</code> is required. An invalid toolset, read-only, transport or HTTP value stops the server at startup, with a message that names the variable, rather than running with a setting you did not ask for.</p>`,
    body: tpl`${main.map((v) => variable(site, v, local))}
<div class="doc-callout" id="intent-flags" role="note">${notes.map((n) => tpl`<p>${md(site, n, UP, local)}</p>`)}</div>`,
  });

  const httpVars = docSection({
    id: "http-mode",
    title: "HTTP mode",
    intro: tpl`<p>These apply only when the server runs as an HTTP endpoint for <a href="${UP}guide/#remote-clients-over-http">remote clients</a>. The plugin and the bundle always run it over stdio, so they offer none of them.</p>`,
    body: http.map((v) => variable(site, v, local)),
  });

  const perClient = docSection({
    id: "set-them-in-your-client",
    title: "Set them in your client",
    intro: tpl`<p>Each example loads two toolsets in read-only mode for one server. Keep the lines you need.</p>`,
    body: tpl`<section class="panel" id="set-config-file" aria-labelledby="set-config-file-h">
  <h3 id="set-config-file-h">Config file: Claude Desktop, Cursor, Windsurf, Cline</h3>
  <p>Add the variables to the <code>env</code> object of the server entry, then restart the client. The <a href="${UP}guide/#add-it-to-your-client">guide</a> names each client's file.</p>
  ${term(jsonConfig(EXAMPLE), "json", "MCP config", "config file example")}
</section>
<section class="panel" id="set-claude-code" aria-labelledby="set-claude-code-h">
  <h3 id="set-claude-code-h">Claude Code</h3>
  <p>With the plugin, run <code>/plugin configure discord-mcp@pasympa</code>. It asks for each setting listed above and stores the token as a secret. Restart Claude Code after you set or change the token.</p>
  <p>Without the plugin, pass one <code>-e</code> per variable:</p>
  ${term(command("claude mcp add discord", "-e"), "bash", "Terminal", "Claude Code command")}
</section>
<section class="panel" id="set-claude-desktop-bundle" aria-labelledby="set-claude-desktop-bundle-h">
  <h3 id="set-claude-desktop-bundle-h">Claude Desktop bundle</h3>
  <p>The install screen of <code>discord-mcp.mcpb</code> asks for the settings listed above. After you change one in the extension's settings, quit and reopen Claude Desktop.</p>
</section>
<section class="panel" id="set-vs-code" aria-labelledby="set-vs-code-h">
  <h3 id="set-vs-code-h">VS Code</h3>
  <p>In <code>.vscode/mcp.json</code>, next to the token VS Code asks for:</p>
  ${term(json({ servers: { discord: { command: "npx", args: ["-y", PACKAGE], env: { ...EXAMPLE, DISCORD_TOKEN: "${input:discord_token}" } } } }), "json", ".vscode/mcp.json", "VS Code config")}
  <p>The <code>inputs</code> entry that defines <code>discord_token</code> is in the <a href="${UP}guide/#client-vs-code">guide</a>.</p>
</section>
<section class="panel" id="set-codex" aria-labelledby="set-codex-h">
  <h3 id="set-codex-h">Codex CLI</h3>
  <p>Pass one <code>--env</code> per variable:</p>
  ${term(command("codex mcp add discord", "--env"), "bash", "Terminal", "Codex command")}
</section>
<section class="panel" id="set-docker" aria-labelledby="set-docker-h">
  <h3 id="set-docker-h">Docker</h3>
  <p>Pass each variable with <code>-e</code>, and its value in <code>env</code>:</p>
  ${term(jsonConfig(EXAMPLE, "docker", ["run", "--rm", "-i", ...Object.keys(EXAMPLE).flatMap((k) => ["-e", k]), "pasympa/discord-mcp:latest"]), "json", "MCP config", "Docker config")}
</section>
<section class="panel" id="set-env-file" aria-labelledby="set-env-file-h">
  <h3 id="set-env-file-h">From source</h3>
  <p>A <code>.env</code> file at the project root works too: the server loads it on start. Variables set by the client win over the file.</p>
  ${term(
    Object.entries(EXAMPLE)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
    "text",
    ".env",
    ".env example",
  )}
</section>`,
  });

  return docPage(site, {
    key: "configuration",
    title: "Configuration reference | discord-mcp",
    description:
      "Every environment variable of the discord-mcp server, with its default, its plugin and bundle setting, and how to set it in each MCP client.",
    lead: "Every setting the server reads, its default, and where each client takes it.",
    toc: [
      { id: "variables", label: "Environment variables" },
      { id: "http-mode", label: "HTTP mode" },
      { id: "set-them-in-your-client", label: "Set them in your client" },
    ],
    body: [vars, httpVars, perClient],
  });
}
