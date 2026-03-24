/**
 * Tool registry — aggregates all tool modules and provides a unified interface
 * for listing definitions and routing tool calls to the correct handler.
 *
 * To add a new tool module:
 * 1. Create a new file in this folder (e.g. `onboarding.ts`)
 * 2. Export `definitions` and `handle()` following the ToolModule interface
 * 3. Import and add it to the `modules` array below
 */

import type { ToolModule, ToolDefinition, ToolResult } from "./types.js";

import discovery from "./discovery.js";
import messages from "./messages.js";
import channels from "./channels.js";
import permissions from "./permissions.js";
import members from "./members.js";
import roles from "./roles.js";
import moderation from "./moderation.js";
import screening from "./screening.js";
import stats from "./stats.js";
import forums from "./forums.js";
import webhooks from "./webhooks.js";
import scheduledEvents from "./scheduledEvents.js";
import invites from "./invites.js";

const modules: ToolModule[] = [
  discovery,
  messages,
  channels,
  permissions,
  members,
  roles,
  moderation,
  screening,
  stats,
  forums,
  webhooks,
  scheduledEvents,
  invites,
];

/**
 * Returns every tool definition across all modules.
 * Called once when the MCP client requests the tool list.
 */
export function getAllDefinitions(): ToolDefinition[] {
  return modules.flatMap((m) => m.definitions);
}

/**
 * Routes a tool call to the first module that recognizes the tool name.
 * @param name - The tool name (e.g. "discord_send_message").
 * @param args - The arguments passed by the MCP client.
 * @returns The tool's response.
 * @throws {Error} If no module handles the given tool name.
 */
export async function handleTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  for (const mod of modules) {
    const result = await mod.handle(name, args);
    if (result) return result;
  }
  throw new Error(`Unknown tool: ${name}`);
}
