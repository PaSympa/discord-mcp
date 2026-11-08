import { permissionLabel, permissionLines, renderToolDetail } from "../client/detail.mjs";
import { breakable, formatInt, raw, riskBadge, tpl } from "../client/tpl.mjs";
import { layout, SITE_URL } from "./layout.mjs";

const RISK_WORD = { read: "Read-only", write: "Write", destructive: "Destructive" };

// The example prompt lands here with site/prompts.json (S4); until then the slot ships empty.
const EXAMPLE_SLOT = raw(
  '<section class="d-sec" id="example-prompt" hidden><!-- Example prompt: S4 --></section>',
);

export const toolPath = (name) => `tools/${name}/`;

/** One tool's page: what the catalog panel shows, under an h1, at its own URL. */
export function renderToolPage(site, tool) {
  const labels = Object.fromEntries(site.toolsets.map((s) => [s.name, s.label]));
  const label = labels[tool.toolset];
  const path = toolPath(tool.name);
  const { body } = renderToolDetail(tool, {
    labels,
    byName: site.byName,
    href: (name) => `../${name}/`,
    level: 2,
    example: EXAMPLE_SLOT,
  });
  const permissions = permissionLines(tool.permissions);
  const id = tpl`<div class="tp-id">
  <nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="../">Tools</a></li><li><a href="../#set-${tool.toolset}">${label}</a></li></ol></nav>
  <h1>${tool.title}</h1>
  <p class="tp-name"><code>${breakable(tool.name)}</code><button class="btn btn-sm" type="button" data-copy-text="${tool.name}">Copy name</button></p>
  <p class="tp-badges">${riskBadge(tool.risk)}${tool.dryRunDefault ? tpl`<span class="dry">Dry run by default</span>` : ""}</p>
  <dl class="facts">
    <div><dt>Toolset</dt><dd><a href="../#set-${tool.toolset}">${label}</a> <code>${tool.toolset}</code></dd></div>
    ${permissions.length ? tpl`<div><dt>${permissionLabel(tool.permissions)}</dt><dd>${permissions.map((line) => tpl`<span class="perm">${line}</span>`)}</dd></div>` : ""}
    <div><dt>Context cost</dt><dd>${formatInt(tool.tokens)} tokens, estimated<span class="fine">${formatInt(tool.bytes)} bytes of definition, divided by 4</span></dd></div>
  </dl>
</div>`;
  return layout(site, {
    path,
    current: "",
    title: `${tool.title}: ${tool.name} | discord-mcp`,
    description: `${tool.purpose} ${RISK_WORD[tool.risk]} tool in the ${label} toolset of discord-mcp, the MCP server for Discord.`,
    body: String(tpl`<div class="wrap tp">
${id}
<div class="tp-main">${body}</div>
</div>`),
    script: "page.js",
    ogType: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        ["discord-mcp", SITE_URL],
        ["Tools", SITE_URL + "tools/"],
        [tool.title, SITE_URL + path],
      ].map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
    },
  });
}
