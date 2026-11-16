import { PermissionsBitField } from "discord.js";
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCatalog } from "./pages/catalog.mjs";
import { renderConfiguration } from "./pages/configuration.mjs";
import { renderLlms, renderRobots, renderSitemap } from "./pages/files.mjs";
import { renderGuide } from "./pages/guide.mjs";
import { renderLanding } from "./pages/landing.mjs";
import { inlineLogo } from "./pages/layout.mjs";
import { renderNotFound } from "./pages/notfound.mjs";
import { channels, slug } from "./pages/parts.mjs";
import { renderPrivacy } from "./pages/privacy.mjs";
import { renderRecipes } from "./pages/recipes.mjs";
import { renderToolPage, toolPath } from "./pages/tool.mjs";
import { renderTroubleshooting } from "./pages/troubleshooting.mjs";
import {
  renderToolsetPage,
  renderToolsets,
  TOOLSETS_PATH,
  toolsetPath,
} from "./pages/toolsets.mjs";
import { parseReadme } from "./readme.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = join(ROOT, "site");
const GITHUB_ASSETS = join(ROOT, ".github", "assets");

const STYLES = ["base", "landing", "catalog", "tool", "toolsets", "docs"];
const BUNDLES = {
  "landing.js": ["tpl", "keys", "common", "landing"],
  "catalog.js": ["tpl", "keys", "common", "search", "detail", "catalog"],
  "toolsets.js": ["tpl", "keys", "common", "builder", "toolsets"],
  "page.js": ["keys", "common", "page"],
  "notfound.js": ["tpl", "keys", "common", "search", "suggest", "notfound"],
};
const OG_IMAGE = "assets/social-preview.png";
const TOUCH_ICON = "assets/apple-touch-icon.png";
const FAVICON = "assets/favicon.svg";
const BUTTON_FILES = {
  "Install in VS Code": "install-vscode.svg",
  "Install in VS Code Insiders": "install-vscode-insiders.svg",
  "Install in Cursor": "install-cursor.svg",
  "Install in Claude Desktop": "install-claude-desktop.svg",
};
const COPIED = {
  "assets/fonts/bricolage-grotesque-latin.woff2": join(
    SITE,
    "assets/fonts/bricolage-grotesque-latin.woff2",
  ),
  "assets/fonts/jetbrains-mono-latin.woff2": join(SITE, "assets/fonts/jetbrains-mono-latin.woff2"),
  "assets/fonts/OFL.txt": join(SITE, "assets/fonts/OFL.txt"),
  "assets/demo.mp4": join(SITE, "assets/demo.mp4"),
  "assets/demo-full.mp4": join(SITE, "assets/demo-full.mp4"),
  [OG_IMAGE]: join(GITHUB_ASSETS, "social-preview.png"),
  [TOUCH_ICON]: join(GITHUB_ASSETS, "logo-512.png"),
  [FAVICON]: join(GITHUB_ASSETS, "favicon.svg"),
  ...Object.fromEntries(
    Object.values(BUTTON_FILES).map((file) => [`assets/${file}`, join(GITHUB_ASSETS, file)]),
  ),
};

const fail = (message) => {
  throw new Error(`Site content: ${message}`);
};

/** The browser scripts are plain ES modules; the site serves each page one classic script. */
export function bundle(names) {
  const body = names
    .map((name) =>
      readFileSync(join(SITE, "client", `${name}.mjs`), "utf8")
        .replace(/^import [\s\S]*?from "\.\/[\w-]+\.mjs";\n/gm, "")
        .replace(/^export (?=(async )?function |const |class |let )/gm, ""),
    )
    .join("\n");
  return `(() => {\n"use strict";\n${body}\n})();\n`;
}

/** Width and height from the VP8X header of an animated WebP. */
function webpSize(file) {
  const buf = readFileSync(file);
  if (buf.toString("ascii", 12, 16) !== "VP8X") fail(`${file} is not an extended WebP.`);
  return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
}

/** Width and height from the IHDR chunk of a PNG. */
function pngSize(file) {
  const buf = readFileSync(file);
  if (buf.toString("ascii", 12, 16) !== "IHDR") fail(`${file} is not a PNG.`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** The build date as YYYY-MM-DD: an explicit value, then SITE_BUILD_DATE, then today (UTC). */
export function buildDate(value = process.env.SITE_BUILD_DATE) {
  const date = value || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))
    fail(`the build date must read YYYY-MM-DD, not ${date}.`);
  return date;
}

/** The names the tool descriptions use where they differ from the API flag names. */
const PERMISSION_NAMES = { ManageGuild: "Manage Server" };

/** The permissions an invite link requests, named as the tool pages name them. */
export function invitePermissions(link) {
  const bits =
    /[?&]permissions=(\d+)/.exec(link)?.[1] ?? fail("the invite link has no permissions.");
  const field = new PermissionsBitField(BigInt(bits));
  const known = Object.values(PermissionsBitField.Flags).reduce((all, bit) => all | bit, 0n);
  if (BigInt(bits) & ~known)
    fail(`the invite link requests permission bits discord.js does not know: ${bits}.`);
  return field
    .toArray()
    .map((flag) =>
      (PERMISSION_NAMES[flag] ?? flag.replace(/(?<=[a-z])(?=[A-Z])/g, " ")).replace(" In ", " in "),
    );
}

/**
 * Each README configuration variable, with the setting of the Claude Code plugin and of the
 * Claude Desktop bundle that sets it. Both read `${user_config.key}` into the variable.
 */
function configModel(readme) {
  const settings = (file, keyName, configName) => {
    const json = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
    const env = keyName(json) ?? fail(`${file} declares no server env.`);
    const config = json[configName] ?? fail(`${file} has no ${configName}.`);
    return Object.fromEntries(
      Object.entries(env).map(([name, value]) => {
        const key =
          /^\$\{user_config\.(\w+)\}$/.exec(value)?.[1] ??
          fail(`${file} sets ${name} to ${value}, not to a user_config value.`);
        return [name, { key, ...(config[key] ?? fail(`${file} has no setting ${key}.`)) }];
      }),
    );
  };
  const plugin = settings(
    "plugin/.claude-plugin/plugin.json",
    (j) => j.mcpServers?.discord?.env,
    "userConfig",
  );
  const bundle = settings("manifest.json", (j) => j.server?.mcp_config?.env, "user_config");
  const names = readme.configuration.variables.map((v) => v.name);
  for (const name of [...Object.keys(plugin), ...Object.keys(bundle)])
    if (!names.includes(name)) fail(`${name} is set by the plugin or the bundle, not in README.`);
  return {
    variables: readme.configuration.variables.map((v) => ({
      ...v,
      plugin: plugin[v.name] ?? null,
      bundle: bundle[v.name] ?? null,
    })),
    notes: readme.configuration.notes,
  };
}

/**
 * The recipes of site/content.json, each with the toolsets its tools need (discovery always
 * comes along, for the IDs) and what that selection costs.
 */
function recipeModel(recipes, tools, byName, setNames) {
  const ids = new Set();
  return (recipes ?? fail("content.json has no recipes.")).map((recipe) => {
    if (ids.has(recipe.id)) fail(`content.json repeats the recipe id ${recipe.id}.`);
    ids.add(recipe.id);
    const names = [...new Set(recipe.steps.flatMap((step) => step.tools))];
    const used = names.map(
      (name) => byName.get(name) ?? fail(`Unknown tool ${name} in the recipe ${recipe.id}.`),
    );
    const sets = setNames.filter(
      (set) => set === "discovery" || used.some((tool) => tool.toolset === set),
    );
    return {
      ...recipe,
      sets,
      ...summarize(tools.filter((tool) => sets.includes(tool.toolset))),
      readOnly: used.every((tool) => tool.risk === "read"),
      readSteps: recipe.steps
        .map((step, i) =>
          step.tools.every((name) => byName.get(name).risk === "read") ? i + 1 : 0,
        )
        .filter(Boolean),
      dryRun: used.filter((tool) => tool.dryRunDefault).map((tool) => tool.name),
      destructive: used.filter((tool) => tool.risk === "destructive").map((tool) => tool.name),
    };
  });
}

function summarize(tools) {
  const tokens = tools.reduce((n, t) => n + t.tokens, 0);
  return { tools: tools.length, tokens };
}

/**
 * A toolset with no read-only tool may point to reads in another toolset, as "To <task>,
 * <toolset> has the read-only tools <tools>". Every word of that sentence must hold:
 * the tools are read-only and share one other toolset, and each title is a verb of the
 * task followed by its object, as "List channels" or "Find channel by name" for "list or
 * find channels". Any other title, such as "List channel threads", is refused.
 */
function checkReadsElsewhere(set, { task, tools: names }, byName) {
  if (set.risk.read > 0)
    fail(`content.json points ${set.name} to reads elsewhere, but it has read-only tools.`);
  const phrase =
    /^([a-z]+(?: or [a-z]+)*) ([a-z]+)$/.exec(task) ??
    fail(`content.json: the task for ${set.name} must read "<verb> or <verb> <things>".`);
  const verbs = phrase[1].split(" or ");
  const things = [phrase[2], phrase[2].replace(/s$/, "")];
  const tools = names.map(
    (name) => byName.get(name) ?? fail(`content.json names unknown tool ${name}.`),
  );
  for (const tool of tools) {
    if (tool.risk !== "read" || tool.toolset === set.name)
      fail(`${tool.name} is not a read-only tool of another toolset than ${set.name}.`);
    if (tool.toolset !== tools[0].toolset)
      fail(`content.json: the reads named for ${set.name} must share one toolset.`);
    const [verb, thing, next] = tool.title.toLowerCase().split(" ");
    if (!verbs.includes(verb) || !things.includes(thing) || (next !== undefined && next !== "by"))
      fail(`content.json says ${tool.name} can ${task}, but its title is "${tool.title}".`);
  }
  for (const verb of verbs)
    if (!tools.some((tool) => tool.title.toLowerCase().startsWith(verb + " ")))
      fail(`content.json says the reads named for ${set.name} can ${verb}; none of them does.`);
}

/**
 * Joins the tools/list catalog, README.md and site/content.json into what the pages
 * render, and refuses any count or name that disagrees between them.
 */
export function siteModel(catalog, readme, content) {
  const { tools, totals } = catalog;
  const byName = new Map(tools.map((t) => [t.name, t]));
  const setNames = catalog.toolsets.map((s) => s.name);

  for (const t of tools)
    if ((t.risk === "read") !== (t.definition.annotations?.readOnlyHint === true))
      fail(`${t.name}: its risk disagrees with readOnlyHint, which read-only mode filters on.`);

  const extraSets = Object.keys(content.toolsets).filter((s) => !setNames.includes(s));
  if (extraSets.length) fail(`content.json describes unknown toolsets: ${extraSets.join(", ")}.`);
  const toolsets = catalog.toolsets.map((s) => {
    const text =
      content.toolsets[s.name] ?? fail(`content.json has no label for toolset ${s.name}.`);
    if (text.readsElsewhere) checkReadsElsewhere(s, text.readsElsewhere, byName);
    return { ...s, ...text };
  });

  const readTools = tools.filter((t) => t.risk === "read");
  const profiles = readme.profiles.map((p, i) => {
    const all = p.sets === "all";
    const sets = all ? setNames : p.sets;
    const unknown = sets.filter((s) => !setNames.includes(s));
    if (unknown.length)
      fail(`README profile ${p.label} names unknown toolsets: ${unknown.join(", ")}.`);
    const picked = tools.filter((t) => sets.includes(t.toolset));
    if (picked.length !== p.tools)
      fail(
        `README says the ${p.label} profile has ${p.tools} tools; tools/list gives ${picked.length}.`,
      );
    return {
      label: p.label,
      all,
      sets,
      ...summarize(picked),
      readOnly: summarize(picked.filter((t) => t.risk === "read")),
      checked: i === 1,
    };
  });

  const paragraphs = readme.expose.filter((b) => b.type === "p");
  const expose = {
    lead: paragraphs[0] ?? fail("README has no text under Expose only what you need."),
    method:
      paragraphs.find((b) => b.text.startsWith("Context sizes")) ??
      fail("README has no Context sizes paragraph."),
    readOnly:
      paragraphs.find((b) => b.text.includes("DISCORD_MCP_READ_ONLY")) ??
      fail("README has no read-only paragraph."),
  };
  // The README rounds a figure measured at its last release; the page states today's.
  const fullCost = /about \d+k tokens/;
  if (!fullCost.test(expose.lead.text)) fail("README no longer gives the cost of the full set.");
  expose.lead = {
    ...expose.lead,
    text: expose.lead.text.replace(fullCost, `about ${Math.round(totals.tokens / 1000)}k tokens`),
  };
  const claims = [
    [/full set of (\d+) tools/, expose.lead.text, totals.tools, "the total"],
    [
      /only the (\d+) tools annotated/,
      expose.readOnly.text,
      readTools.length,
      "the read-only count",
    ],
    [/with (\d+) tools behind it/, readme.intro, totals.tools, "the total"],
  ];
  for (const [pattern, text, actual, what] of claims) {
    const said = pattern.exec(text);
    if (said && Number(said[1]) !== actual)
      fail(`README gives ${said[1]} for ${what}; tools/list gives ${actual}.`);
  }

  const dryNamed = readme.safety
    .flatMap((rule) => (/^Preview/.test(rule.lead) ? rule.text.match(/discord_[a-z_]+/g) : []))
    .sort();
  const dryActual = tools
    .filter((t) => t.dryRunDefault)
    .map((t) => t.name)
    .sort();
  if (dryNamed.join() !== dryActual.join())
    fail(
      `README Safety names ${dryNamed.join(", ")} as dry-run tools; the schemas default ${dryActual.join(", ")}.`,
    );

  const askLabels = readme.asks.map((a) => a.want);
  const staleAsks = Object.keys(content.asks).filter((label) => !askLabels.includes(label));
  if (staleAsks.length)
    fail(`content.json maps prompts the README no longer has: ${staleAsks.join(", ")}.`);
  const asks = readme.asks.map((a) => {
    const mapped = content.asks[a.want] ?? { recorded: false, tools: [] };
    for (const name of mapped.tools)
      if (!byName.has(name)) fail(`Unknown tool ${name} for "${a.want}".`);
    return {
      ...a,
      ...mapped,
      promptHtml: String(channels(a.prompt)),
    };
  });

  const clientLabels = readme.clients.map((c) => c.label);
  const staleClients = Object.keys(content.clients).filter(
    (label) => !clientLabels.includes(label),
  );
  if (staleClients.length)
    fail(`content.json names clients the README no longer has: ${staleClients.join(", ")}.`);
  const clients = readme.clients.map((c) => {
    const short =
      content.clients[c.label] ??
      fail(`content.json has no short label for the ${c.label} client.`);
    return { ...c, short, id: "c-" + slug(short) };
  });

  const steps = readme.quickStart.find((b) => b.type === "ol").items;
  const quickConfig =
    steps.flat().find((b) => b.type === "code" && b.lang === "json")?.code ??
    fail("README Quick start has no JSON config.");

  for (const call of content.session.calls)
    if (!byName.has(call.tool)) fail(`Unknown tool ${call.tool} in the recorded session.`);
  const demoFile = join(GITHUB_ASSETS, "demo.webp");
  const demo = {
    ...readme.demo,
    ...webpSize(demoFile),
    size: (statSync(join(SITE, "assets/demo.mp4")).size / 1e6).toFixed(1) + " MB",
  };

  const invite =
    steps
      .flat()
      .find((b) => b.type === "code" && b.code.includes("/oauth2/authorize"))
      ?.code.trim() ?? fail("README Quick start has no invite link.");

  const logoSvg = readFileSync(join(GITHUB_ASSETS, "logo.svg"), "utf8");
  return {
    version: catalog.server.version,
    totals,
    tools,
    byName,
    toolsets,
    profiles,
    expose,
    asks,
    clients,
    quickConfig,
    invite: { link: invite, permissions: invitePermissions(invite) },
    recipes: recipeModel(content.recipes, tools, byName, setNames),
    config: configModel(readme),
    session: content.session,
    demo,
    readme,
    installLinks: readme.installLinks,
    buttonFiles: BUTTON_FILES,
    logo: inlineLogo(logoSvg),
    favicon: FAVICON,
    touchIcon: TOUCH_ICON,
    ogImage: {
      path: OG_IMAGE,
      ...pngSize(COPIED[OG_IMAGE]),
      alt: `discord-mcp: ${readme.tagline}`,
    },
    description: `An MCP server that connects Claude, Codex, Cursor, VS Code and other MCP clients to your Discord server through your own bot. ${totals.tools} tools in ${totals.toolsets} toolsets, dry runs for mass actions, a read-only mode.`,
  };
}

/**
 * Renders every page into outDir, which it empties first. Returns the written paths.
 * `date` is the sitemap's lastmod; see buildDate for its default.
 */
export function writeSite(catalog, outDir, { date } = {}) {
  const readme = parseReadme(readFileSync(join(ROOT, "README.md"), "utf8"));
  const content = JSON.parse(readFileSync(join(SITE, "content.json"), "utf8"));
  const site = siteModel(catalog, readme, content);
  const pages = {
    "": renderLanding(site),
    "guide/": renderGuide(site),
    "recipes/": renderRecipes(site),
    "configuration/": renderConfiguration(site),
    "troubleshooting/": renderTroubleshooting(site),
    "privacy/": renderPrivacy(site),
    "tools/": renderCatalog(site),
    [TOOLSETS_PATH]: renderToolsets(site),
    ...Object.fromEntries(
      site.toolsets.map((set) => [toolsetPath(set.name), renderToolsetPage(site, set)]),
    ),
    ...Object.fromEntries(
      site.tools.map((tool) => [toolPath(tool.name), renderToolPage(site, tool)]),
    ),
  };
  const files = {
    ...Object.fromEntries(Object.entries(pages).map(([path, html]) => [path + "index.html", html])),
    "404.html": renderNotFound(site),
    "llms.txt": renderLlms(site),
    "sitemap.xml": renderSitemap(Object.keys(pages), buildDate(date)),
    "robots.txt": renderRobots(),
    "tools.json": JSON.stringify(catalog, null, 2) + "\n",
    "assets/site.css": STYLES.map((name) =>
      readFileSync(join(SITE, "styles", `${name}.css`), "utf8"),
    ).join("\n"),
    ...Object.fromEntries(
      Object.entries(BUNDLES).map(([file, names]) => [`assets/${file}`, bundle(names)]),
    ),
  };
  const emDash = String.fromCharCode(0x2014);
  rmSync(outDir, { recursive: true, force: true });
  for (const [path, text] of Object.entries(files)) {
    if (text.includes(emDash)) fail(`${path} contains an em dash.`);
    mkdirSync(dirname(join(outDir, path)), { recursive: true });
    writeFileSync(join(outDir, path), text);
  }
  for (const [path, source] of Object.entries(COPIED)) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true });
    copyFileSync(source, join(outDir, path));
  }
  return [...Object.keys(files), ...Object.keys(COPIED)];
}
