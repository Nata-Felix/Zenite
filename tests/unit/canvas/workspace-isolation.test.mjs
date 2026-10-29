// Isolamento entre workspaces: o zn list só mostra o que está ligado, e o Sol só aponta
// arquivos/pastas para dentro da pasta da galáxia e dos universos dela.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "workspace-isolation.mjs");
await build({
  stdin: {
    contents: 'export * from "./src/main/elements"; export * from "./src/main/workspaceStore"; export * from "./src/main/workspacePaths"; export { ControlServer } from "./src/main/controlServer"; export { neighborhoodFromStore } from "./src/main/canvasGraph"; export { applyCanvasOps, OUTSIDE_WORKSPACE } from "./src/shared/canvasOps";',
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
const { ElementService, WorkspaceStore, ControlServer, neighborhoodFromStore, pathGuard, isInside, applyCanvasOps, OUTSIDE_WORKSPACE, PathGrants, workspaceGrant, allowedDirs, describeGrants } = await import(pathToFileURL(outfile).href);

const sol = { id: "SOL", x: 0, y: 0, width: 600, height: 400, terminal: { id: "SOL", title: "Sol", command: "claude", cwd: "", sun: true } };
const empty = () => ({ version: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

/** Duas galáxias com pastas vizinhas (Projeto e Projeto2) e um universo na primeira. */
function setup(events = {}) {
  const root = mkdtempSync(join(tmpdir(), "o-iso-"));
  const projeto = join(root, "Projeto");
  const projeto2 = join(root, "Projeto2");
  const universo = join(root, "Projeto-universo");
  for (const d of [projeto, projeto2, universo]) mkdirSync(join(d, "src"), { recursive: true });
  const store = new WorkspaceStore(join(root, "data"));
  const a = store.create("A", projeto).workspaces.find((w) => w.name === "A");
  const b = store.create("B", projeto2).workspaces.find((w) => w.name === "B");
  const u = { id: "11111111-1111-4111-8111-111111111111", name: "U1", branch: "u1", path: universo, worktree: universo };
  store.addUniverse(a.id, u, false);
  store.saveCanvas(a.id, { ...empty(), nodes: [structuredClone(sol)] });
  const svc = new ElementService(join(root, "data"), store, events);
  const create = (kind, path) => svc.canvasOps(a.id, [{ op: "create", kind, title: "X", element: { path } }], "SOL");
  return { root, projeto, projeto2, universo, store, a, b, u, svc, create };
}

test("zn list: sem o campo de elementos não ligados", () => {
  const hood = {
    me: { id: "T1", title: "Claude" },
    place: { galaxy: "A", universe: null, branch: null, dir: "C:/p" },
    linked: [{ id: "N1", title: "Plano", kind: "note" }],
    others: [{ id: "N2", title: "Segredo", kind: "note" }, { id: "C", title: "Solto", kind: "terminal" }],
  };
  const ptys = { has: () => true, verify: () => true };
  const server = new ControlServer(ptys, () => hood, {});
  const r = server.list(hood);
  assert.equal("unlinked" in r, false);
  assert.deepEqual(r.linked.map((p) => p.title), ["Plano"]);
  assert.doesNotMatch(JSON.stringify(r), /Segredo|Solto/);
});

test("o Sol continua alcançando os universos da mesma galáxia, não os de outra", () => {
  const { store, a, b, u } = setup();
  store.saveCanvas(u.id, { ...empty(), nodes: [{ id: "NU", kind: "note", x: 0, y: 0, width: 300, height: 200, element: { id: "NU", kind: "note", title: "Do universo" } }] });
  store.saveCanvas(b.id, { ...empty(), nodes: [{ id: "NB", kind: "note", x: 0, y: 0, width: 300, height: 200, element: { id: "NB", kind: "note", title: "De outra galáxia" } }] });
  const hood = neighborhoodFromStore(store, "SOL", (id) => id === "SOL");
  assert.deepEqual(hood.others.map((i) => i.id), ["NU"]);
});

test("Sol: pasta e arquivo do próprio workspace são aceitos", async () => {
  const { projeto, create } = setup();
  const pasta = await create("folder", join(projeto, "src"));
  assert.equal(pasta.ok, true, pasta.error);
  const novo = await create("file", join(projeto, "src", "ainda-nao-existe.ts"));
  assert.equal(novo.ok, true, novo.error);
  // Barra trocada e ".." que não sai do workspace continuam dentro.
  const torto = await create("folder", `${projeto}/src/../src`);
  assert.equal(torto.ok, true, torto.error);
});

test("Sol: pasta de universo da mesma galáxia é aceita", async () => {
  const { universo, create } = setup();
  const r = await create("folder", join(universo, "src"));
  assert.equal(r.ok, true, r.error);
});

test("Sol: caminho de outro workspace é recusado", async () => {
  const { projeto2, create, store, a } = setup();
  const r = await create("folder", join(projeto2, "src"));
  assert.equal(r.ok, false);
  assert.match(r.error, /Caminho fora deste workspace\. Peça ao usuário para ligar a pasta manualmente\./);
  assert.equal(store.loadCanvas(a.id).nodes.length, 1, "nada foi criado");
});

test("Sol: C:\\Projeto não aprova C:\\Projeto2 (prefixo de texto não basta)", async () => {
  const { projeto, projeto2, create } = setup();
  assert.ok(projeto2.startsWith(projeto));
  const r = await create("file", join(projeto2, "segredo.txt"));
  assert.equal(r.ok, false);
  assert.equal(isInside(projeto2, projeto), false);
  assert.equal(isInside(join(projeto, "src"), projeto), true);
});

test("Sol: caminho com \"..\" que sai do workspace é recusado", async () => {
  const { projeto, create } = setup();
  for (const p of [join(projeto, "..", "Projeto2", "src"), `${projeto}\\src\\..\\..\\Projeto2`, join(projeto, "..")]) {
    const r = await create("folder", p);
    assert.equal(r.ok, false, p);
    assert.match(r.error, /fora deste workspace/);
  }
});

test("Sol: caminho relativo e troca de caminho por update também são recusados", async () => {
  const { projeto, projeto2, svc, a, create } = setup();
  assert.equal((await create("folder", "Projeto2")).ok, false);
  assert.equal((await create("folder", projeto)).ok, true);
  const r = await svc.canvasOps(a.id, [{ op: "update", target: "X", element: { path: projeto2 } }], "SOL");
  assert.equal(r.ok, false);
  assert.match(r.error, /fora deste workspace/);
});

test("Sol: junção dentro do workspace apontando para fora é recusada", { skip: process.platform !== "win32" && "junções só no Windows" }, async () => {
  const { projeto, projeto2, create } = setup();
  writeFileSync(join(projeto2, "segredo.txt"), "x");
  symlinkSync(projeto2, join(projeto, "atalho"), "junction");
  const r = await create("file", join(projeto, "atalho", "segredo.txt"));
  assert.equal(r.ok, false);
  assert.match(r.error, /fora deste workspace/);
});

test("pathGuard sem pastas recusa tudo; applyCanvasOps sem allowPath não limita (ligação manual)", () => {
  assert.equal(pathGuard([])("C:\\qualquer"), false);
  assert.equal(pathGuard(["", "  "])("C:\\qualquer"), false);
  let n = 0;
  const ctx = { callerId: "SOL", newId: () => `id-${++n}`, seed: () => 1 };
  const ops = [{ op: "create", kind: "folder", title: "Fora", element: { path: "C:\\outro" } }];
  assert.doesNotThrow(() => applyCanvasOps({ ...empty(), nodes: [structuredClone(sol)] }, ops, ctx));
  assert.throws(() => applyCanvasOps({ ...empty(), nodes: [structuredClone(sol)] }, ops, { ...ctx, allowPath: () => false }), (err) => err.message.startsWith(OUTSIDE_WORKSPACE) && err.index === 0);
});

test("fora do workspace: pergunta à pessoa e cria se ela permitir", async () => {
  const asked = [];
  const { projeto2, create, store, a } = setup({ authorizePaths: async (canvasId, paths) => (asked.push([canvasId, paths]), true) });
  const r = await create("folder", join(projeto2, "src"));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(asked, [[a.id, [join(projeto2, "src")]]]);
  assert.equal(store.loadCanvas(a.id).nodes.length, 2);
});

test("fora do workspace: recusado pela pessoa, nada é criado e o erro diz por quê", async () => {
  const { projeto2, create, store, a } = setup({ authorizePaths: async () => false });
  const r = await create("folder", join(projeto2, "src"));
  assert.equal(r.ok, false);
  assert.match(r.error, /Caminho fora deste workspace\..*O usuário não autorizou\./s);
  assert.equal(store.loadCanvas(a.id).nodes.length, 1);
});

test("dentro do workspace não pergunta nada", async () => {
  let asked = 0;
  const { projeto, universo, create } = setup({ authorizePaths: async () => (asked++, false) });
  assert.equal((await create("folder", join(projeto, "src"))).ok, true);
  assert.equal((await create("folder", join(universo, "src"))).ok, true);
  assert.equal(asked, 0);
});

test("liberação lembrada: o outro workspace inteiro passa sem perguntar, e some ao esquecer", async () => {
  let asked = 0;
  const pathGrants = new PathGrants();
  const { projeto2, create, store, a, b } = setup({ pathGrants, authorizePaths: async () => (asked++, false) });
  pathGrants.add(a.id, [workspaceGrant(b.id)]);
  assert.equal((await create("folder", join(projeto2, "src"))).ok, true);
  assert.equal(asked, 0);
  assert.ok(allowedDirs(store, a.id, pathGrants).includes(projeto2));
  // A liberação é de A para B, não o contrário.
  assert.equal(allowedDirs(store, b.id, pathGrants).length, 1);
  pathGrants.forget(b.id);
  assert.deepEqual(pathGrants.of(a.id), []);
  assert.equal((await create("folder", join(projeto2, "src"))).ok, false);
  assert.equal(asked, 1);
});

test("liberação de pasta solta vale só para ela", async () => {
  const pathGrants = new PathGrants();
  const { root, create, a } = setup({ pathGrants });
  const solta = join(root, "Solta");
  mkdirSync(join(solta, "dentro"), { recursive: true });
  mkdirSync(join(root, "Solta2"));
  pathGrants.add(a.id, [solta]);
  assert.equal((await create("folder", join(solta, "dentro"))).ok, true);
  assert.equal((await create("folder", join(root, "Solta2"))).ok, false);
});

test("PathGrants avisa a cada mudança (para o processo principal gravar cifrado)", () => {
  const saved = [];
  const g = new PathGrants({}, (all) => saved.push(all));
  g.add("A", ["workspace:B", "workspace:B"]);
  g.forget("B");
  assert.deepEqual(saved, [{ A: ["workspace:B"] }, { A: [] }]);
});

test("revogar: a liberação sai, a lista some e o Sol volta a ser perguntado", async () => {
  let asked = 0;
  const pathGrants = new PathGrants();
  const { root, projeto2, create, store, a, b } = setup({ pathGrants, authorizePaths: async () => (asked++, false) });
  pathGrants.add(a.id, [workspaceGrant(b.id), join(root, "Solta")]);
  assert.deepEqual(describeGrants(store, a.id, pathGrants), [
    { entry: workspaceGrant(b.id), label: 'Galáxia "B"', detail: projeto2 },
    { entry: join(root, "Solta"), label: join(root, "Solta") },
  ]);
  pathGrants.revoke(a.id, workspaceGrant(b.id));
  assert.deepEqual(describeGrants(store, a.id, pathGrants).map((g) => g.entry), [join(root, "Solta")]);
  assert.equal((await create("folder", join(projeto2, "src"))).ok, false);
  assert.equal(asked, 1);
  pathGrants.revoke(a.id, join(root, "Solta"));
  assert.deepEqual(pathGrants.entries(), {});
});
