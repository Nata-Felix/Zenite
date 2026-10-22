// "Desenho → forma": rabiscos viram retângulo, elipse, losango ou linha; o resto fica como lápis.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "recognize.mjs");
await build({ entryPoints: ["src/renderer/draw/recognize.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { recognize } = await import(pathToFileURL(outfile).href);

// Tremor de mão: um desvio pequeno e fixo (sem aleatório, para o teste ser estável).
const wobble = (pts) => pts.map((p, i) => ({ x: p.x + Math.sin(i * 1.7) * 2, y: p.y + Math.cos(i * 1.3) * 2 }));
const along = (a, b, n) => Array.from({ length: n }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
const polygon = (corners, n = 20) => wobble(corners.flatMap((c, i) => along(c, corners[(i + 1) % corners.length], n)).concat([corners[0]]));

test("retângulo rabiscado vira retângulo", () => {
  assert.equal(recognize(polygon([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 120 }, { x: 0, y: 120 }])).shape, "rectangle");
});

test("círculo rabiscado vira elipse", () => {
  const pts = wobble(Array.from({ length: 80 }, (_, i) => ({ x: 100 + 90 * Math.cos((i / 79) * 2 * Math.PI), y: 60 + 50 * Math.sin((i / 79) * 2 * Math.PI) })));
  assert.equal(recognize(pts).shape, "ellipse");
});

test("losango rabiscado vira losango", () => {
  assert.equal(recognize(polygon([{ x: 100, y: 0 }, { x: 200, y: 80 }, { x: 100, y: 160 }, { x: 0, y: 80 }])).shape, "diamond");
});

test("traço quase reto vira linha do começo ao fim", () => {
  const pts = wobble(along({ x: 0, y: 0 }, { x: 300, y: 40 }, 40));
  const r = recognize(pts);
  assert.equal(r.shape, "line");
  assert.deepEqual([r.from, r.to], [pts[0], pts[pts.length - 1]]);
});

test("rabisco qualquer continua lápis", () => {
  const zigzag = Array.from({ length: 30 }, (_, i) => ({ x: i * 10, y: i % 2 ? 60 : 0 }));
  assert.equal(recognize(zigzag).shape, "pen");
  assert.equal(recognize([{ x: 0, y: 0 }, { x: 3, y: 2 }]).shape, "pen");
});
