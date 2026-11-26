import { mock } from "node:test";
import assert from "node:assert/strict";
import { Client, InMemoryTransport, type JSONRPCMessage } from "@modelcontextprotocol/client";
import { discord } from "../src/client.js";
import { createServer } from "../src/server.js";

type Sent = JSONRPCMessage & {
  method?: string;
  id?: unknown;
  params?: { progressToken?: unknown; progress?: number; total?: number };
};

/**
 * Calls a tool through the MCP server on an in-memory link and returns the result and the
 * `[progress, total]` pairs the server sent, checked against the request's token, before the
 * response and strictly increasing. It reads what the server sends, not what the client hands
 * to `onprogress`: the SDK client can drop a notification read with the response
 * (typescript-sdk #3018). `token: false` sends no progress token, and `progressToken` sends
 * that one in `_meta` instead of the client's own; `failNotifications` makes every
 * notification send reject, as a closed transport would.
 */
export async function callWithProgress(
  name: string,
  args: Record<string, unknown>,
  {
    token = true,
    progressToken,
    failNotifications = false,
  }: { token?: boolean; progressToken?: string | number; failNotifications?: boolean } = {},
) {
  mock.method(discord, "isReady", () => true as never);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const sent: Sent[] = [];
  const send = serverTransport.send.bind(serverTransport);
  serverTransport.send = (message, options) => {
    const out = message as Sent;
    sent.push(out);
    if (failNotifications && out.method === "notifications/progress")
      return Promise.reject(new Error("transport closed (test)"));
    return send(message, options);
  };
  const server = createServer("0.0.0-test");
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  sent.length = 0;
  try {
    const result =
      progressToken === undefined
        ? await client.callTool(
            { name, arguments: args },
            token ? { onprogress: () => {} } : undefined,
          )
        : await client.callTool({ name, arguments: args, _meta: { progressToken } });
    const response = sent.findIndex((m) => "result" in m);
    const call = progressToken ?? sent[response].id;
    const progress: [number, number][] = [];
    sent.forEach((m, i) => {
      if (m.method !== "notifications/progress") return;
      assert.ok(i < response, "a progress notification follows the response");
      assert.equal(m.params?.progressToken, call, "the progress token is the request's");
      progress.push([m.params!.progress!, m.params!.total!]);
    });
    for (let i = 1; i < progress.length; i++)
      assert.ok(progress[i][0] > progress[i - 1][0], `progress does not grow: ${progress}`);
    return { result, progress };
  } finally {
    await client.close();
  }
}
