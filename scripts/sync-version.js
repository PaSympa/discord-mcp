// Keeps server.json (MCP Registry manifest), manifest.json (Claude Desktop bundle) and
// plugin/.claude-plugin/plugin.json (Claude Code plugin) in lockstep with package.json. Runs
// as the npm `version` lifecycle script, so `npm version patch|minor|major` bumps
// package.json, package-lock.json, server.json, manifest.json and plugin.json in one go.
//
// Only the version strings change, line by line: JSON.stringify would unfold the short
// arrays that Prettier keeps on one line, and format:check would fail.
const fs = require("fs");
const path = require("path");

const { name, version } = require(path.join(__dirname, "..", "package.json"));
const serverJsonPath = path.join(__dirname, "..", "server.json");
const manifestPath = path.join(__dirname, "..", "manifest.json");
const pluginPath = path.join(__dirname, "..", "plugin", ".claude-plugin", "plugin.json");

const server = fs
  .readFileSync(serverJsonPath, "utf8")
  .replace(/^( *"version": )"[^"]*"/gm, `$1"${version}"`)
  // The registry rejects a `version` field on OCI packages; the identifier's tag carries it.
  .replace(/^( *"identifier": "[^"]*:)[^"]*"/gm, `$1${version}"`);
const { version: serverVersion, packages = [] } = JSON.parse(server);
const stale = packages.filter((pkg) =>
  pkg.registryType === "oci" ? !pkg.identifier.endsWith(`:${version}`) : pkg.version !== version,
);
if (serverVersion !== version || stale.length > 0) {
  throw new Error(
    `server.json has a version this script cannot update: ${stale.map((pkg) => pkg.identifier).join(", ") || "the top-level one"}.`,
  );
}
fs.writeFileSync(serverJsonPath, server);

const manifest = fs
  .readFileSync(manifestPath, "utf8")
  .replace(/^( {2}"version": )"[^"]*"/m, `$1"${version}"`);
if (JSON.parse(manifest).version !== version) {
  throw new Error('manifest.json has no top-level "version" line to update.');
}
fs.writeFileSync(manifestPath, manifest);

// The plugin launches the npm release of its own version: npx -y <name>@<version>.
const plugin = fs
  .readFileSync(pluginPath, "utf8")
  .replace(/^( {2}"version": )"[^"]*"/m, `$1"${version}"`)
  .replace(new RegExp(`"${name}@[^"]*"`, "g"), `"${name}@${version}"`);
const synced = JSON.parse(plugin);
const args = Object.values(synced.mcpServers ?? {}).flatMap((entry) => entry.args ?? []);
if (synced.version !== version || !args.includes(`${name}@${version}`)) {
  throw new Error(`plugin.json needs a top-level "version" line and a "${name}@<version>" arg.`);
}
fs.writeFileSync(pluginPath, plugin);
console.log(`server.json, manifest.json and plugin.json synced to ${version}`);
