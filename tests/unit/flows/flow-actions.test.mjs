import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:http";

const outfile = join(process.cwd(), "out/test/flowActions.mjs");
await build({ entryPoints: ["src/main/flowActions.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { FlowActions } = await import(pathToFileURL(outfile));
const datafile = join(process.cwd(), "out/test/flowData.mjs");
await build({ entryPoints: ["src/shared/flowData.ts"], bundle: true, platform: "node", format: "esm", outfile: datafile, logLevel: "silent" });
const { transformData, jsonBody } = await import(pathToFileURL(datafile));
const runnerfile = join(process.cwd(), "out/test/flowRunnerActions.mjs");
await build({ entryPoints: ["src/main/flowRunner.ts"], bundle: true, platform: "node", format: "esm", outfile: runnerfile, logLevel: "silent" });
const { runFlow } = await import(pathToFileURL(runnerfile));
const item = { entrada: '{"cliente":{"nome":"Ana"},"itens":[1,2]}', vars: {} };
const flow = (id, spec) => ({ id, kind: "flow", element: { id, title: id, kind: "flow", flow: spec } });
const file = (id, path, enabled = true) => ({ id, kind: "file", element: { id, title: id, kind: "file", path, openOnFlow: enabled } });
function fixture(node, extra = {}) {
  const canvas = { nodes: [node], edges: [] };
  const controller = new AbortController();
  const calls = [];
  const host = { cwd: process.cwd(), signal: controller.signal, canvas: () => canvas, permissions: () => "full", confirm: async () => { calls.push("confirm"); return true; }, open: async path => { calls.push(path); return ""; }, ...extra };
  return { actions: new FlowActions(host), host, canvas, calls, controller };
}
test("transformações locais, campos JSON e variáveis preservam os dados", () => {
  assert.equal(transformData({ operation: "template", value: 'Olá {{json.cliente.nome}}' }, item).entrada, "Olá Ana");
  assert.equal(transformData({ operation: "json-field", field: "itens[1]" }, item).entrada, "2");
  const saved = transformData({ operation: "set-variable", variable: "nome", value: "{{json.cliente.nome}}" }, item);
  assert.equal(saved.vars.nome, "Ana"); assert.equal(saved.entrada, item.entrada);
  assert.equal(transformData({ operation: "replace", search: "a", replacement: "x" }, { entrada: "banana", vars: {} }).entrada, "bxnxnx");
  const list = transformData({ operation: "split", separator: "," }, { entrada: "a,b", vars: {} });
  assert.equal(transformData({ operation: "join", separator: "-" }, list).entrada, "a-b");
  assert.throws(() => transformData({ operation: "json-field", field: "constructor" }, item), /não encontrado/);
  assert.throws(() => transformData({ operation: "set-variable", variable: "__proto__" }, item), /válido/);
  assert.deepEqual(jsonBody('{"texto":"{{entrada}}"}', { entrada: 'a"\\b\nc', vars: {} }), { texto: 'a"\\b\nc' });
});
test("abrir arquivo exige opt-in; Sandbox bloqueia e Sempre perguntar confirma", async () => {
  const node = file("f", process.execPath);
  const f = fixture(node, { permissions: () => "sandbox" });
  await assert.rejects(f.actions.run(node, item), /Sandbox/); assert.deepEqual(f.calls, []);
  f.host.permissions = () => "ask";
  await f.actions.run(node, item); assert.deepEqual(f.calls, ["confirm", process.execPath]);
  node.element.openOnFlow = false;
  await assert.rejects(f.actions.run(node, item), /Ative/);
});
test("recusa, interrupção e mudança de permissão/configuração não abrem aplicativo", async () => {
  for (const mutation of ["deny", "sandbox", "edit", "stop"]) {
    const node = file("f", process.execPath);
    const f = fixture(node, { permissions: () => "ask" });
    f.host.confirm = async () => {
      if (mutation === "sandbox") f.host.permissions = () => "sandbox";
      if (mutation === "edit") node.element.path += "other";
      if (mutation === "stop") f.controller.abort();
      return mutation !== "deny";
    };
    await assert.rejects(f.actions.run(node, item)); assert.equal(f.calls.length, 0);
  }
});
test("aplicativo usa argumentos separados sem shell e passa a saída ao próximo passo", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "zenite-launch-"));
  const helper = join(cwd, "helper.cjs"), marker = join(cwd, "marker.txt");
  writeFileSync(helper, 'require("node:fs").writeFileSync(process.argv[2],process.argv[3]);console.log("feito");');
  const node = flow("app", { type: "launch", launch: { mode: "command", path: process.execPath, args: [helper, marker, "{{entrada}}"], waitForExit: true } });
  const f = fixture(node, { cwd });
  const result = await f.actions.run(node, { entrada: 'a & echo hacked | "quoted"', vars: {} });
  assert.equal(result.entrada, "feito"); assert.equal(readFileSync(marker, "utf8"), 'a & echo hacked | "quoted"');
});
test("arquivo conectado precisa manter ligação após autorização", async () => {
  const node = flow("app", { type: "launch", launch: { mode: "open", targetId: "f" } });
  const f = fixture(node, { permissions: () => "ask" });
  f.canvas.nodes.push(file("f", process.execPath)); f.canvas.edges.push({ source: "app", target: "f" });
  f.host.confirm = async () => { f.canvas.edges = []; return true; };
  await assert.rejects(f.actions.run(node, item), /conexão/); assert.equal(f.calls.length, 0);
});
test("HTTP envia JSON escapado, oculta token e bloqueia redirecionamento e erros", async t => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    requests.push({ body, authorization: req.headers.authorization });
    if (req.url === "/redirect") { res.writeHead(302, { Location: "/ok" }); return res.end(); }
    if (req.url === "/fail") { res.writeHead(500); return res.end("falhou"); }
    if (req.url === "/large") return res.end("a".repeat(1_000_001));
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ body: body ? JSON.parse(body) : null, token: req.headers.authorization }));
  }).listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r)); t.after(() => server.close());
  const cwd = mkdtempSync(join(tmpdir(), "zenite-http-")); writeFileSync(join(cwd, ".env"), "QA_TOKEN=qa-only-secret");
  const url = `http://127.0.0.1:${server.address().port}`;
  const node = flow("api", { type: "request", http: { url: url + "/ok", method: "POST", body: '{"texto":"{{entrada}}"}', tokenEnv: "QA_TOKEN" } });
  const f = fixture(node, { cwd });
  const result = await f.actions.run(node, { entrada: 'Ana "X"\nY', vars: {} });
  assert.deepEqual(JSON.parse(requests[0].body), { texto: 'Ana "X"\nY' });
  assert.equal(result.vars.status_http, "200"); assert.ok(!result.entrada.includes("qa-only-secret"));
  for (const [path, pattern] of [["redirect", /Redirecionamento/], ["fail", /HTTP 500/], ["large", /maior que 1 MB/]]) {
    node.element.flow.http = { url: `${url}/${path}` }; await assert.rejects(f.actions.run(node, item), pattern);
  }
  const count = requests.length; f.host.permissions = () => "sandbox";
  await assert.rejects(f.actions.run(node, item), /Sandbox/); assert.equal(requests.length, count);
});
test("motor percorre transformação e abre somente arquivos habilitados", async () => {
  const start = flow("i", { type: "ignition" }), transform = flow("t", { type: "transform", transform: { operation: "template", value: "Olá {{entrada}}" } });
  const enabled = file("yes", process.execPath), disabled = file("no", process.execPath, false);
  const canvas = { nodes: [start, transform, enabled, disabled], edges: [{ id: "a", source: "i", target: "t" }, { id: "b", source: "t", target: "yes" }, { id: "c", source: "t", target: "no" }] };
  const actions = [], statuses = [];
  await runFlow(canvas, "i", { action: async (node, data) => { actions.push([node.id, data.entrada]); return data; }, status: s => statuses.push(s) }, "Ana");
  assert.deepEqual(actions, [["yes", "Olá Ana"]]); assert.ok(statuses.some(s => s.nodeId === "yes" && s.state === "ok"));
});
test("limites impedem expansão de modelos e substituições", () => {
  const text = { entrada: "a".repeat(2000), vars: {} };
  assert.throws(() => transformData({ operation: "template", value: "{{entrada}}".repeat(1000) }, text), /1 MB/);
  assert.throws(() => transformData({ operation: "replace", search: "a", replacement: "x".repeat(2000) }, text), /1 MB/);
});
test("proteção do canvas exige confirmação de ação no computador mesmo em Controle total", async () => {
  const node = file("f", process.execPath);
  const f = fixture(node, { forceConfirm: true, confirm: async () => false });
  await assert.rejects(f.actions.run(node, item), /cancelada/);
  assert.deepEqual(f.calls, []);
});
test("astro Código respeita Sandbox, recusa e entrega a saída ao próximo astro", async () => {
  const node = flow("code", { type: "code", code: { language: "javascript", source: 'console.log(entrada + " ✓")' } });
  const f = fixture(node, { permissions: () => "sandbox" });
  await assert.rejects(f.actions.run(node, item), /Sandbox/);
  f.host.permissions = () => "ask"; f.host.confirm = async () => false;
  await assert.rejects(f.actions.run(node, item), /cancelada/);
  f.host.permissions = () => "full";
  const statuses = [], delivered = [];
  f.canvas.nodes.push({ id: "end", kind: "terminal" }); f.canvas.edges.push({ id: "out", source: "code", target: "end" });
  await runFlow(f.canvas, "code", { action: (n, data) => f.actions.run(n, data), status: s => statuses.push(s), deliver: async (_, text) => delivered.push(text) }, "Olá");
  assert.deepEqual(delivered, ["Olá ✓"]); assert.ok(statuses.some(s => s.nodeId === "code" && s.state === "ok"));
});
test("destino do astro Abrir aplicativo não dispara novamente como arquivo", async () => {
  const start = flow("a", { type: "launch", launch: { mode: "open", targetId: "f" } });
  const canvas = { nodes: [start, file("f", process.execPath)], edges: [{ id: "c", source: "a", target: "f" }] };
  const calls = [];
  await runFlow(canvas, "a", { action: async (node, item) => { calls.push(node.id); return item; }, status: () => {} });
  assert.deepEqual(calls, ["a"]);
});
test("serviço conectado respeita envio permitido, caminho e revogação de conexão", async t => {
  let calls = 0;
  const server = createServer((_req, res) => { calls++; res.end('{"ok":true}'); }).listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r)); t.after(() => server.close());
  const endpoint = `http://127.0.0.1:${server.address().port}/api`;
  const node = flow("r", { type: "request", http: { serviceId: "s", path: "users?q=ana" } });
  const f = fixture(node);
  const service = { id: "s", kind: "service", element: { id: "s", kind: "service", service: { transport: "http", endpoint } } };
  f.canvas.nodes.push(service); f.canvas.edges.push({ source: "r", target: "s" });
  assert.equal((await f.actions.run(node, item)).vars.status_http, "200");
  node.element.flow.http.method = "POST";
  await assert.rejects(f.actions.run(node, item), /envio de dados/);
  node.element.flow.http.method = "GET"; node.element.flow.http.path = "../outside";
  await assert.rejects(f.actions.run(node, item), /dentro/);
  node.element.flow.http.path = "users";
  f.host.permissions = () => "ask";
  f.host.confirm = async () => { f.canvas.edges = []; return true; };
  await assert.rejects(f.actions.run(node, item), /conexão/);
  assert.equal(calls, 1);
});
