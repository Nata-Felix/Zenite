import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "canvasClipboard.mjs");
await build({ stdin: { contents: 'export * from "./src/main/canvasClipboard"; export * from "./src/main/elements"; export * from "./src/main/workspaceStore";', loader: "ts", resolveDir: process.cwd() }, bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { CanvasClipboard, ElementService, WorkspaceStore } = await import(pathToFileURL(outfile).href);
const empty = () => ({ version: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "zn-clipboard-"));
  const store = new WorkspaceStore(dir);
  const a = store.list().activeId;
  const b = store.create("Outro workspace", "").activeId;
  store.addUniverse(a, { id: "universe", name: "Paralelo", branch: "", path: "", worktree: "", isolated: false }, false);
  const elements = new ElementService(dir, store, { noteChanged() {}, tableChanged() {}, patch() {} });
  const node = (id, kind, extra = {}) => ({ id, kind, x: id.length * 60, y: 40, width: 300, height: 180, ...(kind === "terminal" ? { terminal: { id, title: "Agente", command: "claude", cwd: dir, account: "conta", provider: "openrouter", appearance: { color: "#4fd1a5", fontSize: 18 } } } : { element: { id, kind, title: id, ...extra } }) });
  writeFileSync(join(dir, "ref.png"), "imagem original");
  writeFileSync(join(dir, "ref.mp4"), "vídeo original");
  const image = elements.importMedia(join(dir, "ref.png"));
  const video = elements.importMedia(join(dir, "ref.mp4"));
  const nodes = [node("terminal", "terminal"), node("nota", "note", { formatted: true, color: "pink" }), node("tabela", "table"), node("imagem", "image", { file: image.file }), node("video", "video", { file: video.file }), node("site", "web", { url: "https://example.test", zoom: 1.3 }), node("arquivo", "file", { path: join(dir, "ref.png") }), node("pasta", "folder", { path: dir }), { id: "desenho", kind: "draw", x: 100, y: 400, width: 200, height: 50, z: 4, draw: { shape: "text", text: "ideia", stroke: "auto", fill: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, seed: 3 } }];
  elements.writeNote("nota", "conteúdo antes de copiar", false);
  elements.writeTable("tabela", [["Cabeçalho"], ["valor antes de copiar"]], false);
  store.saveCanvas(a, { ...empty(), nodes, edges: [{ id: "t-n", source: "terminal", target: "nota" }, { id: "n-t", source: "nota", target: "tabela" }] });
  store.saveCanvas(b, empty());
  store.saveCanvas("universe", empty());
  const clipboard = new CanvasClipboard(dir, store, elements);
  return { dir, store, elements, clipboard, a, b, nodes, ids: nodes.map((n) => n.id) };
}

test("copiar e importar ações mantém referências aos arquivos e serviços copiados", () => {
  for (const operation of ["copy", "import"]) {
    const { store, clipboard, a, b } = setup();
    const flow = (id, config) => ({ id, kind: "flow", x: 0, y: 0, width: 280, height: 160, element: { id, kind: "flow", title: id, flow: config } });
    const nodes = [
      flow("http", { type: "request", http: { serviceId: "s" } }), flow("app", { type: "launch", launch: { mode: "open", targetId: "f" } }),
      { id: "s", kind: "service", x: 300, y: 0, width: 280, height: 160, element: { id: "s", title: "s", kind: "service" } },
      { id: "f", kind: "file", x: 300, y: 300, width: 280, height: 160, element: { id: "f", title: "f", kind: "file" } },
    ];
    let result;
    if (operation === "copy") {
      store.saveCanvas(a, { ...empty(), nodes });
      clipboard.capture(a, store.loadCanvas(a), nodes.map(n => n.id), "copy");
      result = clipboard.paste(b, store.loadCanvas(b), { x: 0, y: 0 });
    } else result = clipboard.insert(b, store.loadCanvas(b), { nodes, edges: [], notes: {}, tables: {} }, { x: 0, y: 0 });
    const copied = result.state.nodes;
    assert.equal(copied.find(n => n.element?.flow?.type === "request").element.flow.http.serviceId, copied.find(n => n.kind === "service").id);
    assert.equal(copied.find(n => n.element?.flow?.type === "launch").element.flow.launch.targetId, copied.find(n => n.kind === "file").id);
  }
});

test("copia todos os tipos com ids novos, sufixo, aparência, conteúdo e conexões internas", () => {
  const { store, elements, clipboard, a, b, nodes, ids } = setup();
  clipboard.capture(a, store.loadCanvas(a), ids, "copy");
  const result = clipboard.paste(b, store.loadCanvas(b), { x: 500, y: 500 });
  assert.equal(result.inserted.length, 9);
  const pasted = result.state.nodes;
  for (const [i, n] of pasted.entries()) {
    assert.notEqual(n.id, nodes[i].id);
    assert.equal(n.width, nodes[i].width);
    if (n.terminal) assert.deepEqual(n.terminal, { ...nodes[i].terminal, id: n.id, title: "Agente - cópia" });
    if (n.element) assert.equal(n.element.title, `${nodes[i].element.title} - cópia`);
  }
  const note = pasted.find((n) => n.kind === "note");
  const table = pasted.find((n) => n.kind === "table");
  assert.equal(elements.readNote(note.id), "conteúdo antes de copiar");
  assert.deepEqual(elements.readTable(table.id), [["Cabeçalho"], ["valor antes de copiar"]]);
  assert.equal(pasted.find((n) => n.kind === "web").element.zoom, 1.3);
  assert.equal(pasted.find((n) => n.kind === "file").element.path, nodes.find((n) => n.kind === "file").element.path);
  assert.deepEqual(pasted.find((n) => n.kind === "draw").draw, nodes.find((n) => n.kind === "draw").draw);
  assert.equal(result.state.edges.length, 2);
  assert.ok(result.state.edges.every((e) => result.inserted.includes(e.source) && result.inserted.includes(e.target)));
  elements.writeNote(note.id, "editada", false);
  assert.equal(elements.readNote("nota"), "conteúdo antes de copiar");
});

test("o snapshot copiado sobrevive à alteração e exclusão dos originais", () => {
  const { store, elements, clipboard, a, b, nodes, ids } = setup();
  clipboard.capture(a, store.loadCanvas(a), ids, "copy");
  elements.writeNote("nota", "mudou depois", false);
  elements.writeTable("tabela", [["mudou depois"]], false);
  nodes.forEach((n) => elements.cleanup(n));
  store.saveCanvas(a, empty());
  const result = clipboard.paste(b, store.loadCanvas(b), { x: 0, y: 0 });
  assert.equal(elements.readNote(result.state.nodes.find((n) => n.kind === "note").id), "conteúdo antes de copiar");
  assert.deepEqual(elements.readTable(result.state.nodes.find((n) => n.kind === "table").id), [["Cabeçalho"], ["valor antes de copiar"]]);
  const image = result.state.nodes.find((n) => n.kind === "image");
  assert.equal(readFileSync(elements.mediaPath(image.element.file), "utf8"), "imagem original");
  clipboard.clear(b, result.state);
  assert.ok(existsSync(elements.mediaPath(image.element.file)), "limpar a área de transferência mantém a mídia já colada");
});

test("recortar remove todas as conexões e move a identidade entre universo e workspace", () => {
  const { store, elements, clipboard, a, b, ids, nodes } = setup();
  const cut = clipboard.capture(a, store.loadCanvas(a), ids, "cut");
  assert.equal(cut.state.nodes.length, 0);
  assert.deepEqual(cut.state.edges, []);
  assert.equal(elements.readNote("nota"), "conteúdo antes de copiar");
  const inUniverse = clipboard.paste("universe", store.loadCanvas("universe"), { x: 0, y: 0 });
  assert.deepEqual(inUniverse.inserted, ids);
  assert.deepEqual(inUniverse.state.nodes.find((n) => n.terminal).terminal, nodes[0].terminal);
  assert.deepEqual(inUniverse.state.edges, []);
  assert.equal(clipboard.state(), null);
  clipboard.capture("universe", inUniverse.state, ids, "cut");
  const inWorkspace = clipboard.paste(b, store.loadCanvas(b), { x: 600, y: 400 });
  assert.deepEqual(inWorkspace.inserted, ids);
  assert.equal(store.loadCanvas("universe").nodes.length, 0);
  assert.throws(() => clipboard.paste(b, inWorkspace.state, { x: 0, y: 0 }), /Copie ou recorte/);
});

test("recortar só um elemento remove linhas de entrada e saída sem mover seus vizinhos", () => {
  const { store, clipboard, a } = setup();
  const cut = clipboard.capture(a, store.loadCanvas(a), ["nota"], "cut");
  assert.equal(cut.state.nodes.length, 8);
  assert.ok(cut.state.nodes.some((n) => n.id === "terminal"));
  assert.deepEqual(cut.state.edges, []);
  clipboard.clear(a, cut.state);
  assert.equal(store.loadCanvas(a).nodes.length, 9);
  assert.deepEqual(store.loadCanvas(a).edges, [], "desfazer o recorte não restaura as conexões removidas");
});

test("copiar outra seleção devolve um recorte pendente sem perder o elemento", () => {
  const { store, clipboard, a, b } = setup();
  clipboard.capture(a, store.loadCanvas(a), ["nota"], "cut");
  clipboard.capture(a, store.loadCanvas(a), ["tabela"], "copy");
  assert.ok(store.loadCanvas(a).nodes.some((n) => n.id === "nota"));
  const result = clipboard.paste(b, store.loadCanvas(b), { x: 0, y: 0 });
  assert.equal(result.state.nodes[0].element.title, "tabela - cópia");
});

test("recorte pendente pode ser recuperado depois de reiniciar o app", () => {
  const { dir, store, elements, clipboard, a } = setup();
  clipboard.capture(a, store.loadCanvas(a), ["nota", "terminal"], "cut");
  const reopened = new CanvasClipboard(dir, store, elements);
  assert.equal(reopened.state().count, 2);
  const restored = reopened.clear(a, store.loadCanvas(a));
  assert.equal(restored.restoredCanvasId, a);
  assert.equal(restored.state.nodes.length, 9);
  assert.equal(reopened.state(), null);
});

test("recuperar um recorte cuja origem foi excluída usa um workspace existente", () => {
  const { store, clipboard, a, b } = setup();
  clipboard.capture(a, store.loadCanvas(a), ["nota"], "cut");
  store.remove(a);
  const restored = clipboard.clear(b, store.loadCanvas(b));
  assert.equal(restored.restoredCanvasId, b);
  assert.equal(restored.state.nodes[0].id, "nota");
});

test("salvamentos atrasados não ressuscitam o recorte nem apagam o que foi colado", () => {
  const { store, clipboard, a, b } = setup();
  const staleA = store.loadCanvas(a);
  const staleB = store.loadCanvas(b);
  clipboard.capture(a, staleA, ["terminal"], "cut");
  clipboard.paste(b, staleB, { x: 0, y: 0 });
  store.saveCanvas(a, staleA);
  store.saveCanvas(b, staleB);
  assert.ok(!store.loadCanvas(a).nodes.some((n) => n.id === "terminal"));
  assert.equal(store.loadCanvas(b).nodes[0].id, "terminal");
  assert.throws(() => clipboard.capture(a, staleA, ["nota"], "copy"), /canvas mudou/);
});

test("colar cópias repetidas gera nomes e posições distintos sem ligar aos originais", () => {
  const { store, clipboard, a, b } = setup();
  clipboard.capture(a, store.loadCanvas(a), ["nota"], "copy");
  const first = clipboard.paste(b, store.loadCanvas(b), { x: 300, y: 200 });
  const again = clipboard.paste(b, first.state, { x: 300, y: 200 });
  assert.deepEqual(again.state.nodes.map((n) => n.element.title), ["nota - cópia", "nota - cópia 2"]);
  assert.equal(again.state.nodes[1].x - again.state.nodes[0].x, 24);
  assert.deepEqual(again.state.edges, []);
});

test("falha ao copiar mídia não substitui nem perde um recorte pendente", () => {
  const { store, elements, clipboard, a } = setup();
  clipboard.capture(a, store.loadCanvas(a), ["nota"], "cut");
  const current = store.loadCanvas(a);
  rmSync(elements.mediaPath(current.nodes.find((n) => n.kind === "image").element.file));
  assert.throws(() => clipboard.capture(a, current, ["imagem"], "copy"), /mídia/);
  assert.equal(clipboard.state().mode, "cut");
  clipboard.clear(a, store.loadCanvas(a));
  assert.ok(store.loadCanvas(a).nodes.some((n) => n.id === "nota"));
});

test("falha durante uma colagem limpa as cópias parciais e mantém a origem intacta", () => {
  const { dir, store, elements, clipboard, a, b } = setup();
  clipboard.capture(a, store.loadCanvas(a), ["nota", "imagem"], "copy");
  const saved = JSON.parse(readFileSync(join(dir, "canvas-clipboard.json"), "utf8"));
  rmSync(elements.mediaPath(saved.nodes.find((n) => n.kind === "image").element.file));
  assert.throws(() => clipboard.paste(b, store.loadCanvas(b), { x: 0, y: 0 }), /mídia/);
  assert.deepEqual(readdirSync(elements.notesDir), ["nota.md"]);
  assert.deepEqual(store.loadCanvas(b).nodes, []);
  assert.equal(elements.readNote("nota"), "conteúdo antes de copiar");
});
