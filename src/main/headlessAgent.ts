import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccountAgent } from "../shared/types";

/**
 * Nó Agente: roda um CLI sem tela, com conta, modelo, esforço e permissão já escolhidos, e devolve a
 * resposta final. Cada execução começa do zero (sem memória da anterior).
 *  - Codex: `codex exec` (prompt pela entrada padrão, resposta final em arquivo com -o).
 *  - Claude Code: `claude -p` (prompt pela entrada padrão).
 *  - Antigravity: `agy --print "prompt"`.
 */
export interface HeadlessRun {
  agent: AccountAgent;
  prompt: string;
  cwd: string;
  model?: string;
  effort?: string;
  permission?: "read" | "sandbox" | "full";
  /** Variáveis da conta (CODEX_HOME, CLAUDE_CONFIG_DIR...) e o PATH. */
  env: Record<string, string>;
  timeoutMs?: number;
}

/** Argumento seguro para o cmd.exe (o Codex e o Claude no Windows são atalhos .cmd do npm). */
const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

export function commandFor(run: HeadlessRun, outFile: string): { file: string; args: string[]; shell: boolean; stdin?: string } {
  if (run.agent === "codex") {
    const perm = run.permission === "full" ? ["--dangerously-bypass-approvals-and-sandbox"] : ["-s", run.permission === "read" ? "read-only" : "workspace-write"];
    const args = [...(run.permission === "full" ? [] : ["--ask-for-approval", "never"]), "exec", "--skip-git-repo-check", ...(run.model ? ["-m", run.model] : []), ...(run.effort ? ["-c", `model_reasoning_effort=${run.effort}`] : []), ...perm, "-C", q(run.cwd), "-o", q(outFile), "-"];
    return { file: "codex", args, shell: true, stdin: run.prompt };
  }
  if (run.agent === "claude") {
    const mode = run.permission === "full" ? "bypassPermissions" : run.permission === "read" ? "plan" : "acceptEdits";
    return { file: "claude", args: ["-p", "--output-format", "text", "--permission-mode", mode, ...(run.model ? ["--model", run.model] : [])], shell: true, stdin: run.prompt };
  }
  const agy = join(process.env.LOCALAPPDATA ?? "", "agy", "bin", "agy.exe");
  const args = ["--print", run.prompt, ...(run.model ? ["--model", run.model] : []), ...(run.effort ? ["--effort", run.effort] : []), ...(run.permission === "full" ? ["--dangerously-skip-permissions"] : run.permission === "sandbox" ? ["--sandbox", "--dangerously-skip-permissions"] : ["--mode", "plan"])];
  return { file: existsSync(agy) ? agy : "agy", args, shell: false };
}

export function runHeadless(run: HeadlessRun): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const dir = mkdtempSync(join(tmpdir(), "zenite-agente-"));
  const outFile = join(dir, "resposta.txt");
  const cmd = commandFor(run, outFile);
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(cmd.file, cmd.args, { cwd: run.cwd, env: { ...process.env, ...run.env }, shell: cmd.shell, windowsHide: true });
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: `Tempo esgotado (${Math.round((run.timeoutMs ?? 0) / 1000)} s).` });
    }, run.timeoutMs ?? 10 * 60_000);
    let done = false;
    const finish = (r: { ok: true; text: string } | { ok: false; error: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      resolve(r);
    };
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => finish({ ok: false, error: `Não foi possível abrir ${cmd.file}: ${e.message}` }));
    child.on("close", (code) => {
      const fromFile = existsSync(outFile) ? readFileSync(outFile, "utf8").trim() : "";
      const text = fromFile || stdout.trim();
      if (code === 0 && text) return finish({ ok: true, text });
      const tail = (stderr || stdout).trim().split(/\r?\n/).slice(-3).join(" ");
      finish({ ok: false, error: `${cmd.file} terminou com código ${code}${tail ? `: ${tail.slice(0, 300)}` : ""}` });
    });
    if (cmd.stdin !== undefined) child.stdin.end(cmd.stdin);
    else child.stdin.end();
  });
}

/** Modelos do Codex que a conta enxerga (models_cache.json da pasta da conta), com os esforços aceitos. */
export function codexModels(codexHome: string): { slug: string; name: string; efforts: string[]; defaultEffort?: string }[] {
  try {
    const raw = JSON.parse(readFileSync(join(codexHome, "models_cache.json"), "utf8"));
    const list = Array.isArray(raw?.models) ? raw.models : [];
    return list
      .filter((m: any) => typeof m?.slug === "string" && m.visibility !== "hide")
      .map((m: any) => ({
        slug: m.slug,
        name: m.display_name || m.slug,
        efforts: Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels.map((l: any) => l?.effort).filter((e: unknown) => typeof e === "string") : [],
        ...(typeof m.default_reasoning_level === "string" ? { defaultEffort: m.default_reasoning_level } : {}),
      }));
  } catch {
    return [];
  }
}

/** Saída de `agy models`: "slug<TAB>Nome". */
export function parseAgyModels(stdout: string): { slug: string; name: string }[] {
  return stdout
    .split(/\r?\n/)
    .map((l) => l.split("\t"))
    .filter((p) => p.length >= 2 && /^[\w.-]+$/.test(p[0].trim()))
    .map(([slug, name]) => ({ slug: slug.trim(), name: name.trim() }));
}
