// Keeps server.json (MCP Registry manifest) and manifest.json (Claude Desktop bundle) in
// lockstep with package.json. Runs as the npm `version` lifecycle script, so
// `npm version patch|minor|major` bumps package.json, package-lock.json, server.json and
// manifest.json in one go.
const fs = require("fs");
const path = require("path");

const { version } = require(path.join(__dirname, "..", "package.json"));
const serverJsonPath = path.join(__dirname, "..", "server.json");
const manifestPath = path.join(__dirname, "..", "manifest.json");

const server = JSON.parse(fs.readFileSync(serverJsonPath, "utf8"));
server.version = version;
for (const pkg of server.packages ?? []) {
  // The registry rejects a `version` field on OCI packages; the identifier's tag carries it.
  if (pkg.registryType === "oci") {
    pkg.identifier = pkg.identifier.slice(0, pkg.identifier.lastIndexOf(":") + 1) + version;
  } else {
    pkg.version = version;
  }
}
fs.writeFileSync(serverJsonPath, JSON.stringify(server, null, 2) + "\n");

// Only the top-level version line changes: JSON.stringify would unfold the short arrays
// that Prettier keeps on one line, and format:check would fail.
const manifest = fs
  .readFileSync(manifestPath, "utf8")
  .replace(/^( {2}"version": )"[^"]*"/m, `$1"${version}"`);
if (JSON.parse(manifest).version !== version) {
  throw new Error('manifest.json has no top-level "version" line to update.');
}
fs.writeFileSync(manifestPath, manifest);
console.log(`server.json and manifest.json synced to ${version}`);
