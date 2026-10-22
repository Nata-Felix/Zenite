// Sites no Zênite se identificam como o Chrome: sem o nome do app (com acento) nem "Electron".
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "userAgent.mjs");
await build({ entryPoints: ["src/main/userAgent.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { cleanUserAgent } = await import(pathToFileURL(outfile).href);

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.149 Safari/537.36";

test("tira o nome do app com acento e o Electron (o que o Instagram recusava)", () => {
  const electron = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Zênite/0.24.0 Chrome/152.0.7977.149 Electron/44.7.2 Safari/537.36";
  assert.equal(cleanUserAgent(electron), CHROME);
  assert.match(cleanUserAgent(electron), /^[\x20-\x7e]+$/, "só ASCII");
});

test("nome sem acento também sai; o do Chrome fica igual", () => {
  assert.equal(cleanUserAgent(CHROME.replace("Chrome/", "zenite/0.24.0 Chrome/")), CHROME);
  assert.equal(cleanUserAgent(CHROME), CHROME);
});
