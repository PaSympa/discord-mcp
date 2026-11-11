import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { selectModules } from "../src/tools/index.js";

const root = join(__dirname, "..");
const readJson = (...parts: string[]) => JSON.parse(readFileSync(join(root, ...parts), "utf8"));

type Option = { type: string; required?: boolean; default?: unknown } & Record<string, unknown>;
type Server = { command: string; args: string[]; env?: Record<string, string> };
type Plugin = {
  name: string;
  version: string;
  userConfig: Record<string, Option>;
  mcpServers: Record<string, Server>;
};

const pkg: { name: string; version: string } = readJson("package.json");
const plugin: Plugin = readJson("plugin", ".claude-plugin", "plugin.json");
const manifestEnv: Record<string, string> = readJson("manifest.json").server.mcp_config.env;
const marketplace: { plugins: { name: string; source: string }[] } = readJson(
  ".claude-plugin",
  "marketplace.json",
);
const servers = Object.entries(plugin.mcpServers);

// The keys a userConfig option accepts; Claude Code refuses to load a plugin with any other.
const OPTION_KEYS = new Set([
  "type",
  "title",
  "description",
  "required",
  "default",
  "options",
  "multiple",
  "sensitive",
  "min",
  "max",
]);

test("the plugin maps the same env vars to the same options as manifest.json", () => {
  assert.ok(servers.length > 0, "plugin.json declares no MCP server");
  for (const [name, server] of servers) {
    assert.deepEqual(server.env, manifestEnv, `plugin.json server ${name}`);
  }
});

test("each plugin env value names a userConfig option, and each option reaches a server", () => {
  const used = new Set<string>();
  for (const [name, server] of servers) {
    for (const [variable, value] of Object.entries(server.env ?? {})) {
      const key = /^\$\{user_config\.(\w+)\}$/.exec(value)?.[1];
      assert.ok(
        key !== undefined && key in plugin.userConfig,
        `plugin.json server ${name} maps ${variable} to ${value}, which names no userConfig option`,
      );
      used.add(key);
    }
  }
  for (const key of Object.keys(plugin.userConfig)) {
    assert.ok(used.has(key), `userConfig.${key} reaches no server env`);
  }
});

test("each userConfig option has a title and a description, and no unknown key", () => {
  for (const [key, option] of Object.entries(plugin.userConfig)) {
    assert.equal(typeof option.title, "string", `userConfig.${key} needs a title`);
    assert.equal(typeof option.description, "string", `userConfig.${key} needs a description`);
    for (const field of Object.keys(option)) {
      assert.ok(OPTION_KEYS.has(field), `userConfig.${key} has an unknown key: ${field}`);
    }
  }
});

test("optional plugin options declare a default, an empty one for strings", () => {
  for (const [key, option] of Object.entries(plugin.userConfig)) {
    if (option.required) continue;
    assert.ok("default" in option, `userConfig.${key} is optional but has no default`);
    if (option.type === "string") {
      assert.equal(option.default, "", `userConfig.${key} is an optional string: default ""`);
    }
  }
});

test("the plugin version and the npm release it runs match package.json", () => {
  assert.equal(plugin.version, pkg.version, "run node scripts/sync-version.js");
  for (const [name, server] of servers) {
    assert.equal(server.command, "npx", `plugin.json server ${name}`);
    assert.deepEqual(
      server.args,
      ["-y", `${pkg.name}@${pkg.version}`],
      `plugin.json server ${name}: run node scripts/sync-version.js`,
    );
  }
});

test("marketplace.json lists each plugin from a folder that holds its manifest", () => {
  assert.ok(marketplace.plugins.length > 0, "marketplace.json lists no plugin");
  for (const entry of marketplace.plugins) {
    assert.ok(
      entry.source.startsWith("./") && !entry.source.includes(".."),
      `${entry.name}: a relative source starts with ./ and has no ..`,
    );
    const manifestPath = join(root, entry.source, ".claude-plugin", "plugin.json");
    assert.ok(existsSync(manifestPath), `${entry.source} has no .claude-plugin/plugin.json`);
    assert.equal(JSON.parse(readFileSync(manifestPath, "utf8")).name, entry.name);
  }
});

test("the plugin folder has no .mcp.json, which git ignores, and no package.json", () => {
  // A package.json next to a lockfile makes Claude Code install dependencies on every install.
  for (const file of [".mcp.json", "package.json"]) {
    assert.ok(!existsSync(join(root, "plugin", file)), `plugin/${file} must not exist`);
  }
});

test("the skills name only tools the server has", () => {
  delete process.env.DISCORD_MCP_TOOLSETS;
  const tools = new Set(selectModules().flatMap((mod) => mod.definitions.map((def) => def.name)));
  const dir = join(root, "plugin", "skills");
  for (const skill of readdirSync(dir)) {
    const text = readFileSync(join(dir, skill, "SKILL.md"), "utf8");
    for (const [name] of text.matchAll(/\bdiscord_[a-z_]+/g)) {
      assert.ok(tools.has(name), `skills/${skill}/SKILL.md names ${name}, which is not a tool`);
    }
  }
});

test("each skill's frontmatter is valid and pre-approves only read-only tools", () => {
  delete process.env.DISCORD_MCP_TOOLSETS;
  const readOnly = new Set(
    selectModules()
      .flatMap((mod) => mod.definitions)
      .filter((def) => def.annotations?.readOnlyHint === true)
      .map((def) => def.name),
  );
  // Claude Code names a plugin's MCP tools mcp__plugin_<plugin>_<server>__<tool>.
  const prefixes = servers.map(([server]) => `mcp__plugin_${plugin.name}_${server}__`);
  const dir = join(root, "plugin", "skills");
  for (const skill of readdirSync(dir)) {
    const front = /^---\n([\s\S]*?)\n---\n/.exec(
      readFileSync(join(dir, skill, "SKILL.md"), "utf8"),
    )?.[1];
    assert.ok(front, `skills/${skill}/SKILL.md has no frontmatter`);
    assert.equal(
      /^name: (.+)$/m.exec(front)?.[1],
      skill,
      `skills/${skill}: name and folder differ`,
    );
    const description = /^description: (.+)$/m.exec(front)?.[1] ?? "";
    assert.ok(description.length > 0 && description.length <= 1024, `skills/${skill}: description`);
    for (const [, tool] of front.matchAll(/^ {2}- (\S+)$/gm)) {
      const prefix = prefixes.find((p) => tool.startsWith(p));
      assert.ok(prefix, `skills/${skill} pre-approves ${tool}, which this plugin does not serve`);
      assert.ok(readOnly.has(tool.slice(prefix.length)), `skills/${skill} pre-approves ${tool}`);
    }
  }
});
