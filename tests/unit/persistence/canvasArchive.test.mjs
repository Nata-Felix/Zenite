// Exportar/importar canvas (.zenite): só a distribuição dos itens, sem contas nem chaves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "canvasArchive.mjs");
await build({ entryPoints: ["src/main/canvasArchive.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { readCanvasArchive, writeCanvasArchive } = await import(pathToFileURL(outfile).href);

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "o-archive-"));
  const media = join(dir, "media");
  const imported = join(dir, "imported");
  mkdirSync(media);
  mkdirSync(imported);
  const bytes = Buffer.from(Array.from({ length: 70_000 }, (_, i) => i % 251));
  writeFileSync(join(media, "foto.png"), bytes);
  const box = { x: 0, y: 0, width: 100, height: 80 };
  const state = {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: "t1", ...box, kind: "terminal", terminal: { id: "t1", title: "Codex", command: "codex", cwd: "C:\\projeto", account: "conta-1", accountName: "Pessoal", provider: "openrouter", appearance: { color: "#f00" } } },
      { id: "n1", ...box, x: 200, kind: "note", element: { id: "n1", kind: "note", title: "Plano" } },
      { id: "tb", ...box, x: 400, kind: "table", element: { id: "tb", kind: "table", title: "Preços" } },
      { id: "i1", ...box, y: 200, kind: "image", element: { id: "i1", kind: "image", title: "Logo", file: "foto.png" } },
      { id: "f1", ...box, y: 400, kind: "folder", element: { id: "f1", kind: "folder", title: "Projeto", path: "C:\\projeto" } },
    ],
    edges: [
      { id: "e1", source: "t1", target: "n1" },
      { id: "e2", source: "t1", target: "i1" },
      { id: "e3", source: "n1", target: "f1" },
    ],
  };
  const src = {
    readNote: (id) => (id === "n1" ? "objetivo: lançar v1" : ""),
    readTable: (id) => (id === "tb" ? [["Plano", "Preço"], ["Básico", "10"]] : [[""]]),
    mediaPath: (file) => join(media, file),
  };
  return { dir, media, imported, bytes, state, src };
}

test("exporta só os tipos marcados, sem conta nem provedor, e importa com mídia, notas e tabelas", () => {
  const { dir, imported, bytes, state, src } = setup();
  const file = join(dir, "canvas.zenite");
  const count = writeCanvasArchive(file, state, ["terminal", "note", "table", "image"], src);
  assert.equal(count, 4, "a pasta ficou de fora");
  assert.equal(existsSync(`${file}.tmp`), false);

  const batch = readCanvasArchive(file, (f) => join(imported, f));
  assert.deepEqual(batch.nodes.map((n) => n.id).sort(), ["i1", "n1", "t1", "tb"]);
  const terminal = batch.nodes.find((n) => n.id === "t1").terminal;
  assert.deepEqual(terminal, { id: "t1", title: "Codex", command: "codex", cwd: "C:\\projeto", appearance: { color: "#f00" } });
  assert.deepEqual(batch.edges.map((e) => e.id).sort(), ["e1", "e2"], "ligação com a pasta, que não foi, some");
  assert.equal(batch.notes.n1, "objetivo: lançar v1");
  assert.deepEqual(batch.tables.tb, [["Plano", "Preço"], ["Básico", "10"]]);

  const image = batch.nodes.find((n) => n.id === "i1").element;
  assert.notEqual(image.file, "foto.png", "a mídia ganha nome novo");
  assert.match(image.file, /\.png$/);
  assert.ok(readFileSync(join(imported, image.file)).equals(bytes), "bytes da imagem idênticos");
  assert.doesNotMatch(readFileSync(file).toString("latin1"), /conta-1|Pessoal|openrouter/, "nada de conta no arquivo");
});

test("pasta e arquivo vão só com o caminho", () => {
  const { dir, imported, state, src } = setup();
  const file = join(dir, "pasta.zenite");
  writeCanvasArchive(file, state, ["folder"], src);
  const batch = readCanvasArchive(file, (f) => join(imported, f));
  assert.equal(batch.nodes.length, 1);
  assert.equal(batch.nodes[0].element.path, "C:\\projeto");
  assert.equal(batch.edges.length, 0);
});

test("nada marcado que exista no canvas é recusado", () => {
  const { dir, state, src } = setup();
  assert.throws(() => writeCanvasArchive(join(dir, "x.zenite"), state, ["video"], src), /Nada para exportar/);
});

test("arquivo que não é do Zênite ou cortado é recusado sem deixar mídia pela metade", () => {
  const { dir, imported, state, src } = setup();
  const other = join(dir, "outro.zenite");
  writeFileSync(other, "não sou um canvas");
  assert.throws(() => readCanvasArchive(other, (f) => join(imported, f)), /não é um canvas exportado/);

  const file = join(dir, "inteiro.zenite");
  writeCanvasArchive(file, state, ["image"], src);
  const full = readFileSync(file);
  const cut = join(dir, "cortado.zenite");
  writeFileSync(cut, full.subarray(0, full.length - 1000));
  assert.throws(() => readCanvasArchive(cut, (f) => join(imported, f)), /incompleto/);
  assert.deepEqual(readdirSync(imported), [], "mídia parcial apagada");
});
