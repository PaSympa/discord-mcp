import { $, initCommon } from "./common.mjs";

initCommon({
  onSearch: () => {
    location.href = $(".search-btn").href;
  },
});

// A link to a collapsed client in the guide opens it; without a script its summary still shows.
function openTarget() {
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id && document.getElementById(id);
  if (target?.tagName === "DETAILS" && !target.open) {
    target.open = true;
    target.scrollIntoView();
  }
}
openTarget();
window.addEventListener("hashchange", openTarget);
