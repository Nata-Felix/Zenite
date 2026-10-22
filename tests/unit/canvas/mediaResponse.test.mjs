// Vídeos do canvas: o protocolo o-media responde a pedaços (Range), para pular e tocar de novo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "mediaResponse.mjs");
await build({ entryPoints: ["src/main/mediaResponse.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { mediaResponse, parseRange } = await import(pathToFileURL(outfile).href);

const file = join(mkdtempSync(join(tmpdir(), "o-media-")), "v.mp4");
writeFileSync(file, Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256)));

test("lê os pedidos de pedaço", () => {
  assert.deepEqual(parseRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange("bytes=900-", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=950-5000", 1000), { start: 950, end: 999 });
  assert.equal(parseRange(null, 1000), null);
  assert.equal(parseRange("bytes=2000-", 1000), "invalid");
  assert.equal(parseRange("itens=0-1", 1000), "invalid");
});

test("pedaço: 206 com só os bytes pedidos", async () => {
  const r = mediaResponse(file, "bytes=100-199");
  assert.equal(r.status, 206);
  assert.equal(r.headers.get("content-range"), "bytes 100-199/1000");
  assert.equal(r.headers.get("content-type"), "video/mp4");
  const body = Buffer.from(await r.arrayBuffer());
  assert.equal(body.length, 100);
  assert.equal(body[0], 100);
});

test("arquivo inteiro: 200 avisando que aceita pedaços; fora do arquivo: 416; sumiu: 404", async () => {
  const r = mediaResponse(file, null);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("accept-ranges"), "bytes");
  assert.equal((await r.arrayBuffer()).byteLength, 1000);
  assert.equal(mediaResponse(file, "bytes=5000-").status, 416);
  assert.equal(mediaResponse(join(tmpdir(), "nao-existe.mp4"), null).status, 404);
});
