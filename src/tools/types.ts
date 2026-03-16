/** Schema definition for a single MCP tool, describing its name, purpose, and expected input. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Standard response returned by every tool handler. */
export interface ToolResult {
  [key: string]: unknown;
  content: { type: string; text: string }[];
  isError?: boolean;
}

/**
 * Contract every tool module must satisfy.
 * - `definitions`: the tools this module exposes to the MCP client.
 * - `handle()`: attempts to execute a tool by name; returns `null` if the name doesn't belong to this module.
 */
export interface ToolModule {
  definitions: ToolDefinition[];
  handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null>;
}
