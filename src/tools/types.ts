/**
 * MCP tool behavioral hints (advisory, not guarantees). See the MCP spec
 * "tool annotations": readOnlyHint (only reads, never mutates), destructiveHint
 * (delete/ban/prune, or a write that can lose state no tool can restore),
 * idempotentHint (repeat calls with same args add no effect, even when the repeat
 * fails because the target is already gone), openWorldHint (talks to an external
 * API, always true here). title is a human-readable display name.
 */
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** A JSON Schema with an object root: the SDK types tool schemas with the literal `type: "object"`. */
export type ObjectSchema = { type: "object"; [key: string]: unknown };

/**
 * Schema definition for a single MCP tool: its name, purpose, and expected input.
 * `outputSchema` is the JSON Schema (object root) of the tool's `structuredContent`,
 * present only on tools that return structured output.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ObjectSchema;
  outputSchema?: ObjectSchema;
  annotations?: ToolAnnotations;
}

/**
 * Standard response returned by every tool handler: a subset of the SDK's
 * `CallToolResult`. Handlers only ever emit text blocks; `structuredContent` is an
 * optional machine-readable mirror conforming to the tool's `outputSchema` when one
 * is declared. The index signature mirrors the SDK's passthrough `Result` (which
 * carries `_meta` and keeps the value assignable to `CallToolResult`).
 */
export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Per-call context. `signal` aborts when the client cancels the request. `progress`
 * reports how many items of `total` a batch has handled; it never throws, and `progress`
 * must grow with each report.
 *
 * `confirm` is present when the client can ask its user, and the tools with a dry run call
 * it before a real change. It throws to stop the handler, the first time to ask: the SDK
 * then runs the handler again with the answer, and `confirm` returns only if the user
 * confirmed. So nothing that changes Discord may run before it, and what runs before it
 * runs twice. `message` is built only on the run that asks.
 */
export interface ToolContext {
  signal?: AbortSignal;
  progress?: (progress: number, total: number) => void;
  confirm?: (message: () => string | Promise<string>) => Promise<void>;
}

/** Validates and executes a single tool call, returning its result. */
export type ToolHandler = (args: Record<string, unknown>, ctx?: ToolContext) => Promise<ToolResult>;

/**
 * Contract every tool module must satisfy: the tool definitions it exposes to the
 * client, and a name→handler map the registry merges into one O(1) dispatch table.
 */
export interface ToolModule {
  definitions: ToolDefinition[];
  handlers: ReadonlyMap<string, ToolHandler>;
}
