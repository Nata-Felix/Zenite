import { test } from "node:test";
import assert from "node:assert/strict";
import { build, version } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out/test/codeRuntime.mjs");
await build({ entryPoints: ["src/main/codeRuntime.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { prepareCodeRuntime, findCodeRuntime, executeCode } = await import(pathToFileURL(outfile));
const runtime = { file: process.execPath, version: process.version };

test("reutiliza a versão instalada sem perguntar nem instalar", async () => {
  const unexpected = () => assert.fail("Não deve instalar nem pedir confirmação");
  assert.equal(await prepareCodeRuntime("javascript", { check: unexpected, confirm: unexpected }, { find: async () => runtime, install: unexpected }), runtime);
});
test("instala apenas após confirmação e detecta a versão resultante", async () => {
  const calls = []; let installed = false;
  const result = await prepareCodeRuntime("python", {
    check: () => calls.push("check"),
    confirm: async (title, detail) => { assert.match(title, /Instalar Python/); assert.match(detail, /Python.Python/); calls.push("confirm"); return true; },
  }, { find: async () => installed ? runtime : undefined, install: async () => { calls.push("install"); installed = true; } });
  assert.equal(result, runtime); assert.deepEqual(calls, ["check", "confirm", "check", "install", "check"]);
});
test("recusa, Sandbox, alteração de permissão e cancelamento impedem instalação", async () => {
  for (const mode of ["deny", "sandbox", "change", "abort"]) {
    const controller = new AbortController(); let confirmed = false;
    await assert.rejects(prepareCodeRuntime("python", {
      signal: controller.signal,
      check: () => { if (mode === "sandbox" || mode === "change" && confirmed) throw Error("Bloqueado"); },
      confirm: async () => { confirmed = true; if (mode === "abort") controller.abort(); return mode !== "deny"; },
    }, { find: async () => undefined, install: async () => assert.fail("Não pode instalar") }));
  }
  await assert.rejects(prepareCodeRuntime("ruby", { check() {}, confirm: async () => true }), /Python ou JavaScript/);
});
test("JavaScript recebe entrada como dados, preserva Unicode e usa a pasta do projeto", async () => {
  const input = 'Olá 🌍 \n "; throw new Error("injetado"); //';
  const result = await executeCode(runtime, "javascript", 'console.log(JSON.stringify({entrada, variaveis, cwd: process.cwd(), dependency: require("esbuild").version}));', { entrada: input, vars: { nome: "João" } }, process.cwd(), new AbortController().signal);
  assert.deepEqual(JSON.parse(result), { entrada: input, variaveis: { nome: "João" }, cwd: process.cwd(), dependency: version });
});
test("erro de código, saída excessiva e interrupção não entregam sucesso", async () => {
  const item = { entrada: "", vars: {} }, cwd = process.cwd();
  await assert.rejects(executeCode(runtime, "javascript", 'throw Error("falha esperada")', item, cwd, new AbortController().signal), /falha esperada/);
  await assert.rejects(executeCode(runtime, "javascript", 'console.log("x".repeat(1100000))', item, cwd, new AbortController().signal));
  const controller = new AbortController();
  const run = executeCode(runtime, "javascript", 'setInterval(() => {}, 1000)', item, cwd, controller.signal);
  setTimeout(() => controller.abort(), 250);
  await assert.rejects(run, /parado/);
});
test("Python instalado recebe texto e variáveis sem interpolar o código", async t => {
  const python = await findCodeRuntime("python");
  if (!python) return t.skip("Python não está instalado neste ambiente de teste");
  const result = await executeCode(python, "python", 'from __future__ import annotations\nprint(entrada + variaveis["sufixo"])', { entrada: 'Olá "mundo"', vars: { sufixo: " ✓" } }, process.cwd(), new AbortController().signal);
  assert.equal(result, 'Olá "mundo" ✓');
});
