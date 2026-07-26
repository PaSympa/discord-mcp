/**
 * Tool registry: aggregates all tool modules and provides a unified interface
 * for listing definitions and routing tool calls to the correct handler.
 *
 * To add a new tool module:
 * 1. Create a new file in this folder (e.g. `onboarding.ts`)
 * 2. Build it with `defineModule([...])` and default-export the result
 * 3. Import and add it to `allToolsets` below (the key is its `DISCORD_MCP_TOOLSETS` name)
 */

import type { ToolModule, ToolDefinition, ToolHandler, ToolResult } from "./types.js";

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
import dm from "./dm.js";

/** Every toolset, keyed by the name used in the `DISCORD_MCP_TOOLSETS` env var. */
const allToolsets: Record<string, ToolModule> = {
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
  scheduled_events: scheduledEvents,
  invites,
  dm,
};

/**
 * Selects which toolsets to expose from `DISCORD_MCP_TOOLSETS` (comma-separated,
 * case-insensitive). Unset, empty, or `all` exposes everything; unknown names throw
 * at startup: a typo must not silently expose the full destructive surface.
 */
export function selectModules(): ToolModule[] {
  const raw = process.env.DISCORD_MCP_TOOLSETS?.trim();
  if (!raw) return Object.values(allToolsets);
  const names = [
    ...new Set(
      raw
        .split(",")
        .map((n) => n.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (names.includes("all")) return Object.values(allToolsets);
  const unknown = names.filter((n) => !(n in allToolsets));
  if (unknown.length > 0 || names.length === 0) {
    throw new Error(
      `Invalid DISCORD_MCP_TOOLSETS: unknown toolset(s) ${unknown.map((n) => `"${n}"`).join(", ") || "(none selected)"}. ` +
        `Known: all, ${Object.keys(allToolsets).join(", ")}.`,
    );
  }
  return names.map((n) => allToolsets[n]);
}

const modules: ToolModule[] = selectModules();

/** One O(1) name→handler table merged from every module, built once at load. */
const registry: Map<string, ToolHandler> = (() => {
  const map = new Map<string, ToolHandler>();
  for (const mod of modules) {
    for (const [name, handler] of mod.handlers) {
      if (map.has(name)) throw new Error(`Duplicate tool name across modules: ${name}`);
      map.set(name, handler);
    }
  }
  return map;
})();

/**
 * Returns every tool definition across all modules.
 * Called on each tools/list request from the MCP client.
 */
export function getAllDefinitions(): ToolDefinition[] {
  return modules.flatMap((m) => m.definitions);
}

/** True if a tool with this name is registered (and not gated off). */
export function hasTool(name: string): boolean {
  return registry.has(name);
}

/**
 * Routes a tool call to its handler via the merged registry.
 * @throws {Error} If no tool owns the given name.
 */
export async function handleTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const handler = registry.get(name);
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  return handler(args);
}
