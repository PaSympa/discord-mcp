import { formatTokens, plural, tpl } from "../client/tpl.mjs";
import { docPage, UP } from "./docs.mjs";
import { channels, md, terminal, toolChip } from "./parts.mjs";
import { listOf } from "./toolsets.mjs";

const steps = (list) => {
  const n = list.map(String);
  return n.length === 1 ? `step ${n[0]}` : `steps ${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
};

function readOnlyNote(r) {
  const mode = tpl`<a href="${UP}configuration/#DISCORD_MCP_READ_ONLY">read-only mode</a>`;
  if (r.readOnly) return tpl`Every step only reads, so the recipe works with ${mode} on.`;
  if (!r.readSteps.length) return tpl`Every step writes, so it needs ${mode} off.`;
  return tpl`With ${mode} on, ${steps(r.readSteps)} still ${r.readSteps.length === 1 ? "runs" : "run"}; the others need write tools.`;
}

function recipe(site, r) {
  const local = new Set();
  const unpreviewed = r.destructive.filter((name) => !r.dryRun.includes(name));
  const chips = (names) => listOf(names.map((name) => toolChip(site, name, UP)));
  const safety = [
    ...(r.dryRun.length
      ? [
          r.dryRun.length === 1
            ? tpl`${chips(r.dryRun)} runs as a dry run by default: it reports what would happen and changes nothing until called again with <code>dry_run: false</code>.`
            : tpl`${chips(r.dryRun)} run as a dry run by default: they report what would happen and change nothing until called again with <code>dry_run: false</code>.`,
        ]
      : []),
    ...(unpreviewed.length
      ? [
          tpl`Destructive here: ${chips(unpreviewed)}. Your client can ask before each destructive call.`,
        ]
      : []),
    readOnlyNote(r),
    ...r.notes.map((note) => md(site, note, UP, local)),
  ];
  const line = `DISCORD_MCP_TOOLSETS=${r.sets.join(",")}`;
  return tpl`<article class="doc-sec recipe" id="${r.id}" aria-labelledby="${r.id}-h">
  <h2 id="${r.id}-h">${r.title}</h2>
  <p class="recipe-goal">${r.goal}</p>
  <ol class="recipe-steps" role="list">${r.steps.map(
    (s) => tpl`<li class="recipe-step">
    <p class="prompt"><span class="pm" aria-hidden="true">&gt;</span><span>${channels(s.prompt)}</span></p>
    <p class="recipe-does">${md(site, s.does, UP, local)}</p>
    <p class="uses"><span class="vh">Tools: </span>${s.tools.map((name) => toolChip(site, name, UP))}</p>
  </li>`,
  )}</ol>
  <div class="recipe-meta">
    <div class="recipe-box">
      <h3>Toolsets to load</h3>
      ${terminal({ code: line, lang: "text", title: "Environment", copyLabel: `Copy the toolsets for ${r.title.toLowerCase()}` })}
      <p class="note">${plural(r.tools, "tool")}, about ${formatTokens(r.tokens).slice(1)} tokens of context. Discovery comes along for the server and channel IDs.</p>
    </div>
    <div class="recipe-box">
      <h3>Safety</h3>
      <ul>${safety.map((s) => tpl`<li>${s}</li>`)}</ul>
    </div>
  </div>
</article>`;
}

export function renderRecipes(site) {
  return docPage(site, {
    key: "recipes",
    title: "Recipes: typical Discord tasks | discord-mcp",
    description:
      "Step-by-step Discord tasks with discord-mcp: recap a channel, stop a raid, run an event, restructure roles, set up a forum, audit permissions.",
    lead: "Whole tasks, prompt by prompt: what to type, which tools the assistant reaches for, and what keeps each step safe.",
    toc: site.recipes.map((r) => ({ id: r.id, label: r.title })),
    body: tpl`<p class="doc-intro">The prompts are examples: say it your way and the assistant picks the tools. The tools listed under each prompt come from their descriptions, not from a recorded session. Most clients ask before each write unless you allow it; check how yours is set.</p>
${site.recipes.map((r) => recipe(site, r))}`,
  });
}
