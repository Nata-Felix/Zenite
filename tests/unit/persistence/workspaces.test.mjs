// Testa o WorkspaceStore em uma pasta temporária.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "workspaces.mjs");
await build({
  entryPoints: ["src/main/workspaceStore.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "silent",
});
const { WorkspaceStore } = await import(pathToFileURL(outfile).href);

const canvas = (ids) => ({
  version: 1,
  nodes: ids.map((id) => ({ id, x: 0, y: 0, width: 100, height: 100, terminal: { id, title: id, command: "", cwd: "" } })),
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
});

const fresh = () => mkdtempSync(join(tmpdir(), "o-ws-"));

test("primeiro uso cria o workspace Principal", () => {
  const index = new WorkspaceStore(fresh()).list();
  assert.equal(index.workspaces.length, 1);
  assert.equal(index.workspaces[0].name, "Principal");
  assert.equal(index.activeId, index.workspaces[0].id);
});

test("migra o canvas.json da versão anterior", () => {
  const dir = fresh();
  writeFileSync(join(dir, "canvas.json"), JSON.stringify(canvas(["a", "b"])));
  const store = new WorkspaceStore(dir);
  const index = store.list();
  assert.deepEqual(store.loadCanvas(index.activeId).nodes.map((n) => n.id), ["a", "b"]);
  assert.equal(existsSync(join(dir, "canvas.json")), false);
  assert.equal(existsSync(join(dir, "canvas.json.migrado")), true);
});

test("criar, renomear, trocar e persistir entre instâncias", () => {
  const dir = fresh();
  const store = new WorkspaceStore(dir);
  const first = store.list().workspaces[0].id;
  let index = store.create("  Projeto X ", " C:\\dev\\x ");
  const x = index.workspaces[1];
  assert.equal(x.name, "Projeto X");
  assert.equal(x.dir, "C:\\dev\\x");
  assert.equal(index.activeId, x.id);
  index = store.update(x.id, { name: "Projeto Y" });
  assert.equal(index.workspaces[1].name, "Projeto Y");
  store.setActive(first);
  const reopened = new WorkspaceStore(dir).list();
  assert.equal(reopened.activeId, first);
  assert.equal(reopened.workspaces.length, 2);
});

test("canvas fica separado por workspace", () => {
  const store = new WorkspaceStore(fresh());
  const a = store.list().workspaces[0].id;
  const b = store.create("B", "").activeId;
  store.saveCanvas(a, canvas(["t1"]));
  store.saveCanvas(b, canvas(["t2", "t3"]));
  assert.deepEqual(store.loadCanvas(a).nodes.map((n) => n.id), ["t1"]);
  assert.deepEqual(store.loadCanvas(b).nodes.map((n) => n.id), ["t2", "t3"]);
});

test("remover devolve os terminais do workspace e não deixa remover o último", () => {
  const dir = fresh();
  const store = new WorkspaceStore(dir);
  const a = store.list().workspaces[0].id;
  const b = store.create("B", "").activeId;
  store.saveCanvas(b, canvas(["t2", "t3"]));
  const { index, terminalIds } = store.remove(b);
  assert.deepEqual(terminalIds, ["t2", "t3"]);
  assert.equal(index.activeId, a);
  assert.equal(existsSync(join(dir, "workspaces", `${b}.json`)), false);
  // Salvar depois de remover não ressuscita o arquivo.
  store.saveCanvas(b, canvas(["t9"]));
  assert.equal(existsSync(join(dir, "workspaces", `${b}.json`)), false);
  assert.equal(store.remove(a).index.workspaces.length, 1);
});

test("index corrompido é recriado sem quebrar", () => {
  const dir = fresh();
  const store = new WorkspaceStore(dir);
  store.list();
  writeFileSync(join(dir, "workspaces", "index.json"), "{ quebrado");
  assert.equal(store.list().workspaces.length, 1);
  assert.equal(JSON.parse(readFileSync(join(dir, "workspaces", "index.json"), "utf8")).version, 1);
});
