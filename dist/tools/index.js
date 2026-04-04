"use strict";
/**
 * Tool registry — aggregates all tool modules and provides a unified interface
 * for listing definitions and routing tool calls to the correct handler.
 *
 * To add a new tool module:
 * 1. Create a new file in this folder (e.g. `onboarding.ts`)
 * 2. Export `definitions` and `handle()` following the ToolModule interface
 * 3. Import and add it to the `modules` array below
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllDefinitions = getAllDefinitions;
exports.handleTool = handleTool;
const discovery_js_1 = __importDefault(require("./discovery.js"));
const messages_js_1 = __importDefault(require("./messages.js"));
const channels_js_1 = __importDefault(require("./channels.js"));
const permissions_js_1 = __importDefault(require("./permissions.js"));
const members_js_1 = __importDefault(require("./members.js"));
const roles_js_1 = __importDefault(require("./roles.js"));
const moderation_js_1 = __importDefault(require("./moderation.js"));
const screening_js_1 = __importDefault(require("./screening.js"));
const stats_js_1 = __importDefault(require("./stats.js"));
const forums_js_1 = __importDefault(require("./forums.js"));
const webhooks_js_1 = __importDefault(require("./webhooks.js"));
const scheduledEvents_js_1 = __importDefault(require("./scheduledEvents.js"));
const invites_js_1 = __importDefault(require("./invites.js"));
const dm_js_1 = __importDefault(require("./dm.js"));
const modules = [
    discovery_js_1.default,
    messages_js_1.default,
    channels_js_1.default,
    permissions_js_1.default,
    members_js_1.default,
    roles_js_1.default,
    moderation_js_1.default,
    screening_js_1.default,
    stats_js_1.default,
    forums_js_1.default,
    webhooks_js_1.default,
    scheduledEvents_js_1.default,
    invites_js_1.default,
    dm_js_1.default,
];
/**
 * Returns every tool definition across all modules.
 * Called once when the MCP client requests the tool list.
 */
function getAllDefinitions() {
    return modules.flatMap((m) => m.definitions);
}
/**
 * Routes a tool call to the first module that recognizes the tool name.
 * @param name - The tool name (e.g. "discord_send_message").
 * @param args - The arguments passed by the MCP client.
 * @returns The tool's response.
 * @throws {Error} If no module handles the given tool name.
 */
async function handleTool(name, args) {
    for (const mod of modules) {
        const result = await mod.handle(name, args);
        if (result)
            return result;
    }
    throw new Error(`Unknown tool: ${name}`);
}
//# sourceMappingURL=index.js.map