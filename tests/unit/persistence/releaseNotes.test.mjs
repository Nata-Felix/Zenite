// Notas da versão: Markdown e HTML do GitHub viram títulos, listas e parágrafos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "releaseNotes.mjs");
await build({ entryPoints: ["src/shared/releaseNotes.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { parseNotes, parseInline, htmlToMarkdown } = await import(pathToFileURL(outfile).href);

const plain = (parts) => parts.map((p) => p.text).join("");

test("release-notes.md: títulos sem # e itens de lista", () => {
  const blocks = parseNotes(readFileSync("build/release-notes.md", "utf8"));
  for (const h of blocks.filter((b) => b.kind === "heading")) assert.doesNotMatch(plain(h.content), /^#/);
  const items = blocks.filter((b) => b.kind === "list").flatMap((b) => b.items);
  assert.ok(items.length >= 1);
  for (const i of items) assert.doesNotMatch(plain(i), /^[-*] /);
});

test("estrutura: título, lista, parágrafo e continuação de item", () => {
  const blocks = parseNotes("## Novidades\n\n- um\n- dois\n  continua\n\nTexto solto\nna mesma frase.\n\n### Correções\n1. três");
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["heading", "list", "paragraph", "heading", "list"],
  );
  assert.equal(blocks[0].level, 2);
  assert.equal(plain(blocks[1].items[1]), "dois continua");
  assert.equal(plain(blocks[2].content), "Texto solto na mesma frase.");
  assert.equal(blocks[3].level, 3);
  assert.equal(plain(blocks[4].items[0]), "três");
});

test("negrito, itálico e código dentro da linha", () => {
  assert.deepEqual(parseInline("use **Reiniciar agora** ou `zn list`, *sem* pressa"), [
    { kind: "text", text: "use " },
    { kind: "bold", text: "Reiniciar agora" },
    { kind: "text", text: " ou " },
    { kind: "code", text: "zn list" },
    { kind: "text", text: ", " },
    { kind: "italic", text: "sem" },
    { kind: "text", text: " pressa" },
  ]);
  // Nome com sublinhado no meio não vira itálico.
  assert.deepEqual(parseInline("app_update.json"), [{ kind: "text", text: "app_update.json" }]);
});

test("HTML do GitHub vira o mesmo Markdown", () => {
  const md = htmlToMarkdown('<h2>Novidades</h2>\n<ul>\n<li>Atualização <strong>automática</strong></li>\n<li>Use <code>zn</code> &amp; mais</li>\n</ul>');
  const blocks = parseNotes(md);
  assert.equal(blocks[0].kind, "heading");
  assert.equal(plain(blocks[0].content), "Novidades");
  assert.equal(blocks[1].kind, "list");
  assert.deepEqual(blocks[1].items[0], [
    { kind: "text", text: "Atualização " },
    { kind: "bold", text: "automática" },
  ]);
  assert.equal(plain(blocks[1].items[1]), "Use zn & mais");
});
