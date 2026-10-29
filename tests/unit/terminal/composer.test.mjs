// Caixa de mensagem: cada CLI recebe os anexos no formato que reconhece, e o anexo é
// copiado com um nome sem espaços nem acentos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "composer.mjs");
await build({ entryPoints: ["src/main/composer.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { composeSteps, stashAttachment } = await import(pathToFileURL(outfile).href);

const img = "C:\\anexos\\1-print.png", pdf = "C:\\anexos\\2-briefing.pdf";

test("Codex e Claude: cada imagem colada sozinha, outros arquivos citados no texto", () => {
  for (const agent of ["codex", "claude"]) {
    assert.deepEqual(composeSteps(agent, "Use como referência", [img, pdf]), [
      { paste: img },
      { paste: `"${pdf}"\nUse como referência` },
      { submit: true },
    ]);
  }
});

test("Codex só com imagem: não cola texto vazio", () => {
  assert.deepEqual(composeSteps("codex", "  ", [img]), [{ paste: img }, { submit: true }]);
});

test("Antigravity cita tudo com @", () => {
  assert.deepEqual(composeSteps("antigravity", "Analise", [img, pdf]), [{ paste: `@${img} @${pdf} Analise` }, { submit: true }]);
});

test("Shell recebe os caminhos entre aspas", () => {
  assert.deepEqual(composeSteps("shell", "type", [pdf]), [{ paste: `"${pdf}" type` }, { submit: true }]);
});

test("o anexo é copiado com nome seguro e conteúdo igual", () => {
  const dir = mkdtempSync(join(tmpdir(), "composer-"));
  const source = join(dir, "Referência da home (final).png");
  writeFileSync(source, "png");
  const copy = stashAttachment(join(dir, "anexos"), source, 42);
  assert.equal(basename(copy), "42-Referencia-da-home-final-.png");
  assert.equal(readFileSync(copy, "utf8"), "png");
});

test("tela pedindo uma decisão bloqueia o envio", async () => {
  const { waitingForChoice } = await import(pathToFileURL(outfile).href);
  assert.equal(waitingForChoice("Terms of Service & Data Use\n[Previous]   [Done]", false), true);
  assert.equal(waitingForChoice("Do you trust the files in this folder?", false), true);
  assert.equal(waitingForChoice("› Ask Codex to do anything", false), false);
  assert.equal(waitingForChoice("qualquer coisa", true), true);
});

test("última resposta do Codex, sem caixa de digitação nem rodapé", async () => {
  const { lastReply, replyOptions } = await import(pathToFileURL(outfile).href);
  const screen = [
    "› Monte a home do site",
    "",
    "• Posso seguir por dois caminhos:",
    "",
    "  **Qual você prefere?**",
    "  1. Layout com hero grande",
    "  2. Layout em grade",
    "",
    "  Worked for 12s • 15:19",
    "",
    "› Ask Codex to do anything",
    "",
    String.raw`  GPT-6.1-Sol medium fast · C:\videos · Monte a home`,
    "  ↵ for agents · ? for shortcuts",
  ].join("\n");
  const reply = lastReply(screen);
  assert.equal(reply, "Posso seguir por dois caminhos:\n\n**Qual você prefere?**\n1. Layout com hero grande\n2. Layout em grade");
  assert.deepEqual(replyOptions(reply), [{ key: "1", label: "Layout com hero grande" }, { key: "2", label: "Layout em grade" }]);
});

test("última resposta do Claude Code, dentro da moldura", async () => {
  const { lastReply } = await import(pathToFileURL(outfile).href);
  const screen = [
    "> qual o status?",
    "",
    "● Está tudo pronto.",
    "  - testes: **ok**",
    "",
    "╭──────────────────────────╮",
    "│ >                        │",
    "╰──────────────────────────╯",
    "  ? for shortcuts",
  ].join("\n");
  assert.equal(lastReply(screen), "Está tudo pronto.\n- testes: **ok**");
});

test("lista numerada sem pergunta não vira botões", async () => {
  const { replyOptions } = await import(pathToFileURL(outfile).href);
  assert.deepEqual(replyOptions("Fiz assim:\n1. criei a home\n2. testei"), []);
});

test("lista numerada no meio da resposta, com mais conteúdo depois, não vira botões", async () => {
  const { replyOptions } = await import(pathToFileURL(outfile).href);
  const reply = [
    "Confirmo as diretrizes:",
    "1. Orquestração pura: planejar e delegar.",
    "2. Canvas primeiro: consultar elementos ligados.",
    "3. Não execução direta.",
    "",
    "### Diagnóstico inicial",
    "- Sol: Antigravity",
    "- Ligados: Codex",
    "  - Claude Code (ligado ao Codex)",
    "",
    "Pronto para receber o próximo objetivo. O que vamos coordenar?",
  ].join("\n");
  assert.deepEqual(replyOptions(reply), []);
  // Opções seguidas da pergunta e de uma instrução curta continuam valendo.
  assert.deepEqual(replyOptions("Opções:\nA) Manter\nB) Simplificar\n\nQual você prefere?\nResponda com a letra.").map((o) => o.key), ["A", "B"]);
});
