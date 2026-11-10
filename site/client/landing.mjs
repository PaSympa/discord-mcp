import { $, $$, announce, initCommon, setTerminalLines } from "./common.mjs";
import { formatInt, formatTokens } from "./tpl.mjs";

initCommon({
  onSearch: () => {
    location.href = "tools/#q";
  },
});

// Client tabs: plain in-page links without JavaScript, ARIA tabs with it.
const tablist = $("#client-tabs");
const tabs = $$(".tab", tablist);
const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("href").slice(1)));
tablist.setAttribute("role", "tablist");
tabs.forEach((tab, i) => {
  tab.setAttribute("role", "tab");
  tab.id = "tab-" + panels[i].id;
  tab.setAttribute("aria-controls", panels[i].id);
  panels[i].setAttribute("role", "tabpanel");
  panels[i].removeAttribute("aria-label");
  panels[i].setAttribute("aria-labelledby", tab.id);
});
function selectTab(index, focus) {
  tabs.forEach((tab, i) => {
    const on = i === index;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    panels[i].hidden = !on;
  });
  if (focus) tabs[index].focus();
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", (event) => {
    event.preventDefault();
    selectTab(i);
  });
  tab.addEventListener("keydown", (event) => {
    const n = tabs.length;
    const next = {
      ArrowRight: i + 1,
      ArrowDown: i + 1,
      ArrowLeft: i - 1,
      ArrowUp: i - 1,
      Home: 0,
      End: n - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectTab((next + n) % n, true);
  });
});
const fromHash = panels.findIndex((panel) => "#" + panel.id === location.hash);
selectTab(fromHash > -1 ? fromHash : 0);
$("#clients").classList.add("is-tabs");

const profileInputs = $$('input[name="profile"]');
const readOnly = $("#pf-ro");
const env = $("#pf-env");
const hint = $("#pf-hint");
function showProfile(say) {
  const ro = readOnly.checked;
  const picked = profileInputs.find((input) => input.checked);
  for (const input of profileInputs) {
    const row = input.closest(".pf");
    const tools = Number(ro ? input.dataset.roTools : input.dataset.tools);
    const tokens = Number(ro ? input.dataset.roTokens : input.dataset.tokens);
    row.classList.toggle("on", input === picked);
    $(".pf-tools", row).textContent = String(tools);
    $(".pf-unit", row).textContent = tools === 1 ? " tool" : " tools";
    $(".pf-tok-short", row).textContent = formatTokens(tokens);
    $(".pf-tok-long", row).textContent =
      "about " + formatInt(Math.round(tokens / 100) * 100) + " tokens";
    $(".pf-bar i", row).style.width = ((tokens / Number(input.dataset.max)) * 100).toFixed(1) + "%";
  }
  const sets = picked.dataset.sets;
  const lines = [];
  if (sets !== "all" || !ro) lines.push("DISCORD_MCP_TOOLSETS=" + sets);
  if (ro) lines.push("DISCORD_MCP_READ_ONLY=true");
  setTerminalLines(env, lines);
  const label = $(".pf-name", picked.closest(".pf")).textContent;
  hint.textContent =
    sets === "all" && !ro ? "Same as leaving DISCORD_MCP_TOOLSETS unset: every toolset loads." : "";
  if (say) announce(label + (ro ? ", read-only: " : ": ") + lines.join(" "));
}
for (const input of profileInputs) input.addEventListener("change", () => showProfile(true));
readOnly.addEventListener("change", () => showProfile(true));
showProfile(false);

// The recording loads only when asked for: the video keeps preload="none" until the first Play.
const play = $("#demo-play");
const frame = $("#demo-frame");
const video = $("#demo-video");
const [playIcon, pauseIcon] = $$("svg", play);
play.setAttribute("role", "button");
function showPlaying(playing) {
  playIcon.toggleAttribute("hidden", playing);
  pauseIcon.toggleAttribute("hidden", !playing);
  $("span", play).textContent = playing ? "Pause the recording" : "Play the recording";
}
video.addEventListener("play", () => {
  showPlaying(true);
  announce("Recording playing");
});
video.addEventListener("pause", () => {
  showPlaying(false);
  announce("Recording paused");
});
$("source", video).addEventListener("error", () => {
  frame.hidden = true;
  play.hidden = true;
});
play.addEventListener("keydown", (event) => {
  if (event.key !== " ") return;
  event.preventDefault();
  play.click();
});
play.addEventListener("click", (event) => {
  event.preventDefault();
  frame.hidden = false;
  if (video.paused) video.play().catch(() => showPlaying(false));
  else video.pause();
});
