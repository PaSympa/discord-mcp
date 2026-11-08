import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog, collect } from "./data.mjs";

const OUT = fileURLToPath(new URL("../_site/tools.json", import.meta.url));

const catalog = buildCatalog(await collect());
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n");

const { tools, toolsets, bytes, tokens, risk, dryRunDefaults } = catalog.totals;
const linked = catalog.tools.filter((tool) => tool.crossReferences.length > 0).length;
console.log(
  `Wrote _site/tools.json: ${tools} tools in ${toolsets} toolsets, ${bytes} bytes (${tokens} tokens), ` +
    `${risk.read} read / ${risk.write} write / ${risk.destructive} destructive, ` +
    `${dryRunDefaults} dry-run by default, ${linked} with cross references.`,
);
