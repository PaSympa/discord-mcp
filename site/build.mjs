import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { esc } from "./client/tpl.mjs";
import { renderCatalog } from "./pages/catalog.mjs";
import { renderLlms, renderRobots, renderSitemap } from "./pages/files.mjs";
import { renderLanding } from "./pages/landing.mjs";
import { inlineLogo } from "./pages/layout.mjs";
import { renderNotFound } from "./pages/notfound.mjs";
import { slug } from "./pages/parts.mjs";
import { renderToolPage, toolPath } from "./pages/tool.mjs";
import { parseReadme } from "./readme.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = join(ROOT, "site");
const GITHUB_ASSETS = join(ROOT, ".github", "assets");

const STYLES = ["base", "landing", "catalog", "tool"];
const BUNDLES = {
  "landing.js": ["tpl", "keys", "common", "landing"],
  "catalog.js": ["tpl", "keys", "common", "search", "detail", "catalog"],
  "page.js": ["keys", "common", "page"],
  "notfound.js": ["tpl", "keys", "common", "suggest", "notfound"],
};
const OG_IMAGE = "assets/social-preview.png";
const TOUCH_ICON = "assets/apple-touch-icon.png";
const BUTTON_FILES = {
  "Install in VS Code": "install-vscode.svg",
  "Install in VS Code Insiders": "install-vscode-insiders.svg",
  "Install in Cursor": "install-cursor.svg",
};
const COPIED = {
  "assets/fonts/bricolage-grotesque-latin.woff2": join(
    SITE,
    "assets/fonts/bricolage-grotesque-latin.woff2",
  ),
  "assets/fonts/jetbrains-mono-latin.woff2": join(SITE, "assets/fonts/jetbrains-mono-latin.woff2"),
  "assets/fonts/OFL.txt": join(SITE, "assets/fonts/OFL.txt"),
  "assets/demo.webp": join(GITHUB_ASSETS, "demo.webp"),
  [OG_IMAGE]: join(GITHUB_ASSETS, "social-preview.png"),
  [TOUCH_ICON]: join(GITHUB_ASSETS, "logo-512.png"),
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

function summarize(tools) {
  const tokens = tools.reduce((n, t) => n + t.tokens, 0);
  return { tools: tools.length, tokens };
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
      promptHtml: esc(a.prompt).replace(/#[a-z0-9-]+/g, (m) => `<span class="ch">${m}</span>`),
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
    size: (statSync(demoFile).size / 1e6).toFixed(1) + " MB",
  };

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
    session: content.session,
    demo,
    readme,
    installLinks: readme.installLinks,
    buttonFiles: BUTTON_FILES,
    logo: inlineLogo(logoSvg),
    favicon: "data:image/svg+xml," + encodeURIComponent(logoSvg.trim()),
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
    "tools/": renderCatalog(site),
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
