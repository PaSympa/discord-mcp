import { $, $$, announce, initCommon, reduceMotion } from "./common.mjs";
import { initBuilder } from "./builder.mjs";
import { renderToolDetail } from "./detail.mjs";
import { createIndex, matchRanges, search } from "./search.mjs";
import { breakable, formatTokens, marked, plural, RISKS, tpl } from "./tpl.mjs";

const DATA = JSON.parse($("#catalog-data").textContent);
const TOOLS = DATA.tools;
const SETS = DATA.toolsets.map((s) => s.name);
const LABELS = Object.fromEntries(DATA.toolsets.map((s) => [s.name, s.label]));
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
      const inSet = shown.filter((t) => t.toolset === s);
      const n = inSet.length;
      g.el.hidden = n === 0;
      // The strip keeps one bar per row left in the group.
      for (const risk of RISKS) {
        const left = inSet.filter((t) => t.risk === risk).length;
        $$(`.group-head .strip [data-risk="${risk}"]`, g.el).forEach((bar, i) => {
          bar.hidden = i >= left;
        });
      }
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

const builder = initBuilder(DATA, {
  onRender: (list, ro) => {
    $("#show-sel").disabled = !list.length;
    groupsEl.classList.toggle("ro", ro);
  },
});
const { selected, readOnly } = builder;
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
    builder.render();
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
