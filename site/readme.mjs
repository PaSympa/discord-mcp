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

const leadOf = (item, what) => {
  const m = need(/^\*\*(.+?)\*\*\s*(.*)$/.exec(item), `bold lead in ${what} item "${item}"`);
  return { lead: m[1].replace(/\.$/, ""), text: m[2] };
};

const detailsOf = (text) =>
  [
    ...text.matchAll(
      /<details>\s*<summary><strong>(.+?)<\/strong><\/summary>([\s\S]*?)<\/details>/g,
    ),
  ].map((m) => ({ label: m[1], blocks: blocks(m[2]) }));

/**
 * Reads the parts of README.md the site renders: the promise, the install links, the demo,
 * the prompts, the quick start, the profiles, the safety notes, the client setups, the
 * remote clients, the configuration table and the troubleshooting list.
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
  for (const label of [
    "Install in VS Code",
    "Install in VS Code Insiders",
    "Install in Cursor",
    "Install in Claude Desktop",
  ])
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
  const safety = safetyList.items.map((item) => leadOf(item, "safety"));

  const clients = detailsOf(section("Clients"));
  need(clients, "client setups");

  const [remoteText, securityText] = need(
    section("Remote clients over HTTP"),
    "HTTP section",
  ).split(/^### Security over HTTP$/m);
  const remote = {
    intro: blocks(remoteText.slice(0, remoteText.indexOf("<details>"))),
    clients: need(detailsOf(remoteText), "remote client setups"),
    security: need(
      blocks(need(securityText, 'section "### Security over HTTP"')).find((b) => b.type === "ul"),
      "HTTP security list",
    ).items.map((item) => leadOf(item, "HTTP security")),
  };

  const configBlocks = blocks(section("Configuration"));
  const configTable = need(
    configBlocks.find((b) => b.type === "table"),
    "configuration table",
  );
  const configuration = {
    variables: configTable.rows.map(([name, fallback, text]) => ({
      name: plain(name),
      fallback,
      text,
    })),
    notes: configBlocks.filter((b) => b.type === "p").map((b) => b.text),
  };

  const troubleshooting = need(
    blocks(section("Troubleshooting")).find((b) => b.type === "ul"),
    "troubleshooting list",
  ).items.map((item) => leadOf(item, "troubleshooting"));

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
    remote,
    configuration,
    troubleshooting,
  };
}
