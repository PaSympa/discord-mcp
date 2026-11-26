import "./confirm-off-env.js";
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DELETE_CHANNEL, FORM, call, fakeChannel, textOf } from "./elicit.js";

afterEach(() => mock.restoreAll());

test("DISCORD_MCP_CONFIRM=false never asks, even a client that declares form elicitation", async () => {
  const { deletions } = fakeChannel();
  const { result, asked } = await call("discord_delete_channel", DELETE_CHANNEL, {
    capabilities: FORM,
    answer: { action: "decline" },
  });
  assert.deepEqual(asked, []);
  assert.deepEqual(deletions, ["cleanup"]);
  assert.equal(textOf(result), "✅ Channel #victim deleted.");
});
