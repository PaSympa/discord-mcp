import { createIndex, search } from "./search.mjs";

/** Edit distance where swapping two adjacent letters counts as one edit. */
export function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/**
 * The tool name a missing URL seems to ask for, without its discord_ prefix:
 * "/discord-mcp/tools/discord-ban-membr/" gives "ban_membr".
 */
export function requestedName(pathname, base = "/") {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // A malformed escape: match on the raw path.
  }
  if (path.startsWith(base)) path = path.slice(base.length);
  const last =
    path
      .split("/")
      .map((segment) => segment.replace(/\.html?$/i, ""))
      .filter((segment) => segment && !/^(tools|index)$/i.test(segment))
      .at(-1) ?? "";
  return last
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^discord_/, "");
}

/** Up to `limit` tools whose names are within a few edits of the requested path, closest first. */
export function suggest(pathname, tools, { base = "/", limit = 3 } = {}) {
  const wanted = requestedName(pathname, base);
  if (wanted.length < 3) return [];
  const near = Math.max(2, Math.floor(wanted.length / 4));
  return tools
    .map((tool, order) => ({
      tool,
      order,
      distance: editDistance(wanted, tool.name.replace(/^discord_/, "")),
    }))
    .filter((entry) => entry.distance <= near)
    .sort((a, b) => a.distance - b.distance || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.tool);
}

/**
 * The closest names first; when no name is close, the catalog's own search on the words of
 * the path, synonyms included: /tools/discord_mute_member/ finds discord_timeout_member.
 * `tools` are catalog entries, with their definitions.
 */
export function suggestTools(pathname, tools, { base = "/", limit = 3, labels = {} } = {}) {
  const near = suggest(pathname, tools, { base, limit });
  if (near.length) return near;
  const words = requestedName(pathname, base).replace(/_/g, " ");
  if (!words) return [];
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return search(createIndex(tools, labels), words)
    .results.slice(0, limit)
    .map((result) => byName.get(result.name));
}
