import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "discord-mcp.mcpb");
const mcpbCli = join(root, "node_modules", "@anthropic-ai", "mcpb", "dist", "cli", "cli.js");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
if (manifest.version !== pkg.version) {
  throw new Error(
    `manifest.json is at ${manifest.version} but package.json at ${pkg.version}: run node scripts/sync-version.js.`,
  );
}
if (!existsSync(join(root, "dist", "index.js"))) {
  throw new Error("dist/index.js is missing: run npm run build first.");
}

// mcpb pack zips its whole directory, devDependencies included, so it gets a clean copy.
const stage = mkdtempSync(join(tmpdir(), "discord-mcp-bundle-"));
try {
  // dist/index.js reads ../package.json for its version: package.json stays at the bundle root.
  for (const file of ["dist", "package.json", "package-lock.json", "manifest.json", "LICENSE"]) {
    cpSync(join(root, file), join(stage, file), { recursive: true });
  }
  cpSync(join(root, ".github", "assets", "logo-512.png"), join(stage, manifest.icon));
  execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: stage,
    stdio: "inherit",
  });
  execFileSync(process.execPath, [mcpbCli, "pack", ".", out], { cwd: stage, stdio: "inherit" });
} finally {
  rmSync(stage, { recursive: true, force: true });
}

const bundle = readFileSync(out);
const sha256 = createHash("sha256").update(bundle).digest("hex");
console.log(`\n${out}`);
console.log(`size: ${bundle.length} bytes (${(bundle.length / 1024 / 1024).toFixed(1)} MB)`);
console.log(`sha256: ${sha256}`);
