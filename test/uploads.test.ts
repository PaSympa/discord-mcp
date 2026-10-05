import { test, mock, afterEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { ZodError } from "zod";
import { discord } from "../src/client.js";
import { resolveAttachments } from "../src/attachments.js";
import messages from "../src/tools/messages.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const HELLO = Buffer.from("hello").toString("base64");

let root: string;
let allowed: string;
let outside: string;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "discord-mcp-uploads-"));
  allowed = join(root, "allowed");
  outside = join(root, "allowed-sibling");
  await mkdir(allowed);
  await mkdir(outside);
  await writeFile(join(allowed, "report.txt"), "hello");
  await writeFile(join(allowed, "SPOILER_secret.png"), "png");
  await writeFile(join(outside, "secret.txt"), "secret");
  await symlink(join(outside, "secret.txt"), join(allowed, "link.txt"));
});

after(() => rm(root, { recursive: true, force: true }));

afterEach(() => {
  delete process.env.DISCORD_UPLOAD_DIRS;
  mock.restoreAll();
});

// ─── local files ─────────────────────────────────────────────────────────────

test("resolveAttachments returns undefined when no file is requested", async () => {
  assert.equal(await resolveAttachments(undefined), undefined);
});

test("a local file is refused while DISCORD_UPLOAD_DIRS is unset", async () => {
  await assert.rejects(
    resolveAttachments([join(allowed, "report.txt")]),
    /uploads from disk are disabled: set DISCORD_UPLOAD_DIRS to a .*-separated list/,
  );
  process.env.DISCORD_UPLOAD_DIRS = " ";
  await assert.rejects(
    resolveAttachments([{ path: join(allowed, "report.txt") }]),
    /uploads from disk are disabled/,
  );
});

test("a path attaches a file inside an allowed directory under its own name", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  const files = await resolveAttachments([join(allowed, "report.txt")]);
  assert.equal(files?.length, 1);
  assert.equal(files?.[0].name, "report.txt");
  assert.equal(files?.[0].description, null);
});

test("the variable lists directories separated like PATH, and a comma is part of a path", async () => {
  const first = join(root, "first,dir");
  await mkdir(first);
  await writeFile(join(first, "a.txt"), "a");
  process.env.DISCORD_UPLOAD_DIRS = ` ${first}${delimiter}${allowed}${delimiter}`;
  const files = await resolveAttachments([join(first, "a.txt"), join(allowed, "report.txt")]);
  assert.deepEqual(
    files?.map((f) => f.name),
    ["a.txt", "report.txt"],
  );
  await assert.rejects(
    resolveAttachments([join(outside, "secret.txt")]),
    /outside the directories/,
  );
});

test("an object gives a local file a name, an alt text and a spoiler flag", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  const files = await resolveAttachments([
    join(allowed, "report.txt"),
    {
      path: join(allowed, "report.txt"),
      filename: "renamed.md",
      description: "A short report",
      spoiler: true,
    },
    { path: join(allowed, "report.txt"), spoiler: true },
  ]);
  assert.deepEqual(
    files?.map((f) => [f.name, f.description, f.spoiler]),
    [
      ["report.txt", null, false],
      ["SPOILER_renamed.md", "A short report", true],
      ["SPOILER_report.txt", null, true],
    ],
  );
});

test("spoiler false removes the prefix of a file that already has it, absent keeps it", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  const path = join(allowed, "SPOILER_secret.png");
  const files = await resolveAttachments([path, { path, spoiler: false }, { path, spoiler: true }]);
  assert.deepEqual(
    files?.map((f) => f.name),
    ["SPOILER_secret.png", "secret.png", "SPOILER_secret.png"],
  );
});

test("an object is checked against the allowed directories like a path", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  await assert.rejects(
    resolveAttachments([{ path: join(outside, "secret.txt"), filename: "ok.txt" }]),
    /outside the directories/,
  );
  await assert.rejects(resolveAttachments([{ path: "report.txt" }]), /must be absolute/);
});

test("resolveAttachments refuses relative paths", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  await assert.rejects(resolveAttachments(["report.txt"]), /must be absolute/);
});

test("resolveAttachments refuses a file outside the allowed directories", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  await assert.rejects(
    resolveAttachments([join(outside, "secret.txt")]),
    /outside the directories/,
  );
});

test("resolveAttachments refuses a symlink that points out of an allowed directory", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  await assert.rejects(resolveAttachments([join(allowed, "link.txt")]), /outside the directories/);
});

test("resolveAttachments refuses a directory", async () => {
  process.env.DISCORD_UPLOAD_DIRS = root;
  await assert.rejects(resolveAttachments([allowed]), /Not a regular file/);
});

// ─── base64 data ─────────────────────────────────────────────────────────────

test("base64 data becomes a file of that name and content, without any allowed directory", async () => {
  const files = await resolveAttachments([
    { data: HELLO, filename: "hello.txt" },
    { data: HELLO, filename: "alt.txt", description: "A greeting", spoiler: true },
  ]);
  assert.deepEqual(
    files?.map((f) => [f.name, f.description, f.spoiler]),
    [
      ["hello.txt", null, false],
      ["SPOILER_alt.txt", "A greeting", true],
    ],
  );
  assert.equal(Buffer.from(files![0].attachment as Buffer).toString(), "hello");
});

test("data and local files mix in one call, and the files from disk still need the variable", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  const files = await resolveAttachments([
    { data: HELLO, filename: "hello.txt" },
    join(allowed, "report.txt"),
  ]);
  assert.deepEqual(
    files?.map((f) => f.name),
    ["hello.txt", "report.txt"],
  );
  delete process.env.DISCORD_UPLOAD_DIRS;
  await assert.rejects(
    resolveAttachments([{ data: HELLO, filename: "hello.txt" }, join(allowed, "report.txt")]),
    /uploads from disk are disabled/,
  );
});

// ─── what the tools accept ───────────────────────────────────────────────────

function captureSends() {
  const sends: Record<string, unknown>[] = [];
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    send: async (options: Record<string, unknown>) => {
      sends.push(options);
      return { id: "555555555555555555" };
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  return sends;
}

test("send_message attaches the resolved files and stays text-only without any", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  const sends = captureSends();
  const send = messages.handlers.get("discord_send_message")!;

  await send({ channel_id: CHANNEL, content: "text only" });
  assert.equal(sends[0].files, undefined);

  await send({
    channel_id: CHANNEL,
    content: "with file",
    attachments: [
      { path: join(allowed, "report.txt"), description: "alt", spoiler: true },
      { data: HELLO, filename: "hello.txt" },
    ],
  });
  const files = sends[1].files as { name: string; description: string | null }[];
  assert.deepEqual(
    files.map((f) => [f.name, f.description]),
    [
      ["SPOILER_report.txt", "alt"],
      ["hello.txt", null],
    ],
  );
});

test("a bad attachment item is refused before anything is sent", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  const sends = captureSends();
  const send = messages.handlers.get("discord_send_message")!;
  const path = join(allowed, "report.txt");
  for (const attachments of [
    [{ filename: "no-source.txt" }],
    [{ path, data: HELLO, filename: "both.txt" }],
    [{ data: HELLO }],
    [{ data: "not base64!", filename: "bad.txt" }],
    [{ data: HELLO.replace("=", ""), filename: "unpadded.txt" }],
    [{ url: "https://example.com/a.png" }],
    [{ path, url: "https://example.com/a.png" }],
    [{ path, filename: "dir/name.txt" }],
    [{ data: HELLO, filename: "dir\\name.txt" }],
    [{ path, description: "x".repeat(1025) }],
    [{ path, spoiler: "yes" }],
    [{ path, bogus: 1 }],
    Array.from({ length: 11 }, () => path),
    [],
    [""],
  ])
    await assert.rejects(
      send({ channel_id: CHANNEL, content: "x", attachments }),
      ZodError,
      JSON.stringify(attachments).slice(0, 70),
    );
  assert.deepEqual(sends, []);
});

test("a large base64 file passes the validation", async () => {
  const sends = captureSends();
  const big = Buffer.alloc(8 * 1024 * 1024, 1).toString("base64");
  await messages.handlers.get("discord_send_message")!({
    channel_id: CHANNEL,
    attachments: [{ data: big, filename: "big.bin" }],
  });
  assert.equal(sends.length, 1);
});

test("the send tools advertise attachments as an optional list of paths or objects", () => {
  for (const name of [
    "discord_send_message",
    "discord_reply_message",
    "discord_send_embed",
    "discord_send_multiple_embeds",
  ]) {
    const schema = messages.definitions.find((d) => d.name === name)!.inputSchema as {
      required: string[];
      properties: Record<string, { description?: string; items?: { anyOf?: unknown[] } }>;
    };
    assert.ok(schema.properties.attachments, `${name} must advertise attachments`);
    assert.ok(!schema.required.includes("attachments"), `${name}: attachments must stay optional`);
    assert.equal(
      schema.properties.attachments.items?.anyOf?.length,
      3,
      "a path, an object with a path, an object with data",
    );
    assert.match(schema.properties.attachments.description ?? "", /DISCORD_UPLOAD_DIRS/);
  }
});
