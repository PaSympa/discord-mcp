import { mock } from "node:test";
import {
  Client,
  InMemoryTransport,
  type ClientCapabilities,
  type ElicitResult,
  type JSONRPCMessage,
} from "@modelcontextprotocol/client";
import { discord } from "../src/client.js";
import { CONFIRM_TIMEOUT_MS } from "../src/confirm.js";
import { createServer } from "../src/server.js";

export const GUILD = "111111111111111111";
export const CHANNEL = "333333333333333333";

export const FORM: ClientCapabilities = { elicitation: { form: {} } };
const CONFIRMED: ElicitResult = { action: "accept", content: { confirm: true } };

export type Answer = ElicitResult | "hang" | "throw";
type Sent = JSONRPCMessage & { method?: string; params?: { progress?: number } };

/**
 * Calls a tool through the MCP server on an in-memory link, from a client that declares
 * `capabilities` and answers each confirmation with `answer`. `onAsk` runs when the form
 * arrives, before the answer. Returns the result, the forms the client got and the
 * progress values the server sent.
 */
export async function call(
  name: string,
  args: Record<string, unknown>,
  {
    capabilities = FORM,
    answer = CONFIRMED,
    timeoutMs = CONFIRM_TIMEOUT_MS,
    onAsk = () => {},
    signal,
  }: {
    capabilities?: ClientCapabilities;
    answer?: Answer;
    timeoutMs?: number;
    onAsk?: () => void;
    signal?: AbortSignal;
  } = {},
) {
  mock.method(discord, "isReady", () => true as never);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const sent: Sent[] = [];
  const send = serverTransport.send.bind(serverTransport);
  serverTransport.send = (message, options) => {
    sent.push(message as Sent);
    return send(message, options);
  };
  const server = createServer("0.0.0-test", { confirmTimeoutMs: timeoutMs });
  const client = new Client({ name: "test", version: "0.0.0" }, { capabilities });
  const forms: { message: string; requestedSchema: unknown }[] = [];
  if (capabilities.elicitation)
    client.setRequestHandler("elicitation/create", async (req) => {
      const { message, requestedSchema } = req.params as {
        message: string;
        requestedSchema: unknown;
      };
      forms.push({ message, requestedSchema });
      onAsk();
      if (answer === "hang") return new Promise<never>(() => {});
      if (answer === "throw") throw new Error("boom");
      return answer;
    });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    // Listing the tools makes the client check structuredContent against each outputSchema.
    await client.listTools();
    const result = (await client.callTool(
      { name, arguments: args },
      { onprogress: () => {}, signal },
    )) as { content: { text: string }[]; isError?: boolean; structuredContent?: unknown };
    const progress = sent
      .filter((m) => m.method === "notifications/progress")
      .map((m) => m.params!.progress);
    return { result, asked: forms.map((f) => f.message), forms, progress };
  } finally {
    await client.close();
  }
}

export const textOf = (result: { content: { text: string }[] }) => result.content[0]?.text;

/** A guild channel whose `delete` records its reason. */
export function fakeChannel() {
  const deletions: unknown[] = [];
  const channel = {
    id: CHANNEL,
    name: "victim",
    guildId: GUILD,
    guild: { name: "Test guild" },
    delete: async (reason: unknown) => void deletions.push(reason),
  };
  const fetch = mock.method(discord.channels, "fetch", async () => channel as never);
  return { deletions, fetch };
}

export const DELETE_CHANNEL = { channel_id: CHANNEL, dry_run: false, reason: "cleanup" };
export const CHANNEL_FORM = `Delete the channel #victim (${CHANNEL}) in Test guild? Reason: "cleanup"`;
