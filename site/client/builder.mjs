import { $, $$, announce, reduceMotion, setTerminalLines } from "./common.mjs";
import { formatInt, formatTokens, mixText, plural, riskCounts, RISKS, tpl } from "./tpl.mjs";

/**
 * The toolset builder, on the catalog and on /toolsets/. `data` holds the totals, toolsets,
 * README profiles and, per tool, its toolset, risk and tokens. `onRender` runs after each
 * update with the selected toolsets. Returns the selection, the read-only switch and a
 * function that renders the builder again after the selection changes from outside.
 */
export function initBuilder(data, { onRender } = {}) {
  const tools = data.tools;
  const sets = data.toolsets.map((s) => s.name);
  const total = data.totals;
  const maxTokens = Math.max(...data.toolsets.map((s) => s.tokens));
  const selected = new Set(sets);
  const readOnly = $("#b-ro");
  const env = $("#b-env");
  const tsRows = new Map($$("#ts-list .ts-row").map((li) => [li.dataset.set, li]));
  const presets = $$("#presets [data-preset]");
  let format = "env";
  let shownTokens = total.tokens;

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
    const all = list.length === sets.length;
    if (!all || !readOnly.checked)
      lines.push(["DISCORD_MCP_TOOLSETS", all ? "all" : list.join(",")]);
    if (readOnly.checked) lines.push(["DISCORD_MCP_READ_ONLY", "true"]);
    return format === "json"
      ? lines.map(([k, v], i) => `"${k}": "${v}"${i < lines.length - 1 ? "," : ""}`)
      : lines.map(([k, v]) => `${k}=${v}`);
  }

  const countRisks = (list) =>
    Object.fromEntries(RISKS.map((risk) => [risk, list.filter((t) => t.risk === risk).length]));

  function render() {
    const list = sets.filter((s) => selected.has(s));
    const ro = readOnly.checked;
    const keep = (t) => selected.has(t.toolset) && (!ro || t.risk === "read");
    const picked = tools.filter(keep);
    const tokens = picked.reduce((n, t) => n + t.tokens, 0);
    tween(tokens);
    const big = $("#b-tokens");
    big.dataset.tokens = String(Math.round(tokens));
    big.dataset.tools = String(picked.length);
    const pct = (tokens / total.tokens) * 100;
    $("#b-meter-fill").style.width = pct.toFixed(2) + "%";
    $("#b-meter").setAttribute(
      "aria-label",
      `${formatInt(tokens)} of ${formatInt(total.tokens)} estimated tokens selected (${Math.round(pct)}%)`,
    );
    const counts = countRisks(picked);
    $("#b-mix").innerHTML = String(
      tpl`<span><b>${picked.length}</b> ${picked.length === 1 ? "tool" : "tools"}</span>${riskCounts(counts)}`,
    );
    // Read-only mode loads only read tools, so the other bars would describe tools left out.
    $("#ts-list").classList.toggle("ro", ro);
    let emptied = false;
    for (const s of sets) {
      const li = tsRows.get(s);
      const inSet = tools.filter((t) => t.toolset === s && (!ro || t.risk === "read"));
      emptied ||= inSet.length === 0;
      li.classList.toggle("on", selected.has(s));
      li.classList.toggle("none", inSet.length === 0);
      $("input", li).checked = selected.has(s);
      $("[data-n]", li).textContent = String(inSet.length);
      $("[data-unit]", li).textContent = inSet.length === 1 ? " tool" : " tools";
      const cost = inSet.reduce((n, t) => n + t.tokens, 0);
      $("[data-tok]", li).textContent = formatTokens(cost);
      const fill = $(".ts-bar i", li);
      fill.style.width = ((cost / maxTokens) * 100).toFixed(1) + "%";
      fill.hidden = cost === 0;
      $("[data-mix]", li).textContent = mixText(countRisks(inSet));
    }
    $("#ro-legend").hidden = !emptied;
    for (const button of presets) {
      const p = data.profiles[Number(button.dataset.preset)];
      const want = p.all ? sets : p.sets;
      button.setAttribute(
        "aria-pressed",
        String(want.length === list.length && want.every((s) => selected.has(s))),
      );
    }

    const hint = $("#b-hint");
    hint.classList.remove("warn");
    const copy = $("[data-copy-term]", env);
    let usable = true;
    if (!list.length) {
      usable = false;
      hint.textContent = `An empty DISCORD_MCP_TOOLSETS loads all ${tools.length} tools, so there is nothing to copy yet. Pick at least one toolset.`;
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
    } else if (list.length === sets.length) {
      hint.textContent = "Same as leaving DISCORD_MCP_TOOLSETS unset: every toolset loads.";
    } else {
      hint.textContent = counts.destructive
        ? `Includes ${plural(counts.destructive, "destructive tool")}: a toolset always brings its whole module.`
        : "No destructive tool in this selection.";
    }
    setTerminalLines(env, usable ? configLines(list) : ["# Nothing to copy yet"]);
    copy.disabled = !usable;
    onRender?.(list);
  }

  for (const [s, li] of tsRows)
    $("input", li).addEventListener("change", (event) => {
      if (event.target.checked) selected.add(s);
      else selected.delete(s);
      render();
    });
  readOnly.addEventListener("change", () => {
    render();
    announce(readOnly.checked ? "Read-only mode on" : "Read-only mode off");
  });
  for (const button of presets)
    button.addEventListener("click", () => {
      const p = data.profiles[Number(button.dataset.preset)];
      selected.clear();
      (p.all ? sets : p.sets).forEach((s) => selected.add(s));
      render();
      announce(p.label + " profile selected");
    });
  for (const radio of $$('input[name="fmt"]'))
    radio.addEventListener("change", () => {
      format = radio.value;
      render();
    });

  render();
  return { selected, readOnly, render };
}
