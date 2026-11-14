import { initBuilder } from "./builder.mjs";
import { $, initCommon } from "./common.mjs";
import { formatTokens, plural } from "./tpl.mjs";

initCommon({
  onSearch: () => {
    location.href = $(".search-btn").href;
  },
});

const catalogLink = $("#show-cat");
const catalogHref = catalogLink.getAttribute("href");
const lineCopy = $("#lb-copy");
const toolsetData = JSON.parse($("#builder-data").textContent);

initBuilder(toolsetData, {
  onRender: (list, { lines, usable, tools, tokens, readOnly }) => {
    const all = list.length === toolsetData.toolsets.length;
    const query = [
      ...(all ? [] : ["sets=" + list.join(",")]),
      ...(readOnly ? ["risk=read"] : []),
    ].join("&");
    if (usable) {
      catalogLink.setAttribute("href", catalogHref + (query ? "?" + query : ""));
      catalogLink.removeAttribute("aria-disabled");
    } else {
      catalogLink.removeAttribute("href");
      catalogLink.setAttribute("aria-disabled", "true");
    }
    $("#lb-tokens").textContent = formatTokens(tokens) + " tokens";
    $("#lb-count").textContent = `${plural(tools, "tool")} in ${plural(list.length, "toolset")}`;
    lineCopy.dataset.copyText = lines.join("\n");
    lineCopy.disabled = !usable;
  },
});
