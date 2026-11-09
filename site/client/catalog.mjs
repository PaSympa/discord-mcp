import { $, $$, announce, initCommon, reduceMotion, setTerminalLines } from "./common.mjs";
import { renderToolDetail } from "./detail.mjs";
import { createIndex, matchRanges, search } from "./search.mjs";
import { breakable, formatInt, formatTokens, marked, plural, tpl } from "./tpl.mjs";

const DATA = JSON.parse($("#catalog-data").textContent);
const TOOLS = DATA.tools;
const SETS = DATA.toolsets.map((s) => s.name);
const LABELS = Object.fromEntries(DATA.toolsets.map((s) => [s.name, s.label]));
const TOTAL = DATA.totals;
const RISKS = ["read", "write", "destructive"];
const RISK_WORD = { read: "read-only", write: "writes", destructive: "destructive" };
const byName = new Map(TOOLS.map((t) => [t.name, t]));
const index = createIndex(TOOLS, LABELS);

// Rows are rendered at build time; this maps each one to its parts.
const rows = new Map(
  $$(".row-li").map((li, order) => [
    li.dataset.tool,
    {
      li,
      order,
      home: li.parentElement,
      title: $(".row-title", li),
      name: $(".row-name", li),
      purpose: $(".row-purpose", li),
      why: $(".why", li),
      tool: byName.get(li.dataset.tool),
    },
  ]),
);
const groups = new Map(
  SETS.map((s) => [
    s,
    { el: document.getElementById("set-" + s), meta: $(`#set-${s} [data-meta]`) },
  ]),
);

const state = { q: "", risks: new Set(), sets: new Set(), dry: false };
const input = $("#q");
const ranked = $("#ranked");
const groupsEl = $("#groups");
const riskChips = $$("#risk-chips [data-risk]");
const dryChip = $("#risk-chips [data-dry]");
const setChips = $$("#set-chips [data-set]");
const setSelect = $("#set-select");
const wide = matchMedia("(min-width: 641px)");
const placeholders = [input.placeholder, input.dataset.widePlaceholder];
const setPlaceholder = () => {
  input.placeholder = placeholders[wide.matches ? 1 : 0];
};
setPlaceholder();
wide.addEventListener("change", setPlaceholder);

const byRisk = (t) => !state.risks.size || state.risks.has(t.risk);
const bySet = (t) => !state.sets.size || state.sets.has(t.toolset);
const byDry = (t) => !state.dry || t.dryRunDefault;

function setChipCount(chip, n) {
  $(".n", chip).textContent = String(n);
  chip.classList.toggle("zero", n === 0);
}

function highlight(entry, terms) {
  const { tool } = entry;
  entry.title.innerHTML = String(marked(tool.title, matchRanges(tool.title, terms)));
  entry.name.innerHTML = String(breakable(tool.name, matchRanges(tool.name, terms)));
  entry.purpose.innerHTML = String(marked(tool.purpose, matchRanges(tool.purpose, terms)));
}

function whyText(hidden) {
  const where = { params: "parameters", description: "description", toolset: "toolset" };
  const list = hidden.map((field) => where[field]).filter(Boolean);
  return list.length ? "Match in " + list.slice(0, 2).join(" and ") : "";
}

function applyFilters() {
  const q = state.q.trim();
  const result = q ? search(index, q) : null;
  const ranking = result && result.mode !== "all" ? result : null;
  const hits = ranking ? new Map(ranking.results.map((r) => [r.name, r])) : null;
  const byQuery = (t) => !hits || hits.has(t.name);

  const shown = TOOLS.filter((t) => byQuery(t) && byRisk(t) && bySet(t) && byDry(t));
  const visible = new Set(shown.map((t) => t.name));

  if (ranking) {
    groupsEl.hidden = true;
    ranked.hidden = false;
    const order = ranking.results.filter((r) => visible.has(r.name));
    for (const r of order) {
      const entry = rows.get(r.name);
      entry.li.hidden = false;
      highlight(entry, ranking.terms);
      entry.why.textContent = whyText(r.hidden);
      ranked.append(entry.li);
    }
    for (const entry of rows.values()) if (!visible.has(entry.tool.name)) entry.li.hidden = true;
  } else {
    ranked.hidden = true;
    groupsEl.hidden = false;
    for (const entry of [...rows.values()].sort((a, b) => a.order - b.order)) {
      entry.home.append(entry.li);
      entry.title.textContent = entry.tool.title;
      entry.name.innerHTML = String(breakable(entry.tool.name));
      entry.purpose.textContent = entry.tool.purpose;
      entry.why.textContent = "";
      entry.li.hidden = !visible.has(entry.tool.name);
    }
    for (const [s, g] of groups) {
      const set = DATA.toolsets.find((x) => x.name === s);
      const n = shown.filter((t) => t.toolset === s).length;
      g.el.hidden = n === 0;
      g.meta.textContent =
        (n === set.tools ? plural(set.tools, "tool") : `${n} of ${set.tools} tools`) +
        ", " +
        formatTokens(set.tokens) +
        " tokens";
    }
  }

  for (const chip of riskChips) {
    const risk = chip.dataset.risk;
    chip.setAttribute("aria-pressed", String(state.risks.has(risk)));
    setChipCount(
      chip,
      TOOLS.filter((t) => t.risk === risk && byQuery(t) && bySet(t) && byDry(t)).length,
    );
  }
  dryChip.setAttribute("aria-pressed", String(state.dry));
  setChipCount(
    dryChip,
    TOOLS.filter((t) => t.dryRunDefault && byQuery(t) && byRisk(t) && bySet(t)).length,
  );
  for (const chip of setChips) {
    const s = chip.dataset.set;
    chip.setAttribute("aria-pressed", String(state.sets.has(s)));
    setChipCount(
      chip,
      TOOLS.filter((t) => t.toolset === s && byQuery(t) && byRisk(t) && byDry(t)).length,
    );
  }
  setSelect.value = state.sets.size === 0 ? "" : state.sets.size === 1 ? [...state.sets][0] : "*";

  const active = !!(q || state.risks.size || state.sets.size || state.dry);
  $("#count").textContent =
    shown.length === TOOLS.length
      ? `Showing all ${TOOLS.length} tools`
      : `Showing ${shown.length} of ${TOOLS.length} tools`;
  $("#clear").hidden = !active;
  $("#mode-note").hidden = !(ranking && ranking.mode === "or" && shown.length);
  $("#empty").hidden = shown.length !== 0;
  if (shown.length === 0)
    $("#empty-msg").textContent = q
      ? `No tool matches “${q}” with these filters. Try other words, or clear the filters.`
      : "No tool matches these filters.";
}

const toggle = (set, value) => (set.has(value) ? set.delete(value) : set.add(value));
for (const chip of riskChips)
  chip.addEventListener("click", () => {
    toggle(state.risks, chip.dataset.risk);
    applyFilters();
  });
dryChip.addEventListener("click", () => {
  state.dry = !state.dry;
  applyFilters();
});
for (const chip of setChips)
  chip.addEventListener("click", () => {
    toggle(state.sets, chip.dataset.set);
    applyFilters();
  });
setSelect.addEventListener("change", () => {
  if (setSelect.value === "*") return;
  state.sets = new Set(setSelect.value ? [setSelect.value] : []);
  applyFilters();
});
function clearFilters() {
  state.q = "";
  input.value = "";
  state.risks.clear();
  state.sets.clear();
  state.dry = false;
  applyFilters();
}
input.addEventListener("input", () => {
  state.q = input.value;
  applyFilters();
});
input.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && input.value) {
    event.preventDefault();
    state.q = "";
    input.value = "";
    applyFilters();
  }
});
$("#clear").addEventListener("click", () => {
  clearFilters();
  input.focus();
});
$("#empty-clear").addEventListener("click", () => {
  clearFilters();
  input.focus();
});
function focusSearch() {
  if (dialog.open) {
    lastFocus = null;
    dialog.close();
  }
  const top = input.getBoundingClientRect().top;
  if (top < 70 || top > window.innerHeight - 80)
    $("#search").scrollIntoView({
      block: "center",
      behavior: reduceMotion.matches ? "auto" : "smooth",
    });
  input.focus({ preventScroll: true });
}
$("#search-jump").addEventListener("click", focusSearch);
initCommon({ onSearch: focusSearch });

const selected = new Set(SETS);
const readOnly = $("#b-ro");
const env = $("#b-env");
const tsRows = new Map($$("#ts-list .ts-row").map((li) => [li.dataset.set, li]));
const presets = $$("#presets [data-preset]");
let format = "env";
let shownTokens = TOTAL.tokens;

const fmtBig = (n) => (n < 1000 ? String(Math.round(n)) : (n / 1000).toFixed(1) + "k");
function tween(to) {
  const el = $("#b-tokens");
  const from = shownTokens;
  shownTokens = to;
  if (reduceMotion.matches || Math.abs(to - from) < 1) {
    el.textContent = fmtBig(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / 260);
    el.textContent = fmtBig(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1 && shownTokens === to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function configLines(list) {
  const lines = [];
  const all = list.length === SETS.length;
  if (!all || !readOnly.checked) lines.push(["DISCORD_MCP_TOOLSETS", all ? "all" : list.join(",")]);
  if (readOnly.checked) lines.push(["DISCORD_MCP_READ_ONLY", "true"]);
  return format === "json"
    ? lines.map(([k, v], i) => `"${k}": "${v}"${i < lines.length - 1 ? "," : ""}`)
    : lines.map(([k, v]) => `${k}=${v}`);
}

function renderBuilder() {
  const list = SETS.filter((s) => selected.has(s));
  const ro = readOnly.checked;
  const keep = (t) => selected.has(t.toolset) && (!ro || t.risk === "read");
  const picked = TOOLS.filter(keep);
  const tokens = picked.reduce((n, t) => n + t.tokens, 0);
  tween(tokens);
  const big = $("#b-tokens");
  big.dataset.tokens = String(Math.round(tokens));
  big.dataset.tools = String(picked.length);
  const pct = (tokens / TOTAL.tokens) * 100;
  $("#b-meter-fill").style.width = pct.toFixed(2) + "%";
  $("#b-meter").setAttribute(
    "aria-label",
    `${formatInt(tokens)} of ${formatInt(TOTAL.tokens)} estimated tokens selected (${Math.round(pct)}%)`,
  );
  const counts = { read: 0, write: 0, destructive: 0 };
  for (const t of picked) counts[t.risk]++;
  $("#b-mix").innerHTML = String(
    tpl`<span><b>${picked.length}</b> ${picked.length === 1 ? "tool" : "tools"}</span>${RISKS.map(
      (risk) =>
        tpl`<span data-risk="${risk}"><span class="glyph" aria-hidden="true"><i></i><i></i><i></i></span>${counts[risk]} ${RISK_WORD[risk]}</span>`,
    )}`,
  );
  let emptied = false;
  for (const s of SETS) {
    const li = tsRows.get(s);
    const inSet = TOOLS.filter((t) => t.toolset === s && (!ro || t.risk === "read"));
    emptied ||= inSet.length === 0;
    li.classList.toggle("on", selected.has(s));
    li.classList.toggle("none", inSet.length === 0);
    $("input", li).checked = selected.has(s);
    $("[data-n]", li).textContent = String(inSet.length);
    $("[data-unit]", li).textContent = inSet.length === 1 ? " tool" : " tools";
    $("[data-tok]", li).textContent = formatTokens(inSet.reduce((n, t) => n + t.tokens, 0));
  }
  $("#ro-legend").hidden = !emptied;
  for (const button of presets) {
    const p = DATA.profiles[Number(button.dataset.preset)];
    const sets = p.all ? SETS : p.sets;
    button.setAttribute(
      "aria-pressed",
      String(sets.length === list.length && sets.every((s) => selected.has(s))),
    );
  }

  const hint = $("#b-hint");
  hint.classList.remove("warn");
  const copy = $("[data-copy-term]", env);
  let usable = true;
  if (!list.length) {
    usable = false;
    hint.textContent = `An empty DISCORD_MCP_TOOLSETS loads all ${TOOLS.length} tools, so there is nothing to copy yet. Pick at least one toolset.`;
    hint.classList.add("warn");
  } else if (ro && picked.length === 0) {
    usable = false;
    hint.textContent =
      "No read-only tool in this selection: the server would stop at startup. Add a toolset with read tools, such as discovery.";
    hint.classList.add("warn");
  } else if (!selected.has("discovery")) {
    hint.textContent =
      "Tip: keep discovery. Its discord_list_guilds finds the guild_id most other tools need.";
    hint.classList.add("warn");
  } else if (ro) {
    const sensitive = [
      ["webhooks", "discord_list_webhooks", "returns webhook tokens"],
      ["dm", "discord_read_dms", "reads the bot's direct messages"],
    ].filter(([s]) => selected.has(s));
    hint.innerHTML = sensitive.length
      ? String(
          tpl`Still sensitive in read-only mode: ${sensitive.map(([, name, what], i) => tpl`${i ? "; " : ""}<code>${name}</code> ${what}`)}. Leave ${sensitive.map(([s]) => s).join(" and ")} out to hide ${sensitive.length > 1 ? "them" : "it"}.`,
        )
      : "Read-only: no tool in this selection can change your server.";
  } else if (list.length === SETS.length) {
    hint.textContent = "Same as leaving DISCORD_MCP_TOOLSETS unset: every toolset loads.";
  } else {
    hint.textContent = counts.destructive
      ? `Includes ${plural(counts.destructive, "destructive tool")}: a toolset always brings its whole module.`
      : "No destructive tool in this selection.";
  }
  setTerminalLines(env, usable ? configLines(list) : ["# Nothing to copy yet"]);
  copy.disabled = !usable;
  $("#show-sel").disabled = !list.length;
}

for (const [s, li] of tsRows)
  $("input", li).addEventListener("change", (event) => {
    if (event.target.checked) selected.add(s);
    else selected.delete(s);
    renderBuilder();
  });
readOnly.addEventListener("change", () => {
  renderBuilder();
  announce(readOnly.checked ? "Read-only mode on" : "Read-only mode off");
});
for (const button of presets)
  button.addEventListener("click", () => {
    const p = DATA.profiles[Number(button.dataset.preset)];
    selected.clear();
    (p.all ? SETS : p.sets).forEach((s) => selected.add(s));
    renderBuilder();
    announce(p.label + " profile selected");
  });
for (const radio of $$('input[name="fmt"]'))
  radio.addEventListener("change", () => {
    format = radio.value;
    renderBuilder();
  });
$("#show-sel").addEventListener("click", () => {
  state.sets = new Set(selected.size === SETS.length ? [] : selected);
  state.risks = new Set(readOnly.checked ? ["read"] : []);
  state.dry = false;
  state.q = "";
  input.value = "";
  applyFilters();
  $("#catalog").scrollIntoView({
    block: "start",
    behavior: reduceMotion.matches ? "auto" : "smooth",
  });
  announce("Catalog filtered to your toolsets");
});

const dialog = $("#tool");
let current = null;
let lastFocus = null;
const href = (name) => name + "/";

function loadedSlot(tool) {
  const ro = readOnly.checked && tool.risk !== "read";
  if (selected.has(tool.toolset) && !ro)
    return tpl`<span class="sep" aria-hidden="true"></span><span class="loaded">Loaded by your configuration</span>`;
  if (ro)
    return tpl`<span class="sep" aria-hidden="true"></span><span class="loaded">Hidden by read-only mode</span>`;
  return tpl`<span class="sep" aria-hidden="true"></span><span class="loaded">Not in your toolset line. <button class="link-btn" type="button" data-add-set="${tool.toolset}">Add ${tool.toolset}</button></span>`;
}

function renderDetail(tool) {
  current = tool;
  const { head, body } = renderToolDetail(tool, {
    labels: LABELS,
    byName,
    href,
    loaded: loadedSlot(tool),
    page: href(tool.name),
  });
  $("#dlg-head").innerHTML = String(head);
  $("#dlg-body").innerHTML = String(body);
  $("#dlg-body").scrollTop = 0;
  dialog.scrollTop = 0;
}

function openTool(name) {
  const tool = byName.get(name);
  if (!tool) return false;
  renderDetail(tool);
  if (!dialog.open) {
    lastFocus = document.activeElement;
    dialog.showModal();
  }
  $("#dlg-title").focus({ preventScroll: true });
  return true;
}
const toolFromHash = () => {
  const name = decodeURIComponent(location.hash.slice(1));
  return byName.has(name) ? name : null;
};
dialog.addEventListener("close", () => {
  current = null;
  if (toolFromHash()) {
    const depth = history.state?.dlg || 0;
    if (depth > 0) history.go(-depth);
    else history.replaceState(null, "", location.pathname + location.search);
  }
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
});
$("#dlg-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
  const add = event.target.closest("[data-add-set]");
  if (add) {
    selected.add(add.dataset.addSet);
    renderBuilder();
    renderDetail(current);
    announce(add.dataset.addSet + " added to your toolset line");
  }
});
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-tool]");
  if (!link || event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const name = link.dataset.tool;
  if (current && current.name === name) return;
  const depth = (history.state?.dlg || 0) + 1;
  history.pushState({ dlg: dialog.open ? depth : 1 }, "", "#" + name);
  openTool(name);
});
function route() {
  const name = toolFromHash();
  if (name) {
    if (!current || current.name !== name) openTool(name);
  } else if (dialog.open) {
    current = null;
    dialog.close();
  }
}
window.addEventListener("popstate", route);
window.addEventListener("hashchange", route);

const q0 = (new URLSearchParams(location.search).get("q") || "").trim();
if (q0) {
  input.value = q0;
  state.q = q0;
}
applyFilters();
renderBuilder();
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const initial = toolFromHash();
if (initial) {
  history.replaceState(null, "", location.pathname + location.search);
  history.pushState({ dlg: 1 }, "", "#" + initial);
  openTool(initial);
} else if (q0 || location.hash === "#q") {
  $("#search").scrollIntoView({ block: "start" });
  input.focus({ preventScroll: true });
}
