import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outfile = join(process.cwd(), "out", "test", "backup.mjs");
await build({ entryPoints: ["src/main/backup.ts"], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const { BackupService } = await import(pathToFileURL(outfile).href);

function setup() {
  const data = mkdtempSync(join(tmpdir(), "o-bkp-"));
  for (const d of ["workspaces", "notes", "tables", "media", "contas"]) mkdirSync(join(data, d), { recursive: true });
  writeFileSync(join(data, "workspaces", "index.json"), '{"v":1}');
  writeFileSync(join(data, "workspaces", "abc.json"), '{"canvas":"original"}');
  writeFileSync(join(data, "notes", "n1.md"), "nota original");
  writeFileSync(join(data, "media", "grande.mp4"), "x".repeat(1000));
  writeFileSync(join(data, "contas", "login.json"), "segredo");
  return { data, svc: new BackupService(data) };
}

test("backup guarda canvases, notas e tabelas — sem mídia nem logins", () => {
  const { data, svc } = setup();
  const b = svc.create("Teste", Date.UTC(2026, 9, 19, 12, 0, 0));
  assert.equal(b.canvases, 1);
  const dir = join(data, "backups", b.id);
  assert.ok(existsSync(join(dir, "workspaces", "abc.json")));
  assert.ok(existsSync(join(dir, "notes", "n1.md")));
  assert.equal(existsSync(join(dir, "media")), false);
  assert.equal(existsSync(join(dir, "contas")), false);
  assert.equal(svc.list()[0].reason, "Teste");
});

test("restaurar volta o estado e guarda o atual antes (dá para desfazer)", () => {
  const { data, svc } = setup();
  const b = svc.create("Manhã");
  writeFileSync(join(data, "workspaces", "abc.json"), '{"canvas":"estragado"}');
  writeFileSync(join(data, "notes", "n2.md"), "nota nova");
  const r = svc.restore(b.id);
  assert.equal(r.ok, true);
  assert.equal(readFileSync(join(data, "workspaces", "abc.json"), "utf8"), '{"canvas":"original"}');
  assert.equal(existsSync(join(data, "notes", "n2.md")), false);
  assert.equal(r.safety.reason, "Antes de restaurar um backup");
  assert.equal(readFileSync(join(data, "backups", r.safety.id, "workspaces", "abc.json"), "utf8"), '{"canvas":"estragado"}');
  assert.equal(svc.restore("../../etc").ok, false);
});

test("guarda só os 30 mais recentes", () => {
  const { svc } = setup();
  for (let i = 0; i < 33; i++) svc.create(`b${i}`, Date.UTC(2026, 0, 1, 0, 0, i));
  const list = svc.list();
  assert.equal(list.length, 30);
  assert.equal(list[0].reason, "b32");
  assert.equal(list.at(-1).reason, "b3");
});
