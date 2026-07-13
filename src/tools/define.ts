import { z } from "zod";
import { isGuildAllowed } from "../client.js";
import type { ToolModule, ToolDefinition, ToolResult, ToolAnnotations } from "./types.js";

/** A Discord snowflake ID: a 17–20 digit string. Reused by every tool that takes an ID. */
export const snowflake = z
  .string()
  .regex(/^\d{17,20}$/, "Must be a Discord snowflake ID (17-20 digits).");

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
function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/**
 * Converts a zod schema into the JSON Schema MCP advertises as a tool's `outputSchema`.
 * `io: "output"` emits the post-parse view; the `$schema` key is stripped (bare object
 * schema). MCP requires an object root, so the schema must be a `z.object({...})`.
 */
function toOutputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
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
 * A registered tool: its public metadata plus a `run` that validates raw args
 * with its zod schema before handing typed values to the handler.
 */
interface RegisteredTool {
  name: string;
  description: string;
  annotations?: ToolAnnotations;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<ToolResult>;
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
 * values already typed and checked — no `as` casts, no schema/handler drift.
 * Unknown argument keys are rejected (`additionalProperties: false`).
 * An optional `outputSchema` (a `z.object`) derives the advertised `outputSchema`
 * and checks the handler's `structuredContent` against it on the way out: a
 * conforming result is normalised (unknown keys dropped, text block regenerated to
 * match); a non-conforming one is rejected — the call returns an `isError` result
 * and the mismatch is logged, because conformance is a spec MUST and SDK clients
 * reject non-conforming results anyway.
 */
export function defineTool<S extends z.ZodType>(tool: {
  name: string;
  description: string;
  annotations?: ToolAnnotations;
  schema: S;
  outputSchema?: z.ZodType;
  handle(args: z.infer<S>): Promise<ToolResult>;
}): RegisteredTool {
  const { outputSchema } = tool;
  const schema = strictInput(tool.schema);
  return {
    name: tool.name,
    description: tool.description,
    annotations: tool.annotations,
    inputSchema: toInputSchema(schema),
    outputSchema: outputSchema ? toOutputSchema(outputSchema) : undefined,
    run: async (args) => {
      const result = await tool.handle(schema.parse(args));
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
