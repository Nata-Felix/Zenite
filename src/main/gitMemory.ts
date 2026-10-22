import { git } from "./universes";

/** .env e variantes com segredos (exemplos/modelos podem ir para o git). */
const SECRET_FILE = /(^|\/)\.env(\.(?!example$|sample$|template$)[^/]+)?$/i;

/** Arquivos que parecem guardar segredos (.env e variantes). */
export function findSecrets(files: string[]): string[] {
  return files.filter((f) => SECRET_FILE.test(f));
}

/** Mensagem padrão quando um commit esbarra em segredos. */
export function secretsError(files: string[]): string {
  return (
    `Recusado: ${files.join(", ")} parece conter segredos e não está no .gitignore. ` +
    "Use o botão Variáveis (.env) → Adicionar ao .gitignore. Nada foi commitado."
  );
}

export interface AgentCommit {
  title: string;
  why: string;
  todo?: string;
  /** Nome do terminal/agente que está commitando. */
  agent: string;
}

/**
 * Commit no formato padrão do Zênite:
 *   Título
 *
 *   Por quê: ...
 *
 *   Pendente: ...
 *
 *   Agente: ...
 * Commita todas as alterações da pasta (respeitando o .gitignore) e recusa segredos.
 */
export async function commitAsAgent(dir: string, c: AgentCommit): Promise<{ hash: string; files: string[] }> {
  const title = c.title.trim().replace(/\s+/g, " ");
  const why = c.why.trim();
  if (!title) throw new Error("Informe o título do commit (o que mudou, numa linha).");
  if (!why) throw new Error('Informe o porquê: --why "motivo da mudança". É ele que vira memória para os próximos agentes.');
  if ((await git(["rev-parse", "--show-toplevel"], dir)).code !== 0) throw new Error("Esta pasta não é um repositório git. Peça ao usuário para ativar o git na galáxia.");

  await git(["add", "-A"], dir);
  const staged = (await git(["diff", "--cached", "--name-only"], dir)).stdout.split("\n").filter(Boolean);
  if (!staged.length) throw new Error("Nada para commitar: nenhuma alteração desde o último commit.");
  const secrets = findSecrets(staged);
  if (secrets.length) {
    await git(["reset", "-q"], dir);
    throw new Error(secretsError(secrets));
  }

  const args = ["commit", "-m", title, "-m", `Por quê: ${why}`];
  if (c.todo?.trim()) args.push("-m", `Pendente: ${c.todo.trim()}`);
  args.push("-m", `Agente: ${c.agent}`);
  const r = await git(args, dir);
  if (r.code !== 0) {
    const text = `${r.stderr}\n${r.stdout}`;
    if (/user\.(name|email)|tell me who you are/i.test(text)) throw new Error("O git não sabe o nome/e-mail do autor. Peça ao usuário para configurar em Ativar git no Zênite.");
    throw new Error(r.stderr || r.stdout.trim());
  }
  const hash = (await git(["rev-parse", "--short", "HEAD"], dir)).stdout.trim();
  return { hash, files: staged };
}

export interface HistoryEntry {
  hash: string;
  branch: string;
  title: string;
  when: string;
  author: string;
}

/** Últimos commits de todas as branches (Origem e universos), com filtros opcionais. */
export async function recentHistory(dir: string, opts: { limit?: number; grep?: string; file?: string } = {}): Promise<HistoryEntry[]> {
  const args = ["log", "--all", `-n${Math.max(1, Math.min(200, opts.limit ?? 15))}`, "--format=%h%x09%D%x09%s%x09%cr%x09%an"];
  if (opts.grep) args.push("-i", `--grep=${opts.grep}`);
  if (opts.file) args.push("--", opts.file);
  const r = await git(args, dir);
  if (r.code !== 0) return [];
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, refs, title, when, author] = line.split("\t");
      // "HEAD -> main, universo/x" -> "main"; sem ref, fica vazio.
      const branch = (refs ?? "")
        .split(",")
        .map((x) => x.replace("HEAD -> ", "").trim())
        .filter((x) => x && x !== "HEAD" && !x.startsWith("tag:"))[0] ?? "";
      return { hash, branch, title, when, author };
    });
}

/** Quantos arquivos estão alterados e sem commit numa pasta (null se não for git). */
export async function pendingCount(dir: string): Promise<number | null> {
  const r = await git(["status", "--porcelain", "-uall"], dir);
  return r.code === 0 ? r.stdout.split("\n").filter(Boolean).length : null;
}

/** Commits de todas as branches desde um instante (ms), do mais novo para o mais antigo. */
export async function commitsSince(dir: string, since: number, limit = 20): Promise<HistoryEntry[]> {
  const r = await git(["log", "--all", `-n${limit}`, `--since=${Math.floor(since / 1000)}`, "--format=%h%x09%D%x09%s%x09%cr%x09%an"], dir);
  if (r.code !== 0) return [];
  return r.stdout.split("\n").filter(Boolean).map((line) => {
    const [hash, refs, title, when, author] = line.split("\t");
    const branch = (refs ?? "").split(",").map((x) => x.replace("HEAD -> ", "").trim()).filter((x) => x && x !== "HEAD" && !x.startsWith("tag:"))[0] ?? "";
    return { hash, branch, title, when, author };
  });
}
