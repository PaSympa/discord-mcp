/**
 * MCP tool behavioral hints (advisory, not guarantees). See the MCP spec
 * "tool annotations": readOnlyHint (only reads, never mutates), destructiveHint
 * (may perform irreversible updates: delete/ban/prune), idempotentHint (repeat
 * calls with same args add no effect), openWorldHint (talks to an external API,
 * always true here). title is a human-readable display name.
 */
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * Schema definition for a single MCP tool: its name, purpose, and expected input.
 * `outputSchema` is the JSON Schema (object root) of the tool's `structuredContent`,
 * present only on tools that return structured output.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
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

/** Validates and executes a single tool call, returning its result. */
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Contract every tool module must satisfy: the tool definitions it exposes to the
 * client, and a name→handler map the registry merges into one O(1) dispatch table.
 */
export interface ToolModule {
  definitions: ToolDefinition[];
  handlers: ReadonlyMap<string, ToolHandler>;
}
