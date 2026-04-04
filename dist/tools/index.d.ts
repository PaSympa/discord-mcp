/**
 * Tool registry — aggregates all tool modules and provides a unified interface
 * for listing definitions and routing tool calls to the correct handler.
 *
 * To add a new tool module:
 * 1. Create a new file in this folder (e.g. `onboarding.ts`)
 * 2. Export `definitions` and `handle()` following the ToolModule interface
 * 3. Import and add it to the `modules` array below
 */
import type { ToolDefinition, ToolResult } from "./types.js";
/**
 * Returns every tool definition across all modules.
 * Called once when the MCP client requests the tool list.
 */
export declare function getAllDefinitions(): ToolDefinition[];
/**
 * Routes a tool call to the first module that recognizes the tool name.
 * @param name - The tool name (e.g. "discord_send_message").
 * @param args - The arguments passed by the MCP client.
 * @returns The tool's response.
 * @throws {Error} If no module handles the given tool name.
 */
export declare function handleTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
//# sourceMappingURL=index.d.ts.map