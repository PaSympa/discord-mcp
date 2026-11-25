import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { discord } from "../src/client.js";
import type { ToolModule } from "../src/tools/types.js";
import moderation from "../src/tools/moderation.js";

afterEach(() => mock.restoreAll());

type Schema = Record<string, unknown> & {
  properties?: Record<string, Schema>;
  items?: Schema;
  anyOf?: Schema[];
};

function inputSchema(mod: ToolModule, tool: string): Schema {
  const def = mod.definitions.find((d) => d.name === tool);
  assert.ok(def, `${tool} not found`);
  return def.inputSchema as Schema;
}

test("get_audit_log advertises action_type as a plain integer, with no enum from discord.js", async () => {
  const actionType = inputSchema(moderation, "discord_get_audit_log").properties!.action_type;
  assert.equal(actionType.type, "integer");
  assert.equal(actionType.minimum, 1);
  assert.equal(actionType.anyOf, undefined);
  assert.equal(actionType.enum, undefined);

  const fetchAuditLogs = mock.fn(async () => ({ entries: [] }));
  mock.method(discord.guilds, "fetch", async () => ({ fetchAuditLogs }));
  const run = moderation.handlers.get("discord_get_audit_log")!;
  // 16 and 33 are the IDs newer discord-api-types releases added to the enum.
  for (const type of [22, 16, 33, 999]) {
    const result = await run({ guild_id: "100000000000000001", action_type: type });
    assert.ok(!result.isError);
  }
  assert.deepEqual(
    fetchAuditLogs.mock.calls.map((c) => (c.arguments as unknown as [{ type: number }])[0].type),
    [22, 16, 33, 999],
  );
  for (const bad of [0, -1, 2.5, "22"])
    await assert.rejects(run({ guild_id: "100000000000000001", action_type: bad }), ZodError);
  assert.equal(fetchAuditLogs.mock.callCount(), 4);
});
