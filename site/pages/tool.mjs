import { permissionLabel, permissionLines, renderToolDetail } from "../client/detail.mjs";
import { breakable, formatInt, raw, RISK_LABEL, riskBadge, tpl } from "../client/tpl.mjs";
import { firstFitting, layout, SITE_URL } from "./layout.mjs";
import { breadcrumbLd, breadcrumbs, TOOLSETS_PATH, toolsetPath } from "./toolsets.mjs";

// The example prompt lands here with site/prompts.json (S4); until then the slot ships empty.
const EXAMPLE_SLOT = raw(
  '<section class="d-sec" id="example-prompt" hidden><!-- Example prompt: S4 --></section>',
);

export const toolPath = (name) => `tools/${name}/`;

/** Title of at most 60 characters and description of at most 160, for search results. */
export function toolMeta(tool, label) {
  const word = RISK_LABEL[tool.risk];
  return {
    title: firstFitting(
      [
        `${tool.title}: ${tool.name} | discord-mcp`,
        `${tool.title}: ${tool.name}`,
        `${tool.title} | discord-mcp`,
      ],
      60,
    ),
    description: firstFitting(
      [
        `${tool.purpose} ${word} tool in the ${label} toolset of the discord-mcp server.`,
        `${tool.purpose} ${word} tool of the discord-mcp server.`,
        tool.purpose,
      ],
      160,
    ),
  };
}

/** The breadcrumb trail of a tool page: shown above its title and given to search engines. */
export function toolTrail(tool, label) {
  return [
    { name: "Toolsets", href: "../../toolsets/", url: SITE_URL + TOOLSETS_PATH },
    {
      name: label,
      href: `../../${toolsetPath(tool.toolset)}`,
      url: SITE_URL + toolsetPath(tool.toolset),
    },
    { name: tool.title, url: SITE_URL + toolPath(tool.name) },
  ];
}

/** One tool's page: what the catalog panel shows, under an h1, at its own URL. */
export function renderToolPage(site, tool) {
  const labels = Object.fromEntries(site.toolsets.map((s) => [s.name, s.label]));
  const label = labels[tool.toolset];
  const trail = toolTrail(tool, label);
  const { body } = renderToolDetail(tool, {
    labels,
    byName: site.byName,
    href: (name) => `../${name}/`,
    level: 2,
    example: EXAMPLE_SLOT,
  });
  const permissions = permissionLines(tool.permissions);
  const id = tpl`<div class="tp-id">
  ${breadcrumbs(trail)}
  <h1>${tool.title}</h1>
  <p class="tp-name"><code>${breakable(tool.name)}</code><button class="btn btn-sm" type="button" data-copy-text="${tool.name}">Copy name</button></p>
  <p class="tp-badges">${riskBadge(tool.risk)}${tool.dryRunDefault ? tpl`<span class="dry">Dry run by default</span>` : ""}</p>
  <dl class="facts">
    <div><dt>Toolset</dt><dd><a href="../../${toolsetPath(tool.toolset)}">${label}</a> <code>${tool.toolset}</code></dd></div>
    ${permissions.length ? tpl`<div><dt>${permissionLabel(tool.permissions)}</dt><dd>${permissions.map((line) => tpl`<span class="perm">${line}</span>`)}</dd></div>` : ""}
    <div><dt>Context cost</dt><dd>${formatInt(tool.tokens)} tokens, estimated<span class="fine">${formatInt(tool.bytes)} bytes of definition, divided by 4</span></dd></div>
  </dl>
</div>`;
  return layout(site, {
    path: toolPath(tool.name),
    current: "",
    ...toolMeta(tool, label),
    body: String(tpl`<div class="wrap tp">
${id}
<div class="tp-main">${body}</div>
</div>`),
    script: "page.js",
    ogType: "article",
    jsonLd: breadcrumbLd(trail),
  });
}
