// Astros: Ignição → Satélite/Propulsor, com Gêmeos, Torre, Gravidade e Órbita no caminho.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "flowRunner.mjs");
await build({ entryPoints: ["src/main/flowRunner.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { runFlow, fill, matches, ignitionDue, MAX_STEPS } = await import(pathToFileURL(outfile).href);

const flow = (id, spec) => ({ id, kind: "flow", x: 0, y: 0, width: 280, height: 132, element: { id, kind: "flow", title: id, flow: spec } });
const term = (id) => ({ id, kind: "terminal", x: 0, y: 0, width: 600, height: 400, terminal: { id, title: id, command: "" } });
const edge = (source, target, sourceHandle) => ({ id: `${source}:${sourceHandle ?? ""}->${target}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) });
const canvas = (nodes, edges) => ({ version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes, edges });

function deps(extra = {}) {
  const log = { agent: [], script: [], delivered: [], status: [] };
  return {
    log,
    runAgent: async (_spec, prompt) => (log.agent.push(prompt), { ok: true, text: `R(${prompt})` }),
    runScript: async (script) => (log.script.push(script), { ok: true, text: `S(${script})` }),
    deliver: async (id, text) => void log.delivered.push([id, text]),
    hasQuota: () => true,
    status: (s) => log.status.push(s),
    ...extra,
  };
}

test("{{entrada}} e variáveis no texto", () => {
  assert.equal(fill("a {{ Entrada }} b {{volta}} {{nada}}", { entrada: "X", vars: { volta: "2" } }), "a X b 2 ");
});

test("Convergência executa ramos em paralelo e reúne todas as respostas uma vez", async () => {
  let release;
  const ready = new Promise((r) => { release = r; });
  const started = [];
  const d = deps({ runAgent: async (_spec, prompt) => {
    started.push(prompt);
    if (started.length === 2) release();
    await ready;
    return { ok: true, text: prompt };
  } });
  const nodes = [flow("ig", { type: "ignition" }), flow("a", { type: "satellite", prompt: "análise" }), flow("b", { type: "satellite", prompt: "revisão" }), flow("j", { type: "convergence" }), term("t")];
  const edges = [edge("ig", "a"), edge("ig", "b"), edge("a", "j"), edge("b", "j"), edge("j", "t")];
  await runFlow(canvas(nodes, edges), "ig", d);
  assert.deepEqual(d.log.delivered, [["t", "a:\nanálise\n\nb:\nrevisão"]]);
  assert.ok(d.log.status.some((s) => s.nodeId === "j" && s.done === 1 && s.total === 2));
});

test("Convergência primeira e quantidade mínima liberam sem esperar o ramo lento", async () => {
  for (const [joinMode, joinCount] of [["first", 1], ["count", 2]]) {
    let release;
    const slow = new Promise((r) => { release = r; });
    const d = deps({ runAgent: async (_spec, prompt) => {
      if (prompt === "lento") await slow;
      return { ok: true, text: prompt };
    } });
    d.deliver = async (id, text) => { d.log.delivered.push([id, text]); release(); };
    const nodes = [flow("ig", { type: "ignition" }), ...["a", "b", "lento"].map((id) => flow(id, { type: "satellite", prompt: id })), flow("j", { type: "convergence", joinMode, joinCount }), term("t")];
    const edges = ["a", "b", "lento"].flatMap((id) => [edge("ig", id), edge(id, "j")]).concat(edge("j", "t"));
    await runFlow(canvas(nodes, edges), "ig", d);
    assert.equal(d.log.delivered.length, 1);
    assert.ok(!d.log.delivered[0][1].includes("lento"));
  }
});

test("Convergência informa entrada ausente em caso de falha e não mistura execuções", async () => {
  const nodes = [flow("ig", { type: "ignition" }), flow("a", { type: "satellite", prompt: "{{entrada}}" }), flow("b", { type: "satellite", prompt: "falha" }), flow("j", { type: "convergence" }), term("t")];
  const edges = [edge("ig", "a"), edge("ig", "b"), edge("a", "j"), edge("b", "j"), edge("j", "t")];
  const d = deps({ runAgent: async (_s, p) => p === "falha" ? { ok: false, error: "erro" } : { ok: true, text: p } });
  await runFlow(canvas(nodes, edges), "ig", d, "um");
  assert.equal(d.log.delivered.length, 0);
  assert.ok(d.log.status.some((s) => s.nodeId === "j" && s.state === "error" && s.message.includes("b")));
  const failed = deps({ runAgent: async () => ({ ok: false, error: "ambos falharam" }) });
  await runFlow(canvas(nodes, edges), "ig", failed);
  assert.ok(failed.log.status.some((s) => s.nodeId === "j" && s.state === "error" && s.done === 0));
  nodes[2].element.flow.prompt = "{{entrada}}";
  const x = deps(), y = deps();
  await Promise.all([runFlow(canvas(nodes, edges), "ig", x, "dois"), runFlow(canvas(nodes, edges), "ig", y, "três")]);
  assert.ok(!x.log.delivered[0][1].includes("três"));
  assert.ok(!y.log.delivered[0][1].includes("dois"));
});

test("Espera mantém entrada, respeita o tempo e cancela ao parar", async () => {
  const nodes = [flow("w", { type: "wait", waitSeconds: 0.04, input: "preservado" }), term("t")];
  const c = canvas(nodes, [edge("w", "t")]);
  const d = deps(), start = Date.now();
  await runFlow(c, "w", d);
  assert.ok(Date.now() - start >= 35);
  assert.deepEqual(d.log.delivered, [["t", "preservado"]]);
  const controller = new AbortController();
  const cancel = deps({ signal: controller.signal });
  nodes[0].element.flow.waitSeconds = 100;
  const pending = runFlow(c, "w", cancel);
  controller.abort();
  await pending;
  assert.equal(cancel.log.delivered.length, 0);
  assert.ok(cancel.log.status.some((s) => s.state === "error"));
});

test("Configurações inválidas e Convergência em ciclo não executam o próximo passo", async () => {
  for (const spec of [{ type: "wait", waitSeconds: -1 }, { type: "wait", waitMode: "signal", timeoutSeconds: Infinity }]) {
    const d = deps();
    await runFlow(canvas([flow("w", spec), term("t")], [edge("w", "t")]), "w", d);
    assert.equal(d.log.delivered.length, 0);
    assert.ok(d.log.status.some((s) => s.state === "error"));
  }
  const d = deps();
  await runFlow(canvas([flow("i", { type: "ignition" }), flow("j", { type: "convergence" }), term("t")], [edge("i", "j"), edge("j", "j"), edge("j", "t")]), "i", d);
  assert.equal(d.log.delivered.length, 0);
  assert.ok(d.log.status.some((s) => s.message?.includes("ciclos")));
});

test("Espera por sinal recebe dados e falha fechada sem o serviço", async () => {
  const c = canvas([flow("w", { type: "wait", waitMode: "signal", input: "antes" }), term("t")], [edge("w", "t")]);
  const d = deps({ waitForSignal: async () => "depois" });
  await runFlow(c, "w", d);
  assert.deepEqual(d.log.delivered, [["t", "depois"]]);
  const missing = deps();
  await runFlow(c, "w", missing);
  assert.equal(missing.log.delivered.length, 0);
  assert.ok(missing.log.status.some((s) => s.state === "error"));
});

test("Aprovação só libera o caminho escolhido e nunca roda sem decisão", async () => {
  const c = canvas([flow("ap", { type: "approval", approvalMessage: "Publicar {{entrada}}?", input: "relatório" }), term("sim"), term("não")], [edge("ap", "sim", "approved"), edge("ap", "não", "rejected")]);
  for (const approved of [true, false]) {
    const d = deps({ approve: async (_n, message, input, next) => {
      assert.equal(message, "Publicar relatório?");
      assert.equal(input, "relatório");
      assert.deepEqual(next.map((n) => n.id), ["sim"]);
      return approved;
    } });
    await runFlow(c, "ap", d);
    assert.deepEqual(d.log.delivered, [[approved ? "sim" : "não", "relatório"]]);
  }
  const absent = deps();
  await runFlow(c, "ap", absent);
  assert.equal(absent.log.delivered.length, 0);
});

test("Ignição manda o texto inicial; terminal ligado recebe o Hello World", async () => {
  const d = deps();
  await runFlow(canvas([flow("ig", { type: "ignition", input: "Hello World" }), term("t1")], [edge("ig", "t1")]), "ig", d);
  assert.deepEqual(d.log.delivered, [["t1", "Hello World"]]);
});

test("Satélite e Propulsor encadeiam a saída como nova entrada", async () => {
  const d = deps();
  const nodes = [flow("ig", { type: "ignition", input: "oi" }), flow("sat", { type: "satellite", prompt: "Diga: {{entrada}}" }), flow("pr", { type: "thruster", script: "echo {{resposta}}" }), term("t")];
  await runFlow(canvas(nodes, [edge("ig", "sat"), edge("sat", "pr"), edge("pr", "t")]), "ig", d);
  assert.deepEqual(d.log.agent, ["Diga: oi"]);
  assert.deepEqual(d.log.script, ["echo R(Diga: oi)"]);
  assert.deepEqual(d.log.delivered, [["t", "S(echo R(Diga: oi))"]]);
});

test("Gêmeos segue por A ou B", async () => {
  const nodes = [flow("ig", { type: "ignition" }), flow("gm", { type: "gemini", condition: { op: "contains", value: "urgente" } }), term("a"), term("b")];
  const edges = [edge("ig", "gm"), edge("gm", "a", "a"), edge("gm", "b", "b")];
  const d1 = deps();
  await runFlow(canvas(nodes, edges), "ig", d1, "isso é URGENTE");
  assert.deepEqual(d1.log.delivered.map((x) => x[0]), ["a"]);
  const d2 = deps();
  await runFlow(canvas(nodes, edges), "ig", d2, "tranquilo");
  assert.deepEqual(d2.log.delivered.map((x) => x[0]), ["b"]);
});

test("Torre por palavras e pela IA, com saída Outros", async () => {
  const routes = [{ id: "r1", label: "Suporte", match: "erro, falha" }, { id: "r2", label: "Vendas", match: "preço" }];
  const nodes = [flow("ig", { type: "ignition" }), flow("tw", { type: "tower", routes }), term("s"), term("v"), term("o")];
  const edges = [edge("ig", "tw"), edge("tw", "s", "r1"), edge("tw", "v", "r2"), edge("tw", "o", "else")];
  for (const [text, want] of [["deu falha no login", "s"], ["qual o preço?", "v"], ["bom dia", "o"]]) {
    const d = deps();
    await runFlow(canvas(nodes, edges), "ig", d, text);
    assert.deepEqual(d.log.delivered.map((x) => x[0]), [want], text);
  }
  const ai = deps({ runAgent: async () => ({ ok: true, text: "Vendas." }) });
  nodes[1] = flow("tw", { type: "tower", routes, decide: "agent" });
  await runFlow(canvas(nodes, edges), "ig", ai, "bom dia");
  assert.deepEqual(ai.log.delivered.map((x) => x[0]), ["v"]);
});

test("Gravidade reveza e pula o Satélite sem folga", async () => {
  const nodes = [flow("ig", { type: "ignition" }), flow("gv", { type: "gravity", strategy: "quota" }), flow("s1", { type: "satellite", prompt: "1", account: "cheia" }), flow("s2", { type: "satellite", prompt: "2" })];
  const edges = [edge("ig", "gv"), edge("gv", "s1"), edge("gv", "s2")];
  const d = deps({ hasQuota: (spec) => spec.account !== "cheia" });
  await runFlow(canvas(nodes, edges), "ig", d);
  await runFlow(canvas(nodes, edges), "ig", d);
  assert.deepEqual(d.log.agent, ["2", "2"]);
  nodes[1] = flow("gv2", { type: "gravity" });
  const d2 = deps();
  const e2 = [edge("ig", "gv2"), edge("gv2", "s1"), edge("gv2", "s2")];
  for (let i = 0; i < 3; i++) await runFlow(canvas(nodes, e2), "ig", d2);
  assert.deepEqual(d2.log.agent, ["1", "2", "1"]);
});

test("Órbita refaz o passo anterior até a condição ou o limite", async () => {
  // Propulsor → Órbita: Volta → Propulsor; Segue → terminal.
  let n = 0;
  const d = deps({ runScript: async () => ({ ok: true, text: ++n >= 2 ? "OK" : "tentando" }) });
  const nodes = [flow("ig", { type: "ignition" }), flow("pr", { type: "thruster", script: "x" }), flow("ob", { type: "orbit", times: 5, until: { op: "equals", value: "ok" } }), term("t")];
  const edges = [edge("ig", "pr"), edge("pr", "ob"), edge("ob", "pr", "loop"), edge("ob", "t", "done")];
  await runFlow(canvas(nodes, edges), "ig", d);
  assert.equal(n, 2);
  assert.deepEqual(d.log.delivered, [["t", "OK"]]);
  // Sem condição: para no máximo de voltas.
  let m = 0;
  const d2 = deps({ runScript: async () => ({ ok: true, text: String(++m) }) });
  nodes[2] = flow("ob", { type: "orbit", times: 3 });
  await runFlow(canvas(nodes, edges), "ig", d2);
  assert.equal(m, 3);
});

test("Órbita ligada em círculo sem saída para no limite de passos", async () => {
  const nodes = [flow("a", { type: "ignition" }), flow("ob1", { type: "orbit", times: 400 }), flow("ob2", { type: "orbit", times: 400 })];
  const edges = [edge("a", "ob1"), edge("ob1", "ob2", "loop"), edge("ob2", "ob1", "loop")];
  const d = deps();
  await runFlow(canvas(nodes, edges), "a", d);
  assert.ok(d.log.status.some((s) => s.state === "error" && s.message.includes(String(MAX_STEPS))));
});

test("erro no Satélite para o caminho", async () => {
  const d = deps({ runAgent: async () => ({ ok: false, error: "limite" }) });
  await runFlow(canvas([flow("ig", { type: "ignition" }), flow("s", { type: "satellite", prompt: "p" }), term("t")], [edge("ig", "s"), edge("s", "t")]), "ig", d);
  assert.equal(d.log.delivered.length, 0);
  assert.ok(d.log.status.some((s) => s.nodeId === "s" && s.state === "error" && s.message === "limite"));
});

test("condições", () => {
  const it = { entrada: " 42 ", vars: {} };
  assert.ok(matches({ op: "gt", value: "10" }, it));
  assert.ok(!matches({ op: "lt", value: "10" }, it));
  assert.ok(matches({ op: "filled" }, it));
  assert.ok(matches({ op: "regex", value: "^\\s*\\d+" }, it));
});

test("relógio da Ignição", () => {
  const every = { type: "ignition", schedule: "interval", everyMinutes: 10 };
  const t0 = new Date(2026, 9, 20, 9, 0).getTime();
  assert.ok(!ignitionDue(every, t0, new Date(t0 + 9 * 60_000)));
  assert.ok(ignitionDue(every, t0, new Date(t0 + 10 * 60_000)));
  const daily = { type: "ignition", schedule: "daily", at: "09:30", days: [2] }; // terça
  const tue = (h, m) => new Date(2026, 9, 20, h, m); // 20/10/2026 é terça
  assert.ok(!ignitionDue(daily, tue(9, 0).getTime(), tue(9, 29)));
  assert.ok(ignitionDue(daily, tue(9, 0).getTime(), tue(9, 30)));
  assert.ok(!ignitionDue(daily, tue(9, 30).getTime(), tue(10, 0)), "já rodou hoje");
  assert.ok(!ignitionDue(daily, 0, new Date(2026, 9, 21, 9, 30)), "quarta não está marcada");
});

test("zn flow stop: o passo em andamento termina e o próximo não começa", async () => {
  let stop = false;
  const d = deps({ stopped: () => stop });
  d.runAgent = async (_spec, prompt) => {
    d.log.agent.push(prompt);
    stop = true; // pediram para parar enquanto o Satélite trabalhava
    return { ok: true, text: `R(${prompt})` };
  };
  const nodes = [flow("ig", { type: "ignition", input: "oi" }), flow("sat", { type: "satellite", prompt: "{{entrada}}" }), flow("pr", { type: "thruster", script: "echo" }), term("t")];
  await runFlow(canvas(nodes, [edge("ig", "sat"), edge("sat", "pr"), edge("pr", "t")]), "ig", d);
  assert.deepEqual(d.log.agent, ["oi"], "o Satélite terminou");
  assert.deepEqual(d.log.script, [], "o Propulsor não começou");
  assert.deepEqual(d.log.delivered, []);
  const last = d.log.status.at(-1);
  assert.equal(last.nodeId, "pr");
  assert.match(last.message, /Parado/);
});
