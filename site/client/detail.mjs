import { breakable, esc, formatInt, raw, RISK_LABEL, riskBadge, glyph, tpl } from "./tpl.mjs";

const uniq = (list) => [...new Set(list)];
const PLURAL = {
  object: "objects",
  string: "strings",
  number: "numbers",
  integer: "integers",
  boolean: "booleans",
};

function flatVariants(schema) {
  return schema.anyOf ? schema.anyOf.flatMap(flatVariants) : [schema];
}

export function typeLabel(schema) {
  if (!schema) return "any";
  if (schema.anyOf)
    return uniq(schema.anyOf.map(typeLabel).flatMap((label) => label.split(" or "))).join(" or ");
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (Array.isArray(schema.type))
    return schema.type.map((t) => (t === "array" ? arrayLabel(schema) : t)).join(" or ");
  if (schema.type === "array") return arrayLabel(schema);
  return schema.type || "any";
}

function arrayLabel(schema) {
  const item = schema.items ? typeLabel(schema.items) : "any";
  return item.includes(" or ") ? `array of (${item})` : `array of ${PLURAL[item] || item}`;
}

function objectOf(schema) {
  if (!schema || typeof schema !== "object") return null;
  if (
    schema.type === "object" &&
    (schema.properties || typeof schema.additionalProperties === "object")
  )
    return schema;
  if (schema.type === "array" && schema.items?.type === "object" && schema.items.properties)
    return schema.items;
  if (schema.anyOf)
    for (const variant of schema.anyOf) {
      const found = objectOf(variant);
      if (found) return found;
    }
  return null;
}

function rangeText(min, max, unit) {
  if (max !== undefined && max >= Number.MAX_SAFE_INTEGER) max = undefined;
  const u = unit ? " " + unit : "";
  if (min !== undefined && max !== undefined) return `${min} to ${max}${u}`;
  if (min !== undefined) return `at least ${min}${u}`;
  if (max !== undefined) return `at most ${max}${u}`;
  return "";
}

function variantRules(v) {
  const out = [];
  if (v.format) out.push(tpl`<span>format <code>${v.format}</code></span>`);
  if (v.pattern)
    out.push(
      v.pattern.length <= 40
        ? tpl`<span>pattern <code>${v.pattern}</code></span>`
        : tpl`<details><summary>pattern (${v.pattern.length} characters)</summary><code>${v.pattern}</code></details>`,
    );
  const range = rangeText(v.minimum, v.maximum);
  if (range) out.push(tpl`<span>${range}</span>`);
  const items = rangeText(v.minItems, v.maxItems, "items");
  if (items) out.push(tpl`<span>${items}</span>`);
  const length = rangeText(v.minLength, v.maxLength, "characters");
  if (length) out.push(tpl`<span>${length}</span>`);
  if (v.enum) {
    const values = tpl`<span class="vals">${v.enum.map((x) => tpl`<code>${JSON.stringify(x)}</code>`)}</span>`;
    out.push(
      v.enum.length > 10
        ? tpl`<details><summary>one of ${v.enum.length} values</summary>${values}</details>`
        : tpl`<span>one of ${values}</span>`,
    );
  }
  return out;
}

/** The rules of a schema; when it accepts several types, each type with its own rules. */
function rulesFor(schema) {
  const variants = flatVariants(schema).map((v) => ({ v, rules: variantRules(v) }));
  const out =
    variants.length > 1 && variants.some((variant) => variant.rules.length)
      ? variants.map(
          ({ v, rules }) =>
            tpl`<div class="pvar"><span class="pvt">${typeLabel(v)}${rules.length ? ":" : ""}</span>${rules}</div>`,
        )
      : variants.flatMap((variant) => variant.rules);
  if (schema.default !== undefined)
    out.push(tpl`<span>default <code>${JSON.stringify(schema.default)}</code></span>`);
  return out;
}

function schemaRows(schema, depth, out) {
  const required = schema.required || [];
  for (const [key, s] of Object.entries(schema.properties || {})) {
    out.push({ key, s, required: required.includes(key), depth });
    const inner = objectOf(s);
    if (inner) schemaRows(inner, depth + 1, out);
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    const s = schema.additionalProperties;
    out.push({ key: null, s, required: false, depth });
    const inner = objectOf(s);
    if (inner) schemaRows(inner, depth + 1, out);
  }
  return out;
}

function nameCell(row, isInput) {
  const label =
    row.key === null
      ? tpl`<span class="anykey">each key</span>`
      : tpl`<span class="pn">${breakable(row.key)}</span>`;
  const tag = row.required
    ? tpl`<span class="req">required</span>`
    : isInput && row.depth === 0
      ? tpl`<span class="opt">optional</span>`
      : "";
  const nested = row.depth ? tpl`<span class="vh"> (nested, level ${row.depth})</span>` : "";
  const depth = row.depth ? raw(` data-depth style="--depth:${row.depth}"`) : "";
  return tpl`<td class="c-name" data-l="${isInput ? "Parameter" : "Field"}"${depth}>${label}${nested}${tag}</td>`;
}

function inputTable(schema) {
  const rows = schemaRows(schema || {}, 0, []);
  if (!rows.length) return tpl`<p class="note">Takes no arguments.</p>`;
  return tpl`<table class="schema">
<thead><tr><th scope="col">Parameter</th><th scope="col">Type</th><th scope="col">Rules</th><th scope="col">Description</th></tr></thead>
<tbody>${rows.map((row) => {
    const rules = rulesFor(row.s);
    return tpl`<tr>${nameCell(row, true)}<td data-l="Type"><span class="pt">${typeLabel(row.s)}</span></td><td data-l="Rules"><div class="prules">${rules.length ? rules : tpl`<span class="opt">none</span>`}</div></td><td class="c-desc pdesc" data-l="Description">${row.s.description || ""}</td></tr>`;
  })}</tbody>
</table>`;
}

function outputTable(schema) {
  const rows = schemaRows(schema, 0, []);
  const keyed =
    !(schema.properties && Object.keys(schema.properties).length) &&
    typeof schema.additionalProperties === "object";
  const withDesc = rows.some((row) => row.s.description);
  return tpl`${keyed ? tpl`<p class="note">An object keyed by name, each value described below.</p>` : ""}<table class="schema">
<thead><tr><th scope="col">Field</th><th scope="col">Type</th>${withDesc ? tpl`<th scope="col">Description</th>` : ""}</tr></thead>
<tbody>${rows.map((row) => tpl`<tr>${nameCell(row, false)}<td data-l="Type"><span class="pt">${typeLabel(row.s)}</span></td>${withDesc ? tpl`<td class="c-desc pdesc" data-l="Description">${row.s.description || ""}</td>` : ""}</tr>`)}</tbody>
</table>`;
}

const ANNOTATIONS = [
  [
    "readOnlyHint",
    "Read-only",
    { true: "Does not modify your server.", false: "Can modify your server." },
    "Not declared.",
  ],
  [
    "destructiveHint",
    "Destructive",
    {
      true: "May perform destructive updates, so clients can ask before running it.",
      false: "Declared non-destructive.",
    },
    "Not declared: it only applies to tools that write.",
  ],
  [
    "idempotentHint",
    "Idempotent",
    {
      true: "Repeating the call with the same arguments has no additional effect.",
      false: "Repeating the call can have an additional effect.",
    },
    "Not declared.",
  ],
  [
    "openWorldHint",
    "Open world",
    {
      true: "Interacts with an external system: Discord.",
      false: "Works on a closed set of data.",
    },
    "Not declared.",
  ],
];

/** Description text with the tool names it mentions linked to their entries. */
function linkedText(text, byName, href) {
  return raw(
    esc(text).replace(/discord_[a-z_]+/g, (name) =>
      byName.has(name)
        ? `<a href="${href(name)}" data-tool="${name}"><code>${name.replace(/_/g, "_<wbr>")}</code></a>`
        : name,
    ),
  );
}

function relatedItem(tool, href) {
  return tpl`<li><a href="${href(tool.name)}" data-tool="${tool.name}">
  <span class="rt"><span data-risk="${tool.risk}" title="${RISK_LABEL[tool.risk]}">${glyph()}</span>${tool.title}<span class="vh">, ${RISK_LABEL[tool.risk]}</span></span>
  <code>${breakable(tool.name)}</code>
</a></li>`;
}

const list = (items) =>
  items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " and " + items.at(-1);

/**
 * The Discord permissions a tool's description names, one requirement per line:
 * "Manage Nicknames, or Change Nickname for the bot itself", "Manage Messages when ...".
 */
export function permissionLines(permissions = []) {
  const alternatives = (name) =>
    permissions
      .filter((p) => p.alternativeTo === name)
      .map((p) => `, or ${p.name}${p.condition ? " " + p.condition : ""}`)
      .join("");
  const main = permissions.filter((p) => !p.alternativeTo);
  const conditions = [...new Set(main.map((p) => p.condition))];
  return conditions.map((condition) => {
    const names = main.filter((p) => p.condition === condition).map((p) => p.name);
    return list(names) + alternatives(names.at(-1)) + (condition ? " " + condition : "");
  });
}

export const permissionLabel = (permissions = []) =>
  permissions.length > 1 ? "Discord permissions" : "Discord permission";

/**
 * The full reference for one tool, as HTML: description, annotations, parameters, the
 * declared output and related tools. Pure, so pages can render it at build time too.
 * `ctx` gives the toolset labels, a name-to-tool map, a link builder, the heading level
 * of the sections, an optional `example` block after the description, and for the
 * catalog's panel a `loaded` slot and the relative URL of the tool's own page.
 */
export function renderToolDetail(tool, ctx) {
  const { labels, byName, href, loaded = "", level = 3, example = "", page } = ctx;
  const definition = tool.definition;
  const annotations = definition.annotations || {};
  const label = labels[tool.toolset];
  const h = raw(`h${level}`);
  const sub = raw(`h${level + 1}`);
  const rows = ANNOTATIONS.map(([key, name, means, absent]) => {
    const has = Object.prototype.hasOwnProperty.call(annotations, key);
    const value = has ? !!annotations[key] : null;
    return tpl`<tr><th scope="row">${name}<code>${key}</code></th><td class="v ${value === null ? "na" : value ? "yes" : "no"}">${value === null ? "n/a" : value ? "yes" : "no"}</td><td>${value === null ? absent : means[String(value)]}</td></tr>`;
  });
  const mentioned = tool.crossReferences.map((name) => byName.get(name)).filter(Boolean);
  const same = [...byName.values()].filter(
    (t) => t.toolset === tool.toolset && t.name !== tool.name,
  );
  const others = same.filter((t) => !mentioned.includes(t));
  const output = definition.outputSchema
    ? tpl`<p class="note">Declared by <code>outputSchema</code>: clients receive this shape as <code>structuredContent</code>.</p>${outputTable(definition.outputSchema)}`
    : tpl`<p class="note">This tool declares no output schema. Its description says what it returns; this page shows no example rather than invent one.</p>`;
  const permission = permissionLines(tool.permissions).join("; ");
  const head = tpl`<div class="crumb"><span>${label} toolset</span><code>${tool.toolset}</code></div>
<h2 id="dlg-title" tabindex="-1">${tool.title}</h2>
<div class="dlg-name"><code id="dlg-name-code">${breakable(tool.name)}</code><button class="btn btn-sm" type="button" data-copy-text="${tool.name}">Copy name</button>${page ? tpl`<a class="btn btn-sm" href="${page}">Open the tool page</a>` : ""}</div>
<div class="dlg-meta">${riskBadge(tool.risk)}${tool.dryRunDefault ? tpl`<span class="dry">Dry run by default</span>` : ""}<span title="${formatInt(tool.bytes)} bytes divided by 4">${formatInt(tool.tokens)} tokens, estimated</span>${loaded}</div>${permission ? tpl`<p class="dlg-perm">${permissionLabel(tool.permissions)}: ${permission}</p>` : ""}`;
  const body = tpl`<p class="desc">${linkedText(definition.description, byName, href)}</p>${example}
<section class="d-sec" aria-labelledby="d-anno"><${h} id="d-anno">Risk and annotations</${h}>
<table class="anno"><tbody>${rows}</tbody></table>
<p class="note">Annotations are hints the server declares. Clients use them to decide when to ask you before a call.</p></section>
<section class="d-sec" aria-labelledby="d-in"><${h} id="d-in">Parameters</${h}>${inputTable(definition.inputSchema)}</section>
<section class="d-sec" aria-labelledby="d-out"><${h} id="d-out">Output</${h}>${output}</section>
<section class="d-sec" aria-labelledby="d-rel"><${h} id="d-rel">Related tools</${h}>
${mentioned.length ? tpl`<${sub}>Named in its description</${sub}><ul class="rel">${mentioned.map((t) => relatedItem(t, href))}</ul>` : ""}
${others.length ? tpl`<${sub}>Also in ${label}</${sub}><ul class="rel">${others.map((t) => relatedItem(t, href))}</ul>` : same.length ? "" : tpl`<${sub}>${label} has no other tool</${sub}>`}</section>
<details class="d-sec raw"><summary>Raw definition (${formatInt(tool.bytes)} bytes)</summary><pre><code>${JSON.stringify(definition, null, 2)}</code></pre></details>`;
  return { head, body };
}
