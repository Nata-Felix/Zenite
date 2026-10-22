import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "autoLayout.mjs");
await build({ entryPoints: ["src/renderer/autoLayout.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { autoLayout } = await import(pathToFileURL(outfile).href);
const node = (id, w = 300, h = 200) => ({ id, x: 40, y: 60, w, h });
const link = (source, target) => ({ source, target });
const positioned = (boxes, result) => boxes.map((b) => ({ ...b, ...result[b.id] }));
function disjoint(boxes) {
  for (const [i, a] of boxes.entries()) {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
    for (const b of boxes.slice(i + 1)) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} sobrepõe ${b.id}`);
  }
}

test("fluxo com ramos e junção respeita o sentido e tamanhos de terminal/site", () => {
  const boxes = [node("inicio", 640, 400), node("ramo-a", 900, 600), node("ramo-b", 320, 180), node("fim", 520, 260)];
  const edges = [link("inicio", "ramo-a"), link("inicio", "ramo-b"), link("ramo-a", "fim"), link("ramo-b", "fim")];
  const result = autoLayout(boxes, edges);
  assert.ok(result.inicio.x + 640 < result["ramo-a"].x);
  assert.equal(result["ramo-a"].x, result["ramo-b"].x);
  assert.ok(result["ramo-a"].x + 900 < result.fim.x);
  disjoint(positioned(boxes, result));
});

test("ciclos e linhas de retorno terminam sem sobrepor janelas", () => {
  const boxes = [node("a", 640, 400), node("b", 900, 600), node("c", 300, 180), node("d", 520, 250)];
  const edges = [link("a", "b"), link("b", "c"), link("c", "a"), link("c", "d"), link("d", "b")];
  const before = structuredClone({ boxes, edges });
  const result = autoLayout(boxes, edges);
  assert.equal(Object.keys(result).length, 4);
  disjoint(positioned(boxes, result));
  assert.deepEqual({ boxes, edges }, before, "não altera a estrutura nem as conexões");
});

test("grupos independentes e elementos sem ligação ficam separados", () => {
  const boxes = [node("a", 640, 400), node("b", 900, 600), node("c", 320, 180), node("d", 400, 300), node("solto-1", 700, 500), node("solto-2", 300, 200), node("solto-3", 500, 260)];
  const result = autoLayout(boxes, [link("a", "b"), link("c", "d")]);
  disjoint(positioned(boxes, result));
  assert.ok(result.c.y > result.a.y);
  assert.ok(result["solto-1"].y > result.c.y);
});

test("sem conexões usa grade e aceita vazio, um elemento e linhas inválidas", () => {
  assert.deepEqual(autoLayout([], []), {});
  assert.deepEqual(autoLayout([node("unico")], []), { unico: { x: 40, y: 60 } });
  const boxes = [node("a", 600, 400), node("b", 200, 170), node("c", 500, 300), node("d", 800, 600)];
  const result = autoLayout(boxes, [link("ausente", "a"), link("a", "a")]);
  assert.equal(result.a.y, result.b.y);
  assert.ok(result.c.y > result.a.y);
  disjoint(positioned(boxes, result));
});

test("organizar de novo produz o mesmo layout, inclusive com ciclos e tamanhos diferentes", () => {
  const boxes = [node("a", 640, 400), node("b", 900, 600), node("c", 320, 180), node("d", 400, 300), node("solto", 500, 260)];
  const edges = [link("a", "b"), link("a", "b"), link("b", "c"), link("c", "a"), link("a", "d")];
  const result = autoLayout(boxes, edges);
  assert.deepEqual(autoLayout(positioned(boxes, result), edges), result);
  assert.deepEqual(autoLayout([...boxes].reverse(), [...edges].reverse()), result, "a ordem dos dados não muda o desenho");
});

test("seleção evita janelas de fora, sem alterar suas posições", () => {
  const boxes = [node("a", 640, 400), node("b", 900, 600)];
  const outside = [{ id: "fora", x: 500, y: 50, w: 900, h: 650 }, { id: "fora-2", x: 0, y: 1000, w: 1600, h: 500 }];
  const before = structuredClone(outside);
  const result = autoLayout(boxes, [link("a", "b")], outside);
  disjoint([...positioned(boxes, result), ...outside]);
  assert.deepEqual(outside, before);
  assert.deepEqual(autoLayout(positioned(boxes, result), [link("a", "b")], outside), result);
});

test("ordena os ramos para evitar o cruzamento simples de duas linhas", () => {
  const boxes = [node("a"), node("b"), node("c"), node("d")];
  // Também há uma junção para manter os quatro no mesmo grupo.
  const edges = [link("a", "d"), link("b", "c"), link("a", "c")];
  const p = autoLayout(boxes, edges);
  assert.ok((p.a.y - p.b.y) * (p.d.y - p.c.y) > 0);
});

test("muitas janelas com tamanhos variados continuam sem sobreposição", () => {
  const boxes = Array.from({ length: 120 }, (_, i) => node(`n${String(i).padStart(3, "0")}`, 320 + (i % 5) * 140, 180 + (i % 4) * 100));
  const edges = boxes.slice(1).map((b, i) => link(boxes[Math.floor(i / 3)].id, b.id));
  disjoint(positioned(boxes, autoLayout(boxes, edges)));
});
