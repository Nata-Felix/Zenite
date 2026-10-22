import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { GitIdentity, GitRepoState } from "../shared/types";
import { git } from "./universes";

/** O que todo projeto deve ignorar desde o primeiro commit. */
export const DEFAULT_GITIGNORE = [
  "# Segredos",
  ".env",
  ".env.*",
  "!.env.example",
  "",
  "# Dependências e builds",
  "node_modules/",
  "dist/",
  "build/",
  ".venv/",
  "venv/",
  "__pycache__/",
  "",
  "# Sistema e editores",
  ".DS_Store",
  "Thumbs.db",
  "*.log",
];

/** Versão do git instalada, ou null se o git não existe no PATH. */
export async function gitVersion(): Promise<string | null> {
  const r = await git(["--version"], process.cwd());
  return r.code === 0 ? r.stdout.trim() : null;
}

export async function repoState(dir: string): Promise<GitRepoState> {
  if (!dir || !existsSync(dir)) return { isRepo: false, hasCommits: false, top: null, pending: 0 };
  const top = await git(["rev-parse", "--show-toplevel"], dir);
  if (top.code !== 0) return { isRepo: false, hasCommits: false, top: null, pending: 0 };
  const hasCommits = (await git(["rev-parse", "--verify", "HEAD"], dir)).code === 0;
  const pending = (await git(["status", "--porcelain", "-uall"], dir)).stdout.split("\n").filter(Boolean).length;
  return { isRepo: true, hasCommits, top: top.stdout.trim(), pending };
}

export async function identity(dir: string): Promise<GitIdentity> {
  const cwd = dir && existsSync(dir) ? dir : process.cwd();
  const name = (await git(["config", "user.name"], cwd)).stdout.trim();
  const email = (await git(["config", "user.email"], cwd)).stdout.trim();
  return { name, email };
}

/** Grava nome e e-mail do autor dos commits para o usuário (git config --global). */
export async function setIdentity(name: string, email: string): Promise<GitIdentity> {
  await git(["config", "--global", "user.name", name.trim()], process.cwd());
  await git(["config", "--global", "user.email", email.trim()], process.cwd());
  return identity("");
}

/** Acrescenta ao .gitignore as linhas padrão que ainda não estão lá. */
export function ensureGitignore(top: string): string[] {
  const file = join(top, ".gitignore");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  const have = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const missing = DEFAULT_GITIGNORE.filter((l) => l && !l.startsWith("#") && !have.has(l));
  if (!missing.length) return [];
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  appendFileSync(file, `${prefix}${current ? "\n# Adicionado pelo Zênite\n" : ""}${missing.join("\n")}\n`, "utf8");
  return missing;
}

/**
 * Passo 1: transforma a pasta em repositório (se ainda não for) e garante o .gitignore.
 * Não commita nada; devolve o que entraria no primeiro commit.
 */
export async function initRepo(dir: string): Promise<{ ok: boolean; error?: string; files: string[] }> {
  const state = await repoState(dir);
  if (!state.isRepo) {
    const init = await git(["init", "-b", "main"], dir);
    if (init.code !== 0) return { ok: false, error: init.stderr, files: [] };
  }
  const top = (await repoState(dir)).top ?? dir;
  ensureGitignore(top);
  const files = (await git(["status", "--porcelain", "-uall"], top)).stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3));
  return { ok: true, files };
}

/** Passo 2: primeiro commit com tudo que não é ignorado. */
export async function firstCommit(dir: string): Promise<{ ok: boolean; error?: string; needsIdentity?: boolean }> {
  const top = (await repoState(dir)).top;
  if (!top) return { ok: false, error: "A pasta ainda não é um repositório git." };
  await git(["add", "-A"], top);
  const c = await git(["commit", "-m", "Primeiro commit", "-m", `Por quê: início do controle de versão de ${basename(top)} (criado pelo Zênite).`], top);
  if (c.code === 0) return { ok: true };
  const text = `${c.stderr}\n${c.stdout}`;
  if (/user\.(name|email)|tell me who you are/i.test(text)) return { ok: false, needsIdentity: true, error: "O git precisa do seu nome e e-mail para registrar os commits." };
  return { ok: false, error: c.stderr || c.stdout.trim() };
}
