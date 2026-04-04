"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.definitions = void 0;
const client_js_1 = require("../client.js");
/** Tool definitions for sending direct messages to users. */
exports.definitions = [
    {
        name: "discord_send_dm",
        description: "Send a direct message to a user by their user ID. The bot must share at least one server with the user. Creates a DM channel if one does not already exist.",
        inputSchema: {
            type: "object",
            properties: {
                user_id: {
                    type: "string",
                    description: "The Discord user ID to send the DM to.",
                },
                content: {
                    type: "string",
                    description: "The message content to send.",
                },
            },
            required: ["user_id", "content"],
        },
    },
];
/** Handles direct message tools. */
async function handle(name, args) {
    switch (name) {
        case "discord_send_dm": {
            const user = await client_js_1.discord.users.fetch(args.user_id);
            const sent = await user.send(args.content);
            return {
                content: [
                    {
                        type: "text",
                        text: `✅ DM sent to ${user.tag} (message id: ${sent.id}).`,
                    },
                ],
            };
        }
        default:
            return null;
    }
}
exports.default = { definitions: exports.definitions, handle };
//# sourceMappingURL=dm.js.map