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

/**
 * Up to `limit` tools whose names are closest to the requested path: within a few edits
 * first, then names that contain it as a word or a longer fragment.
 */
export function suggest(pathname, tools, { base = "/", limit = 3 } = {}) {
  const wanted = requestedName(pathname, base);
  if (wanted.length < 3) return [];
  const near = Math.max(2, Math.floor(wanted.length / 4));
  const ranked = [];
  tools.forEach((tool, order) => {
    const short = tool.name.replace(/^discord_/, "");
    const distance = editDistance(wanted, short);
    const contains =
      short.split("_").includes(wanted) || (wanted.length >= 4 && short.includes(wanted));
    if (distance <= near || contains)
      ranked.push({ tool, rank: distance <= near ? distance : 100 + distance, order });
  });
  return ranked
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.tool);
}
