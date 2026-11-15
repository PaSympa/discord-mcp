import { $, initCommon } from "./common.mjs";
import { requestedName, suggest, suggestToolsets, suggestTools } from "./suggest.mjs";
import { breakable, glyph, RISK_LABEL, tpl } from "./tpl.mjs";

const { base, labels, toolsets, tools } = JSON.parse($("#nf-data").textContent);
const input = $("#nf-q");
initCommon({ onSearch: () => input.focus() });

function list(heading, items) {
  $("#nf-sug-h").textContent = heading;
  $("#nf-list").innerHTML = String(tpl`${items}`);
  $("#nf-sug").hidden = false;
}

function show(found, heading) {
  if (!found.length) return;
  list(
    heading,
    found.map(
      (tool) => tpl`<li><a href="${base}tools/${tool.name}/">
  <span class="rt"><span data-risk="${tool.risk}" title="${RISK_LABEL[tool.risk]}">${glyph()}</span>${tool.title}<span class="vh">, ${RISK_LABEL[tool.risk]}</span></span>
  <code>${breakable(tool.name)}</code>
</a></li>`,
    ),
  );
}

$("#nf-path").textContent = location.pathname;
const words = requestedName(location.pathname, base).replace(/_/g, " ");
if (words && !input.value) input.value = words;
const sets = suggestToolsets(location.pathname, toolsets, { base });
const near = suggest(location.pathname, tools, { base });
if (sets.length)
  list(
    "Closest toolsets",
    sets.map(
      (set) =>
        tpl`<li><a href="${base}toolsets/${set.name}/"><span class="rt">${set.label}</span><code>${breakable(set.name)}</code></a></li>`,
    ),
  );
else if (near.length) show(near, "Closest tool names");
else if (words)
  // The search needs every description, so tools.json loads only when no name is close.
  fetch(base + "tools.json")
    .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then((catalog) =>
      show(
        suggestTools(location.pathname, catalog.tools, { base, labels }),
        `Tools for “${words}”`,
      ),
    )
    .catch(() => {});
