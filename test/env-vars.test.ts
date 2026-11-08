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

const reads = envReads();
const packages: Package[] = JSON.parse(readFileSync(join(root, "server.json"), "utf8")).packages;

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
