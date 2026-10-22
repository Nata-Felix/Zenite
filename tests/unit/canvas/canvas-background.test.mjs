import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { join } from "node:path";

const outfile = join(process.cwd(), "out/test/canvas-background.cjs");
await build({ stdin: { contents: 'export * from "./src/renderer/canvasBackground"; export * from "./src/renderer/components/CanvasBackground";', resolveDir: process.cwd(), loader: "tsx" }, bundle: true, platform: "node", format: "cjs", external: ["react", "react-dom", "react-dom/server"], outfile, logLevel: "silent" });
const require = createRequire(import.meta.url);
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { normalizeCanvasBg, DEFAULT_BG, SpaceBackgroundSvg, BG_PATTERNS } = require(outfile);
const render = (bg, viewport = {}) => renderToStaticMarkup(createElement(SpaceBackgroundSvg, { bg, ...viewport }));

test("preferências antigas continuam válidas e dados inválidos não quebram o fundo", () => {
  assert.deepEqual(normalizeCanvasBg({ pattern: "grid", spacing: "large" }), { ...DEFAULT_BG, pattern: "grid", spacing: "large" });
  for (const invalid of [null, [], "x", { pattern: "x", spacing: "x", size: NaN, intensity: Infinity }]) assert.deepEqual(normalizeCanvasBg(invalid), DEFAULT_BG);
  assert.deepEqual(normalizeCanvasBg({ size: -1, intensity: 8, detail: 2 }), { ...DEFAULT_BG, size: 0.5, intensity: 1, detail: 1 });
});

test("quatro padrões geram desenhos distintos e estáveis, inclusive em zoom negativo e distante", () => {
  const drawings = new Set();
  for (const pattern of ["stars", "navigation", "coordinates", "starfield"]) {
    assert.ok(BG_PATTERNS.some(p => p.value === pattern));
    const bg = { ...DEFAULT_BG, pattern };
    const first = render(bg);
    assert.equal(first, render(bg));
    assert.doesNotMatch(first, /NaN|Infinity/);
    drawings.add(first);
    const moved = render(bg, { x: -457, y: 231, zoom: 0.2 });
    assert.match(moved, /scale\(0.2\)/);
    // Pan/zoom only changes the pattern transform, never the generated stars.
    assert.equal(first.replace(/patternTransform="[^"]*"/, ""), moved.replace(/patternTransform="[^"]*"/, ""));
  }
  assert.equal(drawings.size, 4);
});

test("aumentar a densidade preserva as estrelas existentes", () => {
  const positions = detail => [...render({ ...DEFAULT_BG, pattern: "starfield", detail }).matchAll(/<circle cx="([^"]+)" cy="([^"]+)"/g)].map(m => `${m[1]},${m[2]}`);
  const sparse = positions(0), dense = new Set(positions(1));
  assert.ok(sparse.length > 0 && dense.size > sparse.length);
  for (const point of sparse) assert.ok(dense.has(point));
});
