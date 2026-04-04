import { discord } from "../client.js";
import type { ToolModule, ToolResult } from "./types.js";

/** Tool definitions for sending direct messages to users. */
export const definitions = [
  {
    name: "discord_send_dm",
    description:
      "Send a direct message to a user by their user ID. The bot must share at least one server with the user. Creates a DM channel if one does not already exist.",
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
async function handle(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  switch (name) {
    case "discord_send_dm": {
      const user = await discord.users.fetch(args.user_id as string);
      const sent = await user.send(args.content as string);
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

export default { definitions, handle } satisfies ToolModule;
