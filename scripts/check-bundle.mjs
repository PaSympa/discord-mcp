/**
 * Starts the server from a packed bundle the way Claude Desktop does: the manifest's env
 * mapping filled with every user_config default, no token, and the bundle's own
 * node_modules. Fails if it cannot list its tools, or if read-only mode lists a write tool.
 * Usage: node scripts/check-bundle.mjs discord-mcp.mcpb
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [bundle] = process.argv.slice(2);
if (!bundle) throw new Error("Usage: node scripts/check-bundle.mjs <bundle.mcpb>");

const dir = mkdtempSync(join(tmpdir(), "discord-mcp-bundle-check-"));
try {
  execFileSync("unzip", ["-q", bundle, "-d", dir]);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const { command, args, env } = manifest.server.mcp_config;
  const defaults = Object.fromEntries(
    Object.entries(manifest.user_config).map(([key, field]) => [key, String(field.default ?? "")]),
  );
  const fill = (value) =>
    value
      .replaceAll("${__dirname}", dir)
      .replace(/\$\{user_config\.(\w+)\}/g, (_, key) => defaults[key]);

  const listTools = async (overrides) => {
    const transport = new StdioClientTransport({
      command: command === "node" ? process.execPath : command,
      args: args.map(fill),
      cwd: dir,
      env: {
        PATH: process.env.PATH,
        ...Object.fromEntries(Object.entries(env).map(([name, value]) => [name, fill(value)])),
        ...overrides,
      },
      stderr: "inherit",
    });
    const client = new Client({ name: "check-bundle", version: "1.0.0" });
    await client.connect(transport);
    const { tools } = await client.listTools();
    await client.close();
    return tools;
  };

  const all = await listTools({});
  const readOnly = await listTools({ DISCORD_MCP_READ_ONLY: "true" });
  const writes = readOnly.filter((tool) => tool.annotations?.readOnlyHint !== true);
  if (all.length === 0 || readOnly.length === 0 || readOnly.length >= all.length || writes.length) {
    throw new Error(
      `Unexpected tool lists: ${all.length} by default, ${readOnly.length} in read-only mode` +
        (writes.length ? `, including write tools ${writes.map((t) => t.name).join(", ")}` : ""),
    );
  }
  console.log(`The bundle starts: ${all.length} tools, ${readOnly.length} in read-only mode.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
