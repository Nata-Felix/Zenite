// Desenhos que andam com os elementos: quadro em bloco e setas presas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "attach.mjs");
await build({ entryPoints: ["src/shared/attach.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { arrowBindings, endpoints, followArrows, frameMembers } = await import(pathToFileURL(outfile).href);

const el = (id, x, y, w = 200, h = 100) => ({ id, x, y, w, h });
const draw = (id, shape, x, y, w, h, extra = {}) => ({ id, x, y, w, h, draw: { shape, ...extra } });
// Seta de (x1,y1) a (x2,y2), com folga de 8 em volta, como o desenho faz.
const arrow = (id, x1, y1, x2, y2) => {
  const pad = 8, x = Math.min(x1, x2) - pad, y = Math.min(y1, y2) - pad, w = Math.abs(x2 - x1) + 2 * pad, h = Math.abs(y2 - y1) + 2 * pad;
  return draw(id, "arrow", x, y, w, h, { points: [[(x1 - x) / w, (y1 - y) / h], [(x2 - x) / w, (y2 - y) / h]] });
};
const close = (a, b) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

test("quadro leva o que está dentro e o título logo acima", () => {
  const pieces = [draw("f", "frame", 0, 100, 600, 400), el("a", 50, 150), el("b", 300, 300), draw("t", "text", 10, 40, 200, 40), el("fora", 700, 150), draw("longe", "text", 10, -300, 200, 40)];
  assert.deepEqual(frameMembers(pieces).get("f").sort(), ["a", "b", "t"]);
});

test("quadro dentro de quadro: o de dentro leva os seus, o de fora leva o de dentro", () => {
  const pieces = [draw("big", "frame", 0, 0, 1000, 800), draw("small", "frame", 50, 50, 400, 300), el("a", 100, 100), el("b", 600, 500)];
  const m = frameMembers(pieces);
  assert.deepEqual(m.get("small"), ["a"]);
  assert.deepEqual(m.get("big").sort(), ["b", "small"]);
});

test("seta presa às duas pontas acompanha os dois elementos", () => {
  const pieces = [el("a", 0, 0), el("b", 500, 0), arrow("s", 210, 50, 490, 50)];
  const bindings = arrowBindings(pieces);
  assert.deepEqual(bindings.get("s"), { start: "a", end: "b" });
  const out = followArrows(pieces, bindings, new Map([["b", { x: 100, y: 200 }]]));
  const moved = { ...pieces[2], x: out.get("s").x, y: out.get("s").y, w: out.get("s").w, h: out.get("s").h, draw: { ...pieces[2].draw, points: out.get("s").points } };
  const [s, e] = endpoints(moved);
  assert.ok(close(s, { x: 210, y: 50 }), "início fica no A");
  assert.ok(close(e, { x: 590, y: 250 }), "fim vai com o B");
});

test("seta solta (sem elemento nas pontas) e seta que já andou ficam onde estão", () => {
  const pieces = [el("a", 0, 0), arrow("solta", 1000, 1000, 1200, 1000), arrow("s", 210, 50, 490, 50)];
  const bindings = arrowBindings(pieces);
  assert.equal(bindings.has("solta"), false);
  assert.equal(followArrows(pieces, bindings, new Map([["a", { x: 50, y: 0 }]]), new Set(["s"])).size, 0);
});
