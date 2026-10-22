import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const outfile = join(process.cwd(), "out", "test", "appUpdate.mjs");
await build({ entryPoints: ["src/main/appUpdate.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { chooseLight, extractPackage, packDir, sha512, startProcessCommand, SWAP_SCRIPT, verifyPackage } = await import(pathToFileURL(outfile).href);

const manifest = { version: "0.22.0", electron: "44.7.2", platform: "win32", arch: "x64", sha512: "abc", size: 5_000_000, url: "app-0.22.0.tar.gz" };
const here = { version: "0.22.0", electron: "44.7.2", platform: "win32", arch: "x64", writable: true };

test("leve só com o mesmo Electron, mesma versão e pasta gravável", () => {
  assert.equal(chooseLight(manifest, here).light, true);
  assert.match(chooseLight({ ...manifest, electron: "45.0.0" }, here).reason, /Electron mudou/);
  assert.equal(chooseLight(manifest, { ...here, writable: false }).light, false);
  assert.equal(chooseLight({ ...manifest, version: "0.21.5" }, here).light, false);
  assert.equal(chooseLight({ ...manifest, arch: "arm64" }, here).light, false);
  assert.equal(chooseLight(manifest, { ...here, failedVersion: "0.22.0" }).light, false);
  assert.equal(chooseLight(manifest, { ...here, failedVersion: "0.21.9" }).light, true);
});

test("app-update.json ausente, incompleto ou com url estranha vai para o instalador completo", () => {
  assert.equal(chooseLight(null, here).light, false);
  assert.equal(chooseLight("texto", here).light, false);
  assert.equal(chooseLight({ ...manifest, sha512: "" }, here).light, false);
  assert.equal(chooseLight({ ...manifest, size: undefined }, here).light, false);
  assert.equal(chooseLight({ ...manifest, url: "../Zenite.exe" }, here).light, false);
  assert.equal(chooseLight({ ...manifest, url: "https://outro.site/app.tar.gz" }, here).light, false);
});

test("o pacote só vale se o sha512 e o tamanho conferem", () => {
  const data = Buffer.from("conteúdo do pacote");
  const ok = { sha512: sha512(data), size: data.length };
  assert.equal(verifyPackage(data, ok), true);
  assert.equal(verifyPackage(Buffer.from("conteúdo do pacotE"), ok), false);
  assert.equal(verifyPackage(data, { ...ok, size: data.length + 1 }), false);
  assert.equal(verifyPackage(data, { ...ok, sha512: sha512(Buffer.from("outro")) }), false);
});

test("empacota e extrai app.asar e app.asar.unpacked iguais, inclusive caminhos longos", () => {
  const src = mkdtempSync(join(tmpdir(), "zn-pack-"));
  const asar = Buffer.alloc(700_000, 7);
  writeFileSync(join(src, "app.asar"), asar);
  const deep = join(src, "app.asar.unpacked", "node_modules", "@lydell", "node-pty-win32-x64", "prebuilds", "win32-x64", "conpty");
  mkdirSync(deep, { recursive: true });
  writeFileSync(join(deep, "OpenConsole-com-um-nome-bem-comprido-para-passar-dos-cem-caracteres.exe"), "exe");
  mkdirSync(join(src, "app.asar.unpacked", "out", "cli"), { recursive: true });
  writeFileSync(join(src, "app.asar.unpacked", "out", "cli", "index.js"), "console.log('zn')");

  const data = packDir(src, ["app.asar", "app.asar.unpacked"]);
  const dest = mkdtempSync(join(tmpdir(), "zn-unpack-"));
  const names = extractPackage(data, dest);
  assert.ok(names.includes("app.asar"));
  assert.deepEqual(readFileSync(join(dest, "app.asar")), asar);
  assert.equal(readFileSync(join(dest, "app.asar.unpacked", "out", "cli", "index.js"), "utf8"), "console.log('zn')");
  const rel = join("app.asar.unpacked", "node_modules", "@lydell", "node-pty-win32-x64", "prebuilds", "win32-x64", "conpty");
  assert.equal(readFileSync(join(dest, rel, "OpenConsole-com-um-nome-bem-comprido-para-passar-dos-cem-caracteres.exe"), "utf8"), "exe");
});

test("pacote com caminho para fora da pasta é recusado", () => {
  const h = Buffer.alloc(512);
  h.write("../fora.txt", 0);
  h.write("0000644\0", 100);
  h.write("00000000003\0", 124);
  h.fill(" ", 148, 156);
  h.write("0", 156);
  h.write("ustar\0", 257);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  const data = gzipSync(Buffer.concat([h, Buffer.from("mal"), Buffer.alloc(509), Buffer.alloc(1024)]));
  const dest = mkdtempSync(join(tmpdir(), "zn-slip-"));
  assert.throws(() => extractPackage(data, join(dest, "dentro")), /caminho inválido/);
  assert.equal(existsSync(join(dest, "fora.txt")), false);
});

// O script de troca roda de verdade no PowerShell (só no Windows).
function fakeInstall(withUnpacked = true) {
  // Espaço e aspas simples no caminho, como em C:\Users\Ana D'Ávila.
  const root = join(mkdtempSync(join(tmpdir(), "zn-swap-")), "pasta d'água");
  mkdirSync(root);
  const res = join(root, "resources");
  const staged = join(root, "staged");
  mkdirSync(join(res, "app.asar.unpacked"), { recursive: true });
  writeFileSync(join(res, "app.asar"), "velho");
  writeFileSync(join(res, "app.asar.unpacked", "cli.js"), "cli velho");
  writeFileSync(join(res, "app.asar.unpacked", "so-no-velho.js"), "x");
  mkdirSync(staged);
  writeFileSync(join(staged, "app.asar"), "novo");
  if (withUnpacked) {
    mkdirSync(join(staged, "app.asar.unpacked"));
    writeFileSync(join(staged, "app.asar.unpacked", "cli.js"), "cli novo");
  }
  const script = join(root, "swap.ps1");
  writeFileSync(script, SWAP_SCRIPT);
  return { root, res, staged, script, result: join(root, "result.json") };
}

async function runSwap(f) {
  // Finge ser o Zênite: abre a troca como o app (PowerShell de partida + Start-Process) e fecha.
  // A troca precisa sobreviver ao fim do "app" e esperar por ele.
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", f.script, "-AppPid", "PID", "-Resources", f.res, "-Staged", f.staged, "-Exe", "nao-reabre.exe", "-Relaunch", "0", "-Result", f.result, "-Version", "0.22.0"];
  const fake = `
    const { spawn } = require("node:child_process");
    const args = ${JSON.stringify(args)}.map((a) => (a === "PID" ? String(process.pid) : a));
    const cmd = (${startProcessCommand.toString()})("powershell.exe", args);
    spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { stdio: "ignore", windowsHide: true })
      .on("exit", () => setTimeout(() => process.exit(0), 1000));`;
  const app = spawn(process.execPath, ["-e", fake], { stdio: "ignore" });
  await new Promise((r) => app.on("exit", r));
  for (let i = 0; i < 120 && !existsSync(f.result); i++) await new Promise((r) => setTimeout(r, 250));
  return JSON.parse(readFileSync(f.result, "utf8"));
}

test("monta o Start-Process com espaços e aspas simples nos caminhos", () => {
  assert.equal(
    startProcessCommand("C:/x/powershell.exe", ["-File", "C:/Ana D'Ávila/swap.ps1", "-Relaunch", "0"]),
    `Start-Process -FilePath 'C:/x/powershell.exe' -WindowStyle Hidden -ArgumentList '-File "C:/Ana D''Ávila/swap.ps1" -Relaunch 0'`,
  );
});

test("troca os arquivos depois que o app fecha e apaga a cópia de segurança", { skip: process.platform !== "win32" }, async () => {
  const f = fakeInstall();
  const r = await runSwap(f);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(readFileSync(join(f.res, "app.asar"), "utf8"), "novo");
  assert.equal(readFileSync(join(f.res, "app.asar.unpacked", "cli.js"), "utf8"), "cli novo");
  assert.equal(existsSync(join(f.res, "app.asar.unpacked", "so-no-velho.js")), false);
  assert.equal(existsSync(join(f.res, ".zenite-old")), false);
  assert.equal(existsSync(f.staged), false);
});

test("se falta algo nos arquivos novos, não mexe na instalação", { skip: process.platform !== "win32" }, async () => {
  const f = fakeInstall(false);
  const r = await runSwap(f);
  assert.equal(r.ok, false);
  assert.match(r.error, /app\.asar\.unpacked/);
  assert.equal(readFileSync(join(f.res, "app.asar"), "utf8"), "velho");
  assert.equal(readFileSync(join(f.res, "app.asar.unpacked", "cli.js"), "utf8"), "cli velho");
});
