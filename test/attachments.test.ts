import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const MESSAGE = "555555555555555555";

afterEach(() => mock.restoreAll());

/** Stubs the channel lookup so the message fetch returns the given attachments. */
function stubMessageWith(attachments: Map<string, unknown>): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [];
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    messages: {
      fetch: async (options: Record<string, unknown>) => {
        calls.push(options);
        return { id: MESSAGE, attachments };
      },
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  return calls;
}

const getAttachments = () => messages.handlers.get("discord_get_message_attachments")!;

test("get_message_attachments advertises both ids as required and is read-only", () => {
  const definition = messages.definitions.find((d) => d.name === "discord_get_message_attachments");
  assert.ok(definition, "discord_get_message_attachments should be defined");
  const schema = definition.inputSchema as {
    required: string[];
    additionalProperties: boolean;
  };
  assert.deepEqual(schema.required.toSorted(), ["channel_id", "message_id"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(definition.annotations?.readOnlyHint, true);
  assert.ok(definition.outputSchema, "structured output must be advertised");
});

test("get_message_attachments maps every attachment field including nullable ones", async () => {
  const attachments = new Map([
    [
      "777777777777777777",
      {
        id: "777777777777777777",
        name: "report.pdf",
        contentType: "application/pdf",
        size: 12345,
        url: "https://cdn.discordapp.com/attachments/1/2/report.pdf?ex=abc",
        proxyURL: "https://media.discordapp.net/attachments/1/2/report.pdf",
        width: null,
        height: null,
        description: null,
        title: null,
        duration: null,
        waveform: null,
        spoiler: false,
      },
    ],
    [
      "888888888888888888",
      {
        // Discord strips non-ASCII from the filename and keeps the original in title.
        id: "888888888888888888",
        name: "c953b519a8c28c42.png",
        contentType: "image/png",
        size: 54321,
        url: "https://cdn.discordapp.com/attachments/1/3/c953b519a8c28c42.png?ex=def",
        proxyURL: "https://media.discordapp.net/attachments/1/3/c953b519a8c28c42.png",
        width: 800,
        height: 600,
        description: "a cat",
        title: "전시부스 안내",
        duration: null,
        waveform: null,
        // A plain name, so a name-prefix check could not pass this: spoiler is flag-based.
        spoiler: true,
      },
    ],
    [
      "999999999999999999",
      {
        id: "999999999999999999",
        name: "voice-message.ogg",
        contentType: "audio/ogg",
        size: 4321,
        url: "https://cdn.discordapp.com/attachments/1/4/voice-message.ogg?ex=ghi",
        proxyURL: "https://media.discordapp.net/attachments/1/4/voice-message.ogg",
        width: null,
        height: null,
        description: null,
        title: null,
        duration: 3.2,
        waveform: "AAECAwQ=",
        spoiler: false,
      },
    ],
  ]);
  const calls = stubMessageWith(attachments);
  const result = await getAttachments()({ channel_id: CHANNEL, message_id: MESSAGE });
  assert.equal(calls[0].message, MESSAGE, "the requested message must be the one fetched");
  assert.equal(calls[0].cache, false, "the fetched message must not be stored in the cache");
  const structured = result.structuredContent as { attachments: Record<string, unknown>[] };
  assert.equal(structured.attachments.length, 3);
  assert.deepEqual(structured.attachments[0], {
    id: "777777777777777777",
    filename: "report.pdf",
    contentType: "application/pdf",
    size: 12345,
    url: "https://cdn.discordapp.com/attachments/1/2/report.pdf?ex=abc",
    proxyUrl: "https://media.discordapp.net/attachments/1/2/report.pdf",
    width: null,
    height: null,
    description: null,
    title: null,
    duration: null,
    waveform: null,
    spoiler: false,
  });
  assert.equal(structured.attachments[1].spoiler, true);
  assert.equal(structured.attachments[1].width, 800);
  assert.equal(structured.attachments[1].filename, "c953b519a8c28c42.png");
  assert.equal(structured.attachments[1].title, "전시부스 안내");
  assert.equal(structured.attachments[2].duration, 3.2);
  assert.equal(structured.attachments[2].waveform, "AAECAwQ=");
});

test("get_message_attachments returns an empty list for a message with no attachments", async () => {
  stubMessageWith(new Map());
  const result = await getAttachments()({ channel_id: CHANNEL, message_id: MESSAGE });
  assert.deepEqual(result.structuredContent, { attachments: [] });
  assert.ok(!result.isError);
});
