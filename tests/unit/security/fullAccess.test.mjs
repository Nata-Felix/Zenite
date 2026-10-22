// Permissões dos agentes: cada modo vira as opções de abertura de cada CLI; outros comandos ficam iguais.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "fullAccess.mjs");
await build({ entryPoints: ["src/main/fullAccess.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { withPermissions, withSolAccess } = await import(pathToFileURL(outfile).href);

test("sempre perguntar mantém as aprovações e impede a abertura do Codex sem sandbox", () => {
  assert.equal(withPermissions("codex"), "codex --sandbox workspace-write --ask-for-approval on-request");
  assert.equal(withPermissions("agy", "ask"), "agy");
});

test("sandbox e acesso total, logo depois do programa", () => {
  assert.equal(withPermissions("codex", "sandbox"), "codex --sandbox workspace-write --ask-for-approval never");
  assert.equal(withPermissions("codex", "full"), "codex --dangerously-bypass-approvals-and-sandbox");
  assert.equal(withPermissions("agy", "sandbox"), "agy --sandbox --dangerously-skip-permissions");
  assert.equal(withPermissions("agy", "full"), "agy --dangerously-skip-permissions");
  if (process.platform === "win32") assert.throws(() => withPermissions("claude --model opus", "sandbox"), /não oferece sandbox no Windows/);
  assert.equal(withPermissions("claude", "full"), "claude --dangerously-skip-permissions");
  assert.equal(withPermissions('"C:\\Program Files\\x\\codex.cmd" resume', "full"), '"C:\\Program Files\\x\\codex.cmd" --dangerously-bypass-approvals-and-sandbox resume');
});

test("a configuração global prevalece sobre opções antigas da linha de comando", () => {
  assert.equal(withPermissions("codex --full-auto", "full"), "codex --dangerously-bypass-approvals-and-sandbox");
  assert.equal(withPermissions("codex -s read-only", "full"), "codex --dangerously-bypass-approvals-and-sandbox");
  assert.equal(withPermissions("claude --permission-mode plan", "full"), "claude --dangerously-skip-permissions");
  assert.equal(withPermissions("codex --dangerously-bypass-approvals-and-sandbox", "ask"), "codex --sandbox workspace-write --ask-for-approval on-request");
  assert.equal(withPermissions("codex --dangerously-bypass-approvals-and-sandbox --sandbox danger-full-access", "sandbox"), "codex --sandbox workspace-write --ask-for-approval never");
  assert.equal(withPermissions("agy --dangerously-skip-permissions --mode accept-edits", "ask"), "agy");
  assert.equal(withPermissions("", "full"), "");
  assert.equal(withPermissions("npm run dev", "full"), "npm run dev");
  assert.equal(withPermissions("git log codex", "full"), "git log codex");
});

test("Sol substitui permissões restritivas sem perder modelo, esforço ou pasta", () => {
  assert.equal(withSolAccess('codex --sandbox read-only --ask-for-approval on-request -m gpt-6-sol -c model_reasoning_effort=low'), 'codex --dangerously-bypass-approvals-and-sandbox -m gpt-6-sol -c model_reasoning_effort=low');
  assert.equal(withSolAccess('codex -s workspace-write -a never -c sandbox_mode="read-only" -c approval_policy="on-request" -c model_reasoning_effort=high'), 'codex --dangerously-bypass-approvals-and-sandbox -c model_reasoning_effort=high');
  assert.equal(withSolAccess('"C:\\Program Files\\Codex\\codex.cmd" --full-auto --cd "C:\\meu projeto"'), '"C:\\Program Files\\Codex\\codex.cmd" --dangerously-bypass-approvals-and-sandbox --cd "C:\\meu projeto"');
  assert.equal(withSolAccess('codex --sandbox=read-only --ask-for-approval=untrusted'), 'codex --dangerously-bypass-approvals-and-sandbox');
});

test("Sol abre os agentes suportados em acesso total, sem duplicar opções", () => {
  for (const command of ['codex -m gpt-6-sol', 'claude --permission-mode plan --model opus', 'agy --sandbox --effort low']) {
    assert.equal(withSolAccess(withSolAccess(command)), withSolAccess(command));
  }
  assert.equal(withSolAccess('claude --permission-mode plan --model opus'), 'claude --dangerously-skip-permissions --model opus');
  assert.equal(withSolAccess('agy --sandbox "pedido de teste"'), 'agy --dangerously-skip-permissions "pedido de teste"');
  assert.equal(withSolAccess('powershell'), 'powershell');
  assert.equal(withSolAccess('npm run dev'), 'npm run dev');
  assert.equal(withSolAccess(''), '');
});
