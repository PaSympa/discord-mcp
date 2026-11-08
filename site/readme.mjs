import { blocks, plain } from "./markdown.mjs";

const need = (value, what) => {
  if (value === undefined || value === null || value === "" || value.length === 0)
    throw new Error(`README.md: ${what} not found. The site reads it from there.`);
  return value;
};

function sections(text) {
  const parts = text.replace(/\r\n/g, "\n").split(/^## (.+)$/m);
  const map = new Map();
  for (let i = 1; i < parts.length; i += 2) map.set(parts[i].trim(), parts[i + 1]);
  return { head: parts[0], map };
}

/**
 * Reads the parts of README.md the site renders: the promise, the install links, the demo,
 * the prompts, the quick start, the profiles, the safety notes and the client setups.
 */
export function parseReadme(text) {
  const { head, map } = sections(text);
  const section = (title) => need(map.get(title), `section "## ${title}"`);

  const banner = need(/<img alt="([^"]+)"/.exec(head)?.[1], "banner alt text");
  const tagline = banner.slice(banner.indexOf(":") + 1).trim();
  const installLinks = Object.fromEntries(
    [...head.matchAll(/\[!\[(Install in [^\]]+)\]\([^)]*\)\]\((https:[^)\s]+)\)/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  for (const label of ["Install in VS Code", "Install in VS Code Insiders", "Install in Cursor"])
    need(installLinks[label], `"${label}" button`);
  const intro = need(
    blocks(head.slice(head.lastIndexOf("</div>") + 6)).find((b) => b.type === "p")?.text,
    "intro paragraph",
  );

  const demoText = section("See it in action");
  const demo = {
    alt: need(/<img src="[^"]*demo[^"]*" alt="([^"]+)"/.exec(demoText)?.[1], "demo alt text"),
    video: need(/<a href="(https:[^"]+)">Watch/.exec(demoText)?.[1], "full demo link"),
    caption: need(/<sub>([\s\S]+?)<\/sub>/.exec(demoText)?.[1].trim(), "demo caption"),
  };

  const askTable = need(
    blocks(section("What you can ask")).find((b) => b.type === "table"),
    "prompt table",
  );
  const asks = askTable.rows.map(([want, ask]) => ({
    want: plain(want),
    prompt: plain(ask).replace(/^"|"$/g, ""),
  }));

  const quickStart = blocks(section("Quick start"));
  need(
    quickStart.find((b) => b.type === "ol"),
    "quick start steps",
  );

  const expose = blocks(section("Expose only what you need"));
  const profileTable = need(
    expose.find((b) => b.type === "table"),
    "profile table",
  );
  const profiles = profileTable.rows.map(([label, sets, tools]) => ({
    label: plain(label).replace(/\s*\(default\)$/, ""),
    sets: sets === "unset" ? "all" : plain(sets).split(","),
    tools: Number(tools),
  }));

  const safetyList = need(
    blocks(section("Safety")).find((b) => b.type === "ul"),
    "safety list",
  );
  const safety = safetyList.items.map((item) => {
    const m = need(/^\*\*(.+?)\*\*\s*(.*)$/.exec(item), `bold lead in safety item "${item}"`);
    return { lead: m[1].replace(/\.$/, ""), text: m[2] };
  });

  const clients = [
    ...section("Clients").matchAll(
      /<details>\s*<summary><strong>(.+?)<\/strong><\/summary>([\s\S]*?)<\/details>/g,
    ),
  ].map((m) => ({ label: m[1], blocks: blocks(m[2]) }));
  need(clients, "client setups");

  return {
    tagline,
    intro,
    installLinks,
    demo,
    asks,
    quickStart,
    expose,
    profiles,
    safety,
    clients,
  };
}
