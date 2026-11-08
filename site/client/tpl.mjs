export class Markup {
  constructor(text) {
    this.text = text;
  }
  toString() {
    return this.text;
  }
}

export const raw = (text) => new Markup(String(text));

export function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emit(value) {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof Markup) return value.text;
  if (Array.isArray(value)) return value.map(emit).join("");
  return esc(value);
}

/** Tagged template: interpolations are escaped unless they are Markup, or arrays of it. */
export function tpl(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += emit(values[i]) + strings[i + 1];
  return new Markup(out);
}

/** Escapes text and wraps the given [start, end) ranges in <mark>. */
export function marked(text, ranges = []) {
  let out = "";
  let pos = 0;
  for (const [start, end] of ranges) {
    out += esc(text.slice(pos, start)) + "<mark>" + esc(text.slice(start, end)) + "</mark>";
    pos = end;
  }
  return raw(out + esc(text.slice(pos)));
}

/** A tool or parameter name that may wrap after each underscore instead of mid-word. */
export function breakable(name, ranges = []) {
  return raw(marked(name, ranges).text.replace(/_/g, "_<wbr>"));
}

export const RISK_LABEL = { read: "Read-only", write: "Writes", destructive: "Destructive" };

export const glyph = () =>
  raw('<span class="glyph" aria-hidden="true"><i></i><i></i><i></i></span>');

export const riskBadge = (risk) =>
  tpl`<span class="risk" data-risk="${risk}">${glyph()}${RISK_LABEL[risk]}</span>`;

export const formatTokens = (n) =>
  n < 1000 ? "~" + Math.round(n) : "~" + (n / 1000).toFixed(1) + "k";

export const formatInt = (n) => Math.round(n).toLocaleString("en-US");

export const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
