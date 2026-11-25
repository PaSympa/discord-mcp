import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

const matrix = /node-version:\s*\[([^\]]+)\]/.exec(read(".github", "workflows", "ci.yml"));
const tested = new Set((matrix?.[1] ?? "").split(",").map((v) => Number(v.trim())));

test("CI runs the tests on the Node.js the Docker image ships", () => {
  assert.ok(matrix, "ci.yml has no node-version matrix");
  // Dependabot bumps the base image, so a new major must reach the matrix in the same PR.
  const from = /^FROM\s+(?:--\S+\s+)*node:(\d+)/gm;
  const images = [...read("Dockerfile").matchAll(from)].map((m) => Number(m[1]));
  assert.ok(images.length > 0, "the Dockerfile has no node base image");
  for (const major of images)
    assert.ok(tested.has(major), `the Dockerfile runs Node ${major}, which ci.yml does not test`);
});

test("CI tests the oldest Node.js that package.json accepts", () => {
  const engines: string = JSON.parse(read("package.json")).engines.node;
  const oldest = Number(/^>=\s*(\d+)/.exec(engines)?.[1]);
  assert.ok(tested.has(oldest), `engines accepts Node ${oldest}, which ci.yml does not test`);
});
