// Integração do CLI `o`: servidor de controle real, PTYs reais (bash) e o CLI
// chamado de dentro dos terminais, como um agente faria.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

if (process.platform === "win32") {
  test("cli: pulado no Windows (usa socket Unix e bash)", { skip: true }, () => {});
} else {
  const out = join(process.cwd(), "out", "test");
  const cliPath = join(out, "cli.cjs");
  await build({ entryPoints: ["src/cli/index.ts"], bundle: true, platform: "node", format: "cjs", outfile: cliPath, logLevel: "silent" });
  const modPath = join(out, "control.mjs");
  await build({
    stdin: {
      contents: 'export * from "./src/main/ptyManager"; export * from "./src/main/controlServer"; export * from "./src/main/cliInstall";',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["@lydell/node-pty"],
    outfile: modPath,
    logLevel: "silent",
  });
  const { PtyManager, ControlServer, installCliShims } = await import(pathToFileURL(modPath).href);

  const dir = mkdtempSync(join(tmpdir(), "o-cli-"));
  const address = join(dir, "control.sock");
  const binDir = join(dir, "bin");
  installCliShims(binDir, process.execPath, cliPath);

  // Canvas de teste. Ligados ao Claude (A): Codex (B), nota Plano, imagem Logo, site Docs.
  // Sem ligação com A: terminal Solto (C), nota Segredo, imagem Foto.
  const mediaDir = join(dir, "media");
  (await import("node:fs")).mkdirSync(mediaDir);
  writeFileSync(join(mediaDir, "logo.png"), "png-falso");
  writeFileSync(join(mediaDir, "foto.png"), "png-falso");
  // Arquivos e pasta "do usuário", fora do app.
  const docs = join(dir, "docs");
  (await import("node:fs")).mkdirSync(join(docs, "sub"), { recursive: true });
  writeFileSync(join(docs, "contrato.txt"), "cláusula 1");
  writeFileSync(join(docs, "privado.txt"), "não leia");
  const items = {
    A: { title: "Claude", kind: "terminal" },
    B: { title: "Codex", kind: "terminal" },
    C: { title: "Solto", kind: "terminal" },
    N1: { title: "Plano", kind: "note" },
    N2: { title: "Segredo", kind: "note" },
    I1: { title: "Logo", kind: "image", file: "logo.png" },
    I2: { title: "Foto", kind: "image", file: "foto.png" },
    W1: { title: "Docs", kind: "web", url: "https://exemplo.com" },
    F1: { title: "Contrato", kind: "file", path: join(docs, "contrato.txt") },
    F2: { title: "Privado", kind: "file", path: join(docs, "privado.txt") },
    D1: { title: "Documentos", kind: "folder", path: docs },
    T1: { title: "Preços", kind: "table" },
  };
  const edges = [["A", "B"], ["A", "N1"], ["I1", "A"], ["A", "W1"], ["A", "F1"], ["A", "D1"], ["A", "T1"]];
  const tables = new Map([["T1", [["Plano", "Preço"], ["Básico", "10"]]]]);
  const authorizedSuns = new Set();
  const asSun = async (id, action) => {
    authorizedSuns.add(id);
    try { return await action(); } finally { authorizedSuns.delete(id); }
  };
  const graph = (id) => {
    if (!items[id]) return null;
    const linkedIds = new Set(edges.flatMap(([s, t]) => (s === id ? [t] : t === id ? [s] : [])));
    const item = (k) => ({ id: k, ...items[k] });
    return {
      me: { id, title: items[id].title, ...(authorizedSuns.has(id) ? { sun: true } : {}) },
      linked: [...linkedIds].map(item),
      others: Object.keys(items).filter((k) => k !== id && !linkedIds.has(k)).map(item),
    };
  };

  const notes = new Map([["N1", "objetivo: lançar v1"], ["N2", "senha 123"]]);
  const webCalls = [];
  const fakeWeb = {
    snapshot: async () => ({ url: "https://exemplo.com/", title: "Exemplo", text: "Bem-vindo", elements: ['@e1 button "Entrar"'] }),
    info: () => ({ url: "https://exemplo.com/", title: "Exemplo" }),
    navigate: async (url) => (webCalls.push(["navigate", url]), { url, title: "Nova" }),
    click: async (ref) => void webCalls.push(["click", ref]),
    type: async (text, ref, replace) => void webCalls.push(["type", text, ref, replace]),
    key: (k) => void webCalls.push(["key", k]),
    evaluate: async (code) => `resultado de ${code}`,
    screenshot: async () => "/tmp/print.png",
    back: () => {},
    reload: () => {},
  };
  const elementOps = {
    readNote: (id) => notes.get(id) ?? "",
    writeNote: (id, content) => void notes.set(id, content),
    mediaPath: (file) => join(mediaDir, file),
    importMedia: (path) => {
      const file = `novo-${Date.now()}.png`;
      copyFileSync(path, join(mediaDir, file));
      return { file, name: "novo", kind: path.endsWith(".png") ? "image" : "video" };
    },
    cleanup: () => {},
    addLinkedElement: (callerId, kind, title, extra = {}) => {
      const id = `X${Object.keys(items).length}`;
      items[id] = { title, kind, ...extra };
      edges.push([callerId, id]);
      return { element: { id, kind, title, ...extra } };
    },
    updateElement: (id, changes) => Object.assign(items[id], changes),
    web: (id) => (id === "W1" ? fakeWeb : null),
    readTable: (id) => structuredClone(tables.get(id) ?? [["Coluna 1"], [""]]),
    writeTable: (id, rows) => void tables.set(id, rows),
  };

  const tokens = {};
  const exits = [];
  let control;
  const ptys = new PtyManager(
    { onData: () => {}, onExit: (id) => (exits.push(id), control?.terminalExited(id)) },
    (id, token) => {
      tokens[id] = token;
      return { O_PIPE: address, O_TOKEN: token, PATH: binDir, PS1: "$ " };
    },
  );
  const gitCalls = [];
  let suggestMode = false;
  const gitOps = {
    commit: async (callerId, c) => {
      gitCalls.push([callerId, c]);
      return suggestMode ? { proposed: true, files: ["a.js"] } : { hash: "abc1234", files: ["a.js", "b.js"] };
    },
    history: async (callerId, opts) => {
      gitCalls.push([callerId, opts]);
      return {
        commits: [{ hash: "abc1234", branch: "universo/login", title: "Novo login", when: "2 horas atrás", author: "Maria" }],
        pending: [{ place: "Origem", files: 0 }, { place: "Login", files: 3 }],
      };
    },
  };
  const notified = [];
  control = new ControlServer(ptys, graph, elementOps, gitOps, (id, message) => notified.push([id, message]));

  const screen = (id) => ptys.snapshot(id, 200);
  async function waitScreen(id, text, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const now = (await screen(id)) ?? "";
      if (text === null ? now.trim().length > 0 : now.includes(text)) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`"${text}" não apareceu na tela de ${id}:\n${await screen(id)}`);
  }
  /** Roda o CLI como se fosse o terminal `id` (fora do PTY, para ler a saída). */
  function cli(id, args, { token, stdin } = {}) {
    return new Promise((resolve) => {
      const p = spawn(process.execPath, [cliPath, ...args], {
        env: { ...process.env, O_PIPE: address, O_TERMINAL_ID: id, O_TOKEN: token ?? tokens[id] },
      });
      let stdout = "";
      let stderr = "";
      p.stdout.on("data", (d) => (stdout += d));
      p.stderr.on("data", (d) => (stderr += d));
      p.on("close", (code) => resolve({ code, stdout, stderr }));
      if (stdin !== undefined) p.stdin.end(stdin);
      else p.stdin.end();
    });
  }

  before(async () => {
    await control.listen(address);
    for (const id of ["A", "B", "C"]) ptys.create({ id, command: "", cwd: dir, cols: 120, rows: 30 });
    // null = qualquer prompt na tela.
    for (const id of ["A", "B", "C"]) await waitScreen(id, null);
  });
  after(() => {
    control.close();
    ptys.killAll();
  });

  test("list mostra quem eu sou e quem está ligado", async () => {
    const r = await cli("A", ["list"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Você é: "Claude"/);
    assert.match(r.stdout, /"Codex" \[terminal\] \(ativo\)/);
    assert.match(r.stdout, /"Plano" \[nota\]/);
    assert.match(r.stdout, /"Logo" \[imagem\] \(.*logo\.png\)/);
    // O que não está ligado nem aparece: nem nome, nem tipo, nem caminho.
    assert.doesNotMatch(r.stdout, /sem ligação/);
    assert.doesNotMatch(r.stdout, /"Solto"|"Foto"|"Segredo"/);
    assert.doesNotMatch(r.stdout, /foto\.png/);
  });

  test("o comando `zn` (e o antigo `o`) funciona de dentro do terminal (PATH + env)", async () => {
    ptys.write("B", "zn list\r");
    await waitScreen("B", 'Você é: "Codex"');
    ptys.write("B", "clear; o list\r");
    await waitScreen("B", 'Você é: "Codex"');
  });

  test("ask entrega a mensagem e devolve a resposta dada com o reply de dentro do outro terminal", async () => {
    const asking = cli("A", ["ask", "codex", "Revise a função soma().\nSegunda linha."]);
    await waitScreen("B", '[Zênite · pedido #');
    const shown = await screen("B");
    const id = shown.match(/pedido #(\d+)/)[1];
    assert.match(shown, /Segunda linha\./);
    // O "agente" B responde de dentro do próprio terminal. O bash tentou executar a
    // mensagem colada como código; Ctrl-C limpa isso antes (um agente real não faz isso).
    ptys.write("B", "\x03");
    await new Promise((r) => setTimeout(r, 200));
    ptys.write("B", `zn reply ${id} "Parece certo, mas trate números negativos."\r`);
    const r = await asking;
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim(), "Parece certo, mas trate números negativos.");
    await waitScreen("B", `Resposta enviada a "Claude" (pedido #${id})`);
  });

  test("mensagem longa via entrada padrão", async () => {
    const asking = cli("A", ["ask", "Codex", "-"], { stdin: 'texto com "aspas" & símbolos | <estranhos>' });
    await waitScreen("B", "símbolos");
    const r1 = await cli("B", ["list"]);
    assert.match(r1.stdout, /#\d+ de "Claude"/);
    const reply = await cli("B", ["reply", "-"], { stdin: "ok & feito" });
    assert.equal(reply.code, 0, reply.stderr);
    assert.equal((await asking).stdout.trim(), "ok & feito");
  });

  test("não fala com terminal que não está ligado", async () => {
    const r = await cli("A", ["ask", "Solto", "oi"]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /existe no canvas, mas não está ligado a você/);
    const r2 = await cli("C", ["check", "Claude"]);
    assert.match(r2.stderr, /existe no canvas, mas não está ligado a você/);
    const r3 = await cli("A", ["ask", "Fantasma", "oi"]);
    assert.match(r3.stderr, /"Fantasma" não está ligado a este terminal\. Ligados a você \(terminal\): "Codex"/);
  });

  test("notas: ler, escrever, acrescentar e criar", async () => {
    let r = await cli("A", ["note", "read", "plano"]);
    assert.equal(r.stdout.trim(), "objetivo: lançar v1");
    r = await cli("A", ["note", "append", "Plano", "prazo: sexta"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(notes.get("N1"), "objetivo: lançar v1\nprazo: sexta");
    r = await cli("A", ["note", "write", "Plano", "-"], { stdin: "tudo novo" });
    assert.equal(notes.get("N1"), "tudo novo");
    r = await asSun("A", () => cli("A", ["note", "create", "Ideias", "item 1"]));
    assert.match(r.stdout, /Nota "Ideias" criada e ligada a você/);
    r = await cli("A", ["note", "read", "Ideias"]);
    assert.equal(r.stdout.trim(), "item 1");
  });

  test("regra: nota, imagem e site sem ligação não podem ser usados", async () => {
    let r = await cli("A", ["note", "read", "Segredo"]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /"Segredo" existe no canvas, mas não está ligado a você/);
    assert.doesNotMatch(r.stdout + r.stderr, /senha/);
    r = await cli("A", ["note", "write", "Segredo", "apagado"]);
    assert.match(r.stderr, /não está ligado a você/);
    assert.equal(notes.get("N2"), "senha 123");
    r = await cli("A", ["media", "Foto"]);
    assert.match(r.stderr, /não está ligado a você/);
    assert.doesNotMatch(r.stdout + r.stderr, /foto\.png/);
    // Quem está ligado à imagem (ninguém) — e o Codex não tem ligação com o site.
    r = await cli("B", ["web", "snapshot", "Docs"]);
    assert.match(r.stderr, /não está ligado a você/);
  });

  test("arquivo e pasta: caminho para quem está ligado; sem ligação, nem o caminho", async () => {
    let r = await cli("A", ["file", "Contrato"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /contrato\.txt\n11 B · modificado em/);
    r = await cli("A", ["file", "Privado"]);
    assert.match(r.stderr, /não está ligado a você/);
    assert.doesNotMatch(r.stdout + r.stderr, /privado\.txt/);
    r = await cli("A", ["list"]);
    assert.match(r.stdout, /"Contrato" \[arquivo\] \(.*contrato\.txt\)/);
    assert.doesNotMatch(r.stdout, /privado\.txt/);
    r = await cli("A", ["folder", "Documentos"]);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.stdout.trim().split("\n").slice(1).map((l) => l.trim()), ["sub/", "contrato.txt  (11 B)", "privado.txt  (9 B)"]);
    r = await asSun("A", () => cli("A", ["file", "create", join(docs, "privado.txt"), "Agora ligado"]));
    assert.equal(r.code, 0, r.stderr);
    const created = Object.values(items).find((i) => i.title === "Agora ligado");
    assert.equal(created.kind, "file");
    assert.equal(created.path, join(docs, "privado.txt"));
  });

  test("tabela: ler, mudar célula, substituir por CSV e criar", async () => {
    let r = await cli("A", ["table", "read", "Preços"]);
    assert.equal(r.stdout.trim(), "| Plano | Preço |\n| --- | --- |\n| Básico | 10 |");
    r = await cli("A", ["table", "set", "Preços", "3", "2", "25"]);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(tables.get("T1"), [["Plano", "Preço"], ["Básico", "10"], ["", "25"]]);
    r = await cli("A", ["table", "write", "Preços", "-"], { stdin: 'Plano;Preço\n"Pro; anual";"1.200,00"\n' });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(tables.get("T1"), [["Plano", "Preço"], ["Pro; anual", "1.200,00"]]);
    r = await asSun("A", () => cli("A", ["table", "create", "Equipe", "Nome,Papel\nAna,Dev"]));
    assert.equal(r.code, 0, r.stderr);
    const id = Object.keys(items).find((k) => items[k].title === "Equipe");
    assert.deepEqual(tables.get(id), [["Nome", "Papel"], ["Ana", "Dev"]]);
  });

  test("zn.cmd não guarda caminhos (acentos quebram no cmd.exe): usa O_RUNTIME e O_CLI", () => {
    const tmp = mkdtempSync(join(tmpdir(), "o-shim-"));
    installCliShims(tmp, "C:\\Users\\João Teste\\AppData\\Local\\Programs\\Zênite\\Zenite.exe", "C:\\Users\\João Teste\\cli.js");
    const cmd = readFileSync(join(tmp, "zn.cmd"), "utf8");
    assert.match(cmd, /"%O_RUNTIME%" "%O_CLI%" %\*/);
    assert.ok(/^[\x00-\x7f]*$/.test(cmd), "só ASCII");
  });

  test("notify avisa o usuário em nome do terminal", async () => {
    const r = await cli("B", ["notify", "Preciso que você aprove o deploy"]);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(notified.at(-1), ["B", "Preciso que você aprove o deploy"]);
  });

  test("tipo errado é explicado", async () => {
    const r = await cli("A", ["ask", "Plano", "oi"]);
    assert.match(r.stderr, /"Plano" é nota, não terminal/);
  });

  test("mídia: caminho e troca de arquivo", async () => {
    let r = await cli("A", ["media", "Logo"]);
    assert.equal(r.stdout.trim(), join(mediaDir, "logo.png"));
    const edited = join(dir, "editada.png");
    writeFileSync(edited, "png-editado");
    r = await cli("A", ["media", "set", "Logo", edited]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(items.I1.file, /^novo-/);
    assert.ok(existsSync(join(mediaDir, items.I1.file)));
  });

  test("site: snapshot, clique, digitação, tecla, navegação, eval e print", async () => {
    let r = await cli("A", ["web", "snapshot", "Docs"]);
    assert.match(r.stdout, /Exemplo — https:\/\/exemplo\.com\//);
    assert.match(r.stdout, /@e1 button "Entrar"/);
    await cli("A", ["web", "click", "Docs", "@e1"]);
    await cli("A", ["web", "type", "Docs", "olá", "--into", "@e2", "--replace"]);
    await cli("A", ["web", "key", "Docs", "Enter"]);
    r = await cli("A", ["web", "navigate", "Docs", "exemplo.org"]);
    assert.match(r.stdout, /Nova — exemplo\.org/);
    assert.deepEqual(webCalls, [["click", "@e1"], ["type", "olá", "@e2", true], ["key", "Enter"], ["navigate", "exemplo.org"]]);
    assert.equal(items.W1.url, "exemplo.org");
    r = await cli("A", ["web", "eval", "Docs", "1+1"]);
    assert.equal(r.stdout.trim(), "resultado de 1+1");
    r = await cli("A", ["web", "screenshot", "Docs"]);
    assert.equal(r.stdout.trim(), "/tmp/print.png");
  });

  test("site criado por agente fica ligado a ele", async () => {
    const r = await asSun("A", () => cli("A", ["web", "create", "https://docs.exemplo.com", "Manual"]));
    assert.match(r.stdout, /Site "Manual" criado e ligado a você/);
    const list = await cli("A", ["list"]);
    assert.match(list.stdout.split("sem ligação")[0], /"Manual" \[site\]/);
  });

  test("o commit envia título, porquê e pendente; modo sugerir avisa para não commitar", async () => {
    let r = await cli("A", ["commit", "Corrige frete", "--why", "CEP do Norte", "--todo", "CEP inválido"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Commit abc1234: 2 arquivos\./);
    assert.deepEqual(gitCalls.at(-1), ["A", { title: "Corrige frete", why: "CEP do Norte", todo: "CEP inválido", agent: "Claude" }]);
    r = await cli("A", ["commit", "Sem porquê"]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /--why/);
    suggestMode = true;
    r = await cli("A", ["commit", "Ajusta login", "--why", "OAuth"]);
    assert.match(r.stdout, /Proposta de commit registrada .*não rode git commit/);
    suggestMode = false;
  });

  test("o history mostra commits de todos os universos e o que está sem commit", async () => {
    const r = await cli("A", ["history", "--grep", "login", "-n", "5"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /abc1234  \[universo\/login\] Novo login  \(2 horas atrás, Maria\)/);
    assert.match(r.stdout, /Sem commit agora:\n  - Login: 3 arquivos/);
    assert.doesNotMatch(r.stdout, /Origem: 0/);
    const [caller, opts] = gitCalls.at(-1);
    assert.equal(caller, "A");
    assert.equal(opts.limit, 5);
    assert.equal(opts.grep, "login");
    assert.equal(opts.file, undefined);
  });

  test("token errado é recusado", async () => {
    const r = await cli("A", ["list"], { token: "x".repeat(48) });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /não autorizado/);
  });

  test("reply sem pedido pendente explica o erro", async () => {
    const r = await cli("B", ["reply", "nada"]);
    assert.match(r.stderr, /Ninguém está esperando resposta sua/);
  });

  test("check lê a tela do outro terminal sem códigos de controle", async () => {
    ptys.write("B", "printf '\\033[31mVERMELHO\\033[0m\\n'\r");
    await waitScreen("B", "VERMELHO");
    const r = await cli("A", ["check", "Codex", "--lines", "5"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /VERMELHO/);
    assert.doesNotMatch(r.stdout, /\x1b/);
  });

  test("send digita teclas cruas com escapes", async () => {
    const r = await cli("A", ["send", "Codex", "echo TECLAS-$((20+22))\\n"]);
    assert.equal(r.code, 0, r.stderr);
    await waitScreen("B", "TECLAS-42");
  });

  test("ask --no-wait entrega e a resposta chega depois como mensagem em quem perguntou", async () => {
    const r = await cli("A", ["ask", "Codex", "aviso rápido", "--no-wait", "--json"]);
    assert.equal(r.code, 0, r.stderr);
    const { request } = JSON.parse(r.stdout);
    await waitScreen("B", "aviso rápido");
    const reply = await cli("B", ["reply", String(request), "RETORNO-WEBHOOK"]);
    assert.equal(reply.code, 0, reply.stderr);
    await waitScreen("A", `resposta de "Codex" ao seu pedido #${request}`);
    await waitScreen("A", "RETORNO-WEBHOOK");
  });

  test("tempo esgotado devolve a tela do outro (código 2) e o pedido continua valendo", async () => {
    const r = await cli("A", ["ask", "Codex", "ninguém vai responder", "--timeout", "1", "--json"]);
    assert.equal(r.code, 2);
    const { request, screen } = JSON.parse(r.stdout);
    assert.match(screen, /ninguém vai responder/);
    const reply = await cli("B", ["reply", String(request), "RESPOSTA-ATRASADA"]);
    assert.equal(reply.code, 0, reply.stderr);
    await waitScreen("A", "RESPOSTA-ATRASADA");
  });

  test("se o outro encerrar, quem espera é liberado", async () => {
    const asking = cli("A", ["ask", "Codex", "vou encerrar"]);
    await waitScreen("B", "vou encerrar");
    ptys.kill("B");
    const r = await asking;
    assert.equal(r.code, 1);
    assert.match(r.stdout, /encerrou antes de responder/);
  });

  test("fora do O o CLI explica o problema", async () => {
    const r = await new Promise((resolve) => {
      const p = spawn(process.execPath, [cliPath, "list"], { env: { PATH: process.env.PATH } });
      let stderr = "";
      p.stderr.on("data", (d) => (stderr += d));
      p.on("close", (code) => resolve({ code, stderr }));
    });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /só funciona dentro de um terminal do O/);
  });
}
