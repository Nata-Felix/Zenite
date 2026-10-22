// Universos com repositórios git reais em pastas temporárias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "universes.mjs");
await build({
  stdin: { contents: 'export * from "./src/main/universes"; export * from "./src/main/workspaceStore";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "silent",
});
const { UniverseService, WorkspaceStore, slugify } = await import(pathToFileURL(outfile).href);

// Identidade para os commits do teste (a máquina pode não ter git configurado).
Object.assign(process.env, { GIT_AUTHOR_NAME: "Teste", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "Teste", GIT_COMMITTER_EMAIL: "t@t" });
// Os testes comparam o conteúdo exato; core.autocrlf=true (padrão do Git for Windows) trocaria \n por \r\n.
Object.assign(process.env, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.autocrlf", GIT_CONFIG_VALUE_0: "false" });
const sh = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function setup({ gitRepo = true, commit = true, sub = "" } = {}) {
  const base = mkdtempSync(join(tmpdir(), "o-uni-"));
  const repo = join(base, "projeto");
  mkdirSync(join(repo, sub), { recursive: true });
  if (gitRepo) {
    sh(repo, "init", "-q", "-b", "main");
    writeFileSync(join(repo, "app.txt"), "versão 1\n");
    if (commit) {
      sh(repo, "add", "-A");
      sh(repo, "commit", "-q", "-m", "inicial");
    }
  }
  const data = join(base, "dados");
  const store = new WorkspaceStore(data);
  const wsId = store.list().workspaces[0].id;
  store.update(wsId, { dir: join(repo, sub) });
  const calls = { killed: [], cleaned: [], notes: [], tables: [] };
  const svc = new UniverseService(join(data, "universos"), store, {
    killTerminals: async (ids) => void calls.killed.push(...ids),
    cleanupNodes: (nodes) => void calls.cleaned.push(...nodes.map((n) => n.id)),
    copyNote: (from, to) => void calls.notes.push([from, to]),
    copyTable: (from, to) => void calls.tables.push([from, to]),
    copyMedia: (file) => `copia-${file}`,
  });
  const universe = (index, name) => index.workspaces[0].universes.find((u) => u.name === name);
  return { repo, store, wsId, svc, calls, universe };
}

test("slugify", () => {
  assert.equal(slugify("Correção do Login!"), "correcao-do-login");
  assert.equal(slugify("!!!"), "universo");
});

test("abrir universo cria cópia numa branch própria e o deixa ativo", async () => {
  const { repo, wsId, svc, universe } = setup();
  const r = await svc.create(wsId, "Correção do Login", false);
  assert.equal(r.ok, true, r.error);
  const u = universe(r.index, "Correção do Login");
  assert.equal(u.branch, "universo/correcao-do-login");
  assert.equal(u.isolated, true);
  assert.equal(readFileSync(join(u.path, "app.txt"), "utf8"), "versão 1\n");
  assert.equal(r.index.workspaces[0].activeUniverse, u.id);
  assert.match(sh(repo, "branch", "--list", "universo/*"), /universo\/correcao-do-login/);
  // Nome repetido ganha número, branch também.
  const r2 = await svc.create(wsId, "Correção do Login", false);
  const u2 = universe(r2.index, "Correção do Login 2");
  assert.equal(u2.branch, "universo/correcao-do-login-2");
});

test("Origem não muda enquanto o universo trabalha; status, commit e convergir", async () => {
  const { repo, store, wsId, svc, universe, calls } = setup();
  const u = universe((await svc.create(wsId, "Novo recurso", false)).index, "Novo recurso");
  store.saveCanvas(u.id, { version: 1, nodes: [{ id: "T9", x: 0, y: 0, width: 10, height: 10, terminal: { id: "T9", title: "Claude", command: "", cwd: u.path } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
  writeFileSync(join(u.path, "app.txt"), "versão 2\n");
  writeFileSync(join(u.path, "novo.txt"), "recurso\n");
  assert.equal(readFileSync(join(repo, "app.txt"), "utf8"), "versão 1\n");

  let st = await svc.status(wsId, u.id);
  assert.deepEqual(st.pending.sort(), ["app.txt", "novo.txt"]);
  assert.equal(st.ahead, 0);
  assert.equal(st.originBranch, "main");

  const blocked = await svc.converge(wsId, u.id, false);
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /2 alterações não commitadas/);

  const c = await svc.commit(wsId, u.id, "recurso pronto");
  assert.equal(c.ok, true, c.error);
  assert.equal(c.index.pending.length, 0);
  assert.equal(c.index.ahead, 1);

  const m = await svc.converge(wsId, u.id, false);
  assert.equal(m.ok, true, m.error);
  assert.equal(readFileSync(join(repo, "app.txt"), "utf8"), "versão 2\n");
  assert.ok(existsSync(join(repo, "novo.txt")));
  assert.equal(m.index.workspaces[0].universes.length, 0);
  assert.equal(existsSync(u.worktree), false);
  assert.equal(sh(repo, "branch", "--list", u.branch), "");
  assert.deepEqual(calls.killed, ["T9"]);
  assert.equal(store.loadCanvas(u.id), null);
});

test("convergir mantendo o universo", async () => {
  const { repo, wsId, svc, universe } = setup();
  const u = universe((await svc.create(wsId, "Contínuo", false)).index, "Contínuo");
  writeFileSync(join(u.path, "x.txt"), "x\n");
  await svc.commit(wsId, u.id, "x");
  const m = await svc.converge(wsId, u.id, true);
  assert.equal(m.ok, true, m.error);
  assert.ok(existsSync(join(repo, "x.txt")));
  assert.ok(existsSync(u.worktree));
  assert.equal(m.index.workspaces[0].universes.length, 1);
});

test("conflito: nada muda na Origem e os arquivos são listados", async () => {
  const { repo, wsId, svc, universe } = setup();
  const u = universe((await svc.create(wsId, "Conflito", false)).index, "Conflito");
  writeFileSync(join(u.path, "app.txt"), "versão do universo\n");
  await svc.commit(wsId, u.id, "universo");
  writeFileSync(join(repo, "app.txt"), "versão da origem\n");
  sh(repo, "commit", "-qam", "origem");
  const before = sh(repo, "rev-parse", "HEAD");
  const m = await svc.converge(wsId, u.id, false);
  assert.equal(m.ok, false);
  assert.deepEqual(m.conflicts, ["app.txt"]);
  assert.equal(sh(repo, "rev-parse", "HEAD"), before);
  assert.equal(readFileSync(join(repo, "app.txt"), "utf8"), "versão da origem\n");
  assert.equal(sh(repo, "status", "--porcelain"), "");
});

test("colapsar descarta cópia e branch mesmo sem merge", async () => {
  const { repo, wsId, svc, universe, calls } = setup();
  const u = universe((await svc.create(wsId, "Experimento", false)).index, "Experimento");
  writeFileSync(join(u.path, "lixo.txt"), "x\n");
  await svc.commit(wsId, u.id, "lixo");
  const r = await svc.collapse(wsId, u.id);
  assert.equal(r.ok, true);
  assert.equal(existsSync(u.worktree), false);
  assert.equal(sh(repo, "branch", "--list", u.branch), "");
  assert.equal(existsSync(join(repo, "lixo.txt")), false);
  assert.equal(r.index.workspaces[0].universes.length, 0);
  assert.ok(Array.isArray(calls.cleaned));
});

test("clonar o layout da Origem aponta os terminais para a cópia", async () => {
  const { repo, store, wsId, svc, universe, calls } = setup();
  store.saveCanvas(wsId, {
    version: 1,
    nodes: [
      { id: "T1", x: 0, y: 0, width: 10, height: 10, terminal: { id: "T1", title: "Claude", command: "claude", cwd: repo } },
      { id: "T2", x: 0, y: 0, width: 10, height: 10, terminal: { id: "T2", title: "Shell", command: "", cwd: join(repo, "src") } },
      { id: "N1", kind: "note", x: 0, y: 0, width: 10, height: 10, element: { id: "N1", kind: "note", title: "Plano" } },
      { id: "I1", kind: "image", x: 0, y: 0, width: 10, height: 10, element: { id: "I1", kind: "image", title: "Logo", file: "a.png" } },
      { id: "F1", kind: "file", x: 0, y: 0, width: 10, height: 10, element: { id: "F1", kind: "file", title: "Leia", path: join(repo, "src", "leia.md") } },
      { id: "F2", kind: "folder", x: 0, y: 0, width: 10, height: 10, element: { id: "F2", kind: "folder", title: "Fora", path: "/fora/do/projeto" } },
      { id: "T1", kind: "table", x: 0, y: 0, width: 10, height: 10, element: { id: "T1", kind: "table", title: "Preços" } },
      { id: "D1", kind: "draw", x: 7, y: 8, width: 50, height: 30, z: -10, draw: { shape: "rectangle", stroke: "auto", fill: "#a5d8ff", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, seed: 42 } },
    ],
    edges: [{ id: "T1->N1", source: "T1", target: "N1" }],
    viewport: { x: 5, y: 5, zoom: 0.5 },
  });
  const u = universe((await svc.create(wsId, "Clone", true)).index, "Clone");
  const c = store.loadCanvas(u.id);
  const t1 = c.nodes.find((n) => n.terminal?.title === "Claude");
  const t2 = c.nodes.find((n) => n.terminal?.title === "Shell");
  const note = c.nodes.find((n) => n.kind === "note");
  assert.notEqual(t1.id, "T1");
  assert.equal(t1.terminal.id, t1.id);
  assert.equal(t1.terminal.cwd, u.path);
  assert.equal(t2.terminal.cwd, join(u.path, "src"));
  assert.deepEqual(calls.notes, [["N1", note.id]]);
  assert.equal(c.nodes.find((n) => n.kind === "image").element.file, "copia-a.png");
  assert.deepEqual(c.edges, [{ id: `${t1.id}->${note.id}`, source: t1.id, target: note.id }]);
  assert.deepEqual(c.viewport, { x: 5, y: 5, zoom: 0.5 });
  // Arquivo do projeto aponta para a cópia; fora do projeto continua igual; tabela é copiada.
  assert.equal(c.nodes.find((n) => n.kind === "file").element.path, join(u.path, "src", "leia.md"));
  assert.equal(c.nodes.find((n) => n.kind === "folder").element.path, "/fora/do/projeto");
  assert.deepEqual(calls.tables, [["T1", c.nodes.find((n) => n.kind === "table").id]]);
  // Desenhos vão junto, iguais, com id novo.
  const d = c.nodes.find((n) => n.kind === "draw");
  assert.notEqual(d.id, "D1");
  assert.deepEqual({ ...d, id: "D1" }, { id: "D1", kind: "draw", x: 7, y: 8, width: 50, height: 30, z: -10, draw: { shape: "rectangle", stroke: "auto", fill: "#a5d8ff", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, seed: 42 } });
});

test("galáxia numa subpasta do repositório: terminais abrem na mesma subpasta da cópia", async () => {
  const { wsId, svc, universe } = setup({ sub: "apps/web" });
  const u = universe((await svc.create(wsId, "Web", false)).index, "Web");
  assert.equal(u.path, join(u.worktree, "apps", "web"));
});

test("projeto sem git: universo só separa o canvas", async () => {
  const { wsId, svc, universe } = setup({ gitRepo: false });
  const r = await svc.create(wsId, "Rascunho", false);
  const u = universe(r.index, "Rascunho");
  assert.equal(u.isolated, false);
  assert.equal(u.branch, "");
  const m = await svc.converge(wsId, u.id, false);
  assert.match(m.error, /não tem cópia isolada/);
  assert.equal((await svc.collapse(wsId, u.id)).ok, true);
});

test("repositório sem nenhum commit é explicado", async () => {
  const { wsId, svc } = setup({ commit: false });
  const r = await svc.create(wsId, "X", false);
  assert.equal(r.ok, false);
  assert.match(r.error, /primeiro commit/);
});

test("globToRegExp", async () => {
  const { globToRegExp } = await import(pathToFileURL(outfile).href);
  assert.ok(globToRegExp(".env").test(".env"));
  assert.ok(!globToRegExp(".env").test("apps/.env"));
  assert.ok(globToRegExp("**/.env").test("apps/web/.env"));
  assert.ok(globToRegExp("**/.env").test(".env"));
  assert.ok(globToRegExp(".env.*").test(".env.local"));
  assert.ok(!globToRegExp(".env.*").test(".env"));
  assert.ok(globToRegExp("config/*.json").test("config/a.json"));
  assert.ok(!globToRegExp("config/*.json").test("config/x/a.json"));
});

test("universo novo recebe .env e afins da Origem, mas não node_modules", async () => {
  const { repo, store, wsId, svc, universe } = setup();
  writeFileSync(join(repo, ".gitignore"), ".env\n.env.*\n!.env.example\nnode_modules/\n");
  writeFileSync(join(repo, ".env.example"), "PORT=\n");
  sh(repo, "add", "-A");
  sh(repo, "commit", "-q", "-m", "gitignore");
  writeFileSync(join(repo, ".env"), "PORT=3000\nSECRET=abc\n");
  mkdirSync(join(repo, "apps", "web"), { recursive: true });
  writeFileSync(join(repo, "apps", "web", ".env.local"), "API=x\n");
  mkdirSync(join(repo, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(repo, "node_modules", "pkg", ".env"), "não copiar\n");

  const preview = await svc.preview(wsId);
  assert.deepEqual(preview, { isolated: true, files: [".env", "apps/web/.env.local"] });

  const u = universe((await svc.create(wsId, "Com env", false)).index, "Com env");
  assert.equal(readFileSync(join(u.worktree, ".env"), "utf8"), "PORT=3000\nSECRET=abc\n");
  assert.equal(readFileSync(join(u.worktree, "apps", "web", ".env.local"), "utf8"), "API=x\n");
  assert.equal(existsSync(join(u.worktree, "node_modules")), false);
  // A cópia é independente: mudar a porta no universo não muda a Origem.
  writeFileSync(join(u.worktree, ".env"), "PORT=3001\n");
  assert.match(readFileSync(join(repo, ".env"), "utf8"), /PORT=3000/);
  // E o .env copiado não aparece como alteração para commitar (continua ignorado).
  assert.deepEqual((await svc.status(wsId, u.id)).pending, []);

  // Padrões próprios da galáxia substituem o padrão.
  store.update(wsId, { copyPatterns: ["apps/**"] });
  assert.deepEqual((await svc.preview(wsId)).files, ["apps/web/.env.local"]);
  store.update(wsId, { copyPatterns: [] });
  assert.deepEqual((await svc.preview(wsId)).files, []);
});

test("commitar pelo diálogo de merge recusa .env que não está no .gitignore", async () => {
  const { repo, wsId, svc, universe } = setup();
  writeFileSync(join(repo, ".env"), "SECRET=1\n"); // sem .gitignore: o git não ignora
  const u = universe((await svc.create(wsId, "Sem ignore", false)).index, "Sem ignore");
  assert.ok(existsSync(join(u.worktree, ".env")));
  const r = await svc.commit(wsId, u.id, "tudo");
  assert.equal(r.ok, false);
  assert.match(r.error, /\.env parece conter segredos/);
  assert.equal(sh(u.worktree, "diff", "--cached", "--name-only"), "");
  assert.equal(sh(u.worktree, "log", "--oneline").split("\n").length, 1);
});

test("atualizar com a Origem sem conflito traz os commits novos e a Origem não muda", async () => {
  const { repo, wsId, svc, universe } = setup();
  const u = universe((await svc.create(wsId, "Atual", false)).index, "Atual");
  writeFileSync(join(repo, "origem.txt"), "novo na origem\n");
  sh(repo, "add", "-A");
  sh(repo, "commit", "-qm", "origem avançou");
  const originHead = sh(repo, "rev-parse", "HEAD");
  let st = await svc.status(wsId, u.id);
  assert.equal(st.behind, 1);
  assert.equal(st.updating, false);
  const r = await svc.update(wsId, u.id);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.index.behind, 0);
  assert.equal(readFileSync(join(u.path, "origem.txt"), "utf8"), "novo na origem\n");
  assert.equal(sh(repo, "rev-parse", "HEAD"), originHead);
  // Já em dia: não faz nada.
  assert.equal((await svc.update(wsId, u.id)).ok, true);
});

test("atualizar com conflito: para no universo, recusa concluir com marcadores, conclui depois de resolver", async () => {
  const { repo, wsId, svc, universe } = setup();
  const u = universe((await svc.create(wsId, "Briga", false)).index, "Briga");
  writeFileSync(join(u.path, "app.txt"), "versão do universo\n");
  await svc.commit(wsId, u.id, "universo");
  writeFileSync(join(repo, "app.txt"), "versão da origem\n");
  sh(repo, "commit", "-qam", "origem");
  const originHead = sh(repo, "rev-parse", "HEAD");

  const r = await svc.update(wsId, u.id);
  assert.equal(r.ok, false);
  assert.deepEqual(r.conflicts, ["app.txt"]);
  let st = await svc.status(wsId, u.id);
  assert.equal(st.updating, true);
  assert.match(readFileSync(join(u.path, "app.txt"), "utf8"), /<<<<<<< /);
  // Origem intacta.
  assert.equal(sh(repo, "rev-parse", "HEAD"), originHead);
  assert.equal(readFileSync(join(repo, "app.txt"), "utf8"), "versão da origem\n");

  // Merge na Origem e commit comum ficam bloqueados enquanto isso.
  assert.match((await svc.converge(wsId, u.id, true)).error, /atualização com a Origem em andamento/);
  assert.match((await svc.commit(wsId, u.id, "x")).error, /atualização com a Origem em andamento/);

  // "git add" sem tirar os marcadores não engana.
  sh(u.path, "add", "app.txt");
  const early = await svc.finishUpdate(wsId, u.id);
  assert.equal(early.ok, false);
  assert.deepEqual(early.conflicts, ["app.txt"]);

  // Resolver só pelo conteúdo (sem git add) basta.
  sh(u.path, "reset", "-q", "--", "app.txt");
  writeFileSync(join(u.path, "app.txt"), "versão combinada\n");
  const done = await svc.finishUpdate(wsId, u.id);
  assert.equal(done.ok, true, done.error);
  assert.equal(done.index.updating, false);
  assert.equal(done.index.behind, 0);
  assert.equal(done.index.pending.length, 0);
  // Agora o merge na Origem passa limpo e leva a versão combinada.
  const m = await svc.converge(wsId, u.id, false);
  assert.equal(m.ok, true, m.error);
  assert.equal(readFileSync(join(repo, "app.txt"), "utf8"), "versão combinada\n");
});

test("cancelar a atualização devolve o universo a como estava", async () => {
  const { repo, wsId, svc, universe } = setup();
  const u = universe((await svc.create(wsId, "Volta", false)).index, "Volta");
  writeFileSync(join(u.path, "app.txt"), "versão do universo\n");
  await svc.commit(wsId, u.id, "universo");
  const head = sh(u.path, "rev-parse", "HEAD");
  writeFileSync(join(repo, "app.txt"), "versão da origem\n");
  sh(repo, "commit", "-qam", "origem");
  await svc.update(wsId, u.id);
  const r = await svc.abortUpdate(wsId, u.id);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.index.updating, false);
  assert.equal(r.index.behind, 1);
  assert.equal(sh(u.path, "rev-parse", "HEAD"), head);
  assert.equal(readFileSync(join(u.path, "app.txt"), "utf8"), "versão do universo\n");
});

test("atualizar exige o universo sem alterações pendentes", async () => {
  const { repo, wsId, svc, universe } = setup();
  const u = universe((await svc.create(wsId, "Sujo", false)).index, "Sujo");
  writeFileSync(join(u.path, "rascunho.txt"), "x\n");
  writeFileSync(join(repo, "o.txt"), "o\n");
  sh(repo, "add", "-A");
  sh(repo, "commit", "-qm", "o");
  const r = await svc.update(wsId, u.id);
  assert.equal(r.ok, false);
  assert.match(r.error, /1 alteração não commitada/);
});
