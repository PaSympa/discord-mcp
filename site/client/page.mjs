import { $, initCommon } from "./common.mjs";

initCommon({
  onSearch: () => {
    location.href = $(".search-btn").href;
  },
});
