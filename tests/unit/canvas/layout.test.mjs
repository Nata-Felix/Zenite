import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "layout.mjs");
await build({ entryPoints: ["src/renderer/layout.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { align, distribute, grid } = await import(pathToFileURL(outfile).href);

const boxes = [
  { id: "a", x: 0, y: 0, w: 100, h: 50 },
  { id: "b", x: 300, y: 40, w: 50, h: 100 },
  { id: "c", x: 120, y: 200, w: 80, h: 30 },
];

test("alinhar pelas bordas e pelo centro", () => {
  assert.deepEqual(align(boxes, "left"), { a: { x: 0, y: 0 }, b: { x: 0, y: 40 }, c: { x: 0, y: 200 } });
  assert.deepEqual(align(boxes, "right").b, { x: 300, y: 40 });
  assert.deepEqual(align(boxes, "right").a, { x: 250, y: 0 });
  assert.deepEqual(align(boxes, "center").c, { x: 135, y: 200 });
  assert.deepEqual(align(boxes, "bottom").a, { x: 0, y: 180 });
  assert.deepEqual(align(boxes, "middle").b, { x: 300, y: 65 });
});

test("distribuir deixa o mesmo espaço entre eles", () => {
  const d = distribute(boxes, "x");
  // span 0..350, ocupado 230 => 2 vãos de 60
  assert.deepEqual(d, { a: { x: 0, y: 0 }, c: { x: 160, y: 200 }, b: { x: 300, y: 40 } });
});

test("grade quase quadrada na ordem de leitura, sem sobreposição", () => {
  const g = grid(boxes);
  assert.deepEqual(g.a, { x: 0, y: 0 });
  assert.deepEqual(g.b, { x: 140, y: 0 });
  assert.deepEqual(g.c, { x: 0, y: 140 });
});
