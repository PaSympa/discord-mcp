/**
 * Prints server.json with an mcpb package for the release bundle, ready for mcp-publisher.
 * Usage: node scripts/registry-mcpb.mjs <version> [--file <bundle.mcpb>] > server.mcpb.json
 * Without --file, it downloads the public release asset: clients verify the hash of that
 * file, and the registry checks only the hash format, so no other copy may be hashed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ATTEMPTS = 6;

const {
  positionals: [version],
  values: { file },
} = parseArgs({ allowPositionals: true, options: { file: { type: "string" } } });
if (!version) throw new Error("Usage: node scripts/registry-mcpb.mjs <version> [--file <bundle>]");

const root = fileURLToPath(new URL("..", import.meta.url));
const server = JSON.parse(readFileSync(join(root, "server.json"), "utf8"));
if (server.version !== version) {
  throw new Error(`server.json is at ${server.version}, not ${version}.`);
}
if (server.packages.some((pkg) => pkg.registryType === "mcpb")) {
  throw new Error("server.json already lists an mcpb package: only the release may add it.");
}
const url = `https://github.com/PaSympa/discord-mcp/releases/download/v${version}/discord-mcp.mcpb`;

async function download() {
  let failure = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      failure = `HTTP ${res.status}`;
    } catch (err) {
      failure = err.message;
    }
    if (attempt < ATTEMPTS) {
      console.error(`${url}: ${failure}, retrying in 10 s.`);
      await sleep(10_000);
    }
  }
  throw new Error(`Could not download ${url} after ${ATTEMPTS} attempts: ${failure}.`);
}

const scratch = mkdtempSync(join(tmpdir(), "discord-mcp-registry-"));
try {
  const path = file ?? join(scratch, "discord-mcp.mcpb");
  const bundle = file ? readFileSync(file) : await download();
  if (!file) writeFileSync(path, bundle);

  try {
    execFileSync("unzip", ["-tq", path], { stdio: "pipe" });
  } catch (err) {
    throw new Error(`${path} is not a valid zip: ${err.stdout}${err.stderr}`.trim(), {
      cause: err,
    });
  }
  const bundled = JSON.parse(
    execFileSync("unzip", ["-p", path, "manifest.json"], { encoding: "utf8" }),
  );
  if (bundled.version !== version) {
    throw new Error(`The bundled manifest.json is at ${bundled.version}, not ${version}.`);
  }

  const entry = {
    registryType: "mcpb",
    identifier: url,
    version,
    fileSha256: createHash("sha256").update(bundle).digest("hex"),
    transport: { type: "stdio" },
  };
  server.packages.push(entry);
  console.error(`mcpb package: ${JSON.stringify(entry)}`);
  process.stdout.write(JSON.stringify(server, null, 2) + "\n");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
