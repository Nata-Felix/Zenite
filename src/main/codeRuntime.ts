import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import type { CodeLanguage } from "../shared/types";
import { DATA_LIMIT, type DataItem } from "../shared/flowData";
import { missingFrom, readPathNow } from "./freshPath";

const languages = { python: { name: "Python", package: "Python.Python.3.14" }, javascript: { name: "Node.js", package: "OpenJS.NodeJS.LTS" } };
export interface CodeRuntime { file: string; version: string }
interface RuntimeOptions {
  cwd?: string;
  signal?: AbortSignal;
  check(): void;
  confirm(title: string, detail: string): Promise<boolean>;
}
const runtimeEnv = () => ({ ...process.env, PATH: [...missingFrom(process.env.PATH ?? ""), process.env.PATH ?? ""].join(delimiter), PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" });

function languageInfo(language: CodeLanguage) {
  if (language !== "python" && language !== "javascript") throw new Error("Escolha Python ou JavaScript.");
  return languages[language];
}

function command(file: string, args: string[], options: { cwd?: string; signal?: AbortSignal; timeout?: number; input?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...runtimeEnv(), ...(options.cwd ? { NODE_PATH: [join(options.cwd, "node_modules"), process.env.NODE_PATH].filter(Boolean).join(delimiter) } : {}) };
    const child = execFile(file, args, { cwd: options.cwd, signal: options.signal, timeout: options.timeout ?? 10_000, maxBuffer: DATA_LIMIT, encoding: "utf8", windowsHide: true, env }, (error, stdout, stderr) => {
      if (error) reject(new Error(options.signal?.aborted ? "Fluxo parado." : error.killed ? "Execução excedeu o tempo ou o limite de saída." : (stderr.trim() || error.message).slice(0, 1000)));
      else resolve(stdout.trim());
    });
    child.stdin?.on("error", () => {}); // O processo pode terminar antes de consumir a entrada.
    child.stdin?.end(options.input ?? "");
  });
}

/** Testa os executáveis existentes, sem instalar, atualizar ou usar o Electron como Node. */
export async function findCodeRuntime(language: CodeLanguage, signal?: AbortSignal, cwd?: string): Promise<CodeRuntime | undefined> {
  languageInfo(language);
  const dirs = runtimeEnv().PATH.split(delimiter).map(p => p.replace(/^"|"$/g, "")).filter(isAbsolute);
  if (language === "python" && cwd) dirs.unshift(join(cwd, ".venv", process.platform === "win32" ? "Scripts" : "bin"));
  if (process.platform === "win32") {
    if (process.env.ProgramFiles) dirs.push(join(process.env.ProgramFiles, "nodejs"));
    if (process.env.LOCALAPPDATA) {
      const root = join(process.env.LOCALAPPDATA, "Programs", "Python");
      if (existsSync(root)) for (const entry of readdirSync(root, { withFileTypes: true })) if (entry.isDirectory()) dirs.push(join(root, entry.name));
    }
  }
  const names = language === "javascript" ? ["node"] : ["python", "python3", "py"];
  const probe = language === "javascript" ? 'console.log(JSON.stringify({file:process.execPath,version:"Node.js "+process.version}))' : 'import sys,json; print(json.dumps({"file":sys.executable,"version":"Python "+sys.version.split()[0]}))';
  for (const dir of new Set(dirs)) for (const name of names) {
    if (signal?.aborted) throw new Error("Fluxo parado.");
    const file = join(dir, name + (process.platform === "win32" ? ".exe" : ""));
    if (!existsSync(file)) continue;
    try {
      const result = JSON.parse(await command(file, [...(name === "py" ? ["-3"] : []), language === "javascript" ? "-e" : "-c", probe], { signal, timeout: 5000 }));
      if (typeof result.file === "string" && isAbsolute(result.file) && existsSync(result.file) && typeof result.version === "string") return result;
    } catch { if (signal?.aborted) throw new Error("Fluxo parado."); }
  }
}

async function installCodeRuntime(language: CodeLanguage, signal?: AbortSignal): Promise<void> {
  const info = languageInfo(language);
  if (process.platform !== "win32") throw new Error(`Instale ${info.name} pelo gerenciador de pacotes do sistema e tente novamente.`);
  const winget = join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WindowsApps", "winget.exe");
  if (!existsSync(winget)) throw new Error("O WinGet não está disponível. Instale o Instalador de Aplicativo do Windows e tente novamente.");
  await command(winget, ["install", "--id", info.package, "--exact", "--source", "winget", "--silent", "--no-upgrade", "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"], { signal, timeout: 600_000 });
  readPathNow();
}

export async function prepareCodeRuntime(language: CodeLanguage, options: RuntimeOptions, deps = { find: findCodeRuntime, install: installCodeRuntime }): Promise<CodeRuntime> {
  const info = languageInfo(language);
  const found = await deps.find(language, options.signal, options.cwd);
  if (options.signal?.aborted) throw new Error("Fluxo parado.");
  if (found) return found;
  options.check();
  const approved = await options.confirm(`Instalar ${info.name}?`, `${info.name} não foi encontrado neste computador. Instalar pelo WinGet para executar o astro Código?\n\nPacote: ${info.package}\nA instalação baixa arquivos e aceita os termos do pacote e da fonte WinGet. Pode pedir autorização do Windows. Se já houver uma versão instalada, ela será preservada.`);
  if (!approved) throw new Error(`Instalação de ${info.name} cancelada. O código foi preservado.`);
  options.check();
  if (options.signal?.aborted) throw new Error("Fluxo parado.");
  await deps.install(language, options.signal);
  options.check();
  const installed = await deps.find(language, options.signal, options.cwd);
  if (!installed) throw new Error(`${info.name} ainda não foi encontrado. Verifique a instalação e tente novamente.`);
  return installed;
}

export async function executeCode(runtime: CodeRuntime, language: CodeLanguage, source: string, item: DataItem, cwd: string, signal: AbortSignal): Promise<string> {
  languageInfo(language);
  if (!source.trim() || Buffer.byteLength(source) > DATA_LIMIT) throw new Error("Escreva um bloco de código de até 1 MB.");
  if (signal.aborted) throw new Error("Fluxo parado.");
  const input = JSON.stringify(item);
  if (Buffer.byteLength(input) > DATA_LIMIT) throw new Error("Entrada do código maior que 1 MB.");
  const folder = await mkdtemp(join(tmpdir(), "zenite-code-"));
  try {
    const file = join(folder, language === "python" ? "astro.py" : "astro.cjs");
    // A entrada segue como JSON por stdin: texto recebido nunca vira código executável.
    const prelude = 'const { entrada, vars: variaveis } = JSON.parse(require("node:fs").readFileSync(0, "utf8"));\n';
    await writeFile(file, (language === "python" ? "" : prelude) + source, "utf8");
    const python = 'import sys,json,runpy,os; data=json.load(sys.stdin); sys.path.insert(0,os.getcwd()); runpy.run_path(sys.argv[1],init_globals={"entrada":data["entrada"],"variaveis":data["vars"]},run_name="__main__")';
    return await command(runtime.file, language === "python" ? ["-u", "-c", python, file] : [file], { cwd, signal, timeout: 600_000, input });
  } finally {
    // folder é exclusivamente o diretório recém-criado por mkdtemp sob tmpdir().
    await rm(folder, { recursive: true, force: true });
  }
}
