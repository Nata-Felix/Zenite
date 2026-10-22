// Detector de "precisa de você": turnos de trabalho, foco e pedidos explícitos.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "attention.mjs");
await build({ entryPoints: ["src/main/attention.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { AttentionTracker } = await import(pathToFileURL(outfile).href);

function setup() {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const events = [];
  const t = new AttentionTracker((all, added) => events.push({ all, added }), { quietMs: 4000, minBytes: 400, busyMs: 120000 }, () => Date.now());
  return { t, events, last: () => events.at(-1)?.all ?? {} };
}

test("banner inicial não conta; trabalho seguido de silêncio vira 'done'", () => {
  const { t, last } = setup();
  t.windowFocus(true);
  t.output("A", 5000); // banner antes de qualquer entrada
  mock.timers.tick(5000);
  assert.deepEqual(last(), {});
  t.input("A");
  t.output("A", 300);
  mock.timers.tick(2000);
  t.output("A", 300);
  mock.timers.tick(3999);
  assert.deepEqual(last(), {}, "ainda trabalhando");
  mock.timers.tick(1);
  assert.equal(last().A.reason, "done");
  mock.timers.reset();
});

test("eco do que foi digitado não conta, e quem está olhando não é avisado", () => {
  const { t, last } = setup();
  t.input("A");
  t.output("A", 12);
  mock.timers.tick(5000);
  assert.deepEqual(last(), {});
  t.focus("A");
  t.input("A");
  t.output("A", 2000);
  mock.timers.tick(5000);
  assert.deepEqual(last(), {}, "terminal em foco com a janela em foco");
  t.windowFocus(false);
  t.input("A");
  t.output("A", 2000);
  mock.timers.tick(5000);
  assert.equal(last().A.reason, "done", "janela em segundo plano avisa mesmo com o terminal focado");
  t.windowFocus(true);
  assert.deepEqual(last(), {}, "voltar para a janela olhando o terminal dispensa");
  mock.timers.reset();
});

test("pedido explícito aparece mesmo em foco, e digitar dispensa", () => {
  const { t, events, last } = setup();
  t.focus("B");
  t.request("B", "  preciso da senha do banco ");
  assert.deepEqual(last().B.message, "preciso da senha do banco");
  assert.equal(events.at(-1).added.id, "B");
  t.input("B");
  assert.deepEqual(last(), {});
  mock.timers.reset();
});

test("busy: saída recente mantém o computador acordado; remove limpa tudo", () => {
  const { t, last } = setup();
  assert.equal(t.busy(), false);
  t.output("C", 10);
  assert.equal(t.busy(), true);
  mock.timers.tick(120001);
  assert.equal(t.busy(), false);
  t.request("C", "x");
  t.remove("C");
  assert.deepEqual(last(), {});
  mock.timers.reset();
});
