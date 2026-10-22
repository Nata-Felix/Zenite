import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out/test/stdio.mjs");
await build({ entryPoints: ["src/main/stdio.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const moduleUrl = pathToFileURL(outfile).href;

test("app continua vivo ao escrever logs e avisos depois que o lançador fecha os pipes", async () => {
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { protectOutputStreams } from ${JSON.stringify(moduleUrl)};
    protectOutputStreams();
    process.on('message', () => {
      console.log('saída com pipe fechado');
      process.emitWarning('aviso com pipe fechado');
      setTimeout(() => { process.send('sobreviveu'); process.disconnect(); }, 100);
    });
    process.send('pronto');
  `], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const messages = [];
  child.on("message", (message) => {
    messages.push(message);
    if (message === "pronto") {
      child.stdout.destroy();
      child.stderr.destroy();
      child.send("escrever");
    }
  });
  const code = await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  assert.equal(code, 0);
  assert.deepEqual(messages, ["pronto", "sobreviveu"]);
});

test("erros de saída diferentes de EPIPE continuam visíveis", async () => {
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { protectOutputStreams } from ${JSON.stringify(moduleUrl)};
    protectOutputStreams();
    process.stdout.emit('error', Object.assign(new Error('falha de saída real'), { code: 'EIO' }));
  `]);
  let stderr = "";
  child.stderr.on("data", (data) => { stderr += data; });
  const code = await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  assert.notEqual(code, 0);
  assert.match(stderr, /falha de saída real/);
});
