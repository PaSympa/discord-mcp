import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AttachmentBuilder } from "discord.js";
import { ZodError } from "zod";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const MESSAGE = "555555555555555555";

afterEach(() => mock.restoreAll());

/** Stubs the channel lookup and records every payload passed to channel.send. */
function captureSends(): Record<string, unknown>[] {
  const sends: Record<string, unknown>[] = [];
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    send: async (payload: Record<string, unknown>) => {
      sends.push(payload);
      return { id: MESSAGE };
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  return sends;
}

const handler = (name: string) => messages.handlers.get(name)!;

test("send_message accepts attachments without content and builds AttachmentBuilders", async () => {
  const sends = captureSends();
  const result = await handler("discord_send_message")({
    channel_id: CHANNEL,
    attachments: [
      { data: Buffer.from("hello").toString("base64"), filename: "hello.txt", spoiler: true },
    ],
  });
  assert.ok(!result.isError);
  assert.equal(sends.length, 1);
  const files = sends[0].files as AttachmentBuilder[];
  assert.equal(files.length, 1);
  assert.ok(files[0] instanceof AttachmentBuilder);
  assert.equal(files[0].name, "SPOILER_hello.txt");
  assert.equal(sends[0].content, undefined);
});

test("send_message still requires content or attachments", async () => {
  captureSends();
  await assert.rejects(
    () => handler("discord_send_message")({ channel_id: CHANNEL }),
    /At least one of content or attachments is required/,
  );
});

test("attachment items reject unknown keys like every other nested object", async () => {
  captureSends();
  await assert.rejects(
    () =>
      handler("discord_send_message")({
        channel_id: CHANNEL,
        attachments: [{ url: "https://example.com/a.png", bogus: 1 }],
      }),
    ZodError,
  );
});

test("search_guild_messages output carries attachments and conforms to its outputSchema", async () => {
  mock.method(discord.rest, "get", async () => ({
    messages: [
      [
        {
          id: MESSAGE,
          content: "see file",
          timestamp: "2026-08-01T00:00:00.000Z",
          channel_id: CHANNEL,
          author: { username: "joe", discriminator: "0" },
          attachments: [
            {
              id: "777777777777777777",
              filename: "report.pdf",
              url: "https://cdn.discordapp.com/attachments/1/2/report.pdf",
              proxy_url: "https://media.discordapp.net/attachments/1/2/report.pdf",
              size: 12345,
              content_type: "application/pdf",
            },
          ],
        },
      ],
    ],
  }));
  mock.method(
    discord.guilds,
    "fetch",
    async () => ({ channels: { cache: new Map([[CHANNEL, { name: "chan" }]]) } }) as never,
  );
  const result = await handler("discord_search_guild_messages")({ guild_id: GUILD, query: "file" });
  assert.ok(!result.isError, "a non-conforming result would come back as isError");
  const { matches } = result.structuredContent as { matches: Record<string, unknown>[] };
  assert.equal(matches[0].channel_name, "chan");
  assert.deepEqual(matches[0].attachments, [
    {
      id: "777777777777777777",
      filename: "report.pdf",
      url: "https://cdn.discordapp.com/attachments/1/2/report.pdf",
      size: 12345,
      content_type: "application/pdf",
      description: null,
    },
  ]);
});
