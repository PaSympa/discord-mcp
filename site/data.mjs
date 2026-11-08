import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  DEFAULT_INHERITED_ENV_VARS,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

export const SERVER = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const TIMEOUT_MS = 60_000;
const RISKS = ["read", "write", "destructive"];

export function riskOf({ annotations = {} }) {
  if (annotations.readOnlyHint) return "read";
  if (annotations.destructiveHint) return "destructive";
  return "write";
}

export function bytesOf(definition) {
  return Buffer.byteLength(JSON.stringify(definition), "utf8");
}

export function purposeOf(description) {
  return /^(.+?\.)(?:\s|$)/.exec(description)?.[1] ?? description;
}

export function dryRunDefault({ inputSchema }) {
  return inputSchema?.properties?.dry_run?.default === true;
}

export function crossReferencesOf({ name, description }) {
  return [...new Set(description.match(/discord_[a-z_]+/g) ?? [])].filter((ref) => ref !== name);
}

const PERMISSION = "[A-Z][A-Za-z]*(?: (?:in|[A-Z][A-Za-z]*))*";
const PERMISSIONS = new RegExp(
  `\\bthe (${PERMISSION}(?:(?:,? and |, )${PERMISSION})*) permissions?\\b|\\b([A-Z]+(?:_[A-Z]+)+) permissions?\\b`,
  "g",
);
const titleCase = (constant) =>
  constant
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

/**
 * The Discord permissions a description says the tool requires, read from its "requires
 * the X permission" clauses. `when` holds the clause's subject when the requirement only
 * covers some calls ("deleting another user's message requires ..."), else null.
 */
export function permissionsOf(description) {
  const found = [];
  for (const match of description.matchAll(/\brequires\b/gi)) {
    const before = description.slice(0, match.index);
    const subject = before
      .slice(Math.max(before.lastIndexOf(". "), before.lastIndexOf("; ")) + 1)
      .trim();
    const rest = description.slice(match.index);
    const clause = rest.slice(0, rest.search(/[.;](?:\s|$)|$/));
    const when = subject ? subject[0].toLowerCase() + subject.slice(1) : null;
    for (const [, names, constant] of clause.matchAll(PERMISSIONS))
      for (const name of constant ? [titleCase(constant)] : names.split(/,? and |, /))
        if (!found.some((p) => p.name === name)) found.push({ name, when });
  }
  return found;
}

/** Maps each tool name to its toolset. Throws unless the toolsets partition tools/list. */
export function assignToolsets(tools, toolsets) {
  const listed = new Map(tools.map((tool) => [tool.name, tool]));
  if (listed.size !== tools.length) throw new Error("tools/list serves a tool name twice.");
  const toolsetOf = new Map();
  for (const { name, tools: served } of toolsets) {
    if (served.length === 0) throw new Error(`Toolset ${name} serves no tool.`);
    for (const tool of served) {
      const other = toolsetOf.get(tool.name);
      if (other) throw new Error(`${tool.name} is served by both ${other} and ${name}.`);
      if (!listed.has(tool.name)) throw new Error(`${tool.name} (${name}) is not in tools/list.`);
      // Toolset token costs are summed from the full list, so a selection must not change a definition.
      if (JSON.stringify(tool) !== JSON.stringify(listed.get(tool.name)))
        throw new Error(`${tool.name} changes when only ${name} is selected.`);
      toolsetOf.set(tool.name, name);
    }
  }
  const orphans = tools.filter((tool) => !toolsetOf.has(tool.name)).map((tool) => tool.name);
  if (orphans.length > 0) throw new Error(`In no toolset: ${orphans.join(", ")}.`);
  return toolsetOf;
}

export function serverParams(cwd, toolsets) {
  // The SDK adds HOME, LOGNAME, SHELL, TERM and USER from this process to env, and
  // child_process drops undefined values, so masking them leaves PATH alone.
  // Windows keeps the SDK defaults: they are system variables such as SYSTEMROOT.
  const inherited = process.platform === "win32" ? [] : DEFAULT_INHERITED_ENV_VARS;
  return {
    command: process.execPath,
    args: [SERVER],
    cwd,
    env: {
      ...Object.fromEntries(inherited.map((name) => [name, undefined])),
      PATH: process.env.PATH,
      ...(toolsets === undefined ? {} : { DISCORD_MCP_TOOLSETS: toolsets }),
    },
    stderr: "pipe",
  };
}

export async function listTools(cwd, toolsets) {
  const transport = new StdioClientTransport(serverParams(cwd, toolsets));
  let stderr = "";
  transport.stderr.on("data", (chunk) => (stderr += chunk));
  const client = new Client({ name: "discord-mcp-site", version: "1.0.0" });
  try {
    await client.connect(transport, { timeout: TIMEOUT_MS });
    const { tools } = await client.listTools(undefined, { timeout: TIMEOUT_MS });
    return { server: client.getServerVersion(), tools };
  } catch (err) {
    const selection = toolsets === undefined ? "" : ` with DISCORD_MCP_TOOLSETS=${toolsets}`;
    throw new Error(
      `dist/index.js did not answer tools/list${selection}, with no token in its env and no .env in its cwd. ` +
        `The site data must not need a token. Server stderr:\n${stderr}`,
      { cause: err },
    );
  } finally {
    await client.close();
  }
}

function toolsetNames(cwd) {
  // An empty selection is always rejected, and the startup error lists every toolset.
  const { command, args, env } = serverParams(cwd, ",");
  const run = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: TIMEOUT_MS });
  const known = /Known: all, ([\w, ]+)\./.exec(run.stderr ?? "");
  if (!known) throw new Error(`No toolset list in the server's startup error:\n${run.stderr}`);
  return known[1].split(", ");
}

/**
 * Reads tools/list from dist/index.js in full, then once per toolset. The server never
 * sees a token: its env holds PATH only, and its cwd is a fresh empty directory, where
 * `dotenv/config` finds no .env.
 */
export async function collect() {
  if (!existsSync(SERVER)) throw new Error(`${SERVER} is missing: run npm run build first.`);
  const cwd = mkdtempSync(join(tmpdir(), "discord-mcp-site-"));
  try {
    const names = toolsetNames(cwd);
    const [full, ...parts] = await Promise.all([
      listTools(cwd),
      ...names.map((name) => listTools(cwd, name)),
    ]);
    return {
      server: full.server,
      tools: full.tools,
      toolsets: names.map((name, i) => ({ name, tools: parts[i].tools })),
    };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function summarize(entries) {
  const bytes = entries.reduce((sum, tool) => sum + tool.bytes, 0);
  const risk = Object.fromEntries(
    RISKS.map((level) => [level, entries.filter((tool) => tool.risk === level).length]),
  );
  return { tools: entries.length, bytes, tokens: bytes / 4, risk };
}

/** Derives the site's catalog from one collect() result, in tools/list order. */
export function buildCatalog({ server, tools, toolsets }) {
  const toolsetOf = assignToolsets(tools, toolsets);
  const entries = tools.map((definition) => {
    const crossReferences = crossReferencesOf(definition);
    const unknown = crossReferences.filter((ref) => !toolsetOf.has(ref));
    if (unknown.length > 0)
      throw new Error(`${definition.name} names unknown tools: ${unknown.join(", ")}.`);
    const bytes = bytesOf(definition);
    return {
      name: definition.name,
      title: definition.title || definition.annotations?.title || definition.name,
      toolset: toolsetOf.get(definition.name),
      risk: riskOf(definition),
      purpose: purposeOf(definition.description),
      dryRunDefault: dryRunDefault(definition),
      crossReferences,
      permissions: permissionsOf(definition.description),
      bytes,
      tokens: bytes / 4,
      definition,
    };
  });
  const { tools: count, ...sizes } = summarize(entries);
  return {
    server,
    totals: {
      tools: count,
      toolsets: toolsets.length,
      ...sizes,
      dryRunDefaults: entries.filter((tool) => tool.dryRunDefault).length,
    },
    toolsets: toolsets.map(({ name }) => ({
      name,
      ...summarize(entries.filter((tool) => tool.toolset === name)),
    })),
    tools: entries,
  };
}
