import { z } from "zod";
import { isGuildAllowed } from "../client.js";
import { MAX_FETCH_LIMIT } from "../constants.js";
import type {
  ObjectSchema,
  ToolModule,
  ToolDefinition,
  ToolResult,
  ToolAnnotations,
  ToolContext,
} from "./types.js";

/** A Discord snowflake ID: a 17–20 digit string. Reused by every tool that takes an ID. */
export const snowflake = z
  .string()
  .regex(/^\d{17,20}$/, "Must be a Discord snowflake ID (17-20 digits).");

export const channelId = snowflake.describe("ID (snowflake) of the channel or thread.");
export const messageId = snowflake.describe("ID of the message.");

const MAX_SNOWFLAKE = 2n ** 64n - 1n;
const digitsOnly = (id: string) => /^\d+$/.test(id);

/**
 * 1 to `max` distinct snowflakes, each in canonical form: with a leading zero, two strings
 * name the same ID, and one above 64 bits makes Discord refuse the whole request. zod runs
 * every check even after a failed one, so BigInt only sees digit strings. The uniqueness
 * refine has no JSON Schema form, so `meta` advertises it as `uniqueItems`.
 */
export const snowflakeSet = (max: number) =>
  z
    .array(
      snowflake.refine(
        (id) => !digitsOnly(id) || (!id.startsWith("0") && BigInt(id) <= MAX_SNOWFLAKE),
        `Must be a Discord snowflake ID: no leading zero, at most ${MAX_SNOWFLAKE}.`,
      ),
    )
    .min(1)
    .max(max)
    .refine(
      (ids) => new Set(ids.map((id) => (digitsOnly(id) ? BigInt(id) : id))).size === ids.length,
      "IDs must not repeat.",
    )
    .meta({ uniqueItems: true });

/**
 * The `guild_id` field, identical across nearly every guild-scoped tool. When
 * `DISCORD_ALLOWED_GUILDS` is set, ids outside the allow-list are rejected at parse time.
 */
export const guildId = snowflake
  .refine(isGuildAllowed, "guild_id is not in the DISCORD_ALLOWED_GUILDS allow-list.")
  .describe("Discord server (guild) ID (snowflake).");

/**
 * A bounded integer field: rejects non-integers and out-of-range values at parse
 * time and emits `type: "integer"` + `minimum`/`maximum` into the JSON Schema, so
 * the advertised input contract matches what the handler actually accepts. Append
 * `.default(n)` for an optional field with a default, or `.optional()` for one with none.
 */
export const intIn = (min: number, max: number) => z.int().min(min).max(max);

/**
 * Text of at most `max` characters, advertised as `maxLength`. Counted in code points, as
 * JSON Schema counts `maxLength`: zod 4.3, which package.json still accepts, counts UTF-16
 * units in `.max()` and would refuse an emoji-heavy text the advertised schema allows.
 */
export const textUpTo = (max: number) =>
  z
    .string()
    .refine((text) => text.length <= max || [...text].length <= max, {
      message: `Must be at most ${max} characters.`,
    })
    .meta({ maxLength: max });

/** A message's text: Discord caps message content at 2000 characters. */
export const messageText = textUpTo(2000);

/** Output fields naming who sent a message. Discord also sets a webhook ID on an app's reply to a command. */
export const messageAuthorShape = { author_id: z.string(), webhook_id: z.string().optional() };

export function messageAuthor(authorId: string, webhookId: string | null | undefined) {
  return { author_id: authorId, ...(webhookId ? { webhook_id: webhookId } : {}) };
}

/**
 * An http(s)-only URL. Bare `z.url()` accepts any WHATWG scheme (javascript:,
 * ftp:, mailto:…) that Discord rejects for clickable/image links. The protocol
 * regex is unrepresentable in JSON Schema, so `meta` advertises it as a pattern.
 */
export const httpUrl = z.url({ protocol: /^https?$/ }).meta({ pattern: "^https?://" });

/**
 * Converts a zod schema into the JSON Schema shape MCP sends over the wire.
 * `io: "input"` emits the input view (so `.default()`s stay optional); the `$schema`
 * key zod adds is stripped because MCP `inputSchema` is a bare object schema.
 */
function toInputSchema(schema: z.ZodType): ObjectSchema {
  const json = z.toJSONSchema(schema, { io: "input" }) as ObjectSchema;
  delete json.$schema;
  return json;
}

/**
 * Converts a zod schema into the JSON Schema MCP advertises as a tool's `outputSchema`.
 * `io: "output"` emits the post-parse view; the `$schema` key is stripped (bare object
 * schema). MCP requires an object root, so the schema must be a `z.object({...})`.
 */
function toOutputSchema(schema: z.ZodType): ObjectSchema {
  const json = z.toJSONSchema(schema, { io: "output" }) as ObjectSchema;
  delete json.$schema;
  return json;
}

/**
 * Builds a dual-output result: a human-readable JSON text block plus the same data
 * as machine-readable `structuredContent`. Pass an object (wrap arrays as
 * `{ items: [...] }`) so it conforms to the tool's object-root `outputSchema`.
 */
export function structured(data: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

/**
 * One page of a list Discord serves in ID order behind an `after` cursor, at most 100 per
 * call (reaction users, poll voters). One extra entry tells whether a next page exists; a
 * full page of 100 leaves no room for it, so a one-entry probe asks instead.
 */
export async function fetchPageAfter<T extends { id: string }>(
  fetchPage: (query: { after?: string; limit: number }) => Promise<ReadonlyMap<string, T>>,
  after: string | undefined,
  limit: number,
): Promise<{ items: T[]; hasMore: boolean; nextAfter: string | null }> {
  const page = [
    ...(await fetchPage({ after, limit: Math.min(limit + 1, MAX_FETCH_LIMIT) })).values(),
  ];
  const items = page.slice(0, limit);
  const last = items.at(-1);
  const more =
    page.length > limit ||
    (last !== undefined &&
      items.length === MAX_FETCH_LIMIT &&
      (await fetchPage({ after: last.id, limit: 1 })).size > 0);
  const nextAfter = more && last ? last.id : null;
  return { items, hasMore: nextAfter !== null, nextAfter };
}

/**
 * A registered tool: its public metadata plus a `run` that validates raw args
 * with its zod schema before handing typed values to the handler.
 */
interface RegisteredTool {
  name: string;
  description: string;
  annotations?: ToolAnnotations;
  inputSchema: ObjectSchema;
  outputSchema?: ObjectSchema;
  run(args: Record<string, unknown>, ctx?: ToolContext): Promise<ToolResult>;
}

/**
 * Rejects unknown argument keys instead of silently stripping them, and the
 * derived JSON Schema advertises it (`additionalProperties: false`). `.strict()`
 * preserves the shape and object-level checks, so the cast keeps S's inference.
 */
function strictInput<S extends z.ZodType>(schema: S): S {
  return schema instanceof z.ZodObject ? (schema.strict() as unknown as S) : schema;
}

/**
 * Declares one tool from a single source of truth: the zod `schema` derives the
 * client-facing `inputSchema` and validates incoming args, so `handle` receives
 * values already typed and checked: no `as` casts, no schema/handler drift.
 * Unknown argument keys are rejected (`additionalProperties: false`).
 * An optional `outputSchema` (a `z.object`) derives the advertised `outputSchema`
 * and checks the handler's `structuredContent` against it on the way out: a
 * conforming result is normalised (unknown keys dropped, text block regenerated to
 * match); a non-conforming one is rejected: the call returns an `isError` result
 * and the mismatch is logged, because conformance is a spec MUST and SDK clients
 * reject non-conforming results anyway.
 */
export function defineTool<S extends z.ZodType>(tool: {
  name: string;
  description: string;
  annotations?: ToolAnnotations;
  schema: S;
  outputSchema?: z.ZodType;
  handle(args: z.infer<S>, ctx: ToolContext): Promise<ToolResult>;
}): RegisteredTool {
  const { outputSchema } = tool;
  const schema = strictInput(tool.schema);
  return {
    name: tool.name,
    description: tool.description,
    annotations: tool.annotations,
    inputSchema: toInputSchema(schema),
    outputSchema: outputSchema ? toOutputSchema(outputSchema) : undefined,
    run: async (args, ctx = {}) => {
      const result = await tool.handle(schema.parse(args), ctx);
      if (outputSchema && result.structuredContent !== undefined) {
        const parsed = outputSchema.safeParse(result.structuredContent);
        if (parsed.success) {
          result.structuredContent = parsed.data as Record<string, unknown>;
          result.content = [{ type: "text", text: JSON.stringify(parsed.data, null, 2) }];
        } else {
          console.error(
            `[${tool.name}] structuredContent does not match outputSchema:`,
            parsed.error.issues,
          );
          return {
            content: [
              {
                type: "text",
                text: `❌ Internal error: ${tool.name} produced output that does not match its declared outputSchema. Please report this at https://github.com/PaSympa/discord-mcp/issues.`,
              },
            ],
            isError: true,
          };
        }
      }
      return result;
    },
  };
}

/**
 * Assembles a list of {@link defineTool} tools into a {@link ToolModule}: their
 * client-facing definitions and a name→handler map the registry merges for O(1)
 * dispatch. Validation runs inside each tool's `run`.
 * @throws {Error} If two tools in the list share a name.
 */
export function defineModule(tools: RegisteredTool[]): ToolModule {
  const definitions: ToolDefinition[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    annotations: t.annotations,
    inputSchema: t.inputSchema,
    ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
  }));
  const handlers = new Map<string, RegisteredTool["run"]>();
  for (const t of tools) {
    if (handlers.has(t.name)) throw new Error(`Duplicate tool name in module: ${t.name}`);
    handlers.set(t.name, t.run);
  }
  return { definitions, handlers };
}
