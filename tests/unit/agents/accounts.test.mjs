// Contas: guardadas no índice, cada uma com pasta própria e variável do agente.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, lstatSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "accounts.mjs");
await build({
  stdin: { contents: 'export * from "./src/main/accounts"; export * from "./src/main/workspaceStore";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "silent",
});
const { Accounts, WorkspaceStore } = await import(pathToFileURL(outfile).href);

test("criar contas: nomes únicos por agente e persistência", () => {
  const dir = mkdtempSync(join(tmpdir(), "o-acc-"));
  const store = new WorkspaceStore(dir);
  const a = store.createAccount("Trabalho", "claude").account;
  const b = store.createAccount("trabalho", "claude").account;
  const c = store.createAccount("Trabalho", "codex").account;
  assert.equal(a.name, "Trabalho");
  assert.equal(b.name, "trabalho 2");
  assert.equal(c.name, "Trabalho");
  const reopened = new WorkspaceStore(dir);
  assert.equal(reopened.list().accounts.length, 3);
  assert.equal(reopened.account(c.id).agent, "codex");
  reopened.removeAccount(a.id);
  assert.equal(new WorkspaceStore(dir).list().accounts.length, 2);
});

test("cada conta tem pasta e variável próprias; só a do Claude tem pasta de skills", () => {
  const root = mkdtempSync(join(tmpdir(), "o-acc-dir-"));
  const short = mkdtempSync(join(tmpdir(), "o-acc-short-"));
  const accounts = new Accounts(root, short);
  const claude = { id: "c1", name: "Pessoal", agent: "claude" };
  const codex = { id: "x1", name: "Pessoal", agent: "codex" };
  accounts.prepare(claude);
  accounts.prepare(codex);
  assert.deepEqual(accounts.env(claude), { CLAUDE_CONFIG_DIR: join(root, "c1") });
  assert.deepEqual(accounts.env(codex), { CODEX_HOME: join(short, "x1") }, "Codex recebe o atalho curto");
  assert.equal(existsSync(join(short, "x1", "AGENTS.md")), true, "a pasta de verdade fica no caminho curto");
  assert.equal(lstatSync(join(root, "x1")).isSymbolicLink(), true, "contas/<id> vira atalho para ela");
  assert.equal(existsSync(join(root, "x1", "AGENTS.md")), true);
  assert.equal(accounts.skillsDir(claude), join(root, "c1", "skills"));
  assert.equal(accounts.skillsDir(codex), null, "o Codex lê ~/.agents/skills, que vale para todas as contas");
  accounts.remove(claude);
  assert.equal(existsSync(join(root, "c1")), false);
  accounts.remove(codex);
  assert.equal(existsSync(join(short, "x1")), false, "remover a conta apaga a pasta curta");
  assert.equal(existsSync(join(root, "x1")), false);
});

test("conta do Codex guarda o login em arquivo na própria pasta; loggedIn olha o arquivo", async () => {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const root = mkdtempSync(join(tmpdir(), "o-acc-login-"));
  const accounts = new Accounts(root, mkdtempSync(join(tmpdir(), "o-acc-short-")));
  const codex = { id: "x1", name: "A", agent: "codex" };
  const claude = { id: "c1", name: "A", agent: "claude" };
  accounts.prepare(codex);
  accounts.prepare(claude);
  const cfg = join(root, "x1", "config.toml");
  assert.equal(readFileSync(cfg, "utf8"), 'cli_auth_credentials_store = "file"\n');
  // Config já existente: a chave entra no topo (antes de qualquer [tabela]) e só uma vez.
  writeFileSync(cfg, '[mcp_servers.x]\ncommand = "y"\n');
  accounts.prepare(codex);
  accounts.prepare(codex);
  assert.equal(readFileSync(cfg, "utf8"), 'cli_auth_credentials_store = "file"\n[mcp_servers.x]\ncommand = "y"\n');
  assert.equal(existsSync(join(root, "c1", "config.toml")), false, "o Claude não usa config.toml");
  // zn liberado fora da sandbox, uma vez só, sem apagar regras que o usuário aprovou.
  const rules = join(root, "x1", "rules", "default.rules");
  assert.equal(readFileSync(rules, "utf8"), 'prefix_rule(pattern=["zn"], decision="allow")\n');
  writeFileSync(rules, 'prefix_rule(pattern=["git"], decision="allow")');
  accounts.prepare(codex);
  accounts.prepare(codex);
  assert.equal(readFileSync(rules, "utf8"), 'prefix_rule(pattern=["git"], decision="allow")\nprefix_rule(pattern=["zn"], decision="allow")\n');
  assert.equal(accounts.loggedIn(codex), false);
  writeFileSync(join(root, "x1", "auth.json"), "{}");
  writeFileSync(join(root, "c1", ".credentials.json"), "{}");
  assert.equal(accounts.loggedIn(codex), true);
  assert.equal(accounts.loggedIn(claude), true);
});

test("conta do Antigravity: pasta própria como ~ e login em arquivo; HOME continua o real", async () => {
  const { homedir } = await import("node:os");
  const root = mkdtempSync(join(tmpdir(), "o-acc-agy-"));
  const accounts = new Accounts(root, mkdtempSync(join(tmpdir(), "o-acc-short-")));
  const agy = { id: "g1", name: "A", agent: "antigravity" };
  assert.deepEqual(accounts.env(agy), { USERPROFILE: join(root, "g1"), HOME: homedir(), SSH_CONNECTION: "127.0.0.1 0 127.0.0.1 0" });
  // Logado = o agy gravou o token na pasta da conta.
  const { mkdirSync, writeFileSync } = await import("node:fs");
  assert.equal(accounts.loggedIn(agy), false);
  mkdirSync(join(root, "g1", ".gemini", "antigravity-cli"), { recursive: true });
  writeFileSync(join(root, "g1", ".gemini", "antigravity-cli", "antigravity-oauth-token"), "{}");
  assert.equal(accounts.loggedIn(agy), true);
});

test("Codex: pasta antiga em contas/<id> é movida para o caminho curto, com o login", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const root = mkdtempSync(join(tmpdir(), "o-acc-mig-"));
  const short = mkdtempSync(join(tmpdir(), "o-acc-short-"));
  mkdirSync(join(root, "abcdefgh-1"), { recursive: true });
  writeFileSync(join(root, "abcdefgh-1", "auth.json"), "{}");
  const accounts = new Accounts(root, short);
  const codex = { id: "abcdefgh-1", name: "A", agent: "codex" };
  accounts.prepare(codex);
  assert.equal(accounts.env(codex).CODEX_HOME, join(short, "abcdefgh"));
  assert.equal(existsSync(join(short, "abcdefgh", "auth.json")), true, "o login foi junto");
  assert.equal(accounts.loggedIn(codex), true, "loggedIn continua achando pelo atalho");
});
