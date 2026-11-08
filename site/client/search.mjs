const STOP_WORDS = new Set(
  (
    "a an the to of for in on at by with from into onto and or but not my your our their its it is are be " +
    "can could would should will i me we you they this that these those some any all one how do does what " +
    "which who where when why please want need before after then than so up out about via using " +
    "someone somebody something anyone anybody"
  ).split(" "),
);

// Everyday and Discord UI words mapped onto the words tools/list uses. Keys are stems;
// values with an underscore match inside tool and parameter names.
const SYNONYMS = {
  mut: ["timeout"],
  unmut: ["timeout"],
  silenc: ["timeout"],
  purg: ["bulk_delete", "prune"],
  wip: ["bulk_delete"],
  renam: ["edit"],
  giv: ["add", "assign"],
  hid: ["deny"],
  chang: ["edit", "set"],
  modify: ["edit", "update"],
  updat: ["edit"],
  edit: ["update"],
  user: ["member"],
  server: ["guild"],
  guild: ["server"],
  preview: ["dry_run"],
  privat: ["dm"],
  announc: ["crosspost"],
  publish: ["crosspost"],
  nick: ["nickname"],
  emoji: ["reaction"],
  react: ["reaction"],
  card: ["embed"],
  rich: ["embed"],
};

const PHRASES = [
  [/\btime[\s-]+outs?\b/g, "timeout"],
  [/\bslow[\s-]+mode\b/g, "slowmode"],
  [/\bdirect[\s-]+messages?\b/g, "dm"],
  [/\bdry[\s-]+runs?\b/g, "dry_run"],
  [/\bun[\s-]+(ban|pin|mute)\b/g, "un$1"],
  [/\bschedule\s+(a|an|the)\b/g, "create scheduled"],
];

const WEIGHT = { name: 10, title: 8, purpose: 4, params: 3, toolset: 2, description: 2 };
// The last word of a tool name is what it acts on: "create event" wants create_scheduled_event,
// not create_event_invite, while "ban" (a verb) still wants ban_member before bulk_ban. A query
// with no verb ("invite") first gets the tools that make the thing, then those that read it.
const OBJECT = 6;
const MAKES = {
  creat: 2,
  send: 2,
  add: 2,
  list: 1,
  get: 1,
  read: 1,
  fetch: 1,
  search: 1,
  find: 1,
  reply: 1,
};
const VISIBLE = new Set(["name", "title", "purpose"]);
const PREFIX = 0.6;
const SYNONYM = 0.8;

const undouble = (s) => (s.length > 3 && /([^aeiouls])\1$/.test(s) ? s.slice(0, -1) : s);

/** A light English stemmer: deleting, deleted, deletes and delete all give "delet". */
export function stem(word) {
  let s = word.toLowerCase();
  if (s.length <= 2) return s;
  if (s.endsWith("ies") && s.length > 4) s = s.slice(0, -3) + "y";
  else if (/(ch|sh|x|ss|z)es$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith("s") && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith("ing") && s.length > 5) s = undouble(s.slice(0, -3));
  else if (s.endsWith("ed") && s.length > 4) s = undouble(s.slice(0, -2));
  if (s.endsWith("e") && s.length > 3) s = s.slice(0, -1);
  return s;
}

const wordsOf = (text) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const field = (words) => words.map((raw) => ({ raw, stem: stem(raw) }));

/** Builds the search index from catalog entries (name, title, purpose, toolset, definition). */
export function createIndex(tools, labels = {}) {
  return tools.map((tool, order) => {
    const short = tool.name.replace(/^discord_/, "");
    const params = Object.keys(tool.definition?.inputSchema?.properties ?? {});
    const description = tool.definition?.description ?? "";
    return {
      name: tool.name,
      order,
      short,
      params,
      description: description.toLowerCase(),
      fields: {
        name: field(short.split("_")),
        title: field(wordsOf(tool.title)),
        purpose: field(wordsOf(tool.purpose)),
        params: field(params.flatMap((p) => p.split("_"))),
        toolset: field(wordsOf(tool.toolset + " " + (labels[tool.toolset] ?? ""))),
        description: field(wordsOf(description)),
      },
    };
  });
}

/** Splits a query into terms: stop words dropped, words stemmed, synonyms attached. */
export function parseQuery(query) {
  let q = query.toLowerCase();
  for (const [pattern, replacement] of PHRASES) q = q.replace(pattern, replacement);
  const terms = [];
  for (const token of q.match(/[a-z0-9_]+/g) ?? []) {
    const word = token.replace(/^_+|_+$/g, "");
    if (!word) continue;
    if (word.includes("_")) {
      terms.push({ raw: word, fragment: word.replace(/^discord_/, ""), stem: null, alts: [] });
    } else if (!STOP_WORDS.has(word)) {
      const s = stem(word);
      const alts = (SYNONYMS[s] ?? []).map((alt) => (alt.includes("_") ? alt : stem(alt)));
      terms.push({ raw: word, fragment: null, stem: s, alts });
    }
  }
  return terms;
}

function wordScore(words, key) {
  let best = 0;
  for (const w of words) {
    if (w.stem === key) return 1;
    if (key.length >= 3 && w.stem.startsWith(key)) best = PREFIX;
  }
  return best;
}

function fragmentScore(entry, fragment) {
  const at = entry.short.indexOf(fragment);
  if (at !== -1) {
    const end = at + fragment.length;
    let score = 12;
    if (at === 0 || entry.short[at - 1] === "_") score += 1;
    if (end === entry.short.length || entry.short[end] === "_") score += 2;
    if (fragment === entry.short) score += 5;
    return { score, field: "name" };
  }
  if (entry.params.includes(fragment)) return { score: WEIGHT.params, field: "params" };
  if (entry.params.some((p) => p.includes(fragment)))
    return { score: WEIGHT.params * PREFIX, field: "params" };
  if (entry.description.includes(fragment))
    return { score: WEIGHT.description, field: "description" };
  return { score: 0, field: null };
}

function termScore(entry, term) {
  if (term.fragment) return fragmentScore(entry, term.fragment);
  const hits = [];
  for (const [name, weight] of Object.entries(WEIGHT)) {
    let s = wordScore(entry.fields[name], term.stem);
    for (const alt of term.alts)
      if (!alt.includes("_")) s = Math.max(s, wordScore(entry.fields[name], alt) * SYNONYM);
    hits.push({ score: s * weight, field: name });
  }
  for (const alt of term.alts) {
    if (!alt.includes("_")) continue;
    const hit = fragmentScore(entry, alt);
    hits.push({ score: hit.score * SYNONYM, field: hit.field });
  }
  hits.sort((a, b) => b.score - a.score);
  if (hits[0].score === 0) return { score: 0, field: null };
  const best = { ...hits[0] };
  // The other fields only break ties between equally good best matches.
  best.score += 0.05 * hits.slice(1).reduce((sum, hit) => sum + hit.score, 0);
  if (best.field === "name") {
    const words = entry.fields.name;
    // The word as typed (a plural, say) and the leading verb make a name match more specific.
    if (words.some((w) => w.raw === term.raw)) best.score += 2;
    if (words[0].stem === term.stem) best.score += 1;
  }
  return best;
}

function keysOf(term) {
  return term.fragment ? [] : [term.stem, ...term.alts.filter((a) => !a.includes("_"))];
}

function adjacentInName(entry, terms) {
  const stems = entry.fields.name.map((w) => w.stem);
  const want = terms.map((t) => t.stem);
  if (want.some((s) => s === null)) return false;
  for (let i = 0; i + want.length <= stems.length; i++)
    if (want.every((s, k) => stems[i + k] === s)) return true;
  return false;
}

/**
 * Ranks the index against a query. Every term must match ("and"); when no tool matches
 * them all, tools matching some of them are returned ("or"), so the list is never empty
 * while any word matches anything.
 */
export function search(index, query) {
  const terms = parseQuery(query);
  if (terms.length === 0) return { terms, mode: "all", results: [] };
  const verbs = new Set(index.map((entry) => entry.fields.name[0].stem));
  const bare = terms.every(
    (t) => !t.fragment && !verbs.has(t.stem) && !t.alts.some((alt) => verbs.has(alt.split("_")[0])),
  );
  const objects = terms.filter((t) => !verbs.has(t.stem)).flatMap(keysOf);
  const scored = index.map((entry) => {
    const hits = terms.map((term) => termScore(entry, term));
    const matched = hits.filter((hit) => hit.score > 0).length;
    let score = hits.reduce((sum, hit) => sum + hit.score, 0);
    if (matched === terms.length) {
      const name = entry.fields.name;
      if (hits.every((hit) => hit.field === "name" || hit.field === "title")) score += 5;
      if (terms.length > 1 && adjacentInName(entry, terms)) score += 4;
      const keys = terms.flatMap(keysOf);
      const named = name.filter((w) => keys.includes(w.stem)).length;
      score += (2 * named) / name.length;
      if (objects.includes(name.at(-1).stem)) score += OBJECT;
      if (bare) score += MAKES[name[0].stem] ?? 0;
    }
    const hidden = [
      ...new Set(hits.filter((hit) => hit.field && !VISIBLE.has(hit.field)).map((h) => h.field)),
    ];
    return { name: entry.name, order: entry.order, score, matched, hidden };
  });
  let results = scored.filter((r) => r.matched === terms.length);
  let mode = "and";
  if (results.length === 0) {
    results = scored.filter((r) => r.matched > 0);
    mode = results.length ? "or" : "none";
  }
  results.sort((a, b) => b.matched - a.matched || b.score - a.score || a.order - b.order);
  return { terms, mode, results };
}

/** [start, end) ranges of the words in text that a query term matches, for highlighting. */
export function matchRanges(text, terms) {
  const keys = terms.flatMap(keysOf);
  const ranges = [];
  for (const m of text.matchAll(/[A-Za-z0-9]+/g)) {
    const s = stem(m[0]);
    if (keys.some((k) => s === k || (k.length >= 3 && s.startsWith(k))))
      ranges.push([m.index, m.index + m[0].length]);
  }
  const lower = text.toLowerCase();
  for (const term of terms) {
    if (!term.fragment) continue;
    for (
      let at = lower.indexOf(term.fragment);
      at !== -1;
      at = lower.indexOf(term.fragment, at + 1)
    )
      ranges.push([at, at + term.fragment.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}
