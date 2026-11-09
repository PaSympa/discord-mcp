import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { gzipSync } from "node:zlib";

// site/ is ESM and this suite runs as CommonJS.
const siteData = () => import("../site/data.mjs");
const siteBuild = () => import("../site/build.mjs");
const siteSearch = () => import("../site/client/search.mjs");
const siteSuggest = () => import("../site/client/suggest.mjs");
const siteDetail = () => import("../site/client/detail.mjs");
const siteLayout = () => import("../site/pages/layout.mjs");

const BUDGET = 200_000;
const TOOL_PAGE_BUDGET = { raw: 40_000, gzip: 8_000 };
const LLMS_BUDGET = 24_000;
const DATE = "2026-11-08";
const TEXT = /\.(html|css|js|json|svg|txt|xml)$/;

type Permission = { name: string; when: string | null };
type Tool = {
  name: string;
  title: string;
  risk: string;
  purpose: string;
  toolset: string;
  dryRunDefault: boolean;
  crossReferences: string[];
  permissions: Permission[];
  tokens: number;
  definition: { outputSchema?: object };
};
type Toolset = {
  name: string;
  tools: number;
  bytes: number;
  tokens: number;
  risk: Record<string, number>;
};
let out = "";
let files: string[] = [];
let pages: string[] = [];
let siteUrl = "";
let base = "";
let catalog: {
  tools: Tool[];
  toolsets: Toolset[];
  totals: { tools: number; toolsets: number; tokens: number; risk: Record<string, number> };
};

before(async () => {
  const { buildCatalog, collect } = await siteData();
  const { writeSite } = await siteBuild();
  ({ SITE_URL: siteUrl } = await siteLayout());
  base = new URL(siteUrl).pathname;
  catalog = buildCatalog(await collect());
  out = mkdtempSync(join(tmpdir(), "discord-mcp-site-pages-"));
  files = writeSite(catalog, out, { date: DATE });
  pages = files.filter((file) => file.endsWith(".html"));
});
after(() => rmSync(out, { recursive: true, force: true }));

const read = (path: string) => readFileSync(join(out, path), "utf8");
const withoutData = (html: string) =>
  html.replace(/<script type="application\/(?:ld\+)?json"[\s\S]*?<\/script>/g, "");
const textOf = (html: string) =>
  withoutData(html)
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const metas = (html: string, key: string) =>
  [...html.matchAll(/<meta\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => attr(tag, "property") === key || attr(tag, "name") === key)
    .map((tag) => attr(tag, "content")!);
const links = (html: string, rel: string) =>
  [...html.matchAll(/<link\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => attr(tag, "rel") === rel)
    .map((tag) => attr(tag, "href")!);
const toolPage = (name: string) => `tools/${name}/index.html`;
const toolsetPage = (name: string) => `toolsets/${name}/index.html`;
const urlPath = (page: string) => page.replace(/index\.html$/, "");
const pageOf = (url: string) => {
  assert.ok(url.startsWith(siteUrl), `${url} is outside ${siteUrl}`);
  const path = url.slice(siteUrl.length);
  return path === "" || path.endsWith("/") ? path + "index.html" : path;
};

/**
 * Resolves a URL found in `from` to a file inside the site, or null if external. 404.html is
 * served at any address, so its links start from the site's root path instead.
 */
function resolve(from: string, url: string) {
  if (/^(https?:|mailto:|data:)/.test(url)) return null;
  let path: string;
  if (from === "404.html" && !url.startsWith("#")) {
    assert.ok(url.startsWith(base), `404.html: ${url} does not start at ${base}`);
    path = url.slice(base.length);
    from = "";
  } else {
    assert.ok(!url.startsWith("/"), `${from}: ${url} is root-relative and breaks under ${base}`);
    path = url;
  }
  const [pathAndQuery, fragment = ""] = path.split("#");
  const file = pathAndQuery.split("?")[0];
  let target = file ? posix.normalize(posix.join(posix.dirname(from || "x"), file)) : from;
  assert.ok(!target.startsWith(".."), `${from}: ${url} leaves the site`);
  if (target === "." || target.endsWith("/")) target = posix.join(target, "index.html");
  else if (existsSync(join(out, target)) && statSync(join(out, target)).isDirectory())
    target = posix.join(target, "index.html");
  return { target, fragment };
}

const idCache = new Map<string, Set<string>>();
const idsOf = (page: string) => {
  if (!idCache.has(page))
    idCache.set(
      page,
      new Set([...withoutData(read(page)).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])),
    );
  return idCache.get(page)!;
};

/** Follows every href, src and form action from the home page and from 404.html. */
function crawl() {
  const seen = new Set(["index.html", "404.html"]);
  const queue = [...seen];
  let checked = 0;
  while (queue.length) {
    const page = queue.shift()!;
    for (const [, url] of withoutData(read(page)).matchAll(/\s(?:href|src|action)="([^"]*)"/g)) {
      const hit = resolve(page, url.replace(/&amp;/g, "&"));
      if (!hit) continue;
      checked++;
      assert.ok(existsSync(join(out, hit.target)), `${page}: ${url} points to a missing file`);
      if (hit.fragment && hit.target.endsWith(".html"))
        assert.ok(idsOf(hit.target).has(hit.fragment), `${page}: ${url} has no #${hit.fragment}`);
      if (hit.target.endsWith(".html") && !seen.has(hit.target)) {
        seen.add(hit.target);
        queue.push(hit.target);
      }
    }
  }
  return { reached: seen, checked };
}

function firstLoad(page: string) {
  const html = withoutData(read(page));
  const urls = new Set<string>();
  for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
    const href = attr(tag, "href");
    if (href && /rel="(stylesheet|preload|icon)"/.test(tag)) urls.add(href);
  }
  for (const [, src] of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)) urls.add(src);
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g))
    if (!/loading="lazy"/.test(tag)) urls.add(attr(tag, "src")!);
  const paths = new Set<string>();
  for (const url of urls) {
    const hit = resolve(page, url);
    if (hit) paths.add(hit.target);
  }
  for (const css of [...paths].filter((p) => p.endsWith(".css")))
    for (const [, url] of read(css).matchAll(/url\("?([^")]+)"?\)/g)) {
      const hit = resolve(css, url);
      if (hit) paths.add(hit.target);
    }
  const size = (path: string) => {
    const bytes = readFileSync(join(out, path));
    return TEXT.test(path) ? gzipSync(bytes, { level: 9 }).length : bytes.length;
  };
  return [page, ...paths].reduce((sum, path) => sum + size(path), 0);
}

test("the site builds a home page, a catalog, one page per tool and per toolset, and a 404 page", () => {
  for (const page of pages) {
    assert.match(read(page), /^<!doctype html>\n<html lang="en">/, page);
    assert.match(read(page), /Not affiliated with Discord\./, page);
  }
  const expected = [
    "index.html",
    "tools/index.html",
    "404.html",
    "toolsets/index.html",
    ...catalog.tools.map((t) => toolPage(t.name)),
    ...catalog.toolsets.map((s) => toolsetPage(s.name)),
  ];
  assert.deepEqual([...pages].sort(), expected.sort());
  for (const file of ["tools.json", "llms.txt", "sitemap.xml", "robots.txt"])
    assert.ok(files.includes(file), file);
  const rows = [
    ...read("tools/index.html").matchAll(/<a class="row" href="([^"]+)" data-tool="([^"]+)">/g),
  ];
  assert.equal(rows.length, catalog.tools.length, "one catalog row per tool");
  for (const [, href, name] of rows)
    assert.equal(href, `${name}/`, `the ${name} row links to its page`);
});

test("a crawl from / and 404.html reaches every page, and every link and anchor resolves", () => {
  const { reached, checked } = crawl();
  for (const page of pages) assert.ok(reached.has(page), `${page} is linked from no page`);
  for (const [, url] of read("assets/site.css").matchAll(/url\("?([^")]+)"?\)/g)) {
    const hit = resolve("assets/site.css", url)!;
    assert.ok(existsSync(join(out, hit.target)), `site.css: ${url} points to a missing file`);
  }
  assert.ok(checked > pages.length * 20, `${checked} links checked on ${reached.size} pages`);
});

test("nothing on any page loads from another host", () => {
  const loads = /^(stylesheet|preload|modulepreload|icon|apple-touch-icon|manifest)$/;
  for (const page of pages) {
    const html = withoutData(read(page));
    const loaded = [
      ...[...html.matchAll(/<(?:script|img|iframe|video|audio|source)\b[^>]*\ssrc="([^"]+)"/g)].map(
        (m) => m[1],
      ),
      ...[...html.matchAll(/<link\b[^>]*>/g)]
        .filter(([tag]) => loads.test(attr(tag, "rel") ?? ""))
        .map(([tag]) => attr(tag, "href")!),
    ];
    for (const url of loaded) assert.ok(!/^(https?:)?\/\//.test(url), `${page} loads ${url}`);
  }
  for (const [, url] of read("assets/site.css").matchAll(/url\("?([^")]+)"?\)/g))
    assert.ok(!/^(https?:)?\/\//.test(url), `site.css loads ${url}`);
});

const unescape = (text: string) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** What a snippet leaves unbalanced: brackets, double quotes, backticks, quoting apostrophes. */
function unbalanced(text: string) {
  const count = (char: string) => text.split(char).length - 1;
  const quotes = text.replace(/(?<=[A-Za-z0-9])'(?=[A-Za-z0-9])/g, "");
  return [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ]
    .filter(([open, close]) => count(open) !== count(close))
    .map(([open, close]) => open + close)
    .concat(['"', "`"].filter((mark) => count(mark) % 2))
    .concat((quotes.split("'").length - 1) % 2 ? ["'"] : []);
}

test("every page has a unique title and description, its canonical URL, one h1 and Open Graph tags", () => {
  const png = readFileSync(join(out, "assets/social-preview.png"));
  const image = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  for (const page of pages) {
    const html = read(page);
    const title = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
    assert.equal(title.length, 1, `${page}: one title`);
    assert.ok(!titles.has(title[0]), `${page} repeats the title of ${titles.get(title[0])}`);
    titles.set(title[0], page);
    assert.ok(unescape(title[0]).length <= 60, `${page}: title "${title[0]}" is over 60`);
    const description = metas(html, "description");
    assert.equal(description.length, 1, `${page}: one description`);
    const text = unescape(description[0]);
    assert.ok(text.length >= 50 && text.length <= 160, `${page}: description "${text}"`);
    assert.deepEqual(unbalanced(unescape(title[0])), [], `${page}: title "${title[0]}"`);
    assert.deepEqual(unbalanced(text), [], `${page}: description "${text}"`);
    assert.ok(
      !descriptions.has(description[0]),
      `${page} repeats the description of ${descriptions.get(description[0])}`,
    );
    descriptions.set(description[0], page);

    const canonical = links(html, "canonical");
    if (page === "404.html") {
      assert.deepEqual(canonical, [], "404.html has no canonical URL");
      assert.deepEqual(metas(html, "og:url"), [], "404.html has no og:url");
      assert.deepEqual(metas(html, "robots"), ["noindex"], "404.html asks not to be indexed");
    } else {
      assert.deepEqual(canonical, [siteUrl + urlPath(page)], `${page}: canonical`);
      assert.deepEqual(metas(html, "og:url"), canonical, `${page}: og:url`);
      assert.deepEqual(metas(html, "robots"), [], `${page}: indexable`);
    }
    assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${page}: one h1`);
    const levels = [...withoutData(html).matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    levels.forEach((level, i) =>
      assert.ok(i === 0 || level <= levels[i - 1] + 1, `${page}: h${levels[i - 1]} then h${level}`),
    );

    assert.deepEqual(metas(html, "og:title"), title, `${page}: og:title`);
    assert.deepEqual(metas(html, "og:description"), description, `${page}: og:description`);
    const ogType = /^tools(ets)?\//.test(page) ? "article" : "website";
    assert.deepEqual(metas(html, "og:type"), [ogType], `${page}: og:type`);
    const [ogImage] = metas(html, "og:image");
    assert.equal(pageOf(ogImage), "assets/social-preview.png", `${page}: og:image`);
    assert.deepEqual(
      metas(html, "og:image:width"),
      [String(image.width)],
      `${page}: og:image:width`,
    );
    assert.deepEqual(
      metas(html, "og:image:height"),
      [String(image.height)],
      `${page}: og:image:height`,
    );
    assert.ok(metas(html, "og:image:alt")[0]?.length > 10, `${page}: og:image:alt`);
    assert.deepEqual(metas(html, "twitter:card"), ["summary_large_image"], `${page}: twitter:card`);

    const [icon] = links(html, "apple-touch-icon");
    const hit = resolve(page, icon)!;
    assert.ok(
      hit.target.endsWith(".png") && existsSync(join(out, hit.target)),
      `${page}: apple-touch-icon`,
    );
  }
});

/** A page's visible breadcrumb and its BreadcrumbList, as names and absolute URLs. */
function trails(page: string) {
  const html = read(page);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1, `${page}: one JSON-LD block`);
  const ld = JSON.parse(blocks[0][1]);
  assert.equal(ld["@context"], "https://schema.org");
  assert.equal(ld["@type"], "BreadcrumbList");
  const crumbs = /<nav class="crumbs" aria-label="Breadcrumb"><ol>([\s\S]*?)<\/ol><\/nav>/.exec(
    html,
  )![1];
  const visible = [...crumbs.matchAll(/<li( aria-current="page")?>([\s\S]*?)<\/li>/g)].map(
    ([, current, inner]) => {
      const href = /<a href="([^"]+)">/.exec(inner)?.[1];
      const url = href
        ? new URL(href, siteUrl + urlPath(page)).href
        : current && siteUrl + urlPath(page);
      return { name: unescape(inner.replace(/<[^>]+>/g, "")), url };
    },
  );
  const items = ld.itemListElement.map(
    (item: { position: number; name: string; item: string }, i: number) => {
      assert.equal(item.position, i + 1, `${page}: position`);
      return { name: item.name, url: item.item };
    },
  );
  assert.deepEqual(items, visible, `${page}: JSON-LD and visible breadcrumb`);
  for (const { url } of visible) assert.ok(existsSync(join(out, pageOf(url.split("#")[0]))));
  return visible;
}

test("tool and toolset pages carry a BreadcrumbList that matches the visible breadcrumb", () => {
  const labels = new Map(
    [...read("toolsets/index.html").matchAll(/<h2><a href="([a-z_]+)\/">([^<]+)<\/a><\/h2>/g)].map(
      ([, name, label]) => [name, unescape(label)],
    ),
  );
  assert.equal(labels.size, catalog.toolsets.length, "one label per toolset");
  const toolsets = { name: "Toolsets", url: siteUrl + "toolsets/" };
  for (const tool of catalog.tools) {
    const page = toolPage(tool.name);
    assert.deepEqual(trails(page), [
      toolsets,
      { name: labels.get(tool.toolset), url: siteUrl + urlPath(toolsetPage(tool.toolset)) },
      { name: tool.title, url: siteUrl + urlPath(page) },
    ]);
  }
  for (const set of catalog.toolsets) {
    const page = toolsetPage(set.name);
    assert.deepEqual(trails(page), [
      toolsets,
      { name: labels.get(set.name), url: siteUrl + urlPath(page) },
    ]);
  }
  for (const page of ["index.html", "tools/index.html", "toolsets/index.html", "404.html"])
    assert.doesNotMatch(read(page), /application\/ld\+json/, `${page} has no breadcrumb`);
});

test("each tool page shows the tool's title, name, risk, permission, schemas and links as declared", async () => {
  const { permissionLines, permissionLabel } = await siteDetail();
  const { breakable, esc, formatInt } = await import("../site/client/tpl.mjs");
  const label: Record<string, string> = {
    read: "Read-only",
    write: "Write",
    destructive: "Destructive",
  };
  const sizes: [number, number, string][] = [];
  for (const tool of catalog.tools) {
    const page = toolPage(tool.name);
    const html = read(page);
    const id = /<div class="tp-id">([\s\S]*?)<\/dl>\s*<\/div>/.exec(html)![1];
    assert.ok(id.includes(`<h1>${esc(tool.title)}</h1>`), `${page}: h1`);
    assert.ok(id.includes(`<code>${breakable(tool.name)}</code>`), `${page}: breakable name`);
    assert.ok(
      id.includes(
        `<span class="risk" data-risk="${tool.risk}"><span class="glyph" aria-hidden="true"><i></i><i></i><i></i></span>${label[tool.risk]}</span>`,
      ),
      `${page}: risk badge`,
    );
    assert.equal(
      id.includes(`<span class="dry">Dry run by default</span>`),
      tool.dryRunDefault,
      `${page}: dry run`,
    );
    const lines: string[] = permissionLines(tool.permissions);
    const shown = lines.map((line) => `<span class="perm">${esc(line)}</span>`).join("");
    const dt = `<dt>${permissionLabel(tool.permissions)}</dt>`;
    assert.equal(id.includes(`${dt}<dd>${shown}</dd>`), lines.length > 0, `${page}: ${shown}`);
    assert.equal(/<dt>Discord permissions?<\/dt>/.test(id), lines.length > 0, page);
    assert.ok(id.includes(`${formatInt(tool.tokens)} tokens, estimated`), `${page}: token cost`);

    const output = /<section class="d-sec" aria-labelledby="d-out">([\s\S]*?)<\/section>/.exec(
      html,
    )![1];
    if (tool.definition.outputSchema) {
      assert.match(output, /Declared by <code>outputSchema<\/code>/, page);
      assert.match(output, /<table class="schema">/, page);
    } else {
      assert.match(output, /declares no output schema/, page);
      assert.doesNotMatch(output, /<table/, page);
    }
    const description = /<p class="desc">([\s\S]*?)<\/p>/.exec(html)![1];
    for (const ref of tool.crossReferences)
      assert.ok(description.includes(`href="../${ref}/"`), `${page}: link to ${ref}`);
    assert.match(
      html,
      /<section class="d-sec" id="example-prompt" hidden><!-- [^>]*--><\/section>/,
      `${page}: S4 slot`,
    );
    sizes.push([Buffer.byteLength(html), gzipSync(html, { level: 9 }).length, page]);
  }
  for (const [raw, gzip, page] of sizes) {
    assert.ok(raw <= TOOL_PAGE_BUDGET.raw, `${page}: ${raw} bytes, budget ${TOOL_PAGE_BUDGET.raw}`);
    assert.ok(
      gzip <= TOOL_PAGE_BUDGET.gzip,
      `${page}: ${gzip} gzip bytes, budget ${TOOL_PAGE_BUDGET.gzip}`,
    );
  }
});

test("the first load of /, /tools/, /toolsets/, the largest tool and toolset pages and 404.html stays under 200 KB", () => {
  const largestOf = (list: string[]) =>
    list.sort((a, b) => statSync(join(out, b)).size - statSync(join(out, a)).size)[0];
  const largest = largestOf(catalog.tools.map((t) => toolPage(t.name)));
  const largestSet = largestOf(catalog.toolsets.map((s) => toolsetPage(s.name)));
  const first = ["index.html", "tools/index.html", "toolsets/index.html", largest, largestSet];
  for (const page of [...first, "404.html"]) {
    const bytes = firstLoad(page);
    assert.ok(bytes < BUDGET, `${page}: ${bytes} bytes on first load, budget ${BUDGET}`);
  }
  const home = read("index.html");
  assert.doesNotMatch(home, /demo\.webp/, "the site serves the demo as a video");
  assert.match(
    home,
    /<video[^>]*id="demo-video"[^>]*preload="none"/,
    "the demo loads on demand only",
  );
  assert.doesNotMatch(home, /<video[^>]*\sautoplay/, "the demo never starts on its own");
});

test("no em dash, and no Claude accent, in any output file", () => {
  for (const file of files.filter((f) => TEXT.test(f))) {
    const text = read(file);
    assert.ok(!text.includes(String.fromCharCode(0x2014)), `${file} contains an em dash`);
    assert.doesNotMatch(text, /#d97757/i, `${file} uses #D97757`);
  }
});

test("the tool total and the toolset count are the same on every page and in llms.txt", () => {
  const { tools, toolsets, risk } = catalog.totals;
  assert.equal(JSON.parse(read("tools.json")).tools.length, tools);
  let seen = 0;
  for (const file of [...pages, "llms.txt"]) {
    const content = read(file);
    for (const [, n] of content.matchAll(/data-total>(\d+)</g)) {
      seen++;
      assert.equal(Number(n), tools, `${file}: a data-total says ${n}`);
    }
    const text = file.endsWith(".html") ? textOf(content) : content;
    const totalClaims = [
      /\ball (\d+) tools\b/gi,
      /\bsearch (\d+) tools\b/gi,
      /\bwith (\d+) tools behind it\b/g,
      /\bset of (\d+) tools\b/g,
      /\b(\d+) tools in \d+ toolsets\b/g,
      /\bthe (\d+) tool definitions\b/g,
    ];
    for (const pattern of totalClaims)
      for (const [claim, n] of text.matchAll(pattern)) {
        seen++;
        assert.equal(Number(n), tools, `${file}: "${claim}"`);
      }
    for (const [claim, n] of text.matchAll(/\bin (\d+) toolsets\b/g))
      assert.equal(Number(n), toolsets, `${file}: "${claim}"`);
    for (const [claim, n] of text.matchAll(/\bonly the (\d+) tools annotated\b/g))
      assert.equal(Number(n), risk.read, `${file}: "${claim}"`);
  }
  assert.ok(seen >= pages.length * 2, `${seen} statements of the total checked`);
});

test("every risk badge carries a label and the three-bar glyph", () => {
  const label: Record<string, string> = {
    read: "Read-only",
    write: "Write",
    destructive: "Destructive",
  };
  let count = 0;
  const withBadges = [
    "tools/index.html",
    ...catalog.tools.map((t) => toolPage(t.name)),
    ...catalog.toolsets.map((s) => toolsetPage(s.name)),
  ];
  for (const page of withBadges) {
    const badges = [
      ...read(page).matchAll(/<span class="risk" data-risk="(\w+)">([\s\S]*?)<\/span>(?=[\s<])/g),
    ];
    count += badges.length;
    for (const [badge, risk, inner] of badges) {
      assert.match(
        inner,
        /^<span class="glyph" aria-hidden="true"><i><\/i><i><\/i><i><\/i>/,
        badge,
      );
      assert.ok(inner.endsWith(label[risk]), badge);
    }
  }
  assert.equal(
    count,
    catalog.tools.length * 3,
    "one badge per catalog row, per tool page and per toolset page row",
  );
});

test("llms.txt lists every tool once, with its purpose, risk and an absolute link to its page", () => {
  const llms = read("llms.txt");
  const byName = new Map(catalog.tools.map((t) => [t.name, t]));
  const lines = [
    ...llms.matchAll(
      /^- \[(discord_[a-z_]+)\]\((\S+)\): (.+) Risk: (read-only|write|destructive)(, dry run by default)?\.$/gm,
    ),
  ];
  assert.equal(lines.length, catalog.tools.length);
  assert.equal(new Set(lines.map((m) => m[1])).size, catalog.tools.length, "no tool twice");
  const risk: Record<string, string> = {
    read: "read-only",
    write: "write",
    destructive: "destructive",
  };
  for (const [line, name, url, purpose, level, dry] of lines) {
    const tool = byName.get(name)!;
    assert.ok(tool, line);
    assert.equal(pageOf(url), toolPage(name), line);
    assert.equal(purpose, tool.purpose, line);
    assert.equal(level, risk[tool.risk], line);
    assert.equal(Boolean(dry), tool.dryRunDefault, line);
  }
  for (const [, url] of llms.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g))
    if (url.startsWith(siteUrl)) assert.ok(existsSync(join(out, pageOf(url))), `llms.txt: ${url}`);
  assert.ok(llms.includes(`](${siteUrl}tools.json)`), "llms.txt points to tools.json");
  const bytes = Buffer.byteLength(llms);
  assert.ok(bytes <= LLMS_BUDGET, `llms.txt: ${bytes} bytes, budget ${LLMS_BUDGET}`);
});

test("tools.json parses and matches the tool pages one to one", () => {
  const data = JSON.parse(read("tools.json"));
  const names = data.tools.map((t: { name: string }) => t.name).sort();
  const dirs = pages
    .filter((p) => /^tools\/[^/]+\/index\.html$/.test(p))
    .map((p) => p.split("/")[1])
    .sort();
  assert.equal(names.length, catalog.totals.tools);
  assert.deepEqual(names, dirs);
  for (const page of pages)
    assert.ok(read(page).includes("tools.json"), `${page} links tools.json`);
});

test("sitemap.xml is well-formed and lists exactly the crawled pages, with the build date", () => {
  const xml = read("sitemap.xml");
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'), "XML declaration");
  const stack: string[] = [];
  const body = xml.replace(/^<\?xml[^>]*\?>/, "");
  for (const [tag, close, name] of body.matchAll(/<(\/?)([a-z]+)\b[^>]*>/g)) {
    if (close) assert.equal(stack.pop(), name, `sitemap.xml: ${tag} closes the wrong element`);
    else stack.push(name);
  }
  assert.deepEqual(stack, [], "every element is closed");
  assert.doesNotMatch(
    body.replace(/<[^>]+>/g, ""),
    /[<>]|&(?!amp;|lt;|gt;|quot;|apos;)/,
    "text is escaped",
  );
  assert.match(body, /^\s*<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const urls = [...body.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/g)];
  assert.equal(urls.length, (body.match(/<url>/g) ?? []).length, "every url has loc and lastmod");
  for (const [, , lastmod] of urls) assert.equal(lastmod, DATE);
  const listed = urls.map(([, loc]) => pageOf(loc)).sort();
  const { reached } = crawl();
  assert.deepEqual(listed, [...reached].filter((p) => p !== "404.html").sort());
  assert.equal(read("robots.txt").match(/^Sitemap: (\S+)$/m)?.[1], `${siteUrl}sitemap.xml`);
});

test("the build date comes from the caller, then SITE_BUILD_DATE, and must be a date", async () => {
  const { buildDate } = await siteBuild();
  assert.equal(buildDate("2026-01-31"), "2026-01-31");
  assert.match(buildDate(undefined), /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => buildDate("31/01/2026"), /YYYY-MM-DD/);
  assert.throws(() => buildDate("2026-13-45"), /YYYY-MM-DD/);
});

test("a shortened text never ends inside brackets, quotes or backticks", async () => {
  const { fit, unclosedAt } = await siteLayout();
  const ellipsis = String.fromCharCode(0x2026);
  const cuts: [string, number, string][] = [
    [
      "Lists each role and their permissions (entity names resolved). More.",
      50,
      "Lists each role and their permissions",
    ],
    ['Mute a member (Discord "timeout" style) for a set duration', 30, "Mute a member"],
    ["Pass `before and after` values", 20, "Pass"],
    ["The user's roles and 'sync permissions' mode", 30, "The user's roles and"],
    [
      "Get a snapshot of server metrics: members (humans vs bots), channels.",
      60,
      "Get a snapshot of server metrics: members (humans vs bots),",
    ],
  ];
  for (const [text, max, kept] of cuts) {
    const cut = fit(text, max);
    assert.ok(cut.length <= max, cut);
    assert.equal(cut, kept.replace(/[\s,;:]+$/, "") + ellipsis, text);
  }
  assert.equal(fit("Short enough.", 160), "Short enough.");
  assert.equal(unclosedAt("a (b [c] d"), 2);
  assert.equal(unclosedAt('say "hi" and (it\'s done)'), -1);
  assert.equal(unclosedAt("members' roles"), -1);
});

test("the 404 page suggests the closest tool names, then the search's own matches", async () => {
  const { suggest, suggestTools, requestedName } = await siteSuggest();
  const near = (path: string) =>
    suggest(path, catalog.tools, { base }).map((t: { name: string }) => t.name);
  const names = (path: string) =>
    suggestTools(path, catalog.tools, { base }).map((t: { name: string }) => t.name);
  assert.equal(requestedName(`${base}tools/discord-Ban-Membr.html`, base), "ban_membr");
  assert.equal(names(`${base}tools/discord_ban_membr/`)[0], "discord_ban_member");
  assert.equal(names(`${base}tools/discord_send_mesage/`)[0], "discord_send_message");
  assert.equal(names(`${base}tools/discord_timeout_memebr/`)[0], "discord_timeout_member");
  assert.equal(names(`${base}tools/discord-delete-channel`)[0], "discord_delete_channel");
  assert.equal(names(`${base}tools/ban_member/`)[0], "discord_ban_member");
  assert.ok(names(`${base}tools/discord_ban_membr/`).length <= 3);
  const fallback: [string, string][] = [
    ["discord_list_threads", "discord_list_channel_threads"],
    ["discord_purge_messages", "discord_bulk_delete_messages"],
    ["discord_mute_member", "discord_timeout_member"],
    ["discord_create_event", "discord_create_scheduled_event"],
    ["ban", "discord_ban_member"],
  ];
  for (const [path, first] of fallback) {
    assert.deepEqual(near(`${base}tools/${path}/`), [], `${path} has no close name`);
    assert.equal(names(`${base}tools/${path}/`)[0], first, path);
  }
  assert.deepEqual(names(`${base}blog/`), []);
  assert.deepEqual(names(`${base}tools/`), []);
  assert.deepEqual(names(`${base}tools/%E0%A4%A/`), []);

  const html = read("404.html");
  assert.match(html, new RegExp(`<form class="find nf-find" action="${base}tools/" method="get"`));
  assert.match(html, /<input id="nf-q" name="q" type="search"/);
  const data = JSON.parse(
    /<script type="application\/json" id="nf-data">([\s\S]*?)<\/script>/.exec(html)![1],
  );
  assert.equal(data.base, base);
  assert.deepEqual(
    data.tools.map((t: { name: string }) => t.name),
    catalog.tools.map((t) => t.name),
  );
});

test("search puts a sensible tool first for task words and name fragments", async () => {
  const { createIndex, search } = await siteSearch();
  const index = createIndex(catalog.tools);
  const top = (q: string, n = 1) =>
    search(index, q)
      .results.slice(0, n)
      .map((r: { name: string }) => r.name);
  const first: [string, string][] = [
    ["bulk_delete", "discord_bulk_delete_messages"],
    ["slowmode", "discord_edit_channel"],
    ["send an embed", "discord_send_embed"],
    ["ban a member", "discord_ban_member"],
    ["create a forum post", "discord_create_forum_post"],
    ["timeout", "discord_timeout_member"],
    ["timeout a user", "discord_timeout_member"],
    ["delete_message", "discord_delete_message"],
    ["mute someone", "discord_timeout_member"],
    ["purge", "discord_bulk_delete_messages"],
    ["give a role", "discord_add_role"],
    ["schedule an event", "discord_create_scheduled_event"],
    ["create event", "discord_create_scheduled_event"],
    ["dm", "discord_send_dm"],
    ["event", "discord_create_scheduled_event"],
    ["webhook", "discord_create_webhook"],
    ["invite", "discord_create_invite"],
    ["message", "discord_send_message"],
    ["who reacted to a message", "discord_get_reactions"],
  ];
  for (const [q, name] of first) assert.equal(top(q)[0], name, `"${q}"`);
  // Both deletion tools fit these; either may lead.
  assert.deepEqual(
    top("delete messages", 2).sort(),
    ["discord_bulk_delete_messages", "discord_delete_message"],
    `"delete messages"`,
  );
  assert.ok(
    ["discord_bulk_delete_messages", "discord_delete_channel"].includes(
      top("preview before deleting")[0],
    ),
    `"preview before deleting"`,
  );
  const partial = search(index, "ban spammer");
  assert.equal(partial.mode, "or", "a word no tool knows falls back to the other words");
  assert.equal(partial.results[0].name, "discord_ban_member");
  assert.equal(search(index, "zzzz").results.length, 0);
});

test("the header search leads to the search input itself, with Ctrl+K or Cmd+K as its shortcut", async () => {
  const { isSearchShortcut } = await import("../site/client/keys.mjs");
  for (const page of pages) {
    const html = read(page);
    assert.doesNotMatch(html, /<kbd>\/<\/kbd>/, `${page}: no single-key hint`);
    for (const [hint] of html.matchAll(/<kbd\b[^>]*>[^<]*<\/kbd>/g))
      assert.equal(hint, '<kbd data-shortcut aria-hidden="true">Ctrl K</kbd>', page);
    const control = /<(a|button) class="search-btn"[^>]*>/.exec(html)![0];
    assert.equal(attr(control, "aria-keyshortcuts"), "Control+K", `${page}: ${control}`);
    if (page === "tools/index.html") continue;
    const hit = resolve(page, attr(control, "href")!)!;
    assert.deepEqual(hit, { target: "tools/index.html", fragment: "q" }, page);
  }
  const catalogHtml = read("tools/index.html");
  assert.match(catalogHtml, /<input id="q" type="search"[^>]* aria-keyshortcuts="Control\+K">/);
  const key = (key: string, mods: Record<string, boolean> = {}) => ({ key, ...mods });
  assert.equal(isSearchShortcut(key("k", { ctrlKey: true }), false), true);
  assert.equal(isSearchShortcut(key("K", { ctrlKey: true }), false), true);
  assert.equal(isSearchShortcut(key("k", { metaKey: true }), true), true);
  assert.equal(isSearchShortcut(key("k", { metaKey: true }), false), false);
  assert.equal(
    isSearchShortcut(key("k", { ctrlKey: true }), true),
    false,
    "Ctrl+K edits text on macOS",
  );
  assert.equal(isSearchShortcut(key("k", { ctrlKey: true, shiftKey: true }), false), false);
  for (const single of ["/", "k", "s"]) assert.equal(isSearchShortcut(key(single), false), false);
});

test("permission lines keep the bracketed clauses, and the label follows the count", () => {
  const facts = (name: string) =>
    /<dt>(Discord permissions?)<\/dt><dd>((?:<span class="perm">[^<]*<\/span>)+)<\/dd>/
      .exec(read(toolPage(name)))!
      .slice(1)
      .map(unescape);
  assert.deepEqual(facts("discord_crosspost_message"), [
    "Discord permissions",
    '<span class="perm">Send Messages</span><span class="perm">Manage Messages for messages authored by others</span>',
  ]);
  assert.deepEqual(facts("discord_set_nickname"), [
    "Discord permissions",
    '<span class="perm">Manage Nicknames, or Change Nickname for the bot itself</span>',
  ]);
  assert.deepEqual(facts("discord_delete_invite"), [
    "Discord permissions",
    '<span class="perm">Manage Channels, or Manage Server</span>',
  ]);
  assert.deepEqual(facts("discord_ban_member"), [
    "Discord permission",
    '<span class="perm">Ban Members</span>',
  ]);
  assert.deepEqual(facts("discord_pin_message"), [
    "Discord permission",
    '<span class="perm">Pin Messages</span>',
  ]);
});

test("a parameter that accepts several types shows each type with its own rules", () => {
  const rules = (tool: string, param: string) => {
    const html = read(toolPage(tool));
    const row = new RegExp(`<span class="pn">${param}</span>[\\s\\S]*?</tr>`).exec(html)![0];
    return [
      ...row.matchAll(/<div class="pvar"><span class="pvt">([^<]*)<\/span>([\s\S]*?)<\/div>/g),
    ].map(([, type, inner]) => [
      unescape(type),
      inner
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    ]);
  };
  assert.deepEqual(rules("discord_set_role_icon", "icon"), [
    ["string:", "format uri pattern ^https?://"],
    ['"null"', ""],
    ["null", ""],
  ]);
  const [number, integer, ...rest] = rules("discord_get_audit_log", "action_<wbr>type");
  assert.equal(number[0], "number:");
  assert.match(number[1], /^one of \d+ values/);
  assert.deepEqual(integer, ["integer:", "at least 1"]);
  assert.deepEqual(rest, []);
});

test("counts say 1 tool, never 1 tools, in the text screen readers get too", () => {
  for (const page of pages) {
    const text = textOf(read(page));
    assert.doesNotMatch(text, /(^|[^\d,.])1 tools\b/, page);
  }
  const catalogHtml = read("tools/index.html");
  for (const set of ["moderation", "stats"]) {
    const row = new RegExp(`<li class="ts-row on" data-set="${set}">[\\s\\S]*?</li>`).exec(
      catalogHtml,
    )![0];
    assert.ok(row.includes('<span data-n>1</span><span class="vh" data-unit> tool</span>'), set);
  }
});

test("every page has a menu button that shows the site links on narrow screens", () => {
  for (const page of pages) {
    const html = read(page);
    const button = /<button class="icon-btn menu-btn"[^>]*>/.exec(html)?.[0];
    assert.ok(button, `${page}: menu button`);
    assert.equal(attr(button!, "aria-expanded"), "false", page);
    assert.equal(attr(button!, "aria-controls"), "site-nav", page);
    assert.ok(attr(button!, "aria-label"), page);
    assert.match(html, /<nav class="nav" id="site-nav" aria-label="Site">/, page);
  }
});

type Content = {
  toolsets: Record<
    string,
    { label: string; blurb: string; readsElsewhere?: { task: string; tools: string[] } }
  >;
};
const content = (): Content =>
  JSON.parse(readFileSync(join(__dirname, "..", "site", "content.json"), "utf8"));
const RISKS = ["read", "write", "destructive"];
const RISK_WORD: Record<string, string> = {
  read: "read-only",
  write: "write",
  destructive: "destructive",
};
const mixOf = (risk: Record<string, number>) =>
  RISKS.filter((r) => risk[r])
    .map((r) => `${risk[r]} ${RISK_WORD[r]}`)
    .join(", ");
const stripOf = (html: string) =>
  Object.fromEntries(RISKS.map((r) => [r, html.split(`<i data-risk="${r}"></i>`).length - 1]));

/** The profiles table of the README, read here on its own rather than through site/readme.mjs. */
function readmeProfiles() {
  const readme = readFileSync(join(__dirname, "..", "README.md"), "utf8");
  const section = /\n## Expose only what you need\n([\s\S]*?)\n## /.exec(readme)![1];
  const all = catalog.toolsets.map((s) => s.name);
  const rows = [...section.matchAll(/^\| ([^|]+?) +\| ([^|]+?) +\| (\d+) +\|/gm)].map(
    ([, label, sets, tools]) => ({
      label: label.replace(/ \(default\)$/, ""),
      sets: sets === "unset" ? all : sets.replace(/`/g, "").split(","),
      unset: sets === "unset",
      tools: Number(tools),
    }),
  );
  assert.ok(rows.length >= 3, "the README has a profiles table");
  return rows;
}

/**
 * The sentence that points a toolset with no read-only tool to reads elsewhere, rebuilt from
 * tools.json after checking every word of it: each tool is read-only, all sit in one other
 * toolset, and each title is a verb of the task then its object, optionally "by" something.
 */
function readsClaim(
  data: { tools: Tool[] },
  text: Content["toolsets"],
  reads: { task: string; tools: string[] },
  up: string,
) {
  const [, verbs, things] = /^([a-z]+(?: or [a-z]+)*) ([a-z]+)$/.exec(reads.task)!;
  const tools = reads.tools.map((name) => data.tools.find((t) => t.name === name)!);
  const home = tools[0].toolset;
  for (const tool of tools) {
    assert.equal(tool.risk, "read", tool.name);
    assert.equal(tool.toolset, home, tool.name);
    const [verb, thing, next] = tool.title.toLowerCase().split(" ");
    assert.ok(verbs.split(" or ").includes(verb), `${tool.title} does not ${reads.task}`);
    assert.ok([things, things.replace(/s$/, "")].includes(thing), `${tool.title}: ${thing}`);
    assert.ok(next === undefined || next === "by", `${tool.title} is about more than ${things}`);
  }
  for (const verb of verbs.split(" or "))
    assert.ok(
      tools.some((t) => t.title.toLowerCase().startsWith(verb + " ")),
      verb,
    );
  const chips = tools.map(
    (t) =>
      `<a class="tool" href="${up}tools/${t.name}/" data-risk="read"><span class="glyph" aria-hidden="true"><i></i><i></i><i></i></span><code>${t.name.replace(/_/g, "_<wbr>")}</code><span class="vh"> (read-only)</span></a>`,
  );
  const list = chips.length < 2 ? chips[0] : chips.slice(0, -1).join(", ") + " and " + chips.at(-1);
  return `To ${reads.task}, <a href="${up}toolsets/${home}/">${text[home].label}</a> has the read-only ${tools.length === 1 ? "tool" : "tools"} ${list}.`;
}

test("/toolsets/ shows every toolset with its label, blurb, counts and cost from tools.json", async () => {
  const { formatTokens, plural, esc } = await import("../site/client/tpl.mjs");
  const data = JSON.parse(read("tools.json"));
  const text = content().toolsets;
  const html = read("toolsets/index.html");
  const entries = [...html.matchAll(/<li class="tsx" id="ts-([a-z_]+)">([\s\S]*?)<\/li>/g)];
  assert.deepEqual(
    entries.map(([, name]) => name),
    data.toolsets.map((s: Toolset) => s.name),
    "one entry per toolset, in tools/list order",
  );
  for (const [, name, inner] of entries) {
    const set: Toolset = data.toolsets.find((s: Toolset) => s.name === name);
    const tools = data.tools.filter((t: Tool) => t.toolset === name);
    assert.equal(set.tools, tools.length, `${name}: count`);
    for (const r of RISKS)
      assert.equal(set.risk[r], tools.filter((t: Tool) => t.risk === r).length, `${name}: ${r}`);
    assert.ok(inner.includes(`<h2><a href="${name}/">${esc(text[name].label)}</a></h2>`), name);
    assert.ok(inner.includes(`<code>${name}</code>`), `${name}: value`);
    assert.ok(inner.includes(`<p class="tsx-blurb">${esc(text[name].blurb)}</p>`), name);
    assert.ok(inner.includes(`${formatTokens(set.tokens)} tokens`), `${name}: tokens`);
    assert.ok(
      inner.includes(`<span>${plural(set.tools, "tool")}: ${mixOf(set.risk)}</span>`),
      name,
    );
    assert.deepEqual(stripOf(inner), set.risk, `${name}: one mark per tool`);
    assert.equal(inner.includes("No read-only tool"), set.risk.read === 0, `${name}: read-only`);
  }
  const ro = /<section class="tsx-ro" id="read-only"[\s\S]*?<\/section>/.exec(html)![0];
  assert.ok(ro.includes(`only the ${catalog.totals.risk.read} tools annotated`), "read-only count");
  const writeOnly = data.toolsets.filter((s: Toolset) => s.risk.read === 0);
  assert.ok(writeOnly.length > 0, "some toolset has no read-only tool");
  for (const set of writeOnly) {
    assert.ok(ro.includes(`<a href="../toolsets/${set.name}/">`), `${set.name} is named`);
    const reads = text[set.name].readsElsewhere;
    if (reads) assert.ok(ro.includes(readsClaim(data, text, reads, "../")), `${set.name}: claim`);
  }
  assert.ok(
    writeOnly.some((s: Toolset) => text[s.name].readsElsewhere),
    "a claim is checked",
  );
});

test("/toolsets/ reuses the catalog's toolset builder, with every toolset and README profile", () => {
  const aside = (page: string) => /<aside class="builder"[\s\S]*?<\/aside>/.exec(read(page))![0];
  const sets = aside("toolsets/index.html");
  const catalogBuilder = aside("tools/index.html");
  assert.match(catalogBuilder, /id="show-sel"/, "the catalog keeps its filter button");
  assert.doesNotMatch(sets, /id="show-sel"/, "no catalog to filter on /toolsets/");
  assert.equal(
    catalogBuilder.replace(/<button class="btn show-sel"[^>]*>[^<]*<\/button>/, ""),
    sets,
    "the same builder markup on both pages",
  );
  const rows = [
    ...sets.matchAll(
      /<li class="ts-row on" data-set="([a-z_]+)">[\s\S]*?<span data-n>(\d+)<\/span>/g,
    ),
  ];
  assert.deepEqual(
    rows.map(([, name, n]) => [name, Number(n)]),
    catalog.toolsets.map((s) => [s.name, s.tools]),
  );
  const presets = [
    ...sets.matchAll(/data-preset="\d+"[^>]*>([^<]+)<span class="n">(\d+)<\/span>/g),
  ];
  assert.deepEqual(
    presets.map(([, label, n]) => [unescape(label), Number(n)]),
    readmeProfiles().map((p) => [p.label, p.tools]),
  );
  const data = JSON.parse(
    /<script type="application\/json" id="builder-data">([\s\S]*?)<\/script>/.exec(
      read("toolsets/index.html"),
    )![1],
  );
  assert.deepEqual(
    data.tools,
    catalog.tools.map(({ name, toolset, risk, tokens }) => ({ name, toolset, risk, tokens })),
  );
  assert.deepEqual(data.totals, JSON.parse(read("tools.json")).totals);
  assert.match(read("toolsets/index.html"), /<script defer src="\.\.\/assets\/toolsets\.js">/);
  assert.ok(files.includes("assets/toolsets.js"));
  assert.match(read("assets/toolsets.js"), /function initBuilder\(/);
  assert.match(read("assets/catalog.js"), /function initBuilder\(/);
});

test("each toolset page lists its tools from tools.json, and every tool appears on exactly one", async () => {
  const { esc, formatInt, formatTokens, plural } = await import("../site/client/tpl.mjs");
  const text = content().toolsets;
  const seen = new Map<string, string>();
  for (const set of catalog.toolsets) {
    const page = toolsetPage(set.name);
    const html = read(page);
    const tools = catalog.tools.filter((t) => t.toolset === set.name);
    assert.ok(html.includes(`<h1>${esc(text[set.name].label)}</h1>`), `${page}: h1`);
    assert.ok(html.includes(`<p class="desc">${esc(text[set.name].blurb)}</p>`), `${page}: blurb`);
    assert.ok(
      html.includes(
        `<dt>Tools</dt><dd>${plural(set.tools, "tool")}<span class="fine">${mixOf(set.risk)}</span>`,
      ),
      `${page}: counts`,
    );
    assert.ok(html.includes(`${formatInt(set.tokens)} tokens, estimated`), `${page}: tokens`);
    assert.deepEqual(stripOf(/<p class="tsp-mix">[\s\S]*?<\/p>/.exec(html)![0]), set.risk, page);

    const rows = [
      ...html.matchAll(
        /<li class="row-li" id="([a-z_]+)"[^>]*>\s*<a class="row" href="([^"]+)"[\s\S]*?<\/li>/g,
      ),
    ];
    assert.deepEqual(
      rows.map(([, name]) => name),
      tools.map((t) => t.name),
      `${page}: its tools, in tools/list order`,
    );
    for (const [row, name, href] of rows) {
      const tool = catalog.tools.find((t) => t.name === name)!;
      assert.equal(href, `../../tools/${name}/`, `${page}: ${name} links its page`);
      assert.ok(row.includes(`<span class="risk" data-risk="${tool.risk}">`), `${name}: risk`);
      assert.equal(
        row.includes('<span class="dry">Dry run by default</span>'),
        tool.dryRunDefault,
        `${name}: dry run`,
      );
      assert.ok(row.includes(`${formatTokens(tool.tokens)} tokens</span>`), `${name}: tokens`);
      assert.ok(!seen.has(name), `${name} is on ${seen.get(name)} and ${page}`);
      seen.set(name, page);
    }

    const line = `DISCORD_MCP_TOOLSETS=${set.name}`;
    const term = /<div class="term" id="tsp-line">[\s\S]*?<\/pre>/.exec(html)![0];
    assert.ok(term.includes("data-copy-term"), `${page}: Copy button`);
    assert.equal(
      textOf(/<pre class="term-code">[\s\S]*?<\/pre>/.exec(term)![0]).trim(),
      line,
      page,
    );
    const note = /<div class="tsp-note" role="note">[\s\S]*?<\/div>/.exec(html)?.[0];
    assert.equal(
      Boolean(note),
      set.risk.read === 0,
      `${page}: a note only without read-only tools`,
    );
    if (note) {
      assert.match(note, /No read-only tool/);
      assert.ok(note.includes("<code>DISCORD_MCP_READ_ONLY=<wbr>true</code>"), page);
      const reads = text[set.name].readsElsewhere;
      if (reads)
        assert.ok(
          note.includes(readsClaim(JSON.parse(read("tools.json")), text, reads, "../../")),
          page,
        );
    }
    const roFact = /<dt>Read-only mode<\/dt><dd>([^<]*)<\/dd>/.exec(html)![1];
    assert.equal(
      roFact,
      set.risk.read
        ? `Keeps ${set.risk.read} of its ${plural(set.tools, "tool")}`
        : "Leaves it out: no read-only tool",
      page,
    );
  }
  assert.equal(seen.size, catalog.tools.length, "every tool is on a toolset page");
  for (const tool of catalog.tools)
    assert.ok(
      read(toolPage(tool.name)).includes(
        `<dt>Toolset</dt><dd><a href="../../toolsets/${tool.toolset}/">`,
      ),
      `${tool.name} links its toolset page`,
    );
});

test("toolset pages show exactly the README profiles that include them", () => {
  const profiles = readmeProfiles();
  for (const p of profiles)
    assert.equal(
      catalog.tools.filter((t) => p.sets.includes(t.toolset)).length,
      p.tools,
      `README count for ${p.label}`,
    );
  for (const set of catalog.toolsets) {
    const page = toolsetPage(set.name);
    const list = /<ul class="tsp-profiles" role="list">([\s\S]*?)<\/ul>/.exec(read(page))![1];
    const shown = [
      ...list.matchAll(
        /<li><span class="tsp-pf">([^<]+)<\/span><code>([\s\S]*?)<\/code><span class="tsp-pf-n">(\d+) tools?,/g,
      ),
    ].map(([, label, sets, n]) => [unescape(label), sets.replace(/<wbr>/g, ""), Number(n)]);
    const expected = profiles
      .filter((p) => p.sets.includes(set.name))
      .map((p) => [p.label, p.unset ? "unset" : p.sets.join(","), p.tools]);
    assert.ok(expected.length > 0, `${set.name}: at least the default profile`);
    assert.deepEqual(shown, expected, page);
  }
});

test("the header's Toolsets link leads to /toolsets/, current there only", () => {
  for (const page of pages) {
    const nav = /<nav class="nav" id="site-nav" aria-label="Site">([\s\S]*?)<\/nav>/.exec(
      read(page),
    )![1];
    const link = /<a href="([^"]+)"( aria-current="page")?>Toolsets<\/a>/.exec(nav);
    assert.ok(link, `${page}: Toolsets link`);
    assert.deepEqual(
      resolve(page, link![1]),
      { target: "toolsets/index.html", fragment: "" },
      page,
    );
    assert.equal(Boolean(link![2]), page === "toolsets/index.html", `${page}: aria-current`);
    assert.doesNotMatch(nav, /#builder/, `${page}: Toolsets is no longer an in-page link`);
    const tools = /<a href="([^"]+)"( aria-current="page")?>Tools<\/a>/.exec(nav)!;
    assert.deepEqual(resolve(page, tools[1]), { target: "tools/index.html", fragment: "" }, page);
    assert.equal(Boolean(tools[2]), page === "tools/index.html", `${page}: Tools aria-current`);
  }
  const home = read("index.html");
  for (const set of catalog.toolsets)
    assert.ok(home.includes(`<a class="set-link" href="toolsets/${set.name}/">`), set.name);
});

test("llms.txt links every toolset page once, with its counts", () => {
  const llms = read("llms.txt");
  const section = /\n## Toolsets\n([\s\S]*?)\n## /.exec(llms)![1];
  assert.ok(section.includes(`](${siteUrl}toolsets/)`), "links /toolsets/");
  const lines = [
    ...section.matchAll(
      /^- \[([^\]]+)\]\((\S+)\): `([a-z_]+)`, (\d+) tools?, (\d+|none) read-only, about ([\d.]+)k tokens\.$/gm,
    ),
  ];
  assert.deepEqual(
    lines.map((m) => m[3]),
    catalog.toolsets.map((s) => s.name),
  );
  for (const [line, , url, name, n, readOnly, k] of lines) {
    const set = catalog.toolsets.find((s) => s.name === name)!;
    assert.equal(pageOf(url), toolsetPage(name), line);
    assert.equal(Number(n), set.tools, line);
    assert.equal(readOnly === "none" ? 0 : Number(readOnly), set.risk.read, line);
    assert.equal(k, (set.tokens / 1000).toFixed(1), line);
  }
});

test("a missing toolset address suggests the closest toolsets", async () => {
  const { suggestToolsets, requestedName } = await siteSuggest();
  const sets = catalog.toolsets.map((s) => ({
    name: s.name,
    label: content().toolsets[s.name].label,
  }));
  const near = (path: string) =>
    suggestToolsets(path, sets, { base }).map((s: { name: string }) => s.name);
  assert.equal(near(`${base}toolsets/mesages/`)[0], "messages");
  assert.equal(near(`${base}toolsets/scheduled-event/`)[0], "scheduled_events");
  assert.equal(near(`${base}toolsets/direct-messages/`)[0], "dm");
  assert.equal(near(`${base}toolsets/chanels`)[0], "channels");
  assert.equal(near(`${base}toolset/messages/`)[0], "messages", "the folder in the singular");
  assert.equal(near(`${base}tool-sets/dm/`)[0], "dm");
  assert.equal(near(`${base}Toolsest/roles/`)[0], "roles");
  assert.deepEqual(near(`${base}toolsets/`), []);
  assert.deepEqual(near(`${base}tools/mesages/`), [], "only under toolsets/");
  assert.deepEqual(near(`${base}toolsets/zzzzzzzzzz/`), []);
  assert.equal(requestedName(`${base}toolsets/mesages/`, base), "mesages");
  const data = JSON.parse(
    /<script type="application\/json" id="nf-data">([\s\S]*?)<\/script>/.exec(read("404.html"))![1],
  );
  assert.deepEqual(data.toolsets, sets);
  assert.ok(read("404.html").includes(`<a href="${base}toolsets/">`), "404.html links /toolsets/");
});

test("the build checks every word of the pointer to reads in another toolset", async () => {
  const { siteModel } = await siteBuild();
  const { parseReadme } = await import("../site/readme.mjs");
  const readme = parseReadme(readFileSync(join(__dirname, "..", "README.md"), "utf8"));
  const build = (set: string, task: string, tools: string[]) => () => {
    const text = content();
    text.toolsets[set] = { ...text.toolsets[set], readsElsewhere: { task, tools } };
    return siteModel(catalog, readme, text);
  };
  const channels = ["discord_list_channels", "discord_find_channel_by_name"];
  assert.doesNotThrow(() => siteModel(catalog, readme, content()));
  assert.doesNotThrow(build("channels", "list or find channels", channels));
  const refused: [string, string, string[], RegExp][] = [
    ["channels", "list or find channels", ["discord_create_channel"], /not a read-only tool/],
    ["channels", "list or find channels", ["discord_no_such_tool"], /unknown tool/],
    ["messages", "list or find channels", channels, /has read-only tools/],
    [
      "channels",
      "list or find channels",
      ["discord_list_channels", "discord_read_messages"],
      /share one toolset/,
    ],
    ["channels", "read channels", channels, /its title is "List channels"/],
    ["channels", "list channels", ["discord_get_forum_channels"], /"List forum channels"/],
    ["channels", "list or find channels", ["discord_list_channels"], /can find; none/],
    ["channels", "browse the channels", channels, /must read/],
  ];
  for (const [set, task, tools, error] of refused)
    assert.throws(build(set, task, tools), error, `${set}: ${task}: ${tools.join(", ")}`);
  for (const page of ["toolsets/index.html", "toolsets/channels/index.html"])
    assert.doesNotMatch(read(page), /on the same subject/, `${page}: the old, broader claim`);
});

test("a toolset's risk mix is the same strip on the landing, the catalog and the builder", () => {
  const landing = read("index.html");
  const tools = read("tools/index.html");
  for (const set of catalog.toolsets) {
    const card = new RegExp(
      `<a class="set-link" href="toolsets/${set.name}/">[\\s\\S]*?<span class="set-mix">([\\s\\S]*?)</span>\\s*<span class="set-blurb">`,
    ).exec(landing)![1];
    assert.deepEqual(stripOf(card), set.risk, `landing: ${set.name}`);
    assert.ok(card.includes(`<span class="vh">${mixOf(set.risk)}</span>`), `landing: ${set.name}`);
    assert.equal(
      card.includes(`${set.risk.destructive} destructive</span>`),
      set.risk.destructive > 0,
      `landing: ${set.name} destructive count`,
    );

    const head = new RegExp(
      `<section class="group" id="set-${set.name}"[\\s\\S]*?<div class="group-head">([\\s\\S]*?)</div>`,
    ).exec(tools)![1];
    assert.deepEqual(stripOf(head), set.risk, `catalog: ${set.name}`);
    assert.match(
      head,
      new RegExp(`<a href="\\.\\./toolsets/${set.name}/">`),
      `catalog: ${set.name}`,
    );

    for (const page of ["tools/index.html", "toolsets/index.html"]) {
      const row = new RegExp(`<li class="ts-row on" data-set="${set.name}">[\\s\\S]*?</li>`).exec(
        read(page),
      )![0];
      assert.deepEqual(stripOf(row), set.risk, `${page}: ${set.name} builder row`);
      assert.ok(
        row.includes(`<span class="vh" data-mix>${mixOf(set.risk)}</span>`),
        `${page}: ${set.name} builder row text`,
      );
    }
  }
  for (const page of ["index.html", "tools/index.html", "toolsets/index.html"])
    assert.match(
      read(page),
      /<p class="strip-key [a-z-]+" aria-hidden="true">One bar per tool:/,
      page,
    );
});

test("the risk levels have one name each on every page and in llms.txt", () => {
  for (const page of [...pages, "llms.txt"])
    assert.doesNotMatch(read(page), />Writes<|\bwrites<\/span>|Risk: writes/, page);
  const counts = RISKS.map(
    (r) =>
      `<span data-risk="${r}"><span class="glyph" aria-hidden="true"><i></i><i></i><i></i></span><b>${catalog.totals.risk[r]}</b> ${RISK_WORD[r]}</span>`,
  ).join("");
  for (const page of ["index.html", "tools/index.html", "toolsets/index.html"])
    assert.ok(read(page).includes(counts), `${page}: risk counts`);
});

test("the risk marks use one color token each, defined for both themes", () => {
  const css = read("assets/site.css");
  for (const level of ["read", "write", "destructive"]) {
    const defs = css.match(new RegExp(`--${level}-mark: #[0-9a-f]{6};`, "g")) ?? [];
    assert.equal(defs.length, 3, `--${level}-mark: light, dark by preference, dark by choice`);
    assert.doesNotMatch(css, new RegExp(`var\\(--${level}\\)`), `--${level} is gone`);
  }
});
