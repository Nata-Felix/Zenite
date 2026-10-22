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
