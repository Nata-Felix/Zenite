import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out/test/solAccess.mjs");
await build({ stdin: { contents: 'export * from "./src/main/solAccess"; export * from "./src/main/fullAccess"; export * from "./src/main/headlessAgent";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { canGrantSolAccess, commandFor, flowPermission, scriptPermission, SOL_ACCESS_MESSAGE, SOL_CANVAS_MESSAGE, solWelcomeMessage, withSolAccess, withPermissions } = await import(pathToFileURL(outfile).href);

test("Sol recebe orientação de canvas em todos os modos sem ampliar permissões", () => {
  for (const mode of [undefined, "ask", "sandbox", "full"]) {
    const message = solWelcomeMessage(mode);
    assert.ok(message.includes(SOL_CANVAS_MESSAGE));
    assert.match(message, /execute zn list/);
    assert.match(message, /diretório de trabalho/);
    assert.match(message, /não contorne/);
    assert.equal(message.includes(SOL_ACCESS_MESSAGE), mode === "full");
  }
});

test("promover a Sol só concede Full Access quando acesso total foi escolhido explicitamente", () => {
  for (const mode of [undefined, "ask", "sandbox"]) assert.equal(canGrantSolAccess(mode), false);
  assert.equal(canGrantSolAccess("full"), true);
  assert.equal(SOL_ACCESS_MESSAGE, "acesso total para trabalhar, prioridade obrigatória ao canvas e controle externo somente quando solicitado");
});

test("o comando do Sol mantém as permissões de sempre perguntar e sandbox", () => {
  const command = "codex -m gpt-6-sol";
  const request = (mode) => canGrantSolAccess(mode) ? withSolAccess(command) : withPermissions(command, mode);
  assert.equal(request("ask"), "codex --sandbox workspace-write --ask-for-approval on-request -m gpt-6-sol");
  assert.equal(request("sandbox"), "codex --sandbox workspace-write --ask-for-approval never -m gpt-6-sol");
  assert.equal(request("full"), "codex --dangerously-bypass-approvals-and-sandbox -m gpt-6-sol");
});

test("astros não escapam das permissões globais solicitando acesso total", () => {
  for (const mode of [undefined, "ask"]) assert.equal(flowPermission(mode, "full"), "read");
  assert.equal(flowPermission("sandbox", "full"), "sandbox");
  assert.equal(flowPermission("sandbox", "read"), "read");
  assert.equal(flowPermission("full", "read"), "read");
  assert.equal(flowPermission("full", "full"), "full");
});

test("Propulsor exige confirmação em Sempre perguntar e é recusado em Sandbox", () => {
  assert.equal(scriptPermission(undefined), "confirm");
  assert.equal(scriptPermission("ask"), "confirm");
  assert.equal(scriptPermission("sandbox"), "deny");
  assert.equal(scriptPermission("full"), "allow");
});

test("processos dos astros não podem pedir elevação quando confinados à sandbox", () => {
  const run = { agent: "codex", prompt: "teste", cwd: process.cwd(), env: {}, permission: flowPermission("sandbox", "full") };
  const command = commandFor(run, "resposta.txt");
  assert.deepEqual(command.args.slice(0, 3), ["--ask-for-approval", "never", "exec"]);
  assert.ok(command.args.includes("workspace-write"));
  assert.ok(!command.args.some((arg) => /dangerously|danger-full-access/.test(arg)));
  const agy = commandFor({ ...run, agent: "antigravity", permission: flowPermission("ask", "full") }, "resposta.txt");
  assert.deepEqual(agy.args.slice(-2), ["--mode", "plan"]);
  assert.ok(!agy.args.includes("--dangerously-skip-permissions"));
});
