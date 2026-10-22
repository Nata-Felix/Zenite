// Atualização leve: quando a versão nova usa o mesmo Electron da instalada, só os arquivos do app
// (resources/app.asar e resources/app.asar.unpacked, ~5 MB) mudam. Em vez de rodar o instalador
// inteiro (~113 MB, ~375 MB extraídos), o app baixa um pacote .tar.gz com esses arquivos e um
// processo auxiliar troca tudo depois que o Zênite fecha (o app.asar fica travado enquanto roda).
//
// Este módulo não depende do Electron: o script de build e os testes usam as mesmas funções.
// Quem roda dentro do Electron passa o módulo "original-fs" em `fs`, porque o fs comum trata
// qualquer caminho terminado em .asar como pasta.
import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { dirname, join, posix, resolve, sep } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

type Fs = typeof nodeFs;

/** app-update.json, publicado no Release ao lado do instalador. */
export interface AppUpdateManifest {
  version: string;
  /** Versão do Electron com que o pacote foi gerado (process.versions.electron). */
  electron: string;
  platform: string;
  arch: string;
  /** sha512 do pacote em base64, como o electron-builder usa no latest.yml. */
  sha512: string;
  size: number;
  /** Nome do pacote, relativo à pasta do app-update.json. */
  url: string;
}

/** O que fica em resources e é trocado pela atualização leve. */
export const APP_FILES = ["app.asar", "app.asar.unpacked"];

export const sha512 = (data: Buffer) => createHash("sha512").update(data).digest("base64");

/** O pacote baixado é exatamente o que o app-update.json descreve? */
export function verifyPackage(data: Buffer, manifest: Pick<AppUpdateManifest, "sha512" | "size">): boolean {
  return data.length === manifest.size && sha512(data) === manifest.sha512;
}

export interface LightCheck {
  /** Versão que o electron-updater achou no latest.yml. */
  version: string;
  electron: string;
  platform: string;
  arch: string;
  /** Dá para escrever na pasta resources da instalação. */
  writable: boolean;
  /** Versão cuja atualização leve já falhou antes (usa o instalador completo). */
  failedVersion?: string;
}

/** Decide entre a atualização leve e o instalador completo. `reason` explica a recusa. */
export function chooseLight(manifest: unknown, c: LightCheck): { light: boolean; reason: string } {
  const m = manifest as Partial<AppUpdateManifest> | null;
  if (!m || typeof m !== "object") return { light: false, reason: "sem app-update.json" };
  if (typeof m.sha512 !== "string" || !m.sha512 || typeof m.size !== "number" || m.size <= 0 || typeof m.url !== "string" || !m.url) return { light: false, reason: "app-update.json incompleto" };
  if (/[\\/]|\.\./.test(m.url)) return { light: false, reason: "url do pacote inválida" };
  if (m.version !== c.version) return { light: false, reason: `app-update.json é da versão ${m.version}, não da ${c.version}` };
  if (m.electron !== c.electron) return { light: false, reason: `Electron mudou (${c.electron} → ${m.electron})` };
  if (m.platform !== c.platform || m.arch !== c.arch) return { light: false, reason: `pacote para ${m.platform}-${m.arch}` };
  if (c.failedVersion === c.version) return { light: false, reason: "a atualização leve desta versão já falhou" };
  if (!c.writable) return { light: false, reason: "sem permissão de escrita na pasta de instalação" };
  return { light: true, reason: "mesmo Electron" };
}

// ---- tar (ustar) + gzip, só arquivos e pastas ----

function header(name: string, size: number, dir: boolean): Buffer {
  const h = Buffer.alloc(512);
  let prefix = "";
  let base = name;
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf("/", name.length - 1);
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
    if (cut < 0 || Buffer.byteLength(base) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`caminho longo demais para o pacote: ${name}`);
  }
  const put = (s: string, at: number, len: number) => h.write(s, at, len, "utf8");
  const oct = (n: number, at: number, len: number) => put(n.toString(8).padStart(len - 1, "0") + "\0", at, len);
  put(base, 0, 100);
  oct(dir ? 0o755 : 0o644, 100, 8);
  oct(0, 108, 8);
  oct(0, 116, 8);
  oct(size, 124, 12);
  oct(0, 136, 12);
  h.fill(" ", 148, 156);
  put(dir ? "5" : "0", 156, 1);
  put("ustar\0", 257, 6);
  put("00", 263, 2);
  put(prefix, 345, 155);
  let sum = 0;
  for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return h;
}

/** Empacota `names` (arquivos ou pastas dentro de `root`) em .tar.gz. */
export function packDir(root: string, names: string[], fs: Fs = nodeFs): Buffer {
  const parts: Buffer[] = [];
  const add = (rel: string) => {
    const full = join(root, ...rel.split("/"));
    if (fs.statSync(full).isDirectory()) {
      parts.push(header(rel + "/", 0, true));
      for (const child of fs.readdirSync(full).sort()) add(`${rel}/${child}`);
    } else {
      const data = fs.readFileSync(full);
      parts.push(header(rel, data.length, false), data, Buffer.alloc((512 - (data.length % 512)) % 512));
    }
  };
  for (const n of names) add(n);
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

/** Extrai o .tar.gz em `dest`. Recusa caminhos que saiam de `dest`. Devolve os nomes extraídos. */
export function extractPackage(data: Buffer, dest: string, fs: Fs = nodeFs): string[] {
  const tar = gunzipSync(data);
  const root = resolve(dest);
  const names: string[] = [];
  const text = (at: number, len: number) => {
    const s = tar.subarray(at, at + len);
    const end = s.indexOf(0);
    return s.subarray(0, end < 0 ? len : end).toString("utf8");
  };
  let pos = 0;
  while (pos + 512 <= tar.length) {
    if (tar.subarray(pos, pos + 512).every((b) => b === 0)) break;
    const prefix = text(pos + 345, 155);
    const name = (prefix ? `${prefix}/` : "") + text(pos, 100);
    const size = parseInt(text(pos + 124, 12).trim() || "0", 8);
    const type = text(pos + 156, 1) || "0";
    const rel = posix.normalize(name.replace(/\/+$/, ""));
    const target = resolve(root, ...rel.split("/"));
    if (!rel || rel === "." || rel.startsWith("../") || posix.isAbsolute(name) || /^[a-z]:/i.test(name) || !(target + sep).startsWith(root + sep)) {
      throw new Error(`caminho inválido no pacote: ${name}`);
    }
    pos += 512;
    if (type === "5") fs.mkdirSync(target, { recursive: true });
    else if (type === "0") {
      if (pos + size > tar.length) throw new Error("pacote truncado");
      fs.mkdirSync(dirname(target), { recursive: true });
      fs.writeFileSync(target, tar.subarray(pos, pos + size));
      pos += Math.ceil(size / 512) * 512;
    } else throw new Error(`tipo de entrada não suportado no pacote: ${type}`);
    names.push(rel);
  }
  return names;
}

/**
 * Comando do PowerShell que abre `exe` com `args` num processo separado, sem janela. Os
 * argumentos vão numa string só: entre aspas duplas quando têm espaço (caminhos do Windows não
 * têm aspas duplas) e com as aspas simples dobradas para a string do PowerShell.
 */
export function startProcessCommand(exe: string, args: string[]): string {
  const quote = (a: string) => (a === "" || /[\s"]/.test(a) ? `"${a}"` : a);
  const esc = (s: string) => s.replace(/'/g, "''");
  return `Start-Process -FilePath '${esc(exe)}' -WindowStyle Hidden -ArgumentList '${esc(args.map(quote).join(" "))}'`;
}

/**
 * Script do PowerShell que troca os arquivos depois que o Zênite fecha. Parâmetros:
 * -AppPid (processo a esperar), -Resources (pasta resources da instalação), -Staged (pasta com os
 * arquivos novos), -Exe (Zenite.exe, para reabrir), -Relaunch 1|0, -Result (json com o resultado).
 * Faz cópia de segurança em resources\.zenite-old e volta tudo se qualquer passo falhar.
 */
export const SWAP_SCRIPT = String.raw`param([int]$AppPid, [string]$Resources, [string]$Staged, [string]$Exe, [int]$Relaunch, [string]$Result, [string]$Version)
# Usa .NET em vez de Move-Item/Copy-Item: esses falham com nomes curtos do Windows (C:\Users\JOAOTE~1).
$ErrorActionPreference = 'Stop'
$items = @('app.asar', 'app.asar.unpacked')
$backup = [IO.Path]::Combine($Resources, '.zenite-old')
$log = New-Object System.Collections.Generic.List[string]
function Say($m) { $log.Add(((Get-Date).ToString('HH:mm:ss') + ' ' + $m)) }
function Exists($p) { [IO.File]::Exists($p) -or [IO.Directory]::Exists($p) }
function Remove($p) { if ([IO.Directory]::Exists($p)) { [IO.Directory]::Delete($p, $true) } elseif ([IO.File]::Exists($p)) { [IO.File]::Delete($p) } }
function MoveTo($from, $to) { if ([IO.Directory]::Exists($from)) { [IO.Directory]::Move($from, $to) } else { [IO.File]::Move($from, $to) } }
function CopyTo($from, $to) {
  if ([IO.File]::Exists($from)) { [IO.File]::Copy($from, $to, $true); return }
  [void][IO.Directory]::CreateDirectory($to)
  foreach ($f in [IO.Directory]::GetFiles($from)) { [IO.File]::Copy($f, [IO.Path]::Combine($to, [IO.Path]::GetFileName($f)), $true) }
  foreach ($d in [IO.Directory]::GetDirectories($from)) { CopyTo $d ([IO.Path]::Combine($to, [IO.Path]::GetFileName($d))) }
}
# O app acabou de fechar: os arquivos podem ficar travados por alguns segundos (antivirus, processos filhos).
function Retry($what, [scriptblock]$do) {
  for ($i = 0; $i -lt 60; $i++) {
    try { & $do; return } catch { if ($i -eq 59) { throw "$what : $($_.Exception.Message)" }; Start-Sleep -Milliseconds 500 }
  }
}
function Save($ok, $err) {
  $o = [ordered]@{ ok = $ok; version = $Version; error = $err; log = $log.ToArray(); at = (Get-Date).ToString('o') }
  [IO.File]::WriteAllText($Result, ($o | ConvertTo-Json -Depth 3), (New-Object Text.UTF8Encoding $false))
}
try {
  Say "esperando o processo $AppPid fechar"
  for ($i = 0; $i -lt 240 -and (Get-Process -Id $AppPid -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }
  if (Get-Process -Id $AppPid -ErrorAction SilentlyContinue) { throw 'o Zenite nao fechou em 2 minutos' }
  foreach ($n in $items) { if (-not (Exists ([IO.Path]::Combine($Staged, $n)))) { throw "falta $n nos arquivos novos" } }
  Remove $backup
  [void][IO.Directory]::CreateDirectory($backup)
  $moved = @()
  try {
    foreach ($n in $items) {
      $cur = [IO.Path]::Combine($Resources, $n)
      if (Exists $cur) { Retry "guardar $n" { MoveTo $cur ([IO.Path]::Combine($backup, $n)) }; $moved += $n }
    }
    Say 'copia de seguranca feita'
    foreach ($n in $items) { CopyTo ([IO.Path]::Combine($Staged, $n)) ([IO.Path]::Combine($Resources, $n)) }
    Say 'arquivos novos no lugar'
  } catch {
    Say "falhou, voltando: $($_.Exception.Message)"
    foreach ($n in $items) { try { Remove ([IO.Path]::Combine($Resources, $n)) } catch { } }
    foreach ($n in $moved) { Retry "voltar $n" { MoveTo ([IO.Path]::Combine($backup, $n)) ([IO.Path]::Combine($Resources, $n)) } }
    throw
  }
  try { Remove $backup; Remove $Staged } catch { Say "sobras: $($_.Exception.Message)" }
  Save $true $null
} catch {
  Say $_.Exception.Message
  Save $false $_.Exception.Message
}
if ($Relaunch -eq 1) { Start-Process -FilePath $Exe }
`;
