// Testa o ElementService (notas, mídia, mudanças no canvas) e utilidades de site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "elements.mjs");
await build({
  stdin: {
    contents: 'export * from "./src/main/elements"; export * from "./src/main/workspaceStore"; export { normalizeUrl } from "./src/main/webDriver"; export { neighborhoodFromStore } from "./src/main/canvasGraph"; export * from "./src/main/files";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "silent",
});
const { ElementService, WorkspaceStore, uniqueTitle, mediaKind, normalizeUrl, neighborhoodFromStore, parseCsv, tableToMarkdown, normalizeTable, fileInfo, listDir } = await import(pathToFileURL(outfile).href);

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "o-el-"));
  const store = new WorkspaceStore(dir);
  const ws = store.list().workspaces[0].id;
  store.saveCanvas(ws, {
    version: 1,
    nodes: [
      { id: "T1", x: 100, y: 50, width: 600, height: 400, terminal: { id: "T1", title: "Claude", command: "claude", cwd: "" } },
      { id: "N0", kind: "note", x: 0, y: 600, width: 300, height: 200, element: { id: "N0", kind: "note", title: "Nota" } },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  });
  const events = { notes: [], patches: [], tables: [] };
  const svc = new ElementService(dir, store, {
    noteChanged: (id, c) => events.notes.push([id, c]),
    tableChanged: (id, rows) => events.tables.push([id, rows]),
    patch: (p) => events.patches.push(p),
  });
  return { dir, store, ws, svc, events };
}

test("uniqueTitle e mediaKind", () => {
  assert.equal(uniqueTitle("Nota", ["nota", "Nota 2"]), "Nota 3");
  assert.equal(uniqueTitle("  ", []), "Sem nome");
  assert.equal(mediaKind("C:\\\\fotos\\\\a.JPG"), "image");
  assert.equal(mediaKind("/v/b.webm"), "video");
  assert.equal(mediaKind("/x/c.pdf"), null);
});

test("notas: só avisa a interface quando quem escreveu foi um agente", () => {
  const { svc, events } = setup();
  svc.writeNote("N0", "do usuário", false);
  svc.writeNote("N0", "do agente", true);
  assert.equal(svc.readNote("N0"), "do agente");
  assert.deepEqual(events.notes, [["N0", "do agente"]]);
  assert.equal(svc.readNote("nao-existe"), "");
});

test("id de nota com ../ não sai da pasta", () => {
  const { svc } = setup();
  assert.ok(svc.notePath("../../etc/passwd").startsWith(svc.notesDir));
});

test("mídia: importa só imagem/vídeo e a limpeza apaga o arquivo", () => {
  const { dir, svc } = setup();
  const src = join(dir, "foto.png");
  writeFileSync(src, "x");
  const imported = svc.importMedia(src);
  assert.equal(imported.kind, "image");
  assert.equal(imported.name, "foto");
  assert.ok(existsSync(svc.mediaPath(imported.file)));
  svc.cleanup({ kind: "image", element: { id: "I", kind: "image", title: "foto", file: imported.file } });
  assert.equal(existsSync(svc.mediaPath(imported.file)), false);
  writeFileSync(join(dir, "doc.pdf"), "x");
  assert.equal(svc.importMedia(join(dir, "doc.pdf")), null);
});

test("agente cria elemento: workspace fechado grava direto no canvas, ligado ao terminal", () => {
  const { store, ws, svc, events } = setup();
  const created = svc.addLinkedElement("T1", "note", "Nota");
  assert.equal(created.element.title, "Nota 2");
  const canvas = store.loadCanvas(ws);
  const node = canvas.nodes.find((n) => n.id === created.element.id);
  assert.equal(node.kind, "note");
  assert.equal(node.x, 100 + 600 + 80);
  assert.deepEqual(canvas.edges.at(-1), { id: `T1->${node.id}`, source: "T1", target: node.id });
  assert.equal(events.patches.length, 0);
  // O segundo vai para baixo do primeiro.
  const second = svc.addLinkedElement("T1", "web", "Site", { url: "https://a.com" });
  const n2 = store.loadCanvas(ws).nodes.find((n) => n.id === second.element.id);
  assert.equal(n2.x, node.x);
  assert.equal(n2.y, node.y + node.height + 40);
  assert.equal(n2.element.url, "https://a.com");
});

test("agente cria elemento: workspace aberto manda a mudança para a interface", () => {
  const { store, ws, svc, events } = setup();
  svc.setMounted(ws);
  svc.addLinkedElement("T1", "web", "Docs", { url: "https://b.com" });
  svc.updateElement("N0", { title: "Renomeada" });
  assert.equal(events.patches.length, 2);
  assert.equal(events.patches[0].type, "add");
  assert.equal(events.patches[1].type, "update");
  // Não mexeu no arquivo: quem salva é a interface.
  assert.equal(store.loadCanvas(ws).nodes.length, 2);
});

test("terminal fora de qualquer canvas não cria nada", () => {
  const { svc } = setup();
  assert.equal(svc.addLinkedElement("XX", "note", "Nota"), null);
});

test("normalizeUrl", () => {
  assert.equal(normalizeUrl("exemplo.com"), "https://exemplo.com");
  assert.equal(normalizeUrl("localhost:3000/a"), "http://localhost:3000/a");
  assert.equal(normalizeUrl("192.168.0.1"), "http://192.168.0.1");
  assert.equal(normalizeUrl("file:///c/a.html"), "file:///c/a.html");
  assert.throws(() => normalizeUrl(" "));
});

test("desenhos não existem para os agentes, nem ligados nem soltos", () => {
  const { store, ws } = setup();
  const canvas = store.loadCanvas(ws);
  const draw = { shape: "text", text: "Arquitetura", stroke: "auto", fill: "transparent", fillStyle: "hachure", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, seed: 1 };
  canvas.nodes.push({ id: "D1", kind: "draw", x: 0, y: 0, width: 100, height: 40, draw });
  canvas.edges.push({ id: "T1->D1", source: "T1", target: "D1" });
  store.saveCanvas(ws, canvas);
  const hood = neighborhoodFromStore(store, "T1");
  assert.deepEqual(hood.linked, []);
  assert.deepEqual(
    hood.others.map((i) => i.id),
    ["N0"],
  );
});

test("tabelas: grava, lê, avisa a interface só quando é agente, e limpa ao remover", () => {
  const { svc, events } = setup();
  assert.deepEqual(svc.readTable("T9"), [["Coluna 1", "Coluna 2", "Coluna 3"], ["", "", ""], ["", "", ""]]);
  svc.writeTable("T9", [["a", "b"], ["1"]], false);
  assert.deepEqual(svc.readTable("T9"), [["a", "b"], ["1", ""]], "completa a grade");
  assert.equal(events.tables.length, 0);
  svc.writeTable("T9", [["x"]], true);
  assert.deepEqual(events.tables, [["T9", [["x"]]]]);
  svc.cleanup({ kind: "table", element: { id: "T9", kind: "table", title: "T" } });
  assert.equal(existsSync(svc.tablePath("T9")), false);
});

test("CSV com vírgula, ponto e vírgula, aspas e quebra de linha; Markdown escapa |", () => {
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv('nome;valor\r\n"Silva; Ana";"1.000,50"\r\n'), [["nome", "valor"], ["Silva; Ana", "1.000,50"]]);
  assert.deepEqual(parseCsv('cena,texto\n1,"fala; pausa; fim"'), [["cena", "texto"], ["1", "fala; pausa; fim"]]);
  assert.deepEqual(parseCsv('a,b\n"linha\ndupla","aspas ""x"""'), [["a", "b"], ["linha\ndupla", 'aspas "x"']]);
  assert.deepEqual(normalizeTable("lixo"), normalizeTable(null));
  assert.equal(tableToMarkdown([["a|b", "c"], ["1", "2\n3"]]), "| a\\|b | c |\n| --- | --- |\n| 1 | 2 3 |");
});

test("arquivos do disco: informação, prévia só de texto, e pasta com pastas primeiro", () => {
  const dir = mkdtempSync(join(tmpdir(), "o-files-"));
  writeFileSync(join(dir, "b.txt"), "olá");
  writeFileSync(join(dir, "a.bin"), Buffer.from([1, 0, 2]));
  writeFileSync(join(dir, "c.pdf"), "%PDF-1.7");
  mkdirSync(join(dir, "z-pasta"));
  const t = fileInfo(join(dir, "b.txt"));
  assert.equal(t.exists, true);
  assert.equal(t.preview, "olá");
  assert.equal(fileInfo(join(dir, "a.bin")).preview, undefined);
  assert.equal(fileInfo(join(dir, "c.pdf")).preview, undefined);
  assert.equal(fileInfo(join(dir, "nada.txt")).exists, false);
  const l = listDir(dir);
  assert.equal(l.ok, true);
  assert.deepEqual(l.entries.map((e) => e.name), ["z-pasta", "a.bin", "b.txt", "c.pdf"]);
  assert.equal(listDir(join(dir, "nao-existe")).ok, false);
});
