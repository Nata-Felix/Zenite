import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, createHash } from "node:crypto";
const outfile = join(process.cwd(), "out/test/isolatedFiles.mjs"), cli = join(process.cwd(), "out/test/isolatedFiles-cli.cjs");
await build({ entryPoints: ["src/main/isolatedFiles.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
await build({ entryPoints: ["src/cli/index.ts"], bundle: true, platform: "node", format: "cjs", outfile: cli, logLevel: "silent" });
const { isolatedFile, FILE_CHUNK_SIZE } = await import(pathToFileURL(outfile));
const allowed = { request: async () => ({ allowed: true }) };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

test("CLI transfere binários maiores que 1 MB em ambas as direções sem flags especiais", async t => {
  const folder = mkdtempSync(join(tmpdir(), "zn-binary-"));
  const original = join(folder, "original.mp4"), remote = join(folder, "remote.mp4"), copy = join(folder, "copy.mp4");
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0xff, 0x80]), randomBytes(2_300_000)]);
  writeFileSync(original, bytes); let requests = 0;
  const server = createServer(async (req, res) => {
    try {
      let body = ""; for await (const chunk of req) body += chunk;
      assert.ok(Buffer.byteLength(body) < 1_000_000, "cada requisição cabe no limite HTTP");
      const data = JSON.parse(body); requests++;
      res.end(JSON.stringify(await isolatedFile(allowed, "test", data)));
    } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error.message })); }
  }).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve)); t.after(() => server.close());
  const run = args => promisify(execFile)(process.execPath, [cli, "access", ...args], { windowsHide: true, env: { ...process.env, O_PIPE: `http://127.0.0.1:${server.address().port}`, O_TOKEN: "test", O_TERMINAL_ID: "test" } });
  await run(["write", remote, "--file", original]);
  assert.equal(hash(readFileSync(remote)), hash(bytes));
  await run(["read", remote, "--out", copy]);
  assert.equal(hash(readFileSync(copy)), hash(bytes)); assert.ok(requests >= 10);
  await run(["read", remote, "--out", copy, "--offset", "3", "--length", "17"]);
  assert.deepEqual(readFileSync(copy), bytes.subarray(3, 20));
  const empty = join(folder, "empty"); writeFileSync(empty, "");
  await run(["write", remote, "--file", empty]); assert.equal(readFileSync(remote).length, 0);
});
test("mkdir cria vários níveis e delete remove arquivo e pasta vazia, nunca árvore cheia", async () => {
  const folder = mkdtempSync(join(tmpdir(), "zn-mkdir-")), deep = join(folder, "roteiros", "05-alucinacao");
  await isolatedFile(allowed, "test", { action: "mkdir", path: deep });
  writeFileSync(join(deep, "teste.txt"), "x");
  await assert.rejects(isolatedFile(allowed, "test", { action: "delete", path: deep }));
  await isolatedFile(allowed, "test", { action: "delete", path: join(deep, "teste.txt") });
  await isolatedFile(allowed, "test", { action: "delete", path: deep });
  assert.equal(existsSync(deep), false);
  await assert.rejects(isolatedFile({ request: async () => ({ allowed: false, reason: "Recusado" }) }, "test", { action: "mkdir", path: deep }), /Recusado/);
  assert.equal(existsSync(deep), false);
});
test("offset, base64 e tamanho inválidos não gravam; recusa preserva destino", async () => {
  const folder = mkdtempSync(join(tmpdir(), "zn-binary-deny-")), path = join(folder, "keep.bin");
  writeFileSync(path, "preservado");
  for (const patch of [{ offset: -1 }, { offset: 1000 }, { content: "!invalid!", encoding: "base64" }, { content: Buffer.alloc(FILE_CHUNK_SIZE + 1).toString("base64"), encoding: "base64" }]) {
    await assert.rejects(isolatedFile(allowed, "test", { action: "write", path, content: "novo", ...patch }));
    assert.equal(readFileSync(path, "utf8"), "preservado");
  }
  await assert.rejects(isolatedFile({ request: async () => ({ allowed: false, reason: "Recusado" }) }, "test", { action: "write", path, content: "novo" }), /Recusado/);
  assert.equal(readFileSync(path, "utf8"), "preservado");
});
