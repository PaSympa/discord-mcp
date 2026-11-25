/**
 * Opens the generated site in headless Chrome and checks what the static tests cannot see:
 * layout from 320 to 1440 px in light and dark mode, console errors, failed requests, alt
 * text, keyboard focus, the menu, the search shortcut, the catalog search and filters, the
 * toolset builder on /toolsets/, the 404 suggestions and the Copy buttons. _site/ is served
 * under /discord-mcp/ with GitHub Pages' 404 behavior.
 *
 * Run `npm run build && npm run site` first. Needs Chrome, so CI does not run it.
 * Usage: node scripts/site-browser-check.mjs [--chrome <path>] [--shots <dir>]
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("../_site/", import.meta.url));
const BASE = "/discord-mcp/";
const WIDTHS = [320, 340, 355, 380, 390, 768, 980, 1440];
const MENU_UP_TO = 980;
const SCHEMES = ["light", "dark"];
const TOOL_PAGES = [
  "discord_ban_member",
  "discord_read_messages",
  "discord_bulk_delete_messages",
  "discord_send_embed",
  "discord_get_audit_log",
  "discord_set_role_icon",
  "discord_list_guilds",
  "discord_follow_announcement_channel",
  "discord_get_server_stats",
  "discord_update_membership_screening",
];
const TOOLSET_PAGES = ["channels", "messages", "moderation", "scheduled_events", "dm"];
const DOC_PAGES = ["guide", "recipes", "configuration", "troubleshooting", "privacy"];
// Copied as typed: a no-break space or a lost line would break the command in a shell.
const CODEX_COMMAND = [
  "codex mcp add discord \\",
  "  --env DISCORD_TOKEN=YOUR_BOT_TOKEN \\",
  "  --env DISCORD_MCP_TOOLSETS=discovery,messages \\",
  "  --env DISCORD_MCP_READ_ONLY=true \\",
  "  --env DISCORD_ALLOWED_GUILDS=YOUR_GUILD_ID \\",
  "  -- npx -y @pasympa/discord-mcp",
].join("\n");
const SEARCHES = [
  ["ban a member", "discord_ban_member"],
  ["bulk_delete", "discord_bulk_delete_messages"],
  ["slowmode", "discord_edit_channel"],
  ["send an embed", "discord_send_embed"],
  ["create a forum post", "discord_create_forum_post"],
  ["timeout a user", "discord_timeout_member"],
  ["mute someone", "discord_timeout_member"],
  ["purge", "discord_bulk_delete_messages"],
  ["give a role", "discord_add_role"],
  ["schedule an event", "discord_create_scheduled_event"],
  ["dm", "discord_send_dm"],
  ["event", "discord_create_scheduled_event"],
  ["webhook", "discord_create_webhook"],
  ["invite", "discord_create_invite"],
  ["who reacted to a message", "discord_get_reactions"],
];
const MISSPELLED = [
  ["tools/discord_ban_membr/", "discord_ban_member"],
  ["tools/discord_send_mesage/", "discord_send_message"],
  ["tools/discord-timeout-memebr", "discord_timeout_member"],
  ["tools/discord_list_threads/", "discord_list_channel_threads"],
  ["tools/discord_purge_messages/", "discord_bulk_delete_messages"],
  ["tools/discord_mute_member/", "discord_timeout_member"],
  ["tools/discord_create_event/", "discord_create_scheduled_event"],
];
const MISSPELLED_SETS = [
  ["toolsets/mesages/", "messages"],
  ["toolset/messages/", "messages"],
  ["toolsets/scheduled-event/", "scheduled_events"],
  ["toolsets/direct-messages", "dm"],
];
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const shots = option("shots");
if (!existsSync(join(SITE, "index.html"))) throw new Error("_site/ is missing: run npm run site.");
const CATALOG = JSON.parse(readFileSync(join(SITE, "tools.json"), "utf8")).tools;
const toolCount = (sets, readOnly = false) =>
  CATALOG.filter((t) => sets.includes(t.toolset) && (!readOnly || t.risk === "read")).length;

/** Serves _site/ under BASE like GitHub Pages: folders give index.html, misses give 404.html. */
function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = null;
    if (path.startsWith(BASE)) {
      const candidate = normalize(join(SITE, path.slice(BASE.length)));
      if (candidate.startsWith(SITE) || candidate + sep === SITE) {
        file = candidate;
        if (existsSync(file) && statSync(file).isDirectory()) {
          if (!path.endsWith("/")) {
            res.writeHead(301, { location: path + "/" }).end();
            return;
          }
          file = join(file, "index.html");
        }
      }
    }
    const found = file && existsSync(file) && statSync(file).isFile();
    const served = found ? file : join(SITE, "404.html");
    res.writeHead(found ? 200 : 404, {
      "content-type": TYPES[extname(served)] ?? "application/octet-stream",
    });
    res.end(readFileSync(served));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function chromePath() {
  const given = option("chrome") ?? process.env.CHROME;
  const known = [
    given,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = known.find((path) => existsSync(path));
  if (!found) throw new Error("Chrome not found: pass --chrome <path> or set CHROME.");
  return found;
}

/** Starts headless Chrome on a free debugging port and returns that port. */
async function launch(profile) {
  const chrome = spawn(
    chromePath(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const port = await new Promise((resolve, reject) => {
    let err = "";
    chrome.stderr.on("data", (chunk) => {
      err += chunk;
      const m = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(err);
      if (m) resolve(Number(m[1]));
    });
    chrome.on("exit", (code) => reject(new Error(`Chrome exited (${code}):\n${err}`)));
  });
  return { chrome, port };
}

/** A DevTools Protocol session on a websocket: the browser's, or one new tab's. */
async function connect(port, { browser = false } = {}) {
  const target = browser
    ? await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    : await (
        await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })
      ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolve(msg.result);
    } else if (msg.method) for (const listen of listeners) listen(msg.method, msg.params);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { ws, send, evaluate, listeners };
}

const results = { pass: 0, fail: 0, failures: [] };
function check(label, ok, detail) {
  if (ok) results.pass++;
  else {
    results.fail++;
    results.failures.push(`${label}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
  }
  return ok;
}

// Runs in the page: elements wider than the viewport, boxes that scroll or clip sideways, and
// content that spills out of its box onto its neighbor. Truncation with an ellipsis is intended.
const OVERFLOW = `(() => {
  for (const d of document.querySelectorAll("details")) d.open = true;
  const vw = document.documentElement.clientWidth;
  const out = [];
  if (document.documentElement.scrollWidth > vw) out.push("page " + document.documentElement.scrollWidth + " > " + vw);
  const visible = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && !el.closest("[hidden], dialog:not([open]), .vh");
  const what = (el) => el.tagName.toLowerCase() + "." + el.className + (el.closest("[data-set]") ? " in " + el.closest("[data-set]").dataset.set : "");
  // A band from edge to edge of the viewport, like the line bar, widens its box on purpose.
  const bleedsOnly = (el) => {
    const r = el.getBoundingClientRect();
    const past = [...el.querySelectorAll("*")].filter((c) => {
      const b = c.getBoundingClientRect();
      return visible(c) && (b.right > r.right + 1 || b.left < r.left - 1);
    });
    const outer = past.filter((c) => !past.some((p) => p !== c && p.contains(c)));
    return outer.length > 0 && outer.every((c) => {
      const b = c.getBoundingClientRect();
      return Math.abs(b.left) <= 1 && Math.abs(b.right - vw) <= 1;
    });
  };
  for (const el of document.querySelectorAll("main *, header *, footer *")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) out.push(what(el) + " spans " + Math.round(r.left) + " to " + Math.round(r.right));
    const cs = getComputedStyle(el);
    if (el.clientWidth === 0 || el.scrollWidth <= el.clientWidth + 1 || cs.textOverflow === "ellipsis") continue;
    if (/auto|scroll|hidden|clip/.test(cs.overflowX)) {
      if (/^(table|pre|code|dl|ul|ol|div|p|section|figure)$/i.test(el.tagName))
        out.push(what(el) + " scrolls sideways (" + el.scrollWidth + " > " + el.clientWidth + ")");
    } else if (!cs.display.startsWith("inline") && cs.display !== "contents" && !bleedsOnly(el))
      out.push(what(el) + " spills out of its box (" + el.scrollWidth + " > " + el.clientWidth + ")");
    if (out.length > 5) break;
  }
  return out;
})()`;

// Runs in the page: the WCAG contrast of every text inside notes, hints and legends, against
// the backgrounds it sits on, blended down to the first opaque one. AA asks 4.5:1, or 3:1 for
// text of 24 px, or 18.66 px in bold.
const CONTRAST = String.raw`(() => {
  const parse = (value) => {
    let m = /rgba?\(([^)]+)\)/.exec(value);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p[3] ?? 1];
    }
    m = /color\(srgb ([^)]+)\)/.exec(value);
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1];
    }
    return null;
  };
  const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
  const background = (el) => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (!c) return null;
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    return layers.reverse().reduce((base, layer) => over(layer, base), [255, 255, 255, 1]);
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const shown = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && !el.closest("[hidden], dialog:not([open]), .vh");
  const fails = [];
  let checked = 0;
  for (const box of document.querySelectorAll(".tsp-note, .note, .hint, .ts-legend, .method, .tsx-ro, .tsx-none, .tsx-key, .fine")) {
    if (!shown(box)) continue;
    for (const el of [box, ...box.querySelectorAll("*")]) {
      if (!shown(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(el);
      const bg = background(el);
      const fg = parse(cs.color);
      if (!bg || !fg) {
        fails.push("unreadable color " + cs.color + " on " + cs.backgroundColor);
        continue;
      }
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const r = ratio(over(fg, bg), bg);
      checked++;
      if (r < (large ? 3 : 4.5))
        fails.push(el.tagName.toLowerCase() + "." + el.className + " in ." + box.className.split(" ")[0] + ' "' + el.textContent.trim().slice(0, 30) + '" ' + r.toFixed(2) + ":1");
    }
  }
  return { checked, fails };
})()`;

// Runs in the page: shell lines whose closing " \" wrapped onto a line of its own, measured by
// comparing the line box of the backslash with that of the character before the space.
const LONE_BACKSLASH = String.raw`(() => {
  const lone = [];
  for (const line of document.querySelectorAll(".term-code .l")) {
    if (!line.getClientRects().length || !line.textContent.endsWith(" \\")) continue;
    const chars = [];
    const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode())
      for (let i = 0; i < node.data.length; i++) chars.push([node, i]);
    const top = ([node, i]) => {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      return range.getClientRects()[0]?.top;
    };
    if (Math.abs(top(chars.at(-1)) - top(chars.at(-3))) > 2) lone.push(line.textContent);
  }
  return lone;
})()`;

// Runs in the page: what Tab should reach, in document order, each with a stable key.
const FOCUSABLES = `(() => {
  const all = [...document.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]")];
  const shown = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && !el.closest("[hidden], dialog:not([open]), [inert], details:not([open]) > :not(summary)");
  const keep = all.filter((el) => el.tabIndex >= 0 && !el.disabled && shown(el) && !(el.type === "radio" && !el.checked && document.querySelector('input[type=radio][name="' + el.name + '"]:checked')));
  keep.forEach((el, i) => el.setAttribute("data-k", String(i)));
  return keep.length;
})()`;

// Runs in the page: which expected element has focus, whether its ring shows, and whether
// something else covers it (the open menu did). Hidden inputs show through their label.
const FOCUSED = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const ring = (node) => {
    if (!node) return false;
    const cs = getComputedStyle(node);
    return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
  };
  const hidden = getComputedStyle(el).opacity === "0";
  const shown = hidden ? el.nextElementSibling : el;
  const r = shown.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const covered = !hit || !(shown.contains(hit) || hit.contains(shown) || [...(el.labels || [])].some((label) => label.contains(hit)));
  return { k: el.getAttribute("data-k"), ring: hidden ? ring(el.nextElementSibling) : ring(el) || ring(el.nextElementSibling), covered, what: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + el.className + (covered && hit ? " under " + hit.tagName.toLowerCase() + "." + hit.className : "") };
})()`;

async function main() {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const site = origin + BASE;
  const profile = mkdtempSync(join(tmpdir(), "discord-mcp-site-chrome-"));
  const { chrome, port } = await launch(profile);
  const browser = await connect(port, { browser: true });
  await browser.send("Browser.grantPermissions", {
    origin,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
  const tab = await connect(port);
  const { send, evaluate, listeners } = tab;
  const counts = {
    loads: 0,
    tabStops: 0,
    searches: 0,
    suggestions: 0,
    copies: 0,
    builds: 0,
    contrasts: 0,
  };
  let log = [];
  let current = "";
  listeners.add((method, params) => {
    if (method === "Runtime.exceptionThrown")
      log.push("exception: " + params.exceptionDetails.text);
    if (
      method === "Runtime.consoleAPICalled" &&
      ["error", "warning", "assert"].includes(params.type)
    )
      log.push(
        `console.${params.type}: ` + params.args.map((a) => a.value ?? a.description).join(" "),
      );
    // A missing page answers 404 by design; Chrome logs that status for the document itself.
    if (
      method === "Log.entryAdded" &&
      params.entry.level === "error" &&
      params.entry.url !== current
    )
      log.push("log: " + params.entry.text + (params.entry.url ? " " + params.entry.url : ""));
    if (method === "Network.loadingFailed" && !params.canceled)
      log.push("request failed: " + params.errorText + " " + (params.blockedReason ?? ""));
    if (
      method === "Network.responseReceived" &&
      params.response.status >= 400 &&
      params.type !== "Document"
    )
      log.push(`HTTP ${params.response.status}: ${params.response.url}`);
  });
  const loaded = () =>
    new Promise((resolve) => {
      const listen = (method) => {
        if (method === "Page.loadEventFired") {
          listeners.delete(listen);
          resolve();
        }
      };
      listeners.add(listen);
    });
  let status = 0;
  listeners.add((method, params) => {
    if (method === "Network.responseReceived" && params.type === "Document")
      status = params.response.status;
  });
  const go = async (path) => {
    log = [];
    current = site + path;
    const done = loaded();
    await send("Page.navigate", { url: current });
    await done;
    await evaluate("document.fonts.ready.then(() => true)");
    await sleep(120);
    counts.loads++;
  };
  const press = async (key, code, keyCode, modifiers = 0) => {
    for (const type of ["rawKeyDown", "keyUp"])
      await send("Input.dispatchKeyEvent", {
        type,
        key,
        code,
        windowsVirtualKeyCode: keyCode,
        modifiers,
      });
  };
  const pressTab = () => press("Tab", "Tab", 9);
  const until = async (expression, ms = 2000) => {
    for (const start = Date.now(); Date.now() - start < ms; await sleep(50))
      if (await evaluate(expression)) return true;
    return false;
  };
  const click = async (selector) => {
    const found = await evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView({ block: "center" }); return !!el; })()`,
    );
    if (!found)
      throw new Error(`Nothing matches ${selector} on ${await evaluate("location.pathname")}.`);
    const box = await evaluate(
      `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
    );
    for (const type of ["mousePressed", "mouseReleased"])
      await send("Input.dispatchMouseEvent", {
        type,
        x: box.x,
        y: box.y,
        button: "left",
        clickCount: 1,
      });
  };

  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Log.enable");
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });

    const pages = [
      ["home", ""],
      ["catalog", "tools/"],
      ["toolsets", "toolsets/"],
      ...TOOL_PAGES.map((name) => [name, `tools/${name}/`]),
      ...TOOLSET_PAGES.map((name) => [`toolset-${name}`, `toolsets/${name}/`]),
      ...DOC_PAGES.map((name) => [name, `${name}/`]),
      ["404", MISSPELLED[0][0]],
    ];
    for (const scheme of SCHEMES) {
      await send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: scheme }],
      });
      for (const width of WIDTHS) {
        const mobile = width < 768;
        await send("Emulation.setDeviceMetricsOverride", {
          width,
          height: mobile ? 800 : 900,
          deviceScaleFactor: 1,
          mobile,
        });
        for (const [name, path] of pages) {
          const where = `${name} at ${width} px, ${scheme}`;
          await go(path);
          check(`${where}: HTTP status`, status === (name === "404" ? 404 : 200), status);
          check(
            `${where}: color scheme applied`,
            await evaluate(`matchMedia("(prefers-color-scheme: ${scheme})").matches`),
          );
          if (shots) {
            mkdirSync(shots, { recursive: true });
            const shot = await send("Page.captureScreenshot", { format: "png" });
            writeFileSync(
              join(shots, `${name}-${width}-${scheme}.png`),
              Buffer.from(shot.data, "base64"),
            );
          }
          check(
            `${where}: every image has alt text`,
            await evaluate(`[...document.images].every((img) => img.hasAttribute("alt"))`),
          );

          const expected = await evaluate(FOCUSABLES);
          await evaluate(
            `document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0)`,
          );
          const seen = new Map();
          const noRing = [];
          const covered = [];
          const unlisted = new Set();
          for (let i = 0; i < expected + 4 && seen.size < expected; i++) {
            await pressTab();
            const focus = await evaluate(FOCUSED);
            if (!focus) continue;
            if (focus.k === null) {
              unlisted.add(focus.what);
              continue;
            }
            if (!seen.has(focus.k)) {
              seen.set(focus.k, focus);
              counts.tabStops++;
              if (!focus.ring) noRing.push(focus.what);
              if (focus.covered) covered.push(focus.what);
            }
          }
          check(
            `${where}: Tab reaches all ${expected} interactive elements`,
            seen.size === expected,
            { reached: seen.size, expected, unlisted: [...unlisted].slice(0, 5) },
          );
          check(
            `${where}: focus is visible on every stop`,
            noRing.length === 0,
            noRing.slice(0, 5),
          );
          check(
            `${where}: no Tab stop sits under another element`,
            covered.length === 0,
            covered.slice(0, 5),
          );

          const overflow = await evaluate(OVERFLOW);
          check(
            `${where}: nothing wider than the viewport, details open`,
            overflow.length === 0,
            overflow,
          );
          const lone = await evaluate(LONE_BACKSLASH);
          check(
            `${where}: no shell line wraps its closing backslash onto a line of its own`,
            lone.length === 0,
            lone,
          );
          const contrast = await evaluate(CONTRAST);
          counts.contrasts += contrast.checked;
          check(
            `${where}: text in notes, hints and legends meets the AA contrast`,
            contrast.fails.length === 0,
            contrast.fails.slice(0, 5),
          );
          check(`${where}: no console error or failed request`, log.length === 0, log.slice(0, 5));
        }

        await go("tools/");
        for (const [query, top] of SEARCHES) {
          const first = await evaluate(`(() => {
            const input = document.getElementById("q");
            input.value = ${JSON.stringify(query)};
            input.dispatchEvent(new Event("input", { bubbles: true }));
            const row = document.querySelector("#ranked .row-li:not([hidden])");
            return row && { name: row.dataset.tool, href: row.querySelector("a.row").getAttribute("href") };
          })()`);
          counts.searches++;
          check(
            `search "${query}" at ${width} px, ${scheme}`,
            first?.name === top && first.href === `${top}/`,
            first,
          );
        }

        for (const [path, tool] of MISSPELLED) {
          await go(path);
          await until(`!document.getElementById("nf-sug").hidden`);
          const sug = await evaluate(
            `[...document.querySelectorAll("#nf-list a")].map((a) => a.getAttribute("href"))`,
          );
          counts.suggestions++;
          check(`404 for ${path} at ${width} px, ${scheme}: status 404`, status === 404, status);
          check(
            `404 for ${path} at ${width} px, ${scheme}: suggests ${tool} first`,
            sug[0] === `${BASE}tools/${tool}/`,
            sug,
          );
          check(`404 for ${path} at ${width} px, ${scheme}: no error`, log.length === 0, log);
        }

        for (const [path, set] of MISSPELLED_SETS) {
          await go(path);
          await until(`!document.getElementById("nf-sug").hidden`);
          const sug = await evaluate(
            `[...document.querySelectorAll("#nf-list a")].map((a) => a.getAttribute("href"))`,
          );
          counts.suggestions++;
          check(
            `404 for ${path} at ${width} px, ${scheme}: suggests the ${set} toolset first`,
            status === 404 && sug[0] === `${BASE}toolsets/${set}/`,
            { status, sug },
          );
          check(`404 for ${path} at ${width} px, ${scheme}: no error`, log.length === 0, log);
        }

        // The builder lives on /toolsets/ only since fbc1786.
        await go("toolsets/");
        const state = () =>
          evaluate(`(() => {
            const big = document.getElementById("b-tokens");
            return {
              env: [...document.querySelectorAll("#b-env .term-code .l")].map((l) => l.textContent).join("\\n"),
              tools: big.dataset.tools,
              tokens: big.dataset.tokens,
              copy: document.querySelector("#b-env [data-copy-term]").disabled,
              none: [...document.querySelectorAll("#ts-list .ts-row.none")].map((li) => li.dataset.set),
              pressed: [...document.querySelectorAll("#presets [aria-pressed=true]")].map((b) => b.textContent),
              hint: document.getElementById("b-hint").textContent,
              bars: document.querySelectorAll("#ts-list .strip i").length,
              shownBars: [...document.querySelectorAll("#ts-list .strip i")].filter((el) => el.getClientRects().length).map((el) => el.dataset.risk),
              key: document.querySelector(".tsx-key").getClientRects().length > 0,
              contrast: ${CONTRAST}.fails,
            };
          })()`);
        const preset = (
          await evaluate(`document.querySelector('#presets [data-preset="1"]').title`)
        ).split(",");
        const withChannels = [...preset, "channels"];
        const steps = [];
        await click('#presets [data-preset="1"]');
        steps.push(await state());
        await click("#line .switch");
        steps.push(await state());
        await click('#ts-list [data-set="channels"] label');
        steps.push(await state());
        await click("#line .switch");
        await click('.seg input[value="json"] + span');
        steps.push(await state());
        for (const li of await evaluate(
          `[...document.querySelectorAll("#ts-list .ts-row.on")].map((li) => li.dataset.set)`,
        ))
          await click(`#ts-list [data-set="${li}"] label`);
        steps.push(await state());
        counts.builds++;
        check(
          `the builder on /toolsets/ composes a toolset line at ${width} px, ${scheme}`,
          steps.every((step, i) => {
            const ro = i === 1 || i === 2;
            return (
              step.shownBars.length > 0 &&
              (ro
                ? step.shownBars.every((risk) => risk === "read")
                : step.shownBars.length === step.bars) &&
              step.key &&
              step.contrast.length === 0
            );
          }) &&
            steps[0].env === `DISCORD_MCP_TOOLSETS=${preset}` &&
            steps[0].tools === String(toolCount(preset)) &&
            steps[0].pressed.length === 1 &&
            steps[1].env === `DISCORD_MCP_TOOLSETS=${preset}\nDISCORD_MCP_READ_ONLY=true` &&
            steps[1].tools === String(toolCount(preset, true)) &&
            steps[1].none.includes("channels") &&
            steps[2].env === `DISCORD_MCP_TOOLSETS=${withChannels}\nDISCORD_MCP_READ_ONLY=true` &&
            steps[2].tools === String(toolCount(withChannels, true)) &&
            steps[3].env === `"DISCORD_MCP_TOOLSETS": "${withChannels}"` &&
            steps[3].tools === String(toolCount(withChannels)) &&
            steps[4].copy === true &&
            steps[4].tools === "0" &&
            log.length === 0,
          { steps, log },
        );

        for (const readOnly of [false, true]) {
          await go("toolsets/");
          await click('#presets [data-preset="1"]');
          if (readOnly) await click("#line .switch");
          const arrivedCat = loaded();
          await click("#show-cat");
          await arrivedCat;
          const shown = await evaluate(`({
            search: location.search,
            count: document.getElementById("count").textContent,
          })`);
          check(
            `the builder's catalog link lists its ${readOnly ? "read-only " : ""}tools at ${width} px, ${scheme}`,
            shown.search === `?sets=${preset}${readOnly ? "&risk=read" : ""}` &&
              shown.count === `Showing ${toolCount(preset, readOnly)} of ${CATALOG.length} tools`,
            shown,
          );
        }

        await go("tools/discord_ban_member/");
        if (width <= MENU_UP_TO) await click("#menu-btn");
        let arrivedSets = loaded();
        await click('#site-nav a[href$="toolsets/"]');
        await arrivedSets;
        check(
          `the header's Toolsets link opens /toolsets/, marked current, at ${width} px, ${scheme}`,
          (await evaluate("location.pathname")) === `${BASE}toolsets/` &&
            (await evaluate(
              `document.querySelector('#site-nav a[aria-current="page"]')?.textContent`,
            )) === "Toolsets",
          await evaluate("location.pathname"),
        );
        arrivedSets = loaded();
        await click("#ts-channels h2 a");
        await arrivedSets;
        const setPage = await evaluate(`({
          path: location.pathname,
          rows: document.querySelectorAll(".rows .row").length,
          crumb: document.querySelector(".crumbs a")?.getAttribute("href"),
        })`);
        check(
          `a toolset entry opens its page, with its tool rows at ${width} px, ${scheme}`,
          setPage.path === `${BASE}toolsets/channels/` &&
            setPage.rows === toolCount(["channels"]) &&
            setPage.crumb === "../",
          setPage,
        );
        arrivedSets = loaded();
        await click('.rows a.row[data-tool="discord_delete_channel"]');
        await arrivedSets;
        arrivedSets = loaded();
        await click(".crumbs li:nth-child(2) a");
        await arrivedSets;
        check(
          `a tool page's breadcrumb leads back to its toolset page at ${width} px, ${scheme}`,
          (await evaluate("location.pathname")) === `${BASE}toolsets/channels/`,
          await evaluate("location.pathname"),
        );

        const copies = [
          ["", "#install .panel:not([hidden]) [data-copy-term]", null],
          ["toolsets/", "#b-env [data-copy-term]", "DISCORD_MCP_TOOLSETS=all"],
          ["configuration/", "#set-codex [data-copy-term]", CODEX_COMMAND],
          ["toolsets/channels/", "#tsp-line [data-copy-term]", "DISCORD_MCP_TOOLSETS=channels"],
          ["tools/discord_ban_member/", "[data-copy-text]", "discord_ban_member"],
        ];
        for (const [path, selector, want] of copies) {
          await go(path);
          const expectedText =
            want ??
            (await evaluate(`(() => {
            const term = document.querySelector(${JSON.stringify(selector)}).closest(".term");
            return [...term.querySelectorAll(".term-code .l")].map((l) => [...l.childNodes].filter((n) => !(n.classList && n.classList.contains("pm"))).map((n) => n.textContent).join("")).join("\\n");
          })()`));
          await click(selector);
          await sleep(150);
          const after = await evaluate(
            `(async () => ({ label: document.querySelector(${JSON.stringify(selector)}).textContent, clip: await navigator.clipboard.readText().catch((e) => "unreadable: " + e.message) }))()`,
          );
          counts.copies++;
          check(
            `Copy on /${path} at ${width} px, ${scheme}`,
            after.label === "Copied" &&
              after.clip === expectedText &&
              /^[\x20-\x7e\n]*$/.test(after.clip),
            { label: after.label, clip: after.clip.slice(0, 80) },
          );
        }

        await go("tools/");
        await click('a.row[data-tool="discord_ban_member"]');
        await sleep(300);
        const panel = await evaluate(`({
          open: document.getElementById("tool").open,
          page: document.querySelector("#dlg-head a.btn")?.getAttribute("href"),
        })`);
        check(
          `catalog row opens the panel, which links the tool page, at ${width} px, ${scheme}`,
          panel.open && panel.page === "discord_ban_member/",
          panel,
        );
        const navigated = loaded();
        await click("#dlg-head a.btn");
        await navigated;
        check(
          `the panel's link opens the tool page at ${width} px, ${scheme}`,
          status === 200 &&
            (await evaluate("location.pathname")) === `${BASE}tools/discord_ban_member/`,
          status,
        );

        const at = `at ${width} px, ${scheme}`;
        const focusedId = () => evaluate("document.activeElement.id");
        await go("");
        const apple = await evaluate(
          `/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)`,
        );
        const shortcut = () => press("k", "KeyK", 75, apple ? 4 : 2);
        const hints = await evaluate(
          `[...document.querySelectorAll("kbd[data-shortcut]")].map((kbd) => kbd.textContent)`,
        );
        check(
          `search hints read ${apple ? "⌘K" : "Ctrl K"} ${at}`,
          hints.length > 0 && hints.every((hint) => hint === (apple ? "⌘K" : "Ctrl K")),
          hints,
        );
        let arrived = loaded();
        await click(".search-btn");
        await arrived;
        await sleep(200);
        check(
          `the header search lands on the focused search field ${at}`,
          (await evaluate("location.hash")) === "#q" && (await focusedId()) === "q",
          await focusedId(),
        );
        await go("tools/discord_ban_member/");
        arrived = loaded();
        await shortcut();
        await arrived;
        await sleep(200);
        check(
          `the shortcut on a tool page opens the catalog with its field focused ${at}`,
          (await evaluate("location.pathname")) === `${BASE}tools/` && (await focusedId()) === "q",
          await focusedId(),
        );
        await evaluate("document.activeElement.blur()");
        await press("/", "Slash", 191);
        check(`a single "/" no longer moves focus ${at}`, (await focusedId()) === "");
        await shortcut();
        check(`the shortcut focuses the catalog field ${at}`, (await focusedId()) === "q");
        await go("tools/no_such_page/");
        await shortcut();
        check(`the shortcut focuses the 404 search field ${at}`, (await focusedId()) === "nf-q");

        await go("");
        const shown = `(el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"`;
        const menu = () =>
          evaluate(`(() => {
            const shown = ${shown};
            const button = document.getElementById("menu-btn");
            return {
              button: shown(button),
              expanded: button.getAttribute("aria-expanded"),
              links: [...document.querySelectorAll("#site-nav a")].filter(shown).length,
              all: document.querySelectorAll("#site-nav a").length,
            };
          })()`);
        // Wide headers show the GitHub icon instead of the menu's GitHub link.
        const inline = (state) => state.all - 1;
        if (width <= MENU_UP_TO) {
          const closed = await menu();
          check(
            `the menu button replaces the links ${at}`,
            closed.button && closed.links === 0,
            closed,
          );
          await click("#menu-btn");
          const open = await menu();
          check(
            `the menu opens with the site links ${at}`,
            open.expanded === "true" && open.links === open.all && open.all > 0,
            open,
          );
          await evaluate(`document.getElementById("menu-btn").focus()`);
          await pressTab();
          check(
            `Tab moves from the menu button to its first link ${at}`,
            await evaluate(`document.activeElement === document.querySelector("#site-nav a")`),
          );
          await press("Escape", "Escape", 27);
          const after = await menu();
          check(
            `Escape closes the menu and returns focus to its button ${at}`,
            after.expanded === "false" && after.links === 0 && (await focusedId()) === "menu-btn",
            after,
          );

          // The menu has had no in-page link since 270374a: its links open other pages.
          await click("#menu-btn");
          let arrivedPage = loaded();
          await click('#site-nav a[href="recipes/"]');
          await arrivedPage;
          const clicked = await menu();
          check(
            `clicking a menu link opens its page, menu closed ${at}`,
            (await evaluate("location.pathname")) === `${BASE}recipes/` &&
              clicked.expanded === "false" &&
              clicked.links === 0,
            clicked,
          );

          await go("");
          await click("#menu-btn");
          await evaluate(`document.querySelector('#site-nav a[href="guide/"]').focus()`);
          arrivedPage = loaded();
          for (const type of ["keyDown", "keyUp"])
            await send("Input.dispatchKeyEvent", {
              type,
              key: "Enter",
              code: "Enter",
              windowsVirtualKeyCode: 13,
              text: type === "keyDown" ? "\r" : undefined,
            });
          await arrivedPage;
          const entered = await menu();
          check(
            `Enter on a menu link opens its page, menu closed ${at}`,
            (await evaluate("location.pathname")) === `${BASE}guide/` &&
              entered.expanded === "false" &&
              entered.links === 0,
            entered,
          );

          await go("tools/discord_ban_member/");
          await click("#menu-btn");
          await evaluate(`[...document.querySelectorAll("#site-nav a")].at(-1).focus()`);
          const landed = [];
          for (let i = 0; i < 5; i++) {
            await pressTab();
            landed.push(await evaluate(FOCUSED));
          }
          const left = await menu();
          check(
            `tabbing out of the menu closes it, and no later stop is under it ${at}`,
            left.expanded === "false" &&
              left.links === 0 &&
              landed.every((focus) => focus && !focus.covered),
            { ...left, landed: landed.map((focus) => focus?.what) },
          );
          if ((await menu()).expanded !== "true") await click("#menu-btn");
          await evaluate(`document.getElementById("menu-btn").focus()`);
          await press("Tab", "Tab", 9, 8);
          const back = await menu();
          check(
            `shift+Tab out of the menu closes it ${at}`,
            back.expanded === "false" && back.links === 0,
            back,
          );
        } else {
          const wide = await menu();
          check(
            `the links show without a menu ${at}`,
            !wide.button && wide.links === inline(wide),
            wide,
          );
        }
        const currentLink = () =>
          evaluate(
            `document.querySelector('#site-nav a[aria-current="page"]')?.textContent ?? null`,
          );
        for (const path of ["toolsets/", "toolsets/channels/"]) {
          await go(path);
          const want = path === "toolsets/" ? "Toolsets" : null;
          if (width <= MENU_UP_TO) {
            await click("#menu-btn");
            const open = { ...(await menu()), current: await currentLink() };
            check(
              `the menu opens on /${path} with the site links ${at}`,
              open.expanded === "true" && open.links === open.all && open.current === want,
              open,
            );
            await press("Escape", "Escape", 27);
            const shut = await menu();
            check(
              `Escape closes the menu on /${path} ${at}`,
              shut.expanded === "false" && shut.links === 0 && (await focusedId()) === "menu-btn",
              shut,
            );
          } else {
            const wide = { ...(await menu()), current: await currentLink() };
            check(
              `the links show without a menu on /${path} ${at}`,
              !wide.button && wide.links === inline(wide) && wide.current === want,
              wide,
            );
          }
        }

        // The headers count the rows listed under them, whatever the builder's switch says.
        await go("tools/");
        const heads = () =>
          evaluate(`[...document.querySelectorAll(".group")].filter((g) => g.getClientRects().length).map((g) => {
            const shown = (sel) => [...g.querySelectorAll(sel)].filter((el) => el.getClientRects().length);
            const rows = shown(".row-li").map((li) => li.dataset.risk).sort().join();
            return {
              set: g.id,
              rows,
              same: rows === shown(".group-head .strip i").map((i) => i.dataset.risk).sort().join(),
              text: g.querySelector("[data-meta]").textContent,
              tools: shown(".row-li").map((li) => li.dataset.tool),
            };
          })`);
        const tokensOf = new Map(CATALOG.map((t) => [t.name, t.tokens]));
        const setsWith = (risk) =>
          new Set(CATALOG.filter((t) => t.risk === risk).map((t) => t.toolset)).size;
        const mixOk = (list) =>
          list.every((h) => {
            const n = (risk) => h.rows.split(",").filter((r) => r === risk).length;
            const text = ["read", "write", "destructive"]
              .filter(n)
              .map((risk) => n(risk) + " " + (risk === "read" ? "read-only" : risk))
              .join(", ");
            const sum = h.tools.reduce((total, name) => total + tokensOf.get(name), 0);
            const cost = sum < 1000 ? "~" + Math.round(sum) : "~" + (sum / 1000).toFixed(1) + "k";
            return h.same && h.text.endsWith(": " + text + ", " + cost + " tokens");
          });
        await click('.chip[data-risk="read"]');
        await sleep(150);
        const readOnly = await heads();
        await click('.chip[data-risk="read"]');
        await click('.chip[data-risk="destructive"]');
        await sleep(150);
        const pressed = await heads();
        check(
          `the catalog headers show one bar per listed row under a risk filter ${at}`,
          readOnly.length === setsWith("read") &&
            readOnly.every((h) => /^read(,read)*$/.test(h.rows)) &&
            mixOk(readOnly) &&
            pressed.length === setsWith("destructive") &&
            pressed.every((h) => /^destructive(,destructive)*$/.test(h.rows)) &&
            mixOk(pressed),
          { readOnly: readOnly.filter((h) => !h.same), pressed: pressed.filter((h) => !h.same) },
        );

        // The panel's Add button left with the builder (da1263f); its toolset link remains.
        await go("tools/");
        await click('a.row[data-tool="discord_ban_member"]');
        await sleep(300);
        const banSet = CATALOG.find((t) => t.name === "discord_ban_member").toolset;
        const crumb = await evaluate(
          `document.querySelector("#dlg-head .crumb a")?.getAttribute("href") ?? null`,
        );
        const toToolset = loaded();
        await click("#dlg-head .crumb a");
        await toToolset;
        check(
          `the panel links the tool's toolset page ${at}`,
          crumb === `../toolsets/${banSet}/` &&
            (await evaluate("location.pathname")) === `${BASE}toolsets/${banSet}/`,
          crumb,
        );

        for (const [path, list] of [
          ["toolsets/", "#ts-list"],
          ["", ".pfs"],
        ]) {
          await go(path);
          await click(path ? ".builder .switch" : ".ro-box .switch");
          await sleep(100);
          const text = await evaluate(
            `document.querySelector(${JSON.stringify(list)}).textContent.replace(/\\s+/g, " ")`,
          );
          check(
            `read-only counts say "1 tool" on /${path} ${at}`,
            !/(^|[^\d])1 tools\b/.test(text),
            text.slice(0, 120),
          );
        }
      }
    }
  } catch (error) {
    // A step that cannot run stops the rest; the checks before it still count.
    check("every step ran", false, error.message);
  } finally {
    tab.ws.close();
    browser.ws.close();
    chrome.kill("SIGKILL");
    server.close();
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
  }

  console.log(
    `${results.pass} passed, ${results.fail} failed. ${counts.loads} page loads over ${WIDTHS.length} widths and ${SCHEMES.length} color schemes, ` +
      `${counts.tabStops} Tab stops, ${counts.searches} searches, ${counts.suggestions} 404 suggestions, ${counts.copies} copies, ${counts.builds} builder runs, ${counts.contrasts} text contrasts.`,
  );
  for (const failure of results.failures) console.log("FAIL " + failure);
  process.exitCode = results.fail ? 1 : 0;
}

await main();
