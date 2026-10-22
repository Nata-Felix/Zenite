import { execFile, spawnSync } from "node:child_process";

/**
 * PATH atual do Windows (sistema + usuário). O Zênite herda o PATH de quem o abriu: se um programa
 * foi instalado depois (ex.: o agy) ou o Zênite foi aberto por um terminal antigo, os terminais não
 * achavam o programa. Relemos o PATH do registro e acrescentamos o que falta.
 */
const READ = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; [Environment]::GetEnvironmentVariable('Path','Machine'); '---'; [Environment]::GetEnvironmentVariable('Path','User')";

let cached: string[] = [];
let lastRead = 0;

/** Pastas do PATH do sistema e do usuário, na ordem do Windows (sistema primeiro). */
export function parsePathListing(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "---")
    .flatMap((l) => l.split(";"))
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Leitura que espera a resposta: ao abrir o app, antes de os terminais do canvas voltarem. */
export function readPathNow(platform: NodeJS.Platform = process.platform): void {
  if (platform !== "win32") return;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", READ], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
  if (r.status === 0 && r.stdout) cached = parsePathListing(r.stdout);
  lastRead = Date.now();
}

/** Relê o PATH do registro em segundo plano (no máximo a cada 5 s). */
export function refreshPath(platform: NodeJS.Platform = process.platform): void {
  if (platform !== "win32" || Date.now() - lastRead < 5000) return;
  lastRead = Date.now();
  execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", READ], { encoding: "utf8", windowsHide: true, timeout: 15_000 }, (err, stdout) => {
    if (!err) cached = parsePathListing(stdout);
  });
}

const norm = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase();

/** Pastas do PATH atual do Windows que faltam em `current`. */
export function missingFrom(current: string, fresh: string[] = cached): string[] {
  const have = new Set(current.split(";").map(norm));
  const out: string[] = [];
  for (const p of fresh) {
    if (have.has(norm(p))) continue;
    have.add(norm(p));
    out.push(p);
  }
  return out;
}
