// Garante o terminal nativo do Windows (@lydell/node-pty-win32-x64) em node_modules antes de
// gerar o instalador. No Windows o npm install já traz; em outro sistema (build cruzado) ele
// é baixado aqui com `npm pack`.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const target = join("node_modules", "@lydell", "node-pty-win32-x64");
const version = JSON.parse(readFileSync(join("node_modules", "@lydell", "node-pty", "package.json"), "utf8")).optionalDependencies["@lydell/node-pty-win32-x64"];
if (existsSync(join(target, "package.json")) && JSON.parse(readFileSync(join(target, "package.json"), "utf8")).version === version) {
  console.log(`node-pty para Windows ${version} já presente`);
} else {
  const tmp = mkdtempSync(join(tmpdir(), "pty-win-"));
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npm, ["pack", `@lydell/node-pty-win32-x64@${version}`, "--pack-destination", tmp], { stdio: "inherit", shell: process.platform === "win32" });
  const tgz = join(tmp, `lydell-node-pty-win32-x64-${version}.tgz`);
  execFileSync("tar", ["xzf", tgz, "-C", tmp]);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(tmp, "package"), target, { recursive: true });
  rmSync(tmp, { recursive: true, force: true });
  console.log(`node-pty para Windows ${version} copiado para ${target}`);
}
