import { tpl } from "../client/tpl.mjs";
import { DOCS, layout, SITE_URL } from "./layout.mjs";

export { DOCS };
import { md, terminal } from "./parts.mjs";
import { breadcrumbLd, breadcrumbs } from "./toolsets.mjs";

export const UP = "../";

export const docTrail = (doc) => [
  { name: "Home", href: UP, url: SITE_URL },
  { name: doc.name, url: SITE_URL + doc.path },
];

/**
 * README blocks as page HTML. Code becomes a terminal block titled by `titleOf`, and tool
 * names in the text become catalog links.
 */
export function readmeBlocks(site, blocks, { local, titleOf, label }) {
  let n = 0;
  const codes = blocks.filter((b) => b.type === "code").length;
  return blocks.map((b) => {
    if (b.type === "p") return tpl`<p>${md(site, b.text, UP, local)}</p>`;
    if (b.type === "ul")
      return tpl`<ul>${b.items.map((item) => tpl`<li>${md(site, item, UP, local)}</li>`)}</ul>`;
    if (b.type === "code") {
      n++;
      return terminal({
        code: b.code,
        lang: b.lang,
        title: titleOf(b),
        copyLabel: `Copy the ${label} ${b.lang === "bash" ? "command" : "config"}${codes > 1 ? ` (${n} of ${codes})` : ""}`,
      });
    }
    return "";
  });
}

/** A titled section of a documentation page. */
export const docSection = ({ id, title, intro = "", body }) =>
  tpl`<section class="doc-sec" id="${id}" aria-labelledby="${id}-h">
  <h2 id="${id}-h">${title}</h2>
  ${intro}
  ${body}
</section>`;

/**
 * Wraps a documentation page: breadcrumb, title and lead on the left, with the list of
 * documentation pages and this page's sections under it; the sections on the right.
 */
export function docPage(site, { key, title, description, lead, toc, body }) {
  const doc = DOCS.find((d) => d.key === key);
  const trail = docTrail(doc);
  const pages = DOCS.map((d) =>
    d.key === key
      ? tpl`<li><a href="${UP}${d.path}" aria-current="page">${d.name}</a>
  <ol class="toc">${toc.map((s) => tpl`<li><a href="#${s.id}">${s.label}</a></li>`)}</ol></li>`
      : tpl`<li><a href="${UP}${d.path}">${d.name}</a></li>`,
  );
  const side = tpl`<div class="tp-id doc-id">
  ${breadcrumbs(trail)}
  <h1>${doc.name}</h1>
  <p class="doc-lead">${lead}</p>
  <nav class="doc-nav" aria-label="Documentation"><ol>${pages}</ol></nav>
</div>`;
  return layout(site, {
    path: doc.path,
    current: key,
    title,
    description,
    body: String(tpl`<div class="wrap tp doc">
${side}
<div class="tp-main doc-main">${body}</div>
</div>`),
    script: "page.js",
    ogType: "article",
    jsonLd: breadcrumbLd(trail),
  });
}
