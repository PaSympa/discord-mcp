import { z } from "zod";
import { discord } from "../client.js";
import { defineTool, defineModule, guildId, structured } from "./define.js";

/** Tool definitions for reading and updating the guild membership screening form. */
const tools = [
  defineTool({
    name: "discord_get_membership_screening",
    description:
      "Fetch the server's membership screening form, the rules/questions new members must accept before gaining access. Requires the server to have the Community feature enabled. Read-only. Returns the form as JSON, including its version.",
    annotations: { title: "Get membership screening", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
    }),
    outputSchema: z.object({
      version: z.string().nullable(),
      form_fields: z.array(
        z.object({
          field_type: z.string(),
          label: z.string(),
          values: z.array(z.string()).nullable(),
          required: z.boolean(),
          description: z.string().nullable(),
        }),
      ),
      description: z.string().nullable(),
    }),
    handle: async ({ guild_id }) => {
      const data = (await discord.rest.get(`/guilds/${guild_id}/member-verification`)) as {
        version?: string | null;
        description?: string | null;
        form_fields?: {
          field_type?: string;
          label?: string;
          values?: string[] | null;
          required?: boolean;
          description?: string | null;
        }[];
      };
      return structured({
        version: data.version ?? null,
        description: data.description ?? null,
        form_fields: (data.form_fields ?? []).map((f) => ({
          field_type: f.field_type ?? "TERMS",
          label: f.label ?? "",
          values: f.values ?? null,
          required: f.required ?? true,
          description: f.description ?? null,
        })),
      });
    },
  }),
  defineTool({
    name: "discord_update_membership_screening",
    description:
      "Update the server's membership screening form: set the welcome description and the rules new members must agree to. Only provided fields change. Requires the Community feature and the Manage Server permission. Returns the updated form.",
    annotations: {
      title: "Update membership screening",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      description: z
        .string()
        .optional()
        .describe("Welcome message shown at the top of the screening form."),
      form_fields: z
        .array(
          z.strictObject({
            label: z.string().describe("Title of this rules block."),
            values: z.array(z.string()).describe("Individual rule lines shown under the label."),
            required: z
              .boolean()
              .optional()
              .describe("Whether the member must agree to this block. Default true."),
          }),
        )
        .optional()
        .describe(
          "Rules/agreement blocks new members must accept. Replaces the existing fields when provided.",
        ),
    }),
    handle: async ({ guild_id, description, form_fields }) => {
      const current = (await discord.rest.get(`/guilds/${guild_id}/member-verification`)) as Record<
        string,
        unknown
      >;
      const body: Record<string, unknown> = { version: current.version };
      if (description !== undefined) body.description = description;
      if (form_fields !== undefined) {
        body.form_fields = form_fields.map((f) => ({
          field_type: "TERMS",
          label: f.label,
          values: f.values,
          required: f.required ?? true,
        }));
      }
      const updated = await discord.rest.patch(`/guilds/${guild_id}/member-verification`, { body });
      return {
        content: [
          {
            type: "text",
            text: `✅ Membership screening updated.\n${JSON.stringify(updated, null, 2)}`,
          },
        ],
      };
    },
  }),
];

export default defineModule(tools);
