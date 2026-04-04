"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.definitions = void 0;
exports.handle = handle;
const client_js_1 = require("../client.js");
/** Tool definitions for server moderation (audit log). */
exports.definitions = [
    {
        name: "discord_get_audit_log",
        description: "Fetch the guild audit log (who did what and when).",
        inputSchema: {
            type: "object",
            properties: {
                guild_id: { type: "string" },
                limit: { type: "number", description: "1–100, default 25." },
                action_type: { type: "number", description: "Optional: filter by Discord action type ID." },
            },
            required: ["guild_id"],
        },
    },
];
/**
 * Handles moderation tools: fetches the guild audit log
 * with optional filtering by action type.
 */
async function handle(name, args) {
    switch (name) {
        case "discord_get_audit_log": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            const logs = await guild.fetchAuditLogs({
                limit: Math.min(Number(args.limit ?? 25), 100),
                type: args.action_type,
            });
            const result = logs.entries.map((entry) => ({
                id: entry.id, action: entry.action,
                executor: entry.executor?.tag, target: entry.targetId,
                reason: entry.reason, createdAt: entry.createdAt.toISOString(),
            }));
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        default:
            return null;
    }
}
exports.default = { definitions: exports.definitions, handle };
//# sourceMappingURL=moderation.js.map