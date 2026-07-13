# Contributing

Thanks for your interest in contributing to Discord MCP Server!

## Adding a New Tool

1. Create a new file in `src/tools/` (e.g. `myfeature.ts`)
2. Build it with `defineTool` entries assembled by `defineModule([...])`, and default-export the result
3. Add it to `allToolsets` in `src/tools/index.ts` — the key becomes its `DISCORD_MCP_TOOLSETS` name
4. Update `README.md` (tool tables, counts, toolset list)

### Tool Module Structure

```typescript
import { z } from "zod";
import { discord } from "../client.js";
import {
  defineTool,
  defineModule,
  guildId,
  snowflake,
  intIn,
  httpUrl,
  structured,
} from "./define.js";

const tools = [
  defineTool({
    name: "discord_my_tool",
    description:
      "One clear action sentence. Then: when to use it vs. similar tools, required Discord permissions, any side effects or destructive/irreversible behavior, and what it returns.",
    annotations: {
      title: "My tool",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      limit: intIn(1, 100).default(25).describe("How many entries to return (1–100). Default 25."),
    }),
    outputSchema: z.object({ items: z.array(z.object({ id: z.string() })) }),
    handle: async ({ guild_id, limit }) => {
      const guild = await discord.guilds.fetch(guild_id);
      // ... tool logic — args arrive validated and typed
      return structured({ items: [] });
    },
  }),
];

export default defineModule(tools);
```

### Conventions

- The zod `schema` is the single source of truth: it derives the advertised `inputSchema` and validates args before `handle` runs — no manual validation, no `as` casts
- Reuse the shared fields from `define.ts`: `snowflake`, `guildId` (enforces `DISCORD_ALLOWED_GUILDS`), `intIn(min, max)` for bounded integers, `httpUrl` for http(s)-only URLs; embed inputs come from `embedFieldsShape` in `src/embeds.ts`
- Resolve channels through `getTextChannel` / `getGuildChannel` / `fetchChannelChecked` from `client.ts` — never `discord.channels.fetch` directly, so the guild allow-list stays enforced centrally
- Read tools declare an `outputSchema` (object root — wrap arrays as `{ items: [...] }`) and return via `structured(data)`, which emits matching text + `structuredContent`
- Success messages start with `✅`; tool names are prefixed with `discord_`

### Tool definition quality

Every tool definition must carry its weight — directory scanners (e.g. Glama) score the
_lowest_-quality tool heavily, so one thin definition drags the whole server's grade down.

- **Description**: action statement + when to use it vs. similar tools + required Discord
  permissions + side effects / destructive behavior + what it returns.
- **`annotations`**: set the MCP hints — `readOnlyHint` (true for pure reads), `destructiveHint`
  (true for delete/ban/prune/irreversible writes), `idempotentHint` (true if repeating the call
  changes nothing further), and `openWorldHint: true` (every tool calls the Discord API). Add a
  short `title`.
- **Parameters**: give every schema field a `.describe()` with its format and constraints
  (e.g. snowflake, value range, defaults). When the same fields repeat across tools, extract
  them into a shared shape and spread it (see `embedFieldsShape` in `src/embeds.ts`).

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

## Releasing (maintainers)

Versions live in three files — `package.json`, `package-lock.json` and `server.json` (the MCP Registry manifest) — and must always agree. Never edit them by hand. `main` only accepts pull requests, so the flow is:

```bash
git switch -c release/x.y.z main   # from an up-to-date main
npm version patch                  # or minor / major
git push -u origin release/x.y.z
```

`npm version` bumps all three files (`server.json` via the `version` lifecycle script in `scripts/sync-version.js`), commits, and creates the `vX.Y.Z` tag locally. Make sure `CHANGELOG.md` has an entry for the new version (commit it on the branch if not).

Open a PR and **merge it with a merge commit** (not squash/rebase — the tagged commit must end up in `main`'s history). Then push the tag:

```bash
git push origin vX.Y.Z
```

The tag triggers `.github/workflows/release.yml`, which does everything else automatically:

1. Fails fast if the tag does not match `package.json` / `server.json`
2. Lints, builds, tests, then publishes to npm (`NPM_TOKEN` secret)
3. Pushes the Docker images
4. Publishes to the official MCP Registry via GitHub OIDC (no secret needed) — the registry pulls the tagged Docker image to validate the `server.json` OCI entry, and the [GitHub MCP Registry](https://github.com/mcp) picks it up automatically
5. Creates the GitHub Release

No manual `npm publish` — local publishes are blocked by npm's 2FA policy anyway.
