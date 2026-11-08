import { $, initCommon } from "./common.mjs";

initCommon({
  onSlash: () => {
    location.href = $(".search-btn").href;
  },
});
