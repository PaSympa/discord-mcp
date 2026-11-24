import { fileURLToPath } from "node:url";
import { writeSite } from "./build.mjs";
import { buildCatalog, collect } from "./data.mjs";

const OUT = fileURLToPath(new URL("../_site", import.meta.url));

const catalog = buildCatalog(await collect());
const files = writeSite(catalog, OUT);

const { tools, toolsets, bytes, tokens, risk, dryRunDefaults } = catalog.totals;
const linked = catalog.tools.filter((tool) => tool.crossReferences.length > 0).length;
console.log(
  `Wrote ${files.length} files to _site/ from ${tools} tools in ${toolsets} toolsets, ${bytes} bytes (${tokens} tokens), ` +
    `${risk.read} read / ${risk.write} write / ${risk.destructive} destructive, ` +
    `${dryRunDefaults} dry-run by default, ${linked} with cross references.`,
);
