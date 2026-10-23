import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "levelLayout.mjs");
await build({ entryPoints: ["src/renderer/levelLayout.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { levelLayout, levelsFrom } = await import(pathToFileURL(outfile).href);
const box = (id, x = 0, y = 0, w = 200, h = 120) => ({ id, x, y, w, h });
const link = (source, target) => ({ source, target });
const centerOf = (b, r) => ({ x: r.x + b.w / 2, y: r.y + b.h / 2 });

test("nível é a distância em conexões até o Sol, sem importar o sentido", () => {
  const level = levelsFrom("sol", [link("a", "sol"), link("a", "b"), link("c", "b")]);
  assert.deepEqual([level.get("sol"), level.get("a"), level.get("b"), level.get("c"), level.get("solto")], [0, 1, 2, 3, undefined]);
});

test("cada nível forma um anel mais afastado do Sol, o Sol fica parado e ninguém se cobre", () => {
  const sun = box("sol", 1000, 1000, 230, 230);
  const boxes = [sun, ...["a", "b", "c", "d", "e"].map((id) => box(id)), box("n2a"), box("n2b"), box("n3"), box("solto")];
  const edges = [...["a", "b", "c", "d", "e"].map((id) => link("sol", id)), link("a", "n2a"), link("c", "n2b"), link("n2b", "n3")];
  const result = levelLayout(boxes, edges, sun);
  const origin = { x: 1115, y: 1115 };
  const radius = (id) => { const c = centerOf(box(id), result[id]); return Math.hypot(c.x - origin.x, c.y - origin.y); };
  assert.equal(result.sol, undefined, "o Sol não é movido");
  const first = ["a", "b", "c", "d", "e"].map(radius);
  assert.ok(Math.max(...first) - Math.min(...first) < 2, "nível 1 num mesmo anel");
  assert.ok(Math.min(radius("n2a"), radius("n2b")) > Math.max(...first), "nível 2 fora do nível 1");
  assert.ok(radius("n3") > Math.max(radius("n2a"), radius("n2b")), "nível 3 fora do nível 2");
  assert.ok(radius("solto") > radius("n3"), "sem caminho até o Sol fica no anel de fora");
  const placed = boxes.filter((b) => b.id !== "sol").map((b) => ({ ...b, ...result[b.id] })).concat(sun);
  for (const [i, a] of placed.entries()) for (const b of placed.slice(i + 1)) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} cobre ${b.id}`);
});

test("sem nada ligado ao Sol, devolve vazio quando só ele existe", () => {
  assert.deepEqual(levelLayout([box("sol")], [], box("sol")), {});
});
