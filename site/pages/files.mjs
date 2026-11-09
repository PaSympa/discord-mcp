import { esc } from "../client/tpl.mjs";
import { REPO, SITE_URL } from "./layout.mjs";
import { toolPath } from "./tool.mjs";
import { TOOLSETS_PATH, toolsetPath } from "./toolsets.mjs";

const RISK = { read: "read-only", write: "writes", destructive: "destructive" };

/** llms.txt (llmstxt.org): every tool on one line, grouped by toolset, with absolute links. */
export function renderLlms(site) {
  const { totals } = site;
  const sections = site.toolsets.map((set) => {
    const lines = site.tools
      .filter((tool) => tool.toolset === set.name)
      .map((tool) => {
        const risk = RISK[tool.risk] + (tool.dryRunDefault ? ", dry run by default" : "");
        return `- [${tool.name}](${SITE_URL}${toolPath(tool.name)}): ${tool.purpose} Risk: ${risk}.`;
      });
    return `## ${set.label} (\`${set.name}\`)\n\n${lines.join("\n")}\n`;
  });
  const sets = site.toolsets.map((set) => {
    const kept = set.risk.read ? `${set.risk.read} read-only` : "none read-only";
    return `- [${set.label}](${SITE_URL}${toolsetPath(set.name)}): \`${set.name}\`, ${set.tools} ${set.tools === 1 ? "tool" : "tools"}, ${kept}, about ${(set.tokens / 1000).toFixed(1)}k tokens.`;
  });
  return `# discord-mcp

> ${site.description}

Version ${site.version}. Run it with \`npx -y @pasympa/discord-mcp\` and your bot's token in \`DISCORD_TOKEN\`. Under each toolset heading, a line names a tool, gives its purpose (the first sentence of its description) and its risk from its annotations: read-only, writes or destructive. Toolset names in headings are the values of \`DISCORD_MCP_TOOLSETS\`. Every definition, with its input and output schemas, is in [tools.json](${SITE_URL}tools.json).

## Toolsets

One page per toolset, with its tools, risk mix, context cost and the README profiles that include it. [All toolsets](${SITE_URL}${TOOLSETS_PATH}) also has the builder for the \`DISCORD_MCP_TOOLSETS\` line.

${sets.join("\n")}

${sections.join("\n")}
## Optional

- [tools.json](${SITE_URL}tools.json): the ${totals.tools} tool definitions as \`tools/list\` serves them, with toolset, risk and estimated token cost.
- [Tool catalog](${SITE_URL}tools/): search, risk filters and the toolset builder.
- [README](${REPO}#readme): setup for each client, configuration and safety.
`;
}

/** One entry per page path, each with the build date as its last modification. */
export function renderSitemap(paths, date) {
  const urls = paths.map(
    (path) => `<url><loc>${esc(SITE_URL + path)}</loc><lastmod>${date}</lastmod></url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

/**
 * Crawlers read robots.txt only at the root of a host, so under a project path such as
 * /discord-mcp/ this file is never fetched: the sitemap must also be submitted by hand.
 */
export function renderRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}sitemap.xml
`;
}
