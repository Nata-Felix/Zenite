// Git como memória: ativação, commits padronizados, histórico e guia dos agentes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "git.mjs");
await build({
  stdin: {
    contents: 'export * from "./src/main/gitSetup"; export * from "./src/main/gitMemory"; export * from "./src/main/agentGuide";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "silent",
});
const m = await import(pathToFileURL(outfile).href);

// Git isolado do usuário real: HOME temporário e sem configuração do sistema.
const fakeHome = mkdtempSync(join(tmpdir(), "o-home-"));
Object.assign(process.env, { HOME: fakeHome, XDG_CONFIG_HOME: fakeHome, GIT_CONFIG_NOSYSTEM: "1" });
for (const k of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"]) delete process.env[k];
const sh = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function project() {
  const dir = mkdtempSync(join(tmpdir(), "o-proj-"));
  writeFileSync(join(dir, "index.js"), "console.log(1)\n");
  writeFileSync(join(dir, ".env"), "SECRET=1\n");
  mkdirSync(join(dir, "node_modules", "x"), { recursive: true });
  writeFileSync(join(dir, "node_modules", "x", "i.js"), "");
  return dir;
}

test("ativar git: cria repositório e .gitignore seguro, lista só o que deve ir", async () => {
  const dir = project();
  assert.equal((await m.repoState(dir)).isRepo, false);
  const r = await m.initRepo(dir);
  assert.equal(r.ok, true);
  assert.deepEqual(r.files.sort(), [".gitignore", "index.js"]);
  const gi = readFileSync(join(dir, ".gitignore"), "utf8");
  assert.match(gi, /^\.env$/m);
  assert.match(gi, /^node_modules\/$/m);
  // Rodar de novo não duplica linhas.
  await m.initRepo(dir);
  assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), gi);
});

test("primeiro commit pede identidade quando o git não sabe quem é o autor", async () => {
  const dir = project();
  await m.initRepo(dir);
  const r = await m.firstCommit(dir);
  assert.equal(r.ok, false);
  assert.equal(r.needsIdentity, true);
  await m.setIdentity("Maria Teste", "maria@exemplo.com");
  assert.deepEqual(await m.identity(dir), { name: "Maria Teste", email: "maria@exemplo.com" });
  const ok = await m.firstCommit(dir);
  assert.equal(ok.ok, true, ok.error);
  const st = await m.repoState(dir);
  assert.equal(st.hasCommits, true);
  assert.equal(st.pending, 0);
  assert.match(sh(dir, "log", "-1", "--format=%B"), /^Primeiro commit\n\nPor quê: /);
});

test("o commit: formato padrão com porquê, pendente e agente", async () => {
  const dir = project();
  await m.initRepo(dir);
  await m.firstCommit(dir);
  writeFileSync(join(dir, "frete.js"), "export const f = 1\n");
  const r = await m.commitAsAgent(dir, { title: "  Adiciona   cálculo de frete ", why: "Clientes do Norte pagavam errado.", todo: "Tratar CEP inválido.", agent: "Claude" });
  assert.deepEqual(r.files, ["frete.js"]);
  assert.equal(
    sh(dir, "log", "-1", "--format=%B"),
    "Adiciona cálculo de frete\n\nPor quê: Clientes do Norte pagavam errado.\n\nPendente: Tratar CEP inválido.\n\nAgente: Claude",
  );
  await assert.rejects(m.commitAsAgent(dir, { title: "Nada", why: "x", agent: "A" }), /Nada para commitar/);
  writeFileSync(join(dir, "a.js"), "1");
  await assert.rejects(m.commitAsAgent(dir, { title: "Sem porquê", why: " ", agent: "A" }), /porquê/);
});

test("o commit recusa .env que não está no .gitignore e não deixa nada preparado", async () => {
  const dir = project();
  await m.initRepo(dir);
  await m.firstCommit(dir);
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
  writeFileSync(join(dir, ".env.production"), "KEY=1\n");
  writeFileSync(join(dir, ".env.example"), "KEY=\n");
  await assert.rejects(m.commitAsAgent(dir, { title: "Config", why: "deploy", agent: "Codex" }), /\.env.*segredos/);
  assert.equal(sh(dir, "diff", "--cached", "--name-only"), "");
});

test("histórico de todas as branches, com busca por assunto e por arquivo", async () => {
  const dir = project();
  await m.initRepo(dir);
  await m.firstCommit(dir);
  writeFileSync(join(dir, "frete.js"), "1");
  await m.commitAsAgent(dir, { title: "Corrige frete", why: "CEP do Norte", agent: "Claude" });
  sh(dir, "checkout", "-q", "-b", "universo/login");
  writeFileSync(join(dir, "login.js"), "1");
  await m.commitAsAgent(dir, { title: "Novo login", why: "OAuth", agent: "Codex" });
  sh(dir, "checkout", "-q", "main");
  const all = await m.recentHistory(dir);
  // Commits no mesmo segundo não têm ordem garantida; confere conteúdo e branch de cada um.
  assert.deepEqual(all.map((c) => c.title).sort(), ["Corrige frete", "Novo login", "Primeiro commit"]);
  assert.equal(all.find((c) => c.title === "Novo login").branch, "universo/login");
  assert.equal(all.find((c) => c.title === "Corrige frete").branch, "main");
  assert.deepEqual((await m.recentHistory(dir, { grep: "NORTE" })).map((c) => c.title), ["Corrige frete"]);
  assert.deepEqual((await m.recentHistory(dir, { file: "login.js" })).map((c) => c.title), ["Novo login"]);
  assert.equal(await m.pendingCount(dir), 0);
  writeFileSync(join(dir, "x.js"), "1");
  assert.equal(await m.pendingCount(dir), 1);
});

test("guia dos agentes: instala, atualiza no lugar e remove sem tocar no resto", () => {
  const dir = mkdtempSync(join(tmpdir(), "o-guide-"));
  const file = join(dir, "CLAUDE.md");
  writeFileSync(file, "# Minhas regras\n\nUse tabs.\n");
  assert.equal(m.installGuide(file), "atualizado");
  const once = readFileSync(file, "utf8");
  assert.match(once, /^# Minhas regras\n\nUse tabs\.\n\n<!-- Zenite:inicio/);
  assert.match(once, /zn commit "Título curto/);
  m.installGuide(file);
  assert.equal(readFileSync(file, "utf8"), once, "não duplica o bloco");
  m.uninstallGuide(file);
  assert.equal(readFileSync(file, "utf8").trim(), "# Minhas regras\n\nUse tabs.");
  // Pasta do agente inexistente: não cria nada.
  assert.equal(m.installGuide(join(dir, "nao-existe", "AGENTS.md")), "ignorado");
  assert.equal(existsSync(join(dir, "nao-existe")), false);
});

test("guia dos agentes: o bloco antigo (do tempo do app O) é trocado no mesmo lugar", () => {
  const dir = mkdtempSync(join(tmpdir(), "o-guide-"));
  const file = join(dir, "AGENTS.md");
  const old = "<!-- O:inicio (gerado pelo app O; apague este bloco para remover) -->\nantigo `o history`\n<!-- O:fim -->\n";
  writeFileSync(file, `# Antes\n\n${old}\n# Depois\n`);
  m.installGuide(file);
  const now = readFileSync(file, "utf8");
  assert.doesNotMatch(now, /O:inicio|antigo/);
  assert.match(now, /^# Antes\n\n<!-- Zenite:inicio[\s\S]*<!-- Zenite:fim -->\n\n?# Depois\n$/);
  m.uninstallGuide(file);
  assert.doesNotMatch(readFileSync(file, "utf8"), /Zenite|O:inicio/);
});
