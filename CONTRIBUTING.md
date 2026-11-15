# Contributing

Thanks for your interest in contributing to Discord MCP Server!

## Adding a New Tool

1. Create a new file in `src/tools/` (e.g. `myfeature.ts`)
2. Build it with `defineTool` entries assembled by `defineModule([...])`, and default-export the result
3. Add it to `allToolsets` in `src/tools/index.ts`; the key becomes its `DISCORD_MCP_TOOLSETS` name
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
      // ... tool logic: args arrive validated and typed
      return structured({ items: [] });
    },
  }),
];

export default defineModule(tools);
```

### Conventions

- The zod `schema` is the single source of truth: it derives the advertised `inputSchema` and validates args before `handle` runs: no manual validation, no `as` casts
- Reuse the shared fields from `define.ts`: `snowflake`, `guildId` (enforces `DISCORD_ALLOWED_GUILDS`), `intIn(min, max)` for bounded integers, `httpUrl` for http(s)-only URLs; embed inputs come from `embedFieldsShape` in `src/embeds.ts`
- Resolve channels through `getTextChannel` / `getGuildChannel` / `fetchChannelChecked` from `client.ts`, never `discord.channels.fetch` directly, so the guild allow-list stays enforced centrally
- Read tools declare an `outputSchema` (object root: wrap arrays as `{ items: [...] }`) and return via `structured(data)`, which emits matching text + `structuredContent`
- Success messages start with `✅`; tool names are prefixed with `discord_`

### Tool definition quality

Every tool definition must carry its weight: directory scanners (e.g. Glama) score the
_lowest_-quality tool heavily, so one thin definition drags the whole server's grade down.

- **Description**: action statement + when to use it vs. similar tools + required Discord
  permissions + side effects / destructive behavior + what it returns.
- **`annotations`**: set the MCP hints: `readOnlyHint` (true for pure reads), `destructiveHint`
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
npm run bundle    # after a build: packs discord-mcp.mcpb for Claude Desktop
```

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Build and test your changes
4. Commit with a descriptive message (e.g. `feat: add my-tool`)
5. Open a pull request against `main`

## Releasing (maintainers)

Versions live in five files and must always agree: `package.json`, `package-lock.json`, `server.json` (the MCP Registry manifest), `manifest.json` (the Claude Desktop bundle manifest) and `plugin/.claude-plugin/plugin.json` (the Claude Code plugin, which also pins the npm version it runs). Never edit them by hand. `main` only accepts pull requests, so the flow is:

```bash
git switch -c release/x.y.z main   # from an up-to-date main
npm version patch                  # or minor / major
git push -u origin release/x.y.z
```

`npm version` bumps all five files (`server.json`, `manifest.json` and `plugin.json` via the `version` lifecycle script in `scripts/sync-version.js`), commits, and creates the `vX.Y.Z` tag locally. Make sure `CHANGELOG.md` has an entry for the new version (commit it on the branch if not).

Open a PR and **merge it with a merge commit** (not squash or rebase: the tagged commit must end up in `main`'s history). The plugin on `main` then pins a version npm does not have yet, so its installs fail until the release publishes it. Push the tag right away:

```bash
git push origin vX.Y.Z
```

The tag triggers `.github/workflows/release.yml`, which does everything else automatically:

1. Builds the Claude Desktop bundle, `discord-mcp.mcpb`, with `npm run bundle`, then starts it once with `scripts/check-bundle.mjs`. A broken bundle stops the release before anything is published
2. Fails fast if the tag does not match `package.json`, `server.json`, `manifest.json`, `plugin.json` and the npm version the plugin runs
3. Lints, builds, tests, then publishes to npm through trusted publishing (GitHub OIDC). No npm token is stored: the trusted publisher on npmjs.com must name `release.yml`
4. Pushes the Docker images
5. Creates the GitHub Release and attaches `discord-mcp.mcpb` to it
6. Publishes to the official MCP Registry via GitHub OIDC (no secret needed). The registry pulls the tagged Docker image to validate the `server.json` OCI entry. The bundle entry is added at this step only: `scripts/registry-mcpb.mjs` downloads the public release asset and records its sha256. The committed `server.json` never lists it. The [GitHub MCP Registry](https://github.com/mcp) is curated: a new server is requested once in [github/github-mcp-server#1257](https://github.com/github/github-mcp-server/discussions/1257), then later versions sync from the official registry

If a job fails, resume the run with `gh run rerun <run-id> --failed`. Once npm has the version, "Re-run all jobs" stops at `npm publish`, which refuses to publish it twice. A full rerun also builds a new bundle with another sha256, since the zip records the build time. The release keeps the first asset (`overwrite_files: false`), and the registry step hashes that public file.

Pull requests that touch the bundle inputs run `.github/workflows/bundle.yml`. It builds the bundle, starts it, validates its manifest and the `server.json` entry, and uploads `discord-mcp.mcpb` as an artifact to install by hand. `mcp-publisher validate` checks the entry's shape only. The registry sends its HEAD request to the asset URL during `publish`, so the release must be public by then.

No manual `npm publish`: local publishes are blocked by npm's 2FA policy anyway.
