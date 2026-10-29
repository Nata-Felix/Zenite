// Sol com Torre ligada: o zn list traz o roteiro da Torre, quem executa rota só é alcançado por
// ela, e a Torre exclusiva fecha o zn ask direto e o recrutar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "sol-tower.mjs");
await build({
  stdin: {
    contents: 'export * from "./src/main/workspaceStore"; export { ControlServer } from "./src/main/controlServer"; export { neighborhoodFromStore, towerMenu, viaTower } from "./src/main/canvasGraph"; export { describeCanvas } from "./src/shared/canvasOps";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@lydell/node-pty", "electron"],
  outfile,
  logLevel: "silent",
});
const { WorkspaceStore, ControlServer, neighborhoodFromStore, describeCanvas } = await import(pathToFileURL(outfile).href);

const term = (id, title, x = 0) => ({ id, kind: "terminal", x, y: 0, width: 600, height: 400, terminal: { id, title, command: "claude", cwd: "" } });
const tower = (exclusive = false) => ({
  id: "torre", kind: "flow", x: 0, y: 600, width: 280, height: 132,
  element: { id: "torre", kind: "flow", title: "Roteiro", flow: { type: "tower", decide: "execute", exclusive, routes: [
    { id: "r1", label: "Pesquisa", criteria: "só ler e resumir", run: { agent: "claude", model: "sonnet", effort: "low", fallback: { agent: "codex", model: "gpt-5" } } },
    { id: "r2", label: "Construção", criteria: "implementar código" },
  ] } },
});

function setup({ exclusive = false } = {}) {
  const store = new WorkspaceStore(mkdtempSync(join(tmpdir(), "o-tower-")));
  const ws = store.list().workspaces[0].id;
  store.saveCanvas(ws, {
    version: 1, viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [term("sol", "Sol"), term("builder", "Builder", 800), term("assist", "Assistente", 1600), tower(exclusive)],
    edges: [
      { id: "e1", source: "sol", target: "torre" },
      { id: "e2", source: "sol", target: "builder" },
      { id: "e3", source: "sol", target: "assist" },
      { id: "e4", source: "torre", target: "builder", sourceHandle: "r2" },
    ],
  });
  const hood = neighborhoodFromStore(store, "sol", (id) => id === "sol");
  const server = new ControlServer({ has: () => true, verify: () => true }, () => hood, {});
  return { store, ws, hood, server, item: (title) => hood.linked.find((p) => p.title === title) };
}

test("a Torre ligada ao Sol chega no zn list com o roteiro dela", () => {
  const { hood, server } = setup();
  const r = server.list(hood);
  const torre = r.linked.find((p) => p.title === "Roteiro");
  assert.deepEqual(torre.tower, {
    executes: true,
    exclusive: false,
    routes: [
      { label: "Pesquisa", criteria: "só ler e resumir", executor: "Claude Code · sonnet · low (sem limite: Codex · gpt-5)" },
      { label: "Construção", criteria: "implementar código", executor: '"Builder" [terminal]' },
      { label: "Outros", executor: "volta para você: pergunte ao usuário" },
    ],
  });
  assert.deepEqual(r.linked.find((p) => p.title === "Builder").viaTower, [{ tower: "Roteiro", route: "Construção" }]);
  assert.equal(r.linked.find((p) => p.title === "Assistente").viaTower, undefined);
  assert.equal("exclusiveTower" in r, false);
});

test("Sol: executor de rota só pela Torre; terminal fora do roteiro continua direto", () => {
  const { hood, server, item } = setup();
  assert.throws(() => server.requireTowerRoute(hood, item("Builder")), (err) => err.status === 403 && /executa a rota "Construção" da Torre "Roteiro"\. Delegue por: zn flow run "Roteiro"/.test(err.message));
  assert.doesNotThrow(() => server.requireTowerRoute(hood, item("Assistente")));
  // Outro agente (não Sol) não é afetado pela regra de orquestração.
  assert.doesNotThrow(() => server.requireTowerRoute({ ...hood, me: { ...hood.me, sun: false } }, item("Builder")));
});

test("Torre exclusiva: o Sol não usa ninguém direto e o zn list avisa", () => {
  const { hood, server, item } = setup({ exclusive: true });
  assert.equal(server.list(hood).exclusiveTower, "Roteiro");
  assert.throws(() => server.requireTowerRoute(hood, item("Assistente")), /A Torre "Roteiro" é exclusiva/);
  assert.throws(() => server.requireTowerRoute(hood), /exclusiva/, "recrutar também passa por aqui");
});

test("zn canvas mostra a saída da Torre pelo nome da rota (com o id para o --output)", () => {
  const { store, ws } = setup();
  const edges = describeCanvas(store.loadCanvas(ws)).edges;
  assert.deepEqual(edges.find((e) => e.from === "Roteiro"), { from: "Roteiro", to: "Builder", output: "Construção (r2)" });
});
