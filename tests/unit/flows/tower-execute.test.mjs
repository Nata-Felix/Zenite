// Torre no modo "Classificar e executar": termos decidem primeiro, a IA classifica pelo critério,
// o executor da rota faz o trabalho e, sem continuação, a resposta volta a quem pediu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "tower-execute.mjs");
await build({ entryPoints: ["src/main/flowRunner.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { runFlow, towerPrompt, routeSpec } = await import(pathToFileURL(outfile).href);

const flow = (id, spec) => ({ id, kind: "flow", x: 0, y: 0, width: 280, height: 132, element: { id, kind: "flow", title: id, flow: spec } });
const term = (id) => ({ id, kind: "terminal", x: 0, y: 0, width: 600, height: 400, terminal: { id, title: id, command: "" } });
const edge = (source, target, sourceHandle) => ({ id: `${source}:${sourceHandle ?? ""}->${target}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) });
const canvas = (nodes, edges) => ({ version: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes, edges });

const routes = () => [
  { id: "r1", label: "Pesquisa", match: "pesquise", criteria: "só ler e resumir", run: { agent: "claude", model: "sonnet", effort: "low", prompt: "Pesquise: {{entrada}}" } },
  { id: "r2", label: "Construção", criteria: "implementar código", run: { agent: "codex", model: "gpt-5", effort: "medium", fallback: { agent: "claude", model: "opus" } } },
  { id: "r3", label: "Revisão", criteria: "revisar um diff" },
];

function deps(answer = "Construção", extra = {}) {
  const log = { agent: [], delivered: [] };
  return {
    log,
    runAgent: async (spec, prompt) => {
      log.agent.push({ agent: spec.agent, model: spec.model, effort: spec.effort, prompt });
      return { ok: true, text: spec.type === "tower" ? answer : `feito por ${spec.agent}/${spec.model}` };
    },
    runScript: async () => ({ ok: true, text: "" }),
    deliver: async (id, text) => void log.delivered.push([id, text]),
    hasQuota: () => true,
    status: () => {},
    replyTo: "sol",
    ...extra,
  };
}

test("termo que bate decide sem chamar a IA e o executor da rota faz o trabalho", async () => {
  const tower = flow("Roteiro", { type: "tower", decide: "execute", agent: "claude", routes: routes() });
  const d = deps();
  await runFlow(canvas([tower, term("sol")], []), "Roteiro", d, "pesquise preços de frete");
  assert.deepEqual(d.log.agent, [{ agent: "claude", model: "sonnet", effort: "low", prompt: "Pesquise: pesquise preços de frete" }]);
  assert.deepEqual(d.log.delivered, [["sol", '[Torre "Roteiro" · Pesquisa]\nfeito por claude/sonnet']]);
});

test("sem termo, a IA classifica pelo critério e o executor da rota escolhida roda", async () => {
  const tower = flow("Roteiro", { type: "tower", decide: "execute", agent: "claude", routes: routes() });
  const d = deps("Construção");
  await runFlow(canvas([tower, term("sol")], []), "Roteiro", d, "adicione login com Google");
  assert.equal(d.log.agent.length, 2);
  assert.match(d.log.agent[0].prompt, /- Pesquisa: só ler e resumir\n- Construção: implementar código\n- Revisão: revisar um diff/);
  assert.deepEqual(d.log.agent[1], { agent: "codex", model: "gpt-5", effort: "medium", prompt: "adicione login com Google" });
  assert.equal(d.log.delivered[0][1], '[Torre "Roteiro" · Construção]\nfeito por codex/gpt-5');
});

test("conta do executor sem limite: usa a alternativa da rota", async () => {
  const tower = flow("Roteiro", { type: "tower", decide: "execute", routes: routes() });
  const d = deps("Construção", { hasQuota: (spec) => spec.agent !== "codex" });
  await runFlow(canvas([tower, term("sol")], []), "Roteiro", d, "refatore o frete");
  assert.deepEqual(d.log.agent.at(-1), { agent: "claude", model: "opus", effort: undefined, prompt: "refatore o frete" });
  assert.deepEqual(routeSpec({ agent: "codex", model: "x" }, { hasQuota: () => false }), { type: "satellite", agent: "codex", model: "x", account: undefined, effort: undefined, permission: undefined });
});

test("rota com continuação: a resposta segue pela saída dela, não volta a quem pediu", async () => {
  const tower = flow("Roteiro", { type: "tower", decide: "execute", routes: routes() });
  const d = deps("Construção");
  await runFlow(canvas([tower, term("sol"), term("revisor")], [edge("Roteiro", "revisor", "r2")]), "Roteiro", d, "crie a tela");
  assert.deepEqual(d.log.delivered, [["revisor", "feito por codex/gpt-5"]]);
});

test("rota sem executor segue pela saída para o terminal ligado (o Builder do canvas)", async () => {
  const tower = flow("Roteiro", { type: "tower", decide: "execute", routes: routes() });
  const d = deps("Revisão");
  await runFlow(canvas([tower, term("sol"), term("builder")], [edge("Roteiro", "builder", "r3")]), "Roteiro", d, "revise o PR");
  assert.equal(d.log.agent.length, 1, "só a classificação");
  assert.deepEqual(d.log.delivered, [["builder", "revise o PR"]]);
});

test("nenhuma rota serve: avisa quem pediu para perguntar ao usuário", async () => {
  const tower = flow("Roteiro", { type: "tower", decide: "execute", routes: routes() });
  const d = deps("nenhum desses");
  await runFlow(canvas([tower, term("sol")], []), "Roteiro", d, "faça um bolo");
  assert.deepEqual(d.log.delivered, [["sol", '[Torre "Roteiro" · Outros]\nNenhuma rota serve para este pedido. Pergunte ao usuário como seguir.']]);
});

test("modo IA antigo continua igual e sem critério o prompt não muda", () => {
  const spec = { type: "tower", decide: "agent", routes: [{ id: "a", label: "A" }, { id: "b", label: "B" }] };
  assert.equal(towerPrompt(spec, { entrada: "oi", vars: {} }), "Escolha o caminho para o texto abaixo. Responda só com um destes nomes: A, B.\n\nTexto:\noi");
});
