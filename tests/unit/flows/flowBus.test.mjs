// Fluxo nas linhas: beat no sentido do envio e, depois, a linha guarda o último sentido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "flowBus.mjs");
await build({ entryPoints: ["src/renderer/flowBus.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { recordFlow, flowState, BEAT_MS } = await import(pathToFileURL(outfile).href);

test("linha sem fluxo fica como sempre", () => {
  assert.equal(flowState("chefe", "bracal"), "");
});

test("pedido do chefe: beat da origem ao destino; resposta: beat ao contrário", () => {
  const t0 = 1_000_000;
  recordFlow("chefe", "bracal", t0);
  assert.equal(flowState("chefe", "bracal", t0 + 10), "forward beat");
  // A mesma linha desenhada ao contrário (bracal → chefe) vê o fluxo como "reverse".
  assert.equal(flowState("bracal", "chefe", t0 + 10), "reverse beat");

  recordFlow("bracal", "chefe", t0 + 100);
  assert.equal(flowState("chefe", "bracal", t0 + 110), "reverse beat");
});

test("sem fluxo novo, o beat para e a linha mantém o último sentido", () => {
  const t0 = 2_000_000;
  recordFlow("nota", "chefe", t0);
  assert.equal(flowState("chefe", "nota", t0 + BEAT_MS + 1), "reverse");
  assert.equal(flowState("nota", "chefe", t0 + BEAT_MS + 1), "forward");
});

test("cada linha tem o seu fluxo", () => {
  recordFlow("a", "b", 3_000_000);
  assert.equal(flowState("a", "c", 3_000_010), "");
});
