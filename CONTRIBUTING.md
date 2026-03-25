# Contributing

Thanks for your interest in contributing to Discord MCP Server!

## Adding a New Tool

1. Create a new file in `src/tools/` (e.g. `myfeature.ts`)
2. Export `definitions` (tool schemas) and `handle()` (tool logic)
3. Import and add it to the `modules` array in `src/tools/index.ts`
4. Update `README.md` with the new tool(s)

### Tool Module Structure

Every tool module must satisfy the `ToolModule` interface:

```typescript
import { discord, validateId } from "../client.js";
import type { ToolModule, ToolResult } from "./types.js";

export const definitions = [
  {
    name: "discord_my_tool",
    description: "What this tool does.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
      },
      required: ["guild_id"],
    },
  },
];

export async function handle(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult | null> {
  switch (name) {
    case "discord_my_tool": {
      const guildId = validateId(args.guild_id, "guild_id");
      // ... tool logic
      return { content: [{ type: "text", text: "result" }] };
    }
    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
```

### Conventions

- Use `validateId()` for all Discord snowflake IDs
- Return `null` from `handle()` if the tool name doesn't match (routing)
- Success messages start with `✅`
- Use `JSON.stringify(data, null, 2)` for list responses
- Tool names are prefixed with `discord_`

## Development

```bash
npm install
npm run build
npm run dev       # build + run
```

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Build and test your changes
4. Commit with a descriptive message (e.g. `feat: add my-tool`)
5. Open a pull request against `main`
