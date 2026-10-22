// Testa o PtyManager e a escolha de shell fora do Electron, com um PTY real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Dentro de out/ para o import achar node_modules.
const outfile = join(process.cwd(), "out", "test", "main.mjs");
await build({
  stdin: { contents: 'export * from "./src/main/ptyManager"; export * from "./src/main/shell";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@lydell/node-pty"],
  outfile,
  logLevel: "silent",
});
const { PtyManager, resolveShell } = await import(pathToFileURL(outfile).href);

test("falha no lançador isolado não inicia shell nativo nem emite token para ele", () => {
  let nativeEnvCalled = false;
  const mgr = new PtyManager({ onData() {}, onExit() {} }, () => { nativeEnvCalled = true; return {}; }, () => "auto", () => { throw new Error("Docker indisponível"); });
  const result = mgr.create({ id: "isolated-fail", command: "echo NAO_EXECUTAR_NO_HOST", cwd: process.cwd(), cols: 80, rows: 24 });
  assert.equal(result.ok, false); assert.match(result.error, /Docker indisponível/);
  assert.equal(nativeEnvCalled, false); assert.equal(mgr.count(), 0);
});

test("token é exclusivo por sessão; trocar ID ou reutilizar token após reinício falha", () => {
  const tokens = new Map();
  const mgr = new PtyManager({ onData() {}, onExit() {} }, (id, token) => { tokens.set(id, token); return {}; });
  const req = id => ({ id, command: "", cwd: "", cols: 80, rows: 24 });
  try {
    assert.equal(mgr.create(req("auth-a")).ok, true);
    assert.equal(mgr.create(req("auth-b")).ok, true);
    const old = tokens.get("auth-a");
    assert.equal(mgr.verify("auth-a", old), true);
    assert.equal(mgr.verify("auth-b", old), false);
    assert.equal(mgr.verify("auth-a", "é".repeat(48)), false);
    assert.equal(mgr.verify("auth-a", ""), false);
    assert.equal(mgr.restart(req("auth-a")).ok, true);
    assert.equal(mgr.verify("auth-a", old), false);
    assert.equal(mgr.verify("auth-a", tokens.get("auth-a")), true);
  } finally { mgr.killAll(); }
});

test("resolveShell no Windows mantém o PowerShell aberto após o comando", () => {
  const { file, args } = resolveShell("claude", "win32", {});
  assert.equal(file, "powershell.exe");
  assert.deepEqual(args, ["-NoLogo", "-NoExit", "-Command", "claude"]);
});

test("resolveShell respeita o shell escolhido no Windows", () => {
  const env = { ProgramFiles: "C:\\PF", ComSpec: "C:\\Windows\\system32\\cmd.exe" };
  const has = (p) => p.includes("Git") || p.includes("PowerShell");
  assert.deepEqual(resolveShell("claude", "win32", env, "cmd", has), { file: env.ComSpec, args: ["/K", "claude"] });
  const gb = resolveShell("claude", "win32", env, "gitbash", has);
  assert.match(gb.file, /Git.bin.bash\.exe$/);
  assert.deepEqual(gb.args, ["-ic", "claude; exec bash -i"]);
  assert.equal(resolveShell("", "win32", env, "powershell", has).file, "powershell.exe");
  assert.match(resolveShell("", "win32", env, "auto", has).file, /pwsh\.exe$/);
  // Git Bash ausente: volta para o PowerShell.
  assert.equal(resolveShell("", "win32", env, "gitbash", () => false).file, "powershell.exe");
});

test("resolveShell sem comando abre só o shell", () => {
  assert.deepEqual(resolveShell("  ", "win32", {}).args, ["-NoLogo"]);
  assert.deepEqual(resolveShell("", "linux", { SHELL: "/bin/bash" }), { file: "/bin/bash", args: ["-i"] });
});

function collect() {
  const out = new Map();
  const exits = new Map();
  const mgr = new PtyManager({
    onData: (id, d) => out.set(id, (out.get(id) ?? "") + d),
    onExit: (id, code) => exits.set(id, code),
  });
  return { mgr, out, exits };
}

async function waitFor(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timeout");
}

test("PTY executa comando, recebe entrada e expõe O_TERMINAL_ID", async () => {
  const { mgr, out } = collect();
  try {
    assert.equal(mgr.create({ id: "t1", command: "", cwd: "", cols: 80, rows: 24 }).ok, true);
    // No Windows o shell é o PowerShell, que lê variáveis de ambiente com $env:.
    const v = process.platform === "win32" ? "$env:O_TERMINAL_ID" : "$O_TERMINAL_ID";
    mgr.write("t1", `echo "id=${v}"\r`);
    await waitFor(() => (out.get("t1") ?? "").includes("id=t1"));
  } finally {
    // Se o teste falhar, o PTY aberto impediria o processo do teste de terminar.
    mgr.killAll();
  }
});

test("recriar o mesmo id reaproveita a sessão e devolve o histórico", async () => {
  const { mgr, out } = collect();
  try {
    mgr.create({ id: "t2", command: "echo marcador-123", cwd: "", cols: 80, rows: 24 });
    await waitFor(() => (out.get("t2") ?? "").includes("marcador-123"));
    const again = mgr.create({ id: "t2", command: "", cwd: "", cols: 100, rows: 30 });
    assert.equal(again.reused, true);
    assert.match(again.backlog, /marcador-123/);
  } finally {
    mgr.killAll();
  }
});

test("kill encerra o processo e esquece a sessão", async () => {
  const { mgr, exits } = collect();
  mgr.create({ id: "t3", command: "", cwd: "", cols: 80, rows: 24 });
  mgr.kill("t3");
  assert.equal(mgr.has("t3"), false);
  await waitFor(() => exits.has("t3"));
});

test("reload troca o processo, limpa o histórico e ignora o encerramento atrasado da sessão anterior", async () => {
  const { mgr, out, exits } = collect();
  const req = { id: "reload", command: "", cwd: "", cols: 80, rows: 24 };
  try {
    assert.equal(mgr.create(req).ok, true);
    // O marcador só existe na saída, não no comando: o PSReadLine sugere o comando do histórico
    // (em cinza) no shell novo, e isso não pode ser confundido com histórico que sobrou.
    mgr.write(req.id, "echo ('antes-' + 'do-reload')\r");
    await waitFor(() => (out.get(req.id) ?? "").includes("antes-do-reload"));
    const oldPid = mgr.roots().find((r) => r.id === req.id).pid;
    const result = mgr.restart(req);
    assert.equal(result.ok, true);
    assert.notEqual(result.reused, true);
    assert.notEqual(mgr.roots().find((r) => r.id === req.id).pid, oldPid);
    exits.clear();
    out.set(req.id, "");
    // Dá tempo para o ConPTY antigo avisar que saiu, antes de conferir o novo.
    await new Promise((r) => setTimeout(r, 400));
    mgr.write(req.id, "echo depois-do-reload\r");
    await waitFor(() => (out.get(req.id) ?? "").includes("depois-do-reload"));
    const reused = mgr.create(req);
    assert.equal(reused.reused, true);
    assert.doesNotMatch(reused.backlog, /antes-do-reload/);
    assert.equal(exits.has(req.id), false);
  } finally {
    mgr.killAll();
  }
});
