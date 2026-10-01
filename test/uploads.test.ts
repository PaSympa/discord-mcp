import { test, mock, afterEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discord } from "../src/client.js";
import { resolveUploads } from "../src/uploads.js";
import messages from "../src/tools/messages.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";

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
  await writeFile(join(outside, "secret.txt"), "secret");
  await symlink(join(outside, "secret.txt"), join(allowed, "link.txt"));
});

after(() => rm(root, { recursive: true, force: true }));

afterEach(() => {
  delete process.env.DISCORD_UPLOAD_DIRS;
  mock.restoreAll();
});

test("resolveUploads returns undefined when no file is requested", async () => {
  assert.equal(await resolveUploads(undefined), undefined);
});

test("resolveUploads refuses every upload while DISCORD_UPLOAD_DIRS is unset", async () => {
  await assert.rejects(resolveUploads([join(allowed, "report.txt")]), /uploads are disabled/);
});

test("resolveUploads attaches a file inside an allowed directory under its own name", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  const files = await resolveUploads([join(allowed, "report.txt")]);
  assert.equal(files?.length, 1);
  assert.equal(files?.[0].name, "report.txt");
});

test("resolveUploads refuses relative paths", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  await assert.rejects(resolveUploads(["report.txt"]), /must be absolute/);
});

test("resolveUploads refuses a file outside the allowed directories", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  await assert.rejects(resolveUploads([join(outside, "secret.txt")]), /outside the directories/);
});

test("resolveUploads refuses a symlink that points out of an allowed directory", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
  await assert.rejects(resolveUploads([join(allowed, "link.txt")]), /outside the directories/);
});

test("resolveUploads refuses a directory", async () => {
  process.env.DISCORD_UPLOAD_DIRS = root;
  await assert.rejects(resolveUploads([allowed]), /Not a regular file/);
});

test("send_message attaches the resolved files and stays text-only without any", async () => {
  process.env.DISCORD_UPLOAD_DIRS = allowed;
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
  const send = messages.handlers.get("discord_send_message")!;

  await send({ channel_id: CHANNEL, content: "text only" });
  assert.equal(sends[0].files, undefined);

  const result = await send({
    channel_id: CHANNEL,
    content: "with file",
    files: [join(allowed, "report.txt")],
  });
  assert.equal((sends[1].files as unknown[]).length, 1);
  assert.match(result.content[0].text, /with 1 file\./);
});

test("send_message and reply_message advertise files as an optional field", () => {
  for (const name of ["discord_send_message", "discord_reply_message"]) {
    const schema = messages.definitions.find((d) => d.name === name)!.inputSchema as {
      required: string[];
      properties: Record<string, { description?: string }>;
    };
    assert.ok(schema.properties.files, `${name} must advertise files`);
    assert.ok(!schema.required.includes("files"), `${name}: files must stay optional`);
  }
});
