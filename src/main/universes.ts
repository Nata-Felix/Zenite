import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { CanvasNode, CanvasState, UniverseMeta, UniverseResult, UniverseStatus, WorkspaceIndex, WorkspaceMeta } from "../shared/types";
import { plural } from "../shared/plural";
import { findSecrets, secretsError } from "./gitMemory";
import { DEFAULT_COPY_PATTERNS, nodeKind } from "../shared/types";
import type { WorkspaceStore } from "./workspaceStore";

interface Git {
  code: number;
  stdout: string;
  stderr: string;
}

function lines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

export function git(args: string[], cwd: string): Promise<Git> {
  return new Promise((done) => {
    execFile(
      "git",
      args,
      { cwd, maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === "number" ? Number((err as { code: number }).code) : 1) : 0;
        done({ code, stdout: stdout.toString(), stderr: (stderr.toString() || (err && !stderr ? err.message : "")).trim() });
      },
    );
  });
}

export interface UniverseHooks {
  /** Encerra os terminais e espera o suficiente para o Windows soltar os arquivos. */
  killTerminals(ids: string[]): Promise<void>;
  /** Apaga arquivos de notas/mídia dos elementos removidos. */
  cleanupNodes(nodes: CanvasNode[]): void;
  /** Copia o texto de uma nota para outra (ao clonar o layout). */
  copyNote(fromId: string, toId: string): void;
  /** Copia o conteúdo de uma tabela para outra (ao clonar o layout). */
  copyTable(fromId: string, toId: string): void;
  /** Copia um arquivo de mídia e devolve o nome da cópia. */
  copyMedia(file: string): string | null;
}

/** Padrão simples de arquivo: `*` (dentro de uma pasta), `?` e `**\/` (qualquer subpasta). */
export function globToRegExp(pattern: string): RegExp {
  let re = "";
  const p = pattern.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*" && p[i + 1] === "*" && p[i + 2] === "/") {
      re += "(?:.*/)?";
      i += 2;
    } else if (c === "*" && p[i + 1] === "*") {
      re += ".*";
      i += 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/**
 * Arquivos fora do git (não rastreados ou ignorados) que batem com os padrões.
 * Pastas ignoradas inteiras (ex.: node_modules/) nem são listadas.
 */
export async function filesToCopy(repoTop: string, patterns: string[]): Promise<string[]> {
  const regexes = patterns.filter((p) => p.trim()).map(globToRegExp);
  if (!regexes.length) return [];
  const list = async (args: string[]) => (await git(["ls-files", "-z", "--others", "--exclude-standard", "--directory", ...args], repoTop)).stdout.split("\0");
  const entries = new Set([...(await list([])), ...(await list(["--ignored"]))]);
  return [...entries]
    .filter((f) => f && !f.endsWith("/") && regexes.some((r) => r.test(f)))
    .filter((f) => {
      try {
        return statSync(join(repoTop, f)).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

/** "Correção do Login!" -> "correcao-do-login" */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "universo";
}

/**
 * Universos paralelos de uma galáxia. Com git: cada universo é um `git worktree` numa
 * branch própria, guardado em `<root>/<galáxia>/<slug>`. Sem git: o universo só separa
 * o canvas (sem isolamento de arquivos).
 */
export class UniverseService {
  constructor(
    private root: string,
    private store: WorkspaceStore,
    private hooks: UniverseHooks,
  ) {}

  async create(workspaceId: string, name: string, cloneLayout: boolean): Promise<UniverseResult> {
    const ws = this.workspace(workspaceId);
    if (!ws) return { ok: false, error: "Galáxia não encontrada." };
    const existing = ws.universes ?? [];
    const title = uniqueName(name.trim() || "Universo", ["Origem", ...existing.map((u) => u.name)]);
    const id = randomUUID();

    let universe: UniverseMeta = { id, name: title, branch: "", path: ws.dir, worktree: "", isolated: false };
    const top = ws.dir ? await git(["rev-parse", "--show-toplevel"], ws.dir) : null;
    if (top && top.code === 0) {
      if ((await git(["rev-parse", "--verify", "HEAD"], ws.dir)).code !== 0) {
        return { ok: false, error: "O repositório ainda não tem nenhum commit. Faça o primeiro commit antes de abrir um universo." };
      }
      const slug = slugify(title);
      let branch = `universo/${slug}`;
      for (let i = 2; (await git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], ws.dir)).code === 0; i++) branch = `universo/${slug}-${i}`;
      let worktree = join(this.root, workspaceId, slug);
      for (let i = 2; existsSync(worktree); i++) worktree = join(this.root, workspaceId, `${slug}-${i}`);
      mkdirSync(join(this.root, workspaceId), { recursive: true });
      const added = await git(["worktree", "add", "-b", branch, worktree, "HEAD"], ws.dir);
      if (added.code !== 0) return { ok: false, error: `Não consegui criar a cópia do projeto: ${added.stderr}` };
      // Arquivos que o git não leva (ex.: .env): cada universo ganha a própria cópia.
      const repoTop = top.stdout.trim();
      for (const f of await filesToCopy(repoTop, ws.copyPatterns ?? DEFAULT_COPY_PATTERNS)) {
        mkdirSync(dirname(join(worktree, f)), { recursive: true });
        copyFileSync(join(repoTop, f), join(worktree, f));
      }
      // A galáxia pode ser uma subpasta do repositório: os terminais abrem na mesma subpasta da cópia.
      const sub = relative(realPath(repoTop), realPath(ws.dir));
      universe = { id, name: title, branch, path: sub ? join(worktree, sub) : worktree, worktree, isolated: true };
    }

    if (cloneLayout) this.store.saveCanvasUnchecked(id, this.cloneCanvas(ws, universe));
    return { ok: true, index: this.store.addUniverse(workspaceId, universe, true) };
  }

  async preview(workspaceId: string): Promise<{ isolated: boolean; files: string[] }> {
    const ws = this.workspace(workspaceId);
    const top = ws?.dir ? await git(["rev-parse", "--show-toplevel"], ws.dir) : null;
    if (!ws || !top || top.code !== 0) return { isolated: false, files: [] };
    return { isolated: true, files: await filesToCopy(top.stdout.trim(), ws.copyPatterns ?? DEFAULT_COPY_PATTERNS) };
  }

  async status(workspaceId: string, universeId: string): Promise<UniverseStatus | null> {
    const found = this.find(workspaceId, universeId);
    if (!found) return null;
    const { ws, universe } = found;
    if (!universe.isolated) return { pending: [], ahead: 0, branch: "", originBranch: "", behind: 0, updating: false, conflicts: [] };
    const wt = universe.worktree;
    const st = await git(["status", "--porcelain", "-uall"], wt);
    const pending = st.stdout.split("\n").filter(Boolean).map((l) => l.slice(3));
    const origin = (await git(["rev-parse", "--abbrev-ref", "HEAD"], ws.dir)).stdout.trim();
    const ahead = Number((await git(["rev-list", "--count", `HEAD..${universe.branch}`], ws.dir)).stdout.trim()) || 0;
    const behind = Number((await git(["rev-list", "--count", `${universe.branch}..HEAD`], ws.dir)).stdout.trim()) || 0;
    const updating = (await git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], wt)).code === 0;
    const conflicts = updating ? lines((await git(["diff", "--name-only", "--diff-filter=U"], wt)).stdout) : [];
    return { pending, ahead, branch: universe.branch, originBranch: origin, behind, updating, conflicts };
  }

  /**
   * Traz a Origem para dentro do universo (merge da branch da Origem na branch do universo).
   * Diferente do merge na Origem, um conflito aqui NÃO é desfeito: fica no universo para ser
   * resolvido (por você ou por um agente) e concluído com finishUpdate.
   */
  async update(workspaceId: string, universeId: string): Promise<UniverseResult<UniverseStatus>> {
    const found = this.find(workspaceId, universeId);
    if (!found?.universe.isolated) return { ok: false, error: "Este universo não tem cópia git." };
    const { universe } = found;
    const st = (await this.status(workspaceId, universeId))!;
    if (st.updating) return { ok: false, error: "Já existe uma atualização em andamento neste universo.", conflicts: st.conflicts };
    if (st.pending.length) {
      return { ok: false, error: `Há ${plural(st.pending.length, "alteração não commitada", "alterações não commitadas")} no universo. Commite antes de atualizar.` };
    }
    if (!st.originBranch || st.originBranch === "HEAD") return { ok: false, error: "A Origem não está numa branch (HEAD solto). Volte a Origem para uma branch e tente de novo." };
    if (st.behind === 0) return { ok: true, index: st };
    const merge = await git(["merge", "--no-ff", "--no-edit", "-m", `Atualizar universo "${universe.name}" com a Origem (${st.originBranch})`, st.originBranch], universe.worktree);
    const after = (await this.status(workspaceId, universeId))!;
    if (merge.code === 0) return { ok: true, index: after };
    if (after.updating) {
      return {
        ok: false,
        error: `${plural(after.conflicts.length, "arquivo ficou", "arquivos ficaram")} em conflito. A Origem não mudou; resolva no universo e clique em Concluir atualização.`,
        conflicts: after.conflicts,
      };
    }
    return { ok: false, error: `Não consegui atualizar: ${merge.stderr || merge.stdout.trim()}` };
  }

  /** Conclui a atualização: confere que não sobrou conflito nem segredo e faz o commit do merge. */
  async finishUpdate(workspaceId: string, universeId: string): Promise<UniverseResult<UniverseStatus>> {
    const found = this.find(workspaceId, universeId);
    if (!found?.universe.isolated) return { ok: false, error: "Este universo não tem cópia git." };
    const wt = found.universe.worktree;
    const st = (await this.status(workspaceId, universeId))!;
    if (!st.updating) return { ok: true, index: st };
    // O que vale é o conteúdo: sobrou marcador <<<<<<< / >>>>>>> em algum arquivo? (Arquivos
    // já resolvidos ainda aparecem como "em conflito" para o git até o add abaixo.)
    const left = [...new Set(lines((await git(["grep", "-l", "-I", "-E", "^(<<<<<<<|>>>>>>>)( |$)"], wt)).stdout))];
    if (left.length) {
      return { ok: false, error: `Ainda há conflito em ${plural(left.length, "arquivo", "arquivos")}: falta escolher entre as versões e apagar os marcadores <<<<<<< e >>>>>>>.`, conflicts: left };
    }
    const secrets = findSecrets(st.pending);
    if (secrets.length) return { ok: false, error: secretsError(secrets) };
    await git(["add", "-A"], wt);
    const c = await git(["commit", "--no-edit"], wt);
    if (c.code !== 0) return { ok: false, error: c.stderr || c.stdout.trim() };
    return { ok: true, index: (await this.status(workspaceId, universeId))! };
  }

  async abortUpdate(workspaceId: string, universeId: string): Promise<UniverseResult<UniverseStatus>> {
    const found = this.find(workspaceId, universeId);
    if (!found?.universe.isolated) return { ok: false, error: "Este universo não tem cópia git." };
    const r = await git(["merge", "--abort"], found.universe.worktree);
    const st = (await this.status(workspaceId, universeId))!;
    if (r.code !== 0 && st.updating) return { ok: false, error: r.stderr || r.stdout.trim() };
    return { ok: true, index: st };
  }

  async commit(workspaceId: string, universeId: string, message: string): Promise<UniverseResult<UniverseStatus>> {
    const found = this.find(workspaceId, universeId);
    if (!found?.universe.isolated) return { ok: false, error: "Este universo não tem cópia git." };
    const wt = found.universe.worktree;
    // No meio de uma atualização, um commit comum fecharia o merge sem checar os conflitos.
    if ((await git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], wt)).code === 0) {
      return { ok: false, error: "Há uma atualização com a Origem em andamento. Termine-a em “Atualizar com a Origem” antes de commitar." };
    }
    await git(["add", "-A"], wt);
    // Mesma trava do `zn commit`: .env fora do .gitignore nunca entra num commit.
    const secrets = findSecrets((await git(["diff", "--cached", "--name-only"], wt)).stdout.split("\n").filter(Boolean));
    if (secrets.length) {
      await git(["reset", "-q"], wt);
      return { ok: false, error: secretsError(secrets) };
    }
    const c = await git(["commit", "-m", message.trim() || `Trabalho no universo ${found.universe.name}`], wt);
    if (c.code !== 0) return { ok: false, error: c.stderr || c.stdout.trim() };
    return { ok: true, index: (await this.status(workspaceId, universeId))! };
  }

  /** Merge do universo na Origem. Em conflito, desfaz o merge e lista os arquivos. */
  async converge(workspaceId: string, universeId: string, keep: boolean): Promise<UniverseResult> {
    const found = this.find(workspaceId, universeId);
    if (!found) return { ok: false, error: "Universo não encontrado." };
    const { ws, universe } = found;
    if (!universe.isolated) {
      return { ok: false, error: "Este universo não tem cópia isolada (o projeto não usa git), então não há o que convergir. Use Colapsar para descartar." };
    }
    const st = (await this.status(workspaceId, universeId))!;
    if (st.updating) return { ok: false, error: "Há uma atualização com a Origem em andamento neste universo. Conclua ou cancele antes de fazer o merge." };
    if (st.pending.length) {
      return { ok: false, error: `Há ${plural(st.pending.length, "alteração não commitada", "alterações não commitadas")} no universo. Commite antes de fazer o merge.` };
    }
    if (st.ahead > 0) {
      const merge = await git(["merge", "--no-ff", "--no-edit", "-m", `Convergir universo "${universe.name}" (${universe.branch})`, universe.branch], ws.dir);
      if (merge.code !== 0) {
        const inMerge = (await git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], ws.dir)).code === 0;
        if (inMerge) {
          const conflicts = (await git(["diff", "--name-only", "--diff-filter=U"], ws.dir)).stdout.split("\n").filter(Boolean);
          await git(["merge", "--abort"], ws.dir);
          return {
            ok: false,
            error: "Os universos entraram em conflito. Nada foi alterado na Origem. Use “Atualizar com a Origem” para resolver os conflitos dentro do universo e depois faça o merge de novo.",
            conflicts,
          };
        }
        return { ok: false, error: `A Origem não aceitou o merge: ${merge.stderr || merge.stdout.trim()}` };
      }
    }
    if (keep) return { ok: true, index: this.store.list() };
    return { ok: true, index: await this.dismantle(ws, universe, "merged") };
  }

  /** Descarta o universo: terminais, canvas, cópia e branch. */
  async collapse(workspaceId: string, universeId: string): Promise<UniverseResult> {
    const found = this.find(workspaceId, universeId);
    if (!found) return { ok: false, error: "Universo não encontrado." };
    return { ok: true, index: await this.dismantle(found.ws, found.universe, "force") };
  }

  /** Ao remover a galáxia: apaga as cópias, mas mantém as branches (o trabalho continua no git). */
  async removeCopies(ws: WorkspaceMeta): Promise<void> {
    for (const u of ws.universes ?? []) if (u.isolated) await this.removeWorktree(ws, u);
  }

  private async dismantle(ws: WorkspaceMeta, universe: UniverseMeta, branch: "merged" | "force"): Promise<WorkspaceIndex> {
    const nodes = this.store.loadCanvas(universe.id)?.nodes ?? [];
    await this.hooks.killTerminals(nodes.filter((n) => nodeKind(n) === "terminal").map((n) => n.id));
    this.hooks.cleanupNodes(nodes);
    if (universe.isolated) {
      await this.removeWorktree(ws, universe);
      await git(["branch", branch === "force" ? "-D" : "-d", universe.branch], ws.dir);
    }
    return this.store.removeUniverse(ws.id, universe.id).index;
  }

  private async removeWorktree(ws: WorkspaceMeta, universe: UniverseMeta): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if ((await git(["worktree", "remove", "--force", universe.worktree], ws.dir)).code === 0) return;
      // No Windows, um processo que acabou de fechar ainda pode segurar arquivos.
      await new Promise((r) => setTimeout(r, 700));
    }
    if (isInside(this.root, universe.worktree)) rmSync(universe.worktree, { recursive: true, force: true });
    await git(["worktree", "prune"], ws.dir);
  }

  /** Copia o canvas da Origem para o universo, apontando terminais para a cópia do projeto. */
  private cloneCanvas(ws: WorkspaceMeta, universe: UniverseMeta): CanvasState {
    const origin = this.store.loadCanvas(ws.id) ?? { version: 1 as const, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    const ids = new Map(origin.nodes.map((n) => [n.id, randomUUID()]));
    const moveCwd = (cwd: string) => {
      if (!ws.dir || !universe.path) return cwd;
      if (!cwd) return universe.path;
      return isInside(ws.dir, cwd) ? join(universe.path, relative(realPath(ws.dir), realPath(cwd))) : cwd;
    };
    const nodes: CanvasNode[] = origin.nodes.map((n) => {
      const id = ids.get(n.id)!;
      if (n.terminal) return { ...n, id, terminal: { ...n.terminal, id, cwd: moveCwd(n.terminal.cwd) } };
      if (!n.element) return { ...n, id };
      const element = { ...n.element, id };
      if (n.kind === "note") this.hooks.copyNote(n.element.id, id);
      if (n.kind === "table") this.hooks.copyTable(n.element.id, id);
      // Arquivo/pasta do projeto: no universo, aponta para a cópia (fora do projeto, continua igual).
      if ((n.kind === "file" || n.kind === "folder") && n.element.path) element.path = moveCwd(n.element.path) || n.element.path;
      if ((n.kind === "image" || n.kind === "video") && n.element.file) element.file = this.hooks.copyMedia(n.element.file) ?? undefined;
      return { ...n, id, element };
    });
    const edges = origin.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ id: `${ids.get(e.source)}->${ids.get(e.target)}`, source: ids.get(e.source)!, target: ids.get(e.target)! }));
    return { version: 1, nodes, edges, viewport: origin.viewport };
  }

  private workspace(id: string): WorkspaceMeta | undefined {
    return this.store.list().workspaces.find((w) => w.id === id);
  }

  private find(workspaceId: string, universeId: string): { ws: WorkspaceMeta; universe: UniverseMeta } | null {
    const ws = this.workspace(workspaceId);
    const universe = ws?.universes?.find((u) => u.id === universeId);
    return ws && universe ? { ws, universe } : null;
  }
}

function uniqueName(wanted: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  if (!lower.has(wanted.toLowerCase())) return wanted;
  for (let i = 2; ; i++) if (!lower.has(`${wanted} ${i}`.toLowerCase())) return `${wanted} ${i}`;
}

/**
 * Caminho canônico para comparar pastas. No Windows o mesmo lugar pode vir com nome curto
 * (C:\Users\JOAOTE~1, comum no %TEMP%) ou longo (C:\Users\João Teste, como o git devolve); sem isso o
 * `relative` entre os dois sai com "..\" e a cópia do universo vai para o lugar errado.
 */
function realPath(p: string): string {
  // A pasta pode ainda não existir (ex.: terminal salvo numa subpasta apagada): expande a parte que existe.
  const full = resolve(p);
  try {
    return realpathSync.native(full);
  } catch {
    const parent = dirname(full);
    return parent === full ? full : join(realPath(parent), basename(full));
  }
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(realPath(parent), realPath(child));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && !/^[a-z]:/i.test(rel));
}
