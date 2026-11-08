/**
 * Opens the generated site in headless Chrome and checks what the static tests cannot see:
 * layout from 320 to 1440 px in light and dark mode, console errors, failed requests, alt
 * text, keyboard focus, the menu, the search shortcut, the catalog search, the 404
 * suggestions and the Copy buttons. _site/ is served under /discord-mcp/ with GitHub Pages'
 * 404 behavior.
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
  for (const el of document.querySelectorAll("main *, header *, footer *")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) out.push(what(el) + " spans " + Math.round(r.left) + " to " + Math.round(r.right));
    const cs = getComputedStyle(el);
    if (el.clientWidth === 0 || el.scrollWidth <= el.clientWidth + 1 || cs.textOverflow === "ellipsis") continue;
    if (/auto|scroll|hidden|clip/.test(cs.overflowX)) {
      if (/^(table|pre|code|dl|ul|ol|div|p|section|figure)$/i.test(el.tagName))
        out.push(what(el) + " scrolls sideways (" + el.scrollWidth + " > " + el.clientWidth + ")");
    } else if (!cs.display.startsWith("inline") && cs.display !== "contents")
      out.push(what(el) + " spills out of its box (" + el.scrollWidth + " > " + el.clientWidth + ")");
    if (out.length > 5) break;
  }
  return out;
})()`;

// Runs in the page: what Tab should reach, in document order, each with a stable key.
const FOCUSABLES = `(() => {
  const all = [...document.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]")];
  const shown = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && !el.closest("[hidden], dialog:not([open]), [inert]");
  const keep = all.filter((el) => el.tabIndex >= 0 && !el.disabled && shown(el) && !(el.type === "radio" && !el.checked && document.querySelector('input[type=radio][name="' + el.name + '"]:checked')));
  keep.forEach((el, i) => el.setAttribute("data-k", String(i)));
  return keep.length;
})()`;

// Runs in the page: which expected element has focus, and whether its ring shows.
const FOCUSED = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const ring = (node) => {
    if (!node) return false;
    const cs = getComputedStyle(node);
    return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
  };
  const hidden = getComputedStyle(el).opacity === "0";
  return { k: el.getAttribute("data-k"), ring: hidden ? ring(el.nextElementSibling) : ring(el) || ring(el.nextElementSibling), what: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + el.className };
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
  const counts = { loads: 0, tabStops: 0, searches: 0, suggestions: 0, copies: 0 };
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
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "center" })`,
    );
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
      ...TOOL_PAGES.map((name) => [name, `tools/${name}/`]),
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
          for (let i = 0; i < expected + 4 && seen.size < expected; i++) {
            await pressTab();
            const focus = await evaluate(FOCUSED);
            if (!focus || focus.k === null) continue;
            if (!seen.has(focus.k)) {
              seen.set(focus.k, focus);
              counts.tabStops++;
              if (!focus.ring) noRing.push(focus.what);
            }
          }
          check(
            `${where}: Tab reaches all ${expected} interactive elements`,
            seen.size === expected,
            { reached: seen.size, expected },
          );
          check(
            `${where}: focus is visible on every stop`,
            noRing.length === 0,
            noRing.slice(0, 5),
          );

          const overflow = await evaluate(OVERFLOW);
          check(
            `${where}: nothing wider than the viewport, details open`,
            overflow.length === 0,
            overflow,
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

        const copies = [
          ["", "#install .panel:not([hidden]) [data-copy-term]", null],
          ["tools/", "#b-env [data-copy-term]", "DISCORD_MCP_TOOLSETS=all"],
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
            after.label === "Copied" && after.clip === expectedText,
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
            };
          })()`);
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
            open.expanded === "true" && open.links === 5,
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
        } else {
          const wide = await menu();
          check(`the links show without a menu ${at}`, !wide.button && wide.links === 4, wide);
        }

        for (const [path, list] of [
          ["tools/", "#ts-list"],
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
      `${counts.tabStops} Tab stops, ${counts.searches} searches, ${counts.suggestions} 404 suggestions, ${counts.copies} copies.`,
  );
  for (const failure of results.failures) console.log("FAIL " + failure);
  process.exitCode = results.fail ? 1 : 0;
}

await main();
