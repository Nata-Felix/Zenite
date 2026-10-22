import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out/test/flowWaits.mjs");
await build({ entryPoints: ["src/main/flowWaits.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { FlowWaits } = await import(pathToFileURL(outfile).href);

test("Sinal só continua uma espera ativa, uma vez, com os dados recebidos", async () => {
  const waits = new FlowWaits(), controller = new AbortController();
  assert.equal(waits.signal("w").ok, false);
  const pending = waits.wait("w", 10, controller.signal);
  assert.equal(waits.signal("w", "dados").ok, true);
  assert.equal(await pending, "dados");
  assert.equal(waits.signal("w").ok, false);
});

test("Parada e tempo limite removem as esperas e não deixam sinais antigos passar", async () => {
  const waits = new FlowWaits(), controller = new AbortController();
  const pending = waits.wait("w", 10, controller.signal);
  controller.abort();
  await assert.rejects(pending, /parado/);
  assert.equal(waits.signal("w").ok, false);
  await assert.rejects(waits.wait("w", 0.01, new AbortController().signal), /limite/);
  assert.equal(waits.signal("w").ok, false);
});

test("Sinal ambíguo não mistura execuções do mesmo astro", async () => {
  const waits = new FlowWaits(), a = new AbortController(), b = new AbortController();
  const pa = waits.wait("w", 10, a.signal), pb = waits.wait("w", 10, b.signal);
  assert.equal(waits.signal("w").ok, false);
  a.abort();
  await assert.rejects(pa);
  assert.equal(waits.signal("w", "b").ok, true);
  assert.equal(await pb, "b");
});
