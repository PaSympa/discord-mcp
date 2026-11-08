import { $, initCommon } from "./common.mjs";
import { requestedName, suggest } from "./suggest.mjs";
import { breakable, glyph, RISK_LABEL, tpl } from "./tpl.mjs";

const { base, tools } = JSON.parse($("#nf-data").textContent);
const input = $("#nf-q");
initCommon({ onSearch: () => input.focus() });

$("#nf-path").textContent = location.pathname;
const found = suggest(location.pathname, tools, { base });
if (found.length) {
  $("#nf-list").innerHTML = String(
    tpl`${found.map(
      (tool) => tpl`<li><a href="${base}tools/${tool.name}/">
  <span class="rt"><span data-risk="${tool.risk}" title="${RISK_LABEL[tool.risk]}">${glyph()}</span>${tool.title}<span class="vh">, ${RISK_LABEL[tool.risk]}</span></span>
  <code>${breakable(tool.name)}</code>
</a></li>`,
    )}`,
  );
  $("#nf-sug").hidden = false;
}
const words = requestedName(location.pathname, base).replace(/_/g, " ");
if (words && !input.value) input.value = words;
