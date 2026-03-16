import { discord, validateId } from "../client.js";
import type { ToolModule, ToolResult } from "./types.js";

/** Tool definitions for reading and updating the guild membership screening form. */
export const definitions = [
  {
    name: "discord_get_membership_screening",
    description: "Get the current membership screening form (rules/questions new members must complete).",
    inputSchema: {
      type: "object",
      properties: { guild_id: { type: "string" } },
      required: ["guild_id"],
    },
  },
  {
    name: "discord_update_membership_screening",
    description: "Update the membership screening form: set a description and rules/questions that new members must agree to before joining.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        description: { type: "string", description: "Welcome message shown at the top of the screening form." },
        form_fields: {
          type: "array",
          description: "List of rules/questions. Each item has: label (the rule title), values (array of rule lines), required (boolean).",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Title/question for this field." },
              values: { type: "array", items: { type: "string" }, description: "Array of rule lines or answer options." },
              required: { type: "boolean", description: "Whether this field is required (default true)." },
            },
            required: ["label", "values"],
          },
        },
      },
      required: ["guild_id"],
    },
  },
];

/**
 * Handles membership screening tools: fetch the current verification form
 * and update it with new descriptions/rules via the Discord REST API.
 */
export async function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
  switch (name) {
    case "discord_get_membership_screening": {
      const guildId = validateId(args.guild_id, "guild_id");
      const data = await discord.rest.get(`/guilds/${guildId}/member-verification`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    case "discord_update_membership_screening": {
      const guildId = validateId(args.guild_id, "guild_id");
      const current = await discord.rest.get(`/guilds/${guildId}/member-verification`) as Record<string, unknown>;
      const body: Record<string, unknown> = { version: current.version };
      if (args.description !== undefined) body.description = args.description as string;
      if (args.form_fields !== undefined) {
        const fields = args.form_fields as { label: string; values: string[]; required?: boolean }[];
        body.form_fields = fields.map((f) => ({
          field_type: "TERMS",
          label: f.label,
          values: f.values,
          required: f.required ?? true,
        }));
      }
      const updated = await discord.rest.patch(`/guilds/${guildId}/member-verification`, { body });
      return { content: [{ type: "text", text: `✅ Membership screening updated.\n${JSON.stringify(updated, null, 2)}` }] };
    }

    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
