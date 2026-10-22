// Encerrar só o que é do Zênite: o processo de fundo do Codex é reconhecido pela pasta da conta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "terminalCleanup.mjs");
await build({ entryPoints: ["src/main/terminalCleanup.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { parseZeniteCodex, zeniteCodexProcesses } = await import(pathToFileURL(outfile).href);

test("só o Codex com pasta de conta do Zênite; o de fora (~/.codex, app da OpenAI) fica", () => {
  const listing = [
    '5604\t"\\\\?\\C:\\Users\\João Teste\\.zenite\\cdc66aa0\\packages\\app-server-daemon\\releases\\0.163.0\\bin\\codex.exe" app-server --listen unix',
    "22020\tC:\\Users\\João Teste\\.zenite\\63618308\\packages\\app-server-daemon\\bin\\codex-code-mode-host.exe",
    "14852\tC:\\Users\\João Teste\\AppData\\Local\\OpenAI\\Codex\\bin\\codex.exe app-server",
    "21872\tC:\\Users\\João Teste\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\vendor\\codex.exe",
    "7777\tC:\\Users\\João Teste\\.codex\\packages\\codex.exe app-server",
    "8888\t/home/n/.zenite/abcdef12/packages/codex app-server",
    "\t",
    "lixo",
  ].join("\r\n");
  assert.deepEqual(parseZeniteCodex(listing), [
    { pid: 5604, account: "cdc66aa0" },
    { pid: 22020, account: "63618308" },
    { pid: 8888, account: "abcdef12" },
  ]);
});

test("a listagem real roda e devolve uma lista (vazia se não há Codex do Zênite)", () => {
  const found = zeniteCodexProcesses();
  assert.ok(Array.isArray(found));
  for (const p of found) assert.match(p.account, /^[0-9a-f]{8}$/);
});
