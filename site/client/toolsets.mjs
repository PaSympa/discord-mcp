import { initBuilder } from "./builder.mjs";
import { $, initCommon } from "./common.mjs";

initCommon({
  onSearch: () => {
    location.href = $(".search-btn").href;
  },
});
initBuilder(JSON.parse($("#builder-data").textContent));
