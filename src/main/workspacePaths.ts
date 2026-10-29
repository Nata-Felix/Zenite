import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { PathGrantInfo, WorkspaceMeta } from "../shared/types";
import type { WorkspaceStore } from "./workspaceStore";

/**
 * Caminho como o disco o vê: resolve "..", barras e junções/links. A parte que ainda não existe
 * (arquivo a criar) é presa ao ancestral real mais próximo.
 */
export function realPath(path: string): string {
  let head = resolve(path);
  const tail: string[] = [];
  for (;;) {
    try {
      return join(realpathSync.native(head), ...tail);
    } catch {
      const up = dirname(head);
      if (up === head) return join(head, ...tail);
      tail.unshift(basename(head));
      head = up;
    }
  }
}

/** `child` é `dir` ou fica dentro dele — por pasta inteira: C:\Projeto não aprova C:\Projeto2. */
export function isInside(child: string, dir: string): boolean {
  const fold = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);
  const rel = relative(fold(dir), fold(child));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Só caminhos absolutos dentro de uma das pastas, comparados depois de normalizados. */
export function pathGuard(dirs: string[]): (path: string) => boolean {
  const roots = dirs.filter((d) => d.trim()).map(realPath);
  return (path) => isAbsolute(path) && roots.some((root) => isInside(realPath(path), root));
}

/** Pasta da galáxia e as dos universos dela. */
export function dirsOf(ws: WorkspaceMeta): string[] {
  return [ws.dir, ...(ws.universes ?? []).map((u) => u.path)].filter((d) => d?.trim());
}

/**
 * Pastas onde o Sol deste canvas pode apontar arquivos/pastas: a da galáxia, as dos universos dela
 * e o que a pessoa já liberou para esta galáxia (outro workspace inteiro ou uma pasta solta).
 */
export function allowedDirs(store: WorkspaceStore, canvasId: string, grants?: PathGrants): string[] {
  const ws = store.place(canvasId)?.workspace;
  if (!ws) return [];
  const workspaces = store.list().workspaces;
  const granted = (grants?.of(ws.id) ?? []).flatMap((g) => {
    if (!g.startsWith(WORKSPACE_GRANT)) return [g];
    const other = workspaces.find((w) => w.id === g.slice(WORKSPACE_GRANT.length));
    return other ? dirsOf(other) : [];
  });
  return [...dirsOf(ws), ...granted];
}

/** Outros workspaces a que o caminho pertence (pela pasta da galáxia ou de um universo). */
export function ownersOf(store: WorkspaceStore, path: string, except?: string): WorkspaceMeta[] {
  return store.list().workspaces.filter((w) => w.id !== except && pathGuard(dirsOf(w))(path));
}

const WORKSPACE_GRANT = "workspace:";
export const workspaceGrant = (id: string) => `${WORKSPACE_GRANT}${id}`;

/**
 * O que a pessoa liberou para o Sol de cada galáxia, fora das pastas dela: `workspace:<id>` (outro
 * workspace inteiro, com os universos que ele tiver) ou o caminho de uma pasta. Quem grava é o
 * processo principal (cifrado), nunca o canvas nem um agente.
 */
export class PathGrants {
  constructor(private grants: Record<string, string[]> = {}, private changed?: (grants: Record<string, string[]>) => void) {}

  of(workspaceId: string): string[] {
    return this.grants[workspaceId] ?? [];
  }

  add(workspaceId: string, entries: string[]): void {
    this.grants[workspaceId] = [...new Set([...this.of(workspaceId), ...entries])];
    this.changed?.(this.entries());
  }

  /** A pessoa tirou uma liberação (opções da galáxia). */
  revoke(workspaceId: string, entry: string): void {
    this.grants[workspaceId] = this.of(workspaceId).filter((g) => g !== entry);
    if (!this.grants[workspaceId].length) delete this.grants[workspaceId];
    this.changed?.(this.entries());
  }

  /** Workspace removido: sai como quem recebeu e como o que foi liberado. */
  forget(workspaceId: string): void {
    delete this.grants[workspaceId];
    for (const id of Object.keys(this.grants)) this.grants[id] = this.grants[id].filter((g) => g !== workspaceGrant(workspaceId));
    this.changed?.(this.entries());
  }

  entries(): Record<string, string[]> {
    return structuredClone(this.grants);
  }
}

/** Liberações da galáxia em palavras, para a pessoa ver e revogar. */
export function describeGrants(store: WorkspaceStore, workspaceId: string, grants: PathGrants): PathGrantInfo[] {
  const workspaces = store.list().workspaces;
  return grants.of(workspaceId).map((entry) => {
    if (!entry.startsWith(WORKSPACE_GRANT)) return { entry, label: entry };
    const other = workspaces.find((w) => w.id === entry.slice(WORKSPACE_GRANT.length));
    return other ? { entry, label: `Galáxia "${other.name}"`, detail: dirsOf(other).join(" · ") } : { entry, label: "Galáxia removida" };
  });
}
