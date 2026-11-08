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
let out = "";
let files: string[] = [];
let pages: string[] = [];
let siteUrl = "";
let base = "";
let catalog: {
  tools: Tool[];
  totals: { tools: number; toolsets: number; risk: Record<string, number> };
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

test("the site builds a home page, a catalog, one page per tool and a 404 page", () => {
  for (const page of pages) {
    assert.match(read(page), /^<!doctype html>\n<html lang="en">/, page);
    assert.match(read(page), /Not affiliated with Discord\./, page);
  }
  const expected = [
    "index.html",
    "tools/index.html",
    "404.html",
    ...catalog.tools.map((t) => toolPage(t.name)),
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
    const ogType = page.startsWith("tools/") ? "article" : "website";
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

test("tool pages carry a BreadcrumbList that matches the visible breadcrumb", () => {
  for (const tool of catalog.tools) {
    const page = toolPage(tool.name);
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
    assert.equal(visible.at(-1)!.name, tool.title, `${page}: the trail ends at the tool`);
    assert.equal(visible.at(-1)!.url, siteUrl + urlPath(page));
    for (const { url } of visible) assert.ok(existsSync(join(out, pageOf(url.split("#")[0]))));
  }
  for (const page of ["index.html", "tools/index.html", "404.html"])
    assert.doesNotMatch(read(page), /application\/ld\+json/, `${page} has no breadcrumb`);
});

test("each tool page shows the tool's title, name, risk, permission, schemas and links as declared", async () => {
  const { permissionLines, permissionLabel } = await siteDetail();
  const { breakable, esc, formatInt } = await import("../site/client/tpl.mjs");
  const label: Record<string, string> = {
    read: "Read-only",
    write: "Writes",
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

test("the first load of /, /tools/, the largest tool page and 404.html stays under 200 KB", () => {
  const largest = catalog.tools
    .map((t) => toolPage(t.name))
    .sort((a, b) => statSync(join(out, b)).size - statSync(join(out, a)).size)[0];
  for (const page of ["index.html", "tools/index.html", largest, "404.html"]) {
    const bytes = firstLoad(page);
    assert.ok(bytes < BUDGET, `${page}: ${bytes} bytes on first load, budget ${BUDGET}`);
  }
  assert.doesNotMatch(read("index.html"), /<img[^>]*demo\.webp/, "the demo loads on demand only");
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
    write: "Writes",
    destructive: "Destructive",
  };
  let count = 0;
  for (const page of ["tools/index.html", ...catalog.tools.map((t) => toolPage(t.name))]) {
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
  assert.equal(count, catalog.tools.length * 2, "one badge per catalog row and per tool page");
});

test("llms.txt lists every tool once, with its purpose, risk and an absolute link to its page", () => {
  const llms = read("llms.txt");
  const byName = new Map(catalog.tools.map((t) => [t.name, t]));
  const lines = [
    ...llms.matchAll(
      /^- \[(discord_[a-z_]+)\]\((\S+)\): (.+) Risk: (read-only|writes|destructive)(, dry run by default)?\.$/gm,
    ),
  ];
  assert.equal(lines.length, catalog.tools.length);
  assert.equal(new Set(lines.map((m) => m[1])).size, catalog.tools.length, "no tool twice");
  const risk: Record<string, string> = {
    read: "read-only",
    write: "writes",
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
