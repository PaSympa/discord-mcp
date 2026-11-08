import { isApple, isSearchShortcut } from "./keys.mjs";

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

export function announce(message) {
  const el = $("#announce");
  el.textContent = "";
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}

/** The text a terminal block copies: its lines, without the shell prompts. */
export function terminalText(term) {
  return $$(".term-code .l", term)
    .map((line) =>
      [...line.childNodes]
        .filter((node) => !(node.nodeType === Node.ELEMENT_NODE && node.classList.contains("pm")))
        .map((node) => node.textContent)
        .join(""),
    )
    .join("\n");
}

/** Replaces the lines of a terminal block; `--i` keeps wrapped lines hanging under their indent. */
export function setTerminalLines(term, lines) {
  const code = $(".term-code code", term);
  code.replaceChildren(
    ...lines.map((text) => {
      const line = document.createElement("span");
      line.className = text.startsWith("#") ? "l cm" : "l";
      line.style.setProperty("--i", String(text.search(/\S|$/)));
      text.split(/(?<=[,=])/).forEach((part, i) => {
        if (i) line.append(document.createElement("wbr"));
        line.append(part);
      });
      return line;
    }),
  );
}

async function copyText(text, button) {
  let ok;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    (button.closest("dialog") || document.body).append(area);
    area.select();
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
  }
  const label = button.dataset.label || button.textContent;
  button.dataset.label = label;
  button.textContent = ok ? "Copied" : "Copy failed";
  clearTimeout(button.copyTimer);
  button.copyTimer = setTimeout(() => {
    button.textContent = label;
  }, 1600);
  announce(ok ? "Copied to the clipboard" : "Copy failed: select the text and copy it by hand");
}

const THEME_NEXT = { auto: "light", light: "dark", dark: "auto" };
const THEME_LABEL = {
  auto: "Color theme: follows your system",
  light: "Color theme: light",
  dark: "Color theme: dark",
};

/** Theme toggle, menu, Copy buttons and the Ctrl+K or Cmd+K search shortcut, on every page. */
export function initCommon({ onSearch }) {
  const apple = isApple(navigator.platform || navigator.userAgent);
  if (apple) {
    for (const hint of $$("kbd[data-shortcut]")) hint.textContent = "⌘K";
    for (const el of $$("[aria-keyshortcuts]")) el.setAttribute("aria-keyshortcuts", "Meta+K");
  }

  const menu = $("#menu-btn");
  const nav = $("#site-nav");
  const isOpen = () => nav.classList.contains("open");
  const setMenu = (open) => {
    menu.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
  };
  const outside = (event) => !event.target.closest("#site-nav, #menu-btn");
  menu.addEventListener("click", () => setMenu(!isOpen()));
  // In-page links ("Install", "Toolsets") keep the page, so the menu must close itself.
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
  });
  document.addEventListener("click", (event) => {
    if (isOpen() && outside(event)) setMenu(false);
  });
  document.addEventListener("focusin", (event) => {
    if (isOpen() && outside(event)) setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isOpen()) return;
    setMenu(false);
    menu.focus();
  });

  const root = document.documentElement;
  const themeButton = $("#theme-btn");
  let theme = root.getAttribute("data-theme") || "auto";
  const setTheme = (next) => {
    theme = next;
    if (next === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    themeButton.setAttribute("aria-label", THEME_LABEL[next]);
    themeButton.title = THEME_LABEL[next];
    try {
      if (next === "auto") localStorage.removeItem("dmcp-theme");
      else localStorage.setItem("dmcp-theme", next);
    } catch {
      // Storage can be blocked; the theme still applies to this page.
    }
  };
  themeButton.addEventListener("click", () => {
    setTheme(THEME_NEXT[theme]);
    announce(THEME_LABEL[theme]);
  });
  setTheme(theme);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-copy-term], [data-copy-text]");
    if (!button || button.disabled) return;
    const text = button.hasAttribute("data-copy-term")
      ? terminalText(button.closest(".term"))
      : button.dataset.copyText;
    copyText(text, button);
  });

  document.addEventListener("keydown", (event) => {
    if (!isSearchShortcut(event, apple)) return;
    event.preventDefault();
    onSearch();
  });
}
