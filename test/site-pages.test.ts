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

const BUDGET = 200_000;
const PAGES = ["index.html", "tools/index.html"];
const TEXT = /\.(html|css|js|json|svg|txt)$/;

type Tool = { name: string; risk: string };
let out = "";
let files: string[] = [];
let catalog: {
  tools: Tool[];
  totals: { tools: number; toolsets: number; risk: Record<string, number> };
};

before(async () => {
  const { buildCatalog, collect } = await siteData();
  const { writeSite } = await siteBuild();
  catalog = buildCatalog(await collect());
  out = mkdtempSync(join(tmpdir(), "discord-mcp-site-pages-"));
  files = writeSite(catalog, out);
});
after(() => rmSync(out, { recursive: true, force: true }));

const read = (path: string) => readFileSync(join(out, path), "utf8");
const withoutData = (html: string) =>
  html.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, "");
const textOf = (html: string) =>
  withoutData(html)
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ");

/** Resolves a relative URL found in `from` to a path inside the site, or null if external. */
function resolve(from: string, url: string) {
  if (/^(https?:|mailto:|data:)/.test(url)) return null;
  assert.ok(
    !url.startsWith("/"),
    `${from}: ${url} is root-relative and breaks under /discord-mcp/`,
  );
  const [pathAndQuery, fragment = ""] = url.split("#");
  const path = pathAndQuery.split("?")[0];
  let target = path ? posix.normalize(posix.join(posix.dirname(from), path)) : from;
  assert.ok(!target.startsWith(".."), `${from}: ${url} leaves the site`);
  if (target === "." || target.endsWith("/")) target = posix.join(target, "index.html");
  else if (existsSync(join(out, target)) && statSync(join(out, target)).isDirectory())
    target = posix.join(target, "index.html");
  return { target, fragment };
}

function firstLoad(page: string) {
  const html = withoutData(read(page));
  const urls = new Set<string>();
  for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
    const href = /href="([^"]+)"/.exec(tag)?.[1];
    if (href && /rel="(stylesheet|preload|icon)"/.test(tag)) urls.add(href);
  }
  for (const [, src] of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)) urls.add(src);
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g))
    if (!/loading="lazy"/.test(tag)) urls.add(/src="([^"]+)"/.exec(tag)![1]);
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

test("the landing page and the catalog build, each with exactly one h1", () => {
  for (const page of PAGES) {
    const html = read(page);
    assert.match(html, /^<!doctype html>\n<html lang="en">/, page);
    assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${page} has one h1`);
    assert.match(html, /<title>[^<]+<\/title>/, page);
    assert.match(html, /Not affiliated with Discord\./, page);
  }
  assert.ok(files.includes("tools.json"));
  assert.equal(
    read("tools/index.html").match(/<li class="row-li" id="discord_/g)?.length,
    catalog.tools.length,
    "one catalog row per tool",
  );
});

test("every internal link, asset and fragment resolves inside the site", () => {
  const ids = new Map<string, Set<string>>();
  const idsOf = (page: string) => {
    if (!ids.has(page))
      ids.set(
        page,
        new Set([...withoutData(read(page)).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])),
      );
    return ids.get(page)!;
  };
  let checked = 0;
  for (const page of PAGES) {
    for (const [, url] of withoutData(read(page)).matchAll(/\s(?:href|src|action)="([^"]*)"/g)) {
      const hit = resolve(page, url.replace(/&amp;/g, "&"));
      if (!hit) continue;
      checked++;
      assert.ok(existsSync(join(out, hit.target)), `${page}: ${url} points to a missing file`);
      if (hit.fragment && hit.target.endsWith(".html"))
        assert.ok(idsOf(hit.target).has(hit.fragment), `${page}: ${url} has no #${hit.fragment}`);
    }
  }
  for (const [, url] of read("assets/site.css").matchAll(/url\("?([^")]+)"?\)/g)) {
    const hit = resolve("assets/site.css", url)!;
    checked++;
    assert.ok(existsSync(join(out, hit.target)), `site.css: ${url} points to a missing file`);
  }
  assert.ok(checked > 100, `${checked} links checked`);
});

test("nothing on the pages loads from another host", () => {
  for (const page of PAGES) {
    const html = withoutData(read(page));
    const loaded = [
      ...[...html.matchAll(/<(?:script|img|iframe|video|audio|source)\b[^>]*\ssrc="([^"]+)"/g)].map(
        (m) => m[1],
      ),
      ...[...html.matchAll(/<link\b[^>]*\shref="([^"]+)"/g)].map((m) => m[1]),
    ];
    for (const url of loaded) assert.ok(!/^(https?:)?\/\//.test(url), `${page} loads ${url}`);
  }
  for (const [, url] of read("assets/site.css").matchAll(/url\("?([^")]+)"?\)/g))
    assert.ok(!/^(https?:)?\/\//.test(url), `site.css loads ${url}`);
});

test("the first load of / and /tools/ stays under 200 KB, the demo excluded", () => {
  for (const page of PAGES) {
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

test("the tool total and the toolset count are the same on every page", () => {
  const { tools, toolsets, risk } = catalog.totals;
  let seen = 0;
  for (const page of PAGES) {
    const html = read(page);
    for (const [, n] of html.matchAll(/data-total>(\d+)</g)) {
      seen++;
      assert.equal(Number(n), tools, `${page}: a data-total says ${n}`);
    }
    const text = textOf(html);
    const totalClaims = [
      /\ball (\d+) tools\b/gi,
      /\bsearch (\d+) tools\b/gi,
      /\bwith (\d+) tools behind it\b/g,
      /\bset of (\d+) tools\b/g,
      /\b(\d+) tools in \d+ toolsets\b/g,
    ];
    for (const pattern of totalClaims)
      for (const [claim, n] of text.matchAll(pattern)) {
        seen++;
        assert.equal(Number(n), tools, `${page}: "${claim}"`);
      }
    for (const [claim, n] of text.matchAll(/\bin (\d+) toolsets\b/g))
      assert.equal(Number(n), toolsets, `${page}: "${claim}"`);
    for (const [claim, n] of text.matchAll(/\bonly the (\d+) tools annotated\b/g))
      assert.equal(Number(n), risk.read, `${page}: "${claim}"`);
  }
  assert.ok(seen >= 8, `${seen} statements of the total checked`);
});

test("every risk badge carries a label and the three-bar glyph", () => {
  const html = read("tools/index.html");
  const badges = [
    ...html.matchAll(/<span class="risk" data-risk="(\w+)">([\s\S]*?)<\/span>(?=\s)/g),
  ];
  assert.equal(badges.length, catalog.tools.length);
  const label: Record<string, string> = {
    read: "Read-only",
    write: "Writes",
    destructive: "Destructive",
  };
  for (const [badge, risk, inner] of badges) {
    assert.match(inner, /^<span class="glyph" aria-hidden="true"><i><\/i><i><\/i><i><\/i>/, badge);
    assert.ok(inner.endsWith(label[risk]), badge);
  }
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
