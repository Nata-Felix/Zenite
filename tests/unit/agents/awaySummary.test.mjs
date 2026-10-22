// "Enquanto você esteve fora": só registra durante a ausência, respeita o tempo mínimo e
// resume por terminal (pedidos primeiro), Sol, astros e selos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "awaySummary.mjs");
await build({ entryPoints: ["src/main/awaySummary.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { AwayLog, hasNews } = await import(pathToFileURL(outfile).href);

const names = {
  terminal: (id) => (id === "apagado" ? undefined : { title: `Terminal ${id}`, where: "Loja" }),
  flow: (id) => `Astro ${id}`,
};
const MIN = 10 * 60_000;

test("eventos com a janela em uso não entram no resumo", () => {
  const log = new AwayLog();
  log.record({ kind: "done", id: "a" });
  log.leave(0);
  assert.equal(log.back(MIN + 1, MIN, names).terminals.length, 0);
});

test("ausência curta não mostra resumo", () => {
  const log = new AwayLog();
  log.leave(0);
  log.record({ kind: "done", id: "a" });
  assert.equal(log.back(MIN - 1, MIN, names), null);
  assert.equal(log.away, false);
});

test("junta turnos, pedidos, selos, Sol e astros; quem pede atenção vem primeiro", () => {
  const log = new AwayLog();
  log.leave(1000);
  log.leave(5000); // sair de novo não reinicia a contagem
  log.record({ kind: "done", id: "a" });
  log.record({ kind: "done", id: "a" });
  log.record({ kind: "request", id: "b", message: "Preciso da chave da API" });
  log.record({ kind: "status", id: "a", status: { state: "pronto", note: "testes ok", at: 2 } });
  log.record({ kind: "done", id: "apagado" });
  log.record({ kind: "sol", what: ["criou Bugs", "ligou Corretor → Bugs"] });
  log.record({ kind: "flow", status: { nodeId: "f", state: "running", done: 0, total: 2, at: 3 } });
  log.record({ kind: "flow", status: { nodeId: "f", state: "ok", done: 1, total: 2, at: 4 } });
  log.record({ kind: "flow", status: { nodeId: "f", state: "error", done: 1, total: 2, message: "sem rede", at: 5 } });
  const s = log.back(1000 + MIN, MIN, names);
  assert.equal(s.since, 1000);
  assert.deepEqual(s.terminals.map((t) => t.id), ["b", "a"]);
  assert.equal(s.terminals[1].turns, 2);
  assert.equal(s.terminals[1].status.state, "pronto");
  assert.deepEqual(s.terminals[0].requests, ["Preciso da chave da API"]);
  assert.deepEqual(s.sol, { count: 2, recent: ["criou Bugs", "ligou Corretor → Bugs"] });
  assert.deepEqual(s.flows, [{ title: "Astro f", ok: 1, errors: 1, lastError: "sem rede" }]);
  assert.equal(hasNews(s), true);
});

test("sem nada acontecendo não há novidade", () => {
  const log = new AwayLog();
  log.leave(0);
  assert.equal(hasNews(log.back(MIN, MIN, names)), false);
});
