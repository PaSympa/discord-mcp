import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { PermissionFlagsBits } from "discord.js";

// site/ is ESM and this suite runs as CommonJS.
const site = () => import("../site/data.mjs");

type Tool = { name: string; description: string };
const tool = (name: string, description = "Does a thing."): Tool => ({ name, description });

test("risk is read when readOnlyHint is set, else destructive when destructiveHint is, else write", async () => {
  const { riskOf } = await site();
  assert.equal(riskOf({ annotations: { readOnlyHint: true, destructiveHint: true } }), "read");
  assert.equal(
    riskOf({ annotations: { readOnlyHint: false, destructiveHint: true } }),
    "destructive",
  );
  assert.equal(riskOf({ annotations: { readOnlyHint: false, destructiveHint: false } }), "write");
  assert.equal(riskOf({}), "write");
});

test("purpose is the first sentence, cut at a period followed by a space or the end", async () => {
  const { purposeOf } = await site();
  assert.equal(
    purposeOf("Read the log (bans, kicks, etc.) with authors. More."),
    "Read the log (bans, kicks, etc.) with authors.",
  );
  assert.equal(purposeOf("Upload up to 2.5 MB. More."), "Upload up to 2.5 MB.");
  assert.equal(purposeOf("Ends here."), "Ends here.");
  assert.equal(purposeOf("No period at all"), "No period at all");
});

test("dry run by default only when the dry_run property defaults to true", async () => {
  const { dryRunDefault } = await site();
  const withDryRun = (dry_run: unknown) => ({
    inputSchema: { type: "object", properties: { dry_run } },
  });
  assert.equal(dryRunDefault(withDryRun({ type: "boolean", default: true })), true);
  assert.equal(dryRunDefault(withDryRun({ type: "boolean", default: false })), false);
  assert.equal(dryRunDefault(withDryRun({ type: "boolean" })), false);
  assert.equal(dryRunDefault({ inputSchema: { type: "object" } }), false);
});

test("cross references list each other discord_* name once, in order of appearance", async () => {
  const { crossReferencesOf } = await site();
  const description =
    "Use discord_list_roles, then discord_add_role. Unlike discord_ban, see discord_list_roles.";
  assert.deepEqual(crossReferencesOf(tool("discord_ban", description)), [
    "discord_list_roles",
    "discord_add_role",
  ]);
  assert.deepEqual(crossReferencesOf(tool("discord_ban", "No reference. Env: DISCORD_TOKEN.")), []);
});

test("permissions come from requires-the-X-permission clauses, with the subject when conditional", async () => {
  const { permissionsOf } = await site();
  const names = (description: string) =>
    permissionsOf(description).map((p: { name: string }) => p.name);
  const only = (name: string, condition: string | null = null, alternativeTo = null) => ({
    name,
    condition,
    alternativeTo,
  });
  assert.deepEqual(
    permissionsOf("Ban someone. Requires the Ban Members permission, and a higher role."),
    [only("Ban Members")],
  );
  assert.deepEqual(
    names("Requires the View Channel and Read Message History permissions; without it, nothing."),
    ["View Channel", "Read Message History"],
  );
  assert.deepEqual(names("Requires both the Ban Members and Manage Server permissions."), [
    "Ban Members",
    "Manage Server",
  ]);
  assert.deepEqual(names("Requires the bot to have the Send Messages permission."), [
    "Send Messages",
  ]);
  assert.deepEqual(names("Requires the Community feature and the Manage Server permission."), [
    "Manage Server",
  ]);
  assert.deepEqual(names("Requires the Send Messages in Threads permission (shown as Posts)."), [
    "Send Messages in Threads",
  ]);
  assert.deepEqual(names("Requires READ_MESSAGE_HISTORY permission."), ["Read Message History"]);
  assert.deepEqual(
    permissionsOf(
      "Delete it. The bot can always delete its own; deleting another user's message requires the Manage Messages permission.",
    ),
    [only("Manage Messages", "when deleting another user's message")],
  );
  assert.deepEqual(
    permissionsOf(
      "Requires the Send Messages permission (and Manage Messages for messages authored by others).",
    ),
    [only("Send Messages"), only("Manage Messages", "for messages authored by others")],
  );
  assert.deepEqual(
    permissionsOf(
      "Requires the Manage Nicknames permission (or Change Nickname for the bot itself).",
    ),
    [
      only("Manage Nicknames"),
      {
        name: "Change Nickname",
        condition: "for the bot itself",
        alternativeTo: "Manage Nicknames",
      },
    ],
  );
  assert.deepEqual(permissionsOf("Requires the Manage Channels permission (or Manage Server)."), [
    only("Manage Channels"),
    { name: "Manage Server", condition: null, alternativeTo: "Manage Channels" },
  ]);
  assert.deepEqual(
    names(
      "Requires the Pin Messages permission (a dedicated permission, separate from Manage Messages).",
    ),
    ["Pin Messages"],
  );
  for (const none of [
    "Requires the original webhook token.",
    "Requires the bot to share at least one server with the user.",
    "Requires the server to have the Community feature enabled.",
    "No bot permission is needed: the token authorizes the call.",
  ])
    assert.deepEqual(permissionsOf(none), [], none);
});

test("toolsets must partition tools/list: no duplicate, no orphan, no stranger, no empty toolset", async () => {
  const { assignToolsets } = await site();
  const [a, b] = [tool("discord_a"), tool("discord_b")];
  assert.deepEqual(
    [
      ...assignToolsets(
        [a, b],
        [
          { name: "x", tools: [a] },
          { name: "y", tools: [b] },
        ],
      ),
    ],
    [
      ["discord_a", "x"],
      ["discord_b", "y"],
    ],
  );
  const fails = (tools: Tool[], toolsets: { name: string; tools: Tool[] }[], message: RegExp) =>
    assert.throws(() => assignToolsets(tools, toolsets), message);
  fails([a, a], [{ name: "x", tools: [a] }], /twice/);
  fails(
    [a, b],
    [
      { name: "x", tools: [a, b] },
      { name: "y", tools: [b] },
    ],
    /discord_b is served by both x and y/,
  );
  fails([a, b], [{ name: "x", tools: [a] }], /In no toolset: discord_b/);
  fails([a], [{ name: "x", tools: [a, b] }], /discord_b \(x\) is not in tools\/list/);
  fails(
    [a],
    [
      { name: "x", tools: [a] },
      { name: "y", tools: [] },
    ],
    /Toolset y serves no tool/,
  );
  fails(
    [a],
    [{ name: "x", tools: [tool("discord_a", "Changed.")] }],
    /discord_a changes when only x/,
  );
});

test("the server gets PATH and the toolset selection, never this process's token", async () => {
  const { SERVER, serverParams } = await site();
  process.env.DISCORD_TOKEN = "must-not-reach-the-server";
  process.env.DOTENV_PATH = "/elsewhere/.env";
  try {
    const params = serverParams("/tmp/empty", "messages");
    const defined = Object.keys(params.env).filter((key) => params.env[key] !== undefined);
    assert.deepEqual(defined.sort(), ["DISCORD_MCP_TOOLSETS", "PATH"]);
    assert.equal(params.env.DISCORD_MCP_TOOLSETS, "messages");
    assert.equal(params.cwd, "/tmp/empty");
    assert.deepEqual(params.args, [SERVER]);
    assert.ok(isAbsolute(SERVER));
  } finally {
    delete process.env.DISCORD_TOKEN;
    delete process.env.DOTENV_PATH;
  }
});

test("a server that cannot answer tools/list fails the generator with its stderr", async () => {
  const { listTools } = await site();
  const cwd = mkdtempSync(join(tmpdir(), "discord-mcp-site-test-"));
  try {
    await assert.rejects(
      listTools(cwd, "no_such_toolset"),
      /did not answer tools\/list with DISCORD_MCP_TOOLSETS=no_such_toolset[\s\S]*Invalid DISCORD_MCP_TOOLSETS/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("site data from dist/index.js: every tool in one toolset, every derived field set", async () => {
  const { buildCatalog, collect } = await site();
  const catalog = buildCatalog(await collect());
  const { totals, toolsets, tools } = catalog;
  const names = new Set(tools.map((t: { name: string }) => t.name));
  const toolsetNames = new Set(toolsets.map((s: { name: string }) => s.name));
  const sum = (list: Record<string, number>[], key: string) => list.reduce((n, x) => n + x[key], 0);

  assert.ok(tools.length > 0);
  assert.equal(names.size, tools.length, "no duplicate tool");
  assert.equal(toolsetNames.size, toolsets.length, "no duplicate toolset");
  assert.equal(totals.tools, tools.length);
  assert.equal(totals.toolsets, toolsets.length);
  assert.equal(sum(toolsets, "tools"), tools.length, "toolset sizes add up to the full list");
  assert.equal(totals.bytes, sum(tools, "bytes"));
  assert.equal(sum(toolsets, "bytes"), totals.bytes);
  assert.equal(totals.tokens, totals.bytes / 4);
  assert.equal(totals.risk.read + totals.risk.write + totals.risk.destructive, tools.length);
  for (const s of toolsets) {
    assert.ok(s.tools > 0, `${s.name} serves at least one tool`);
    assert.equal(s.risk.read + s.risk.write + s.risk.destructive, s.tools, s.name);
  }

  for (const t of tools) {
    const { definition } = t;
    assert.deepEqual(Object.keys(t), [
      "name",
      "title",
      "toolset",
      "risk",
      "purpose",
      "dryRunDefault",
      "crossReferences",
      "permissions",
      "bytes",
      "tokens",
      "definition",
    ]);
    assert.equal(definition.name, t.name);
    assert.ok(t.title.length > 0, t.name);
    assert.ok(toolsetNames.has(t.toolset), t.name);
    assert.ok(["read", "write", "destructive"].includes(t.risk), t.name);
    // The MCP default for a missing destructiveHint is true, which the risk formula would read as write.
    if (t.risk !== "read")
      assert.equal(typeof definition.annotations?.destructiveHint, "boolean", t.name);
    assert.ok(t.purpose.length > 0 && definition.description.startsWith(t.purpose), t.name);
    assert.equal(
      t.dryRunDefault,
      definition.inputSchema.properties?.dry_run?.default === true,
      t.name,
    );
    for (const ref of t.crossReferences)
      assert.ok(names.has(ref) && ref !== t.name, `${t.name}: ${ref}`);
    assert.equal(t.bytes, Buffer.byteLength(JSON.stringify(definition), "utf8"), t.name);
    assert.equal(t.tokens, t.bytes / 4, t.name);
  }

  const flags = new Map(
    Object.entries(PermissionFlagsBits).map(([key, bit]) => [key.toLowerCase(), bit]),
  );
  const flagOf = (name: string) =>
    flags.get(
      name
        .replace(/ /g, "")
        .toLowerCase()
        .replace(/^manageserver$/, "manageguild"),
    );
  const readme = readFileSync(join(__dirname, "..", "README.md"), "utf8");
  const invite = BigInt(/oauth2\/authorize\?[^\s)]*permissions=(\d+)/.exec(readme)![1]);
  type Permission = { name: string; condition: string | null; alternativeTo: string | null };
  let parsed = 0;
  for (const t of tools)
    for (const p of t.permissions as Permission[]) {
      parsed++;
      const bit = flagOf(p.name);
      assert.ok(bit !== undefined, `${t.name}: "${p.name}" is not a Discord permission`);
      const granted = flagOf(p.alternativeTo ?? p.name)!;
      assert.equal(invite & granted, granted, `${t.name}: the README invite link omits ${p.name}`);
      if (p.condition?.startsWith("when "))
        assert.match(p.condition, /^when [a-z]+ing\b/, `${t.name}: "${p.condition}"`);
    }
  assert.ok(parsed > 0, "some descriptions name a permission");

  assert.ok(
    !JSON.stringify(catalog).includes(String.fromCharCode(0x2014)),
    "no em dash in the published data",
  );
});
