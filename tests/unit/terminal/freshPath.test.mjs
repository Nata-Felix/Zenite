// Terminais acham programas instalados depois que o Zênite abriu (PATH relido do Windows).
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "freshPath.mjs");
await build({ entryPoints: ["src/main/freshPath.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { parsePathListing, missingFrom, readPathNow } = await import(pathToFileURL(outfile).href);

test("junta o PATH do sistema e do usuário e acrescenta só o que falta", () => {
  const fresh = parsePathListing("C:\\Windows\\system32;C:\\Windows;\r\n---\r\nC:\\Users\\João Teste\\AppData\\Local\\agy\\bin;;C:\\Tools\\\r\n");
  assert.deepEqual(fresh, ["C:\\Windows\\system32", "C:\\Windows", "C:\\Users\\João Teste\\AppData\\Local\\agy\\bin", "C:\\Tools\\"]);
  // Maiúsculas e barra no fim não contam como diferença; repetidos entram uma vez só.
  assert.deepEqual(missingFrom("c:\\windows\\System32;C:\\Tools", [...fresh, "C:\\Users\\João Teste\\AppData\\Local\\agy\\bin"]), ["C:\\Windows", "C:\\Users\\João Teste\\AppData\\Local\\agy\\bin"]);
});

test("no Windows, a leitura real traz o PATH do usuário", { skip: process.platform !== "win32" }, () => {
  readPathNow();
  const added = missingFrom("");
  assert.ok(added.length > 0);
  assert.ok(added.some((p) => /system32/i.test(p)));
});

test("pastas conhecidas dos CLIs entram mesmo fora do PATH, só se existirem", async () => {
  const { agentDirs } = await import(pathToFileURL(outfile).href);
  const env = { USERPROFILE: "C:\Users\a", APPDATA: "C:\Users\a\AppData\Roaming", LOCALAPPDATA: "C:\Users\a\AppData\Local" };
  const dirs = agentDirs(env, (p) => !p.endsWith("npm"));
  assert.equal(dirs.length, 2);
  assert.ok(dirs[0].endsWith(join(".local", "bin")));
  assert.ok(dirs[1].endsWith(join("agy", "bin")));
});
