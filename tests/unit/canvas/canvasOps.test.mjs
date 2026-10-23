// Operações do Sol no canvas (zn canvas/node/draw/flow/recruit): criar, mudar, ligar, apagar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = join(process.cwd(), "out", "test");
await build({ entryPoints: ["src/shared/canvasOps.ts"], bundle: true, platform: "node", format: "esm", outfile: join(dir, "canvasOps.mjs"), logLevel: "silent" });
await build({ entryPoints: ["src/shared/attach.ts"], bundle: true, platform: "node", format: "esm", outfile: join(dir, "attach-ops.mjs"), logLevel: "silent" });
const { applyCanvasOps, CanvasOpError, describeCanvas } = await import(pathToFileURL(join(dir, "canvasOps.mjs")).href);
const { arrowBindings, frameMembers } = await import(pathToFileURL(join(dir, "attach-ops.mjs")).href);

const sol = { id: "sol-0001", kind: "terminal", x: 0, y: 0, width: 640, height: 400, terminal: { id: "sol-0001", title: "Sol", command: "codex", cwd: "C:/p", sun: true } };
const base = () => ({ version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [structuredClone(sol)], edges: [] });
let n = 0;
const ctx = { callerId: "sol-0001", newId: () => `id-${String(++n).padStart(4, "0")}`, seed: () => 7 };
const run = (state, ops) => applyCanvasOps(state, ops, ctx);
const byTitle = (state, title) => state.nodes.find((x) => (x.terminal?.title ?? x.element?.title ?? x.draw?.text) === title);

test("novos astros podem ser criados, configurados e ligados pelo Sol", () => {
  const { state } = run(base(), [
    { op: "create", kind: "flow", title: "Reunir", element: { flow: { type: "convergence", joinMode: "count", joinCount: 2 } } },
    { op: "create", kind: "flow", title: "Aguardar", element: { flow: { type: "wait", waitSeconds: 10 } } },
    { op: "create", kind: "flow", title: "Autorizar", element: { flow: { type: "approval", approvalMessage: "Enviar?" } } },
    { op: "connect", from: "Reunir", to: "Aguardar" },
    { op: "connect", from: "Aguardar", to: "Autorizar" },
    { op: "connect", from: "Autorizar", to: "Sol", output: "approved" },
  ]);
  assert.equal(byTitle(state, "Reunir").element.flow.joinCount, 2);
  assert.equal(byTitle(state, "Aguardar").element.flow.waitSeconds, 10);
  assert.equal(byTitle(state, "Autorizar").element.flow.approvalMessage, "Enviar?");
  assert.ok(state.edges.some((e) => e.sourceHandle === "approved"));
  assert.throws(() => run(state, [{ op: "connect", from: "Autorizar", to: "Sol" }]), /várias saídas/);
});

test("cria ao lado do Sol, sem cobrir ninguém, com nome único", () => {
  const { state, results } = run(base(), [
    { op: "create", kind: "note", title: "Plano" },
    { op: "create", kind: "note", title: "Plano" },
  ]);
  const [a, b] = results.map((r) => state.nodes.find((x) => x.id === r.id));
  assert.equal(a.element.title, "Plano");
  assert.equal(b.element.title, "Plano 2");
  assert.equal(a.x, 640 + 80);
  const apart = a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.height || b.y >= a.y + a.height;
  assert.ok(apart, "a segunda nota não cobre a primeira");
  const sun = state.nodes.find((x) => x.id === "sol-0001");
  assert.ok(Math.hypot(b.x - sun.x, b.y - sun.y) < 900, "a segunda nota fica perto do Sol");
  assert.ok(a.z >= 1 && b.z > a.z, "elemento novo nasce na frente");
});

test("recrutar: terminal nasce ligado ao Sol", () => {
  const { state, results } = run(base(), [{ op: "create", kind: "terminal", title: "Revisor", terminal: { command: "codex", cwd: "C:/p" }, links: ["Sol"] }]);
  const t = state.nodes.find((x) => x.id === results[0].id);
  assert.equal(t.terminal.title, "Revisor");
  assert.equal(t.terminal.sun, undefined);
  assert.deepEqual(state.edges.map((e) => [e.source, e.target]), [[t.id, "sol-0001"]]);
});

test("ligar astro com várias saídas exige a saída; aceita id ou nome", () => {
  const { state } = run(base(), [{ op: "create", kind: "flow", element: { flow: { type: "gemini" } } }, { op: "create", kind: "note", title: "Sim" }]);
  assert.ok(byTitle(state, "Gêmeos"), "astro sem nome ganha o nome do tipo");
  assert.throws(() => run(state, [{ op: "connect", from: "Gêmeos", to: "Sim" }]), /várias saídas/);
  const linked = run(state, [{ op: "connect", from: "Gêmeos", to: "Sim", output: "A · sim" }]).state;
  assert.equal(linked.edges[0].sourceHandle, "a");
  assert.throws(() => run(linked, [{ op: "connect", from: "Gêmeos", to: "Sim", output: "a" }]), /já estão conectados/);
  const off = run(linked, [{ op: "disconnect", from: "Sim", to: "Gêmeos" }]).state;
  assert.equal(off.edges.length, 0);
  assert.throws(() => run(off, [{ op: "disconnect", from: "Sim", to: "Gêmeos" }]), /não estão ligados/);
});

test("editar astro: rota apagada leva a linha dela", () => {
  let { state } = run(base(), [{ op: "create", kind: "flow", title: "Torre", element: { flow: { type: "tower" } } }, { op: "create", kind: "note", title: "Dois" }]);
  state = run(state, [{ op: "connect", from: "Torre", to: "Dois", output: "r2" }]).state;
  state = run(state, [{ op: "update", target: "Torre", flow: { routes: [{ id: "r1", label: "Só um" }] } }]).state;
  assert.deepEqual(byTitle(state, "Torre").element.flow.routes, [{ id: "r1", label: "Só um" }]);
  assert.equal(state.edges.length, 0);
});

test("mover, renomear, mandar para frente e apagar", () => {
  let { state } = run(base(), [{ op: "create", kind: "note", title: "A" }, { op: "create", kind: "table", title: "B" }]);
  const a = byTitle(state, "A");
  state = run(state, [{ op: "update", target: "A", dx: 10, dy: -5, title: "B", z: "front" }]).state;
  const moved = state.nodes.find((x) => x.id === a.id);
  assert.deepEqual([moved.x, moved.y], [a.x + 10, a.y - 5]);
  assert.equal(moved.element.title, "B 2", "renomear não repete nome");
  assert.equal(moved.z, Math.max(...state.nodes.map((x) => x.z ?? 0)));
  state = run(state, [{ op: "connect", from: "B", to: "Sol" }]).state;
  const out = run(state, [{ op: "delete", target: "B" }]);
  assert.equal(out.removed.length, 1);
  assert.equal(out.state.edges.length, 0, "apagar leva as ligações");
  assert.throws(() => run(state, [{ op: "delete", target: "Sol" }]), /não pode se apagar/);
});

test("lote é tudo ou nada e diz qual operação falhou", () => {
  const start = base();
  try {
    run(start, [{ op: "create", kind: "note", title: "Ok" }, { op: "delete", target: "Ninguém" }]);
    assert.fail("devia falhar");
  } catch (e) {
    assert.ok(e instanceof CanvasOpError);
    assert.equal(e.index, 1);
    assert.match(e.message, /não existe/);
  }
  assert.equal(start.nodes.length, 1, "o estado de entrada não muda");
});

test("acha por id curto e avisa nome repetido", () => {
  const { state } = run(base(), [
    { op: "create", kind: "draw", draw: { shape: "text", text: "Título" } },
    { op: "create", kind: "draw", draw: { shape: "text", text: "Título" } },
  ]);
  assert.throws(() => run(state, [{ op: "delete", target: "Título" }]), /Há 2 itens/);
  const id = state.nodes[2].id;
  assert.equal(run(state, [{ op: "delete", target: `#${id.slice(0, 7)}` }]).removed[0].id, id);
});

test("seta do Sol fica presa aos dois elementos; quadro envolve o que pediu", () => {
  let { state } = run(base(), [{ op: "create", kind: "note", title: "Nota", at: { x: 1200, y: 600 } }]);
  state = run(state, [
    { op: "create", kind: "draw", draw: { shape: "arrow", stroke: "#1971c2" }, from: "Sol", to: "Nota" },
    { op: "create", kind: "draw", draw: { shape: "frame" }, around: ["Sol", "Nota"], title: "Equipe" },
  ]).state;
  const pieces = state.nodes.map((x) => ({ id: x.id, x: x.x, y: x.y, w: x.width, h: x.height, ...(x.draw ? { draw: x.draw } : {}) }));
  const arrow = state.nodes.find((x) => x.draw?.shape === "arrow");
  assert.equal(arrow.draw.stroke, "#1971c2");
  assert.deepEqual(arrowBindings(pieces).get(arrow.id), { start: "sol-0001", end: byTitle(state, "Nota").id });
  const frame = state.nodes.find((x) => x.draw?.shape === "frame");
  assert.equal(frame.draw.text, "Equipe");
  assert.ok(frameMembers(pieces).get(frame.id).includes("sol-0001"));
  assert.ok(frame.z < 0, "quadro fica atrás");
});

test("mover pelo Sol leva as setas presas e o que está dentro do quadro", () => {
  let { state } = run(base(), [{ op: "create", kind: "note", title: "Nota", at: { x: 1200, y: 600 } }]);
  state = run(state, [
    { op: "create", kind: "draw", draw: { shape: "arrow" }, from: "Sol", to: "Nota" },
    { op: "create", kind: "draw", draw: { shape: "frame" }, around: ["Nota"], title: "Caixa" },
  ]).state;
  const pieces = (st) => st.nodes.map((x) => ({ id: x.id, x: x.x, y: x.y, w: x.width, h: x.height, ...(x.draw ? { draw: x.draw } : {}) }));
  const arrowId = state.nodes.find((x) => x.draw?.shape === "arrow").id;
  const nota = byTitle(state, "Nota");
  state = run(state, [{ op: "update", target: "Caixa", dx: 300, dy: 100 }]).state;
  const moved = state.nodes.find((x) => x.id === nota.id);
  assert.deepEqual([moved.x, moved.y], [nota.x + 300, nota.y + 100], "a nota andou com o quadro");
  assert.deepEqual(arrowBindings(pieces(state)).get(arrowId), { start: "sol-0001", end: nota.id }, "a seta continua presa nas duas pontas");
});

test("describeCanvas mostra nós e ligações pelo nome", () => {
  const { state } = run(base(), [{ op: "create", kind: "note", title: "N", links: ["Sol"] }]);
  const d = describeCanvas(state);
  assert.equal(d.nodes.length, 2);
  assert.deepEqual(d.edges, [{ from: "N", to: "Sol" }]);
});

test("terminal guarda a função ao ser criado e ao ser editado, e o zn canvas mostra", () => {
  let { state } = run(base(), [{ op: "create", kind: "terminal", title: "Claude 2", terminal: { command: "claude", role: "  Revisor  " } }]);
  assert.equal(byTitle(state, "Claude 2").terminal.role, "Revisor");
  state = run(state, [{ op: "update", target: "Claude 2", terminal: { role: "Testes" } }]).state;
  assert.equal(byTitle(state, "Claude 2").terminal.role, "Testes");
  assert.equal(describeCanvas(state).nodes.find((x) => x.title === "Claude 2").role, "Testes");
});

test("vários elementos seguidos ficam em volta do Sol, perto e sem se cobrir", () => {
  const { state, results } = run(base(), Array.from({ length: 8 }, (_, i) => ({ op: "create", kind: "note", title: `N${i}` })));
  const made = results.map((r) => state.nodes.find((x) => x.id === r.id));
  const sun = state.nodes.find((x) => x.id === "sol-0001");
  made.forEach((a, i) => {
    assert.ok(Math.hypot(a.x - sun.x, a.y - sun.y) < 1600, `N${i} não pode nascer longe do Sol`);
    for (const b of state.nodes.filter((x) => x.id !== a.id && x.kind !== "draw")) {
      assert.ok(a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.height || b.y >= a.y + a.height, `N${i} cobre ${b.id}`);
    }
  });
});
