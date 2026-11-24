import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

// Read sites, not bare names: DISCORD_ERROR_HINTS in src/errors.ts is a constant.
// envEnabled() reads process.env[name], so its literal argument is the read site.
const READ_PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g,
  /envEnabled\(\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\)/g,
];

/** Every env var read in src/, mapped to the first file that reads it. */
function envReads(): Map<string, string> {
  const reads = new Map<string, string>();
  const dir = join(root, "src");
  for (const file of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    if (!file.endsWith(".ts")) continue;
    const src = readFileSync(join(dir, file), "utf8");
    for (const pattern of READ_PATTERNS) {
      for (const [, name] of src.matchAll(pattern)) {
        if (!reads.has(name)) reads.set(name, `src/${file}`);
      }
    }
  }
  return reads;
}

type Package = { registryType: string; environmentVariables?: { name: string }[] };
type Manifest = {
  version: string;
  server: { mcp_config: { env?: Record<string, string> } };
  user_config?: Record<string, { type: string; required?: boolean; default?: unknown }>;
};

const reads = envReads();
const packages: Package[] = JSON.parse(readFileSync(join(root, "server.json"), "utf8")).packages;
const manifest: Manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const manifestEnv = manifest.server.mcp_config.env ?? {};
const userConfig = manifest.user_config ?? {};

test("the env var scan still matches how src/ reads env vars", () => {
  assert.ok(reads.has("DISCORD_TOKEN"), "update READ_PATTERNS: DISCORD_TOKEN is no longer found");
});

test("server.json declares every env var src/ reads, and only those, on every package", () => {
  for (const pkg of packages) {
    const declared = new Set((pkg.environmentVariables ?? []).map((v) => v.name));
    for (const [name, file] of reads) {
      assert.ok(
        declared.has(name),
        `${name} is read in ${file} but not declared in the server.json ${pkg.registryType} package`,
      );
    }
    for (const name of declared) {
      assert.ok(
        reads.has(name),
        `the server.json ${pkg.registryType} package declares ${name}, which src/ never reads`,
      );
    }
  }
});

test("server.json packages declare identical env var lists", () => {
  const [first, ...rest] = packages;
  for (const pkg of rest) {
    assert.deepEqual(
      pkg.environmentVariables,
      first.environmentVariables,
      `the server.json ${pkg.registryType} package env vars differ from the ${first.registryType} package`,
    );
  }
});

// Claude Desktop runs the bundle over stdio: the HTTP transport settings stay out of manifest.json.
const HTTP_ONLY = new Set([
  "DISCORD_MCP_TRANSPORT",
  "DISCORD_MCP_HTTP_TOKEN",
  "DISCORD_MCP_HTTP_HOST",
  "DISCORD_MCP_HTTP_PORT",
  "DISCORD_MCP_HTTP_ALLOWED_HOSTS",
]);

test("manifest.json maps every env var src/ reads except the HTTP-only ones, and only those", () => {
  for (const name of HTTP_ONLY) {
    assert.ok(reads.has(name), `HTTP_ONLY lists ${name}, which src/ never reads`);
    assert.ok(!(name in manifestEnv), `manifest.json maps ${name}, an HTTP-only variable`);
  }
  for (const [name, file] of reads) {
    if (HTTP_ONLY.has(name)) continue;
    assert.ok(
      name in manifestEnv,
      `${name} is read in ${file} but not mapped in manifest.json mcp_config.env`,
    );
  }
  for (const name of Object.keys(manifestEnv)) {
    assert.ok(reads.has(name), `manifest.json mcp_config.env maps ${name}, which src/ never reads`);
  }
});

test("each manifest.json env value references a user_config option", () => {
  for (const [name, value] of Object.entries(manifestEnv)) {
    const key = /^\$\{user_config\.([a-z0-9_]+)\}$/.exec(value)?.[1];
    assert.ok(
      key !== undefined && key in userConfig,
      `manifest.json maps ${name} to ${value}, which names no user_config option`,
    );
  }
});

test("optional manifest.json options declare a default, an empty one for strings", () => {
  // Without a default, an unset option reaches the env as the literal ${user_config.key}.
  for (const [key, option] of Object.entries(userConfig)) {
    if (option.required) continue;
    assert.ok("default" in option, `user_config.${key} is optional but has no default`);
    if (option.type === "string") {
      assert.equal(option.default, "", `user_config.${key} is an optional string: default ""`);
    }
  }
});

test("manifest.json version matches package.json", () => {
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(manifest.version, version, "run node scripts/sync-version.js");
});

test("the README Configuration table has a row for every env var src/ reads", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const section = readme.split(/^## Configuration$/m)[1]?.split(/^## /m)[0] ?? "";
  const rows = new Set([...section.matchAll(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/gm)].map((m) => m[1]));
  for (const [name, file] of reads) {
    assert.ok(
      rows.has(name),
      `${name} is read in ${file} but has no row in the README Configuration table`,
    );
  }
});
