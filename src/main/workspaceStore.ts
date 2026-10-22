import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { AccountAgent, AccountMeta, AppSettings, CanvasPlace, CommitProposal, CanvasState, UniverseMeta, WorkspaceIndex, WorkspaceMeta } from "../shared/types";

/**
 * Guarda a lista de workspaces (index.json) e um canvas por workspace (<id>.json)
 * dentro de `<dataDir>/workspaces`. Escritas são atômicas (tmp + rename).
 */
export class WorkspaceStore {
  private dir: string;
  private indexFile: string;
  private trustedState: Map<string, unknown> | null = null;

  /** Congela a origem das leituras durante a sessão; só métodos do app atualizam este estado. */
  protectRuntimeState(): void {
    this.trustedState = null;
    const index = this.list();
    const snapshots = new Map<string, unknown>([[this.indexFile, structuredClone(index)]]);
    for (const place of this.places()) {
      const file = this.canvasFile(place.canvasId);
      snapshots.set(file, readJson<CanvasState>(file));
    }
    this.trustedState = snapshots;
  }

  private read<T>(file: string): T | null {
    return this.trustedState ? structuredClone((this.trustedState.get(file) ?? null) as T | null) : readJson<T>(file);
  }

  private write(file: string, value: unknown): void {
    writeAtomic(file, value);
    this.trustedState?.set(file, structuredClone(value));
  }

  constructor(private dataDir: string, private canvasPolicy: (id: string, state: CanvasState) => CanvasState = (_id, state) => state) {
    this.dir = join(dataDir, "workspaces");
    this.indexFile = join(this.dir, "index.json");
  }

  list(): WorkspaceIndex {
    const index = this.read<WorkspaceIndex>(this.indexFile);
    if (index?.version === 1 && index.workspaces.length > 0) {
      if (!index.workspaces.some((w) => w.id === index.activeId)) index.activeId = index.workspaces[0].id;
      return index;
    }
    return this.bootstrap();
  }

  create(name: string, dir: string): WorkspaceIndex {
    const index = this.list();
    const ws: WorkspaceMeta = { id: randomUUID(), name: name.trim() || "Sem nome", dir: dir.trim() };
    index.workspaces.push(ws);
    index.activeId = ws.id;
    return this.writeIndex(index);
  }

  /** Registra uma galáxia importada sem abrir seus terminais nem mudar a galáxia ativa. */
  registerImported(workspace: WorkspaceMeta, canvases: { id: string; state: CanvasState }[]): WorkspaceIndex {
    const index = this.list();
    if (index.workspaces.some(w => w.id === workspace.id)) throw new Error("A galáxia importada já existe.");
    const written: string[] = [];
    try {
      for (const canvas of canvases) {
        if (!/^[a-f0-9-]{36}$/.test(canvas.id) || index.workspaces.some(w => w.id === canvas.id || w.universes?.some(u => u.id === canvas.id))) throw new Error("Identificador de canvas inválido.");
        this.write(this.canvasFile(canvas.id), this.canvasPolicy(canvas.id, canvas.state));
        written.push(this.canvasFile(canvas.id));
      }
      index.workspaces.push(workspace);
      return this.writeIndex(index);
    } catch (error) {
      for (const file of written) { rmSync(file, { force: true }); this.trustedState?.delete(file); }
      throw error;
    }
  }

  update(id: string, changes: Partial<Omit<WorkspaceMeta, "id">>): WorkspaceIndex {
    const index = this.list();
    const ws = index.workspaces.find((w) => w.id === id);
    if (ws) {
      if (changes.name !== undefined) ws.name = changes.name.trim() || ws.name;
      if (changes.dir !== undefined) ws.dir = changes.dir.trim();
      if (changes.agentCommits !== undefined) ws.agentCommits = changes.agentCommits;
      if (changes.copyPatterns !== undefined) ws.copyPatterns = changes.copyPatterns.map((p) => p.trim()).filter(Boolean);
    }
    return this.writeIndex(index);
  }

  /**
   * Remove o workspace (e os canvases dos universos dele) e devolve os ids dos
   * terminais que estavam neles. As cópias git dos universos ficam com quem chamou.
   */
  remove(id: string): { index: WorkspaceIndex; terminalIds: string[] } {
    const index = this.list();
    const ws = index.workspaces.find((w) => w.id === id);
    if (index.workspaces.length <= 1 || !ws) {
      return { index, terminalIds: [] };
    }
    const canvasIds = [id, ...(ws.universes ?? []).map((u) => u.id)];
    const terminalIds = canvasIds.flatMap((c) => this.loadCanvas(c)?.nodes.map((n) => n.id) ?? []);
    index.workspaces = index.workspaces.filter((w) => w.id !== id);
    if (index.activeId === id) index.activeId = index.workspaces[0].id;
    canvasIds.forEach((c) => { rmSync(this.canvasFile(c), { force: true }); this.trustedState?.delete(this.canvasFile(c)); });
    return { index: this.writeIndex(index), terminalIds };
  }

  addProposal(workspaceId: string, p: Omit<CommitProposal, "id" | "at">): { index: WorkspaceIndex; proposal: CommitProposal } {
    const index = this.list();
    const ws = index.workspaces.find((w) => w.id === workspaceId);
    const proposal: CommitProposal = { ...p, id: randomUUID(), at: new Date().toISOString() };
    if (ws) ws.proposals = [...(ws.proposals ?? []), proposal];
    return { index: this.writeIndex(index), proposal };
  }

  removeProposal(workspaceId: string, proposalId: string): WorkspaceIndex {
    const index = this.list();
    const ws = index.workspaces.find((w) => w.id === workspaceId);
    if (ws) ws.proposals = (ws.proposals ?? []).filter((p) => p.id !== proposalId);
    return this.writeIndex(index);
  }

  setSettings(settings: AppSettings): WorkspaceIndex {
    const index = this.list();
    index.settings = { ...index.settings, ...settings };
    return this.writeIndex(index);
  }

  createAccount(name: string, agent: AccountAgent): { index: WorkspaceIndex; account: AccountMeta } {
    const index = this.list();
    const accounts = index.accounts ?? [];
    let title = name.trim() || "Conta";
    const taken = new Set(accounts.filter((a) => a.agent === agent).map((a) => a.name.toLowerCase()));
    for (let i = 2; taken.has(title.toLowerCase()); i++) title = `${name.trim() || "Conta"} ${i}`;
    const account: AccountMeta = { id: randomUUID(), name: title, agent };
    index.accounts = [...accounts, account];
    return { index: this.writeIndex(index), account };
  }

  removeAccount(id: string): WorkspaceIndex {
    const index = this.list();
    index.accounts = (index.accounts ?? []).filter((a) => a.id !== id);
    return this.writeIndex(index);
  }

  account(id: string): AccountMeta | undefined {
    return this.list().accounts?.find((a) => a.id === id);
  }

  /** Todos os canvases: a Origem de cada galáxia e cada universo. */
  places(): CanvasPlace[] {
    return this.list().workspaces.flatMap((w) => [
      { canvasId: w.id, workspace: w },
      ...(w.universes ?? []).map((u) => ({ canvasId: u.id, workspace: w, universe: u })),
    ]);
  }

  place(canvasId: string): CanvasPlace | null {
    return this.places().find((p) => p.canvasId === canvasId) ?? null;
  }

  addUniverse(workspaceId: string, universe: UniverseMeta, activate: boolean): WorkspaceIndex {
    const index = this.list();
    const ws = index.workspaces.find((w) => w.id === workspaceId);
    if (ws) {
      ws.universes = [...(ws.universes ?? []), universe];
      if (activate) ws.activeUniverse = universe.id;
    }
    return this.writeIndex(index);
  }

  /** Tira o universo da lista e apaga o canvas dele; devolve os ids dos terminais. */
  removeUniverse(workspaceId: string, universeId: string): { index: WorkspaceIndex; terminalIds: string[] } {
    const index = this.list();
    const ws = index.workspaces.find((w) => w.id === workspaceId);
    const terminalIds = this.loadCanvas(universeId)?.nodes.map((n) => n.id) ?? [];
    if (ws) {
      ws.universes = (ws.universes ?? []).filter((u) => u.id !== universeId);
      if (ws.activeUniverse === universeId) delete ws.activeUniverse;
    }
    rmSync(this.canvasFile(universeId), { force: true });
    this.trustedState?.delete(this.canvasFile(universeId));
    return { index: this.writeIndex(index), terminalIds };
  }

  setActiveUniverse(workspaceId: string, universeId: string | null): WorkspaceIndex {
    const index = this.list();
    const ws = index.workspaces.find((w) => w.id === workspaceId);
    if (ws) {
      if (universeId && (ws.universes ?? []).some((u) => u.id === universeId)) ws.activeUniverse = universeId;
      else delete ws.activeUniverse;
    }
    return this.writeIndex(index);
  }

  setActive(id: string): WorkspaceIndex {
    const index = this.list();
    if (index.workspaces.some((w) => w.id === id)) index.activeId = id;
    return this.writeIndex(index);
  }

  loadCanvas(id: string): CanvasState | null {
    const state = this.read<CanvasState>(this.canvasFile(id));
    return state?.version === 1 ? this.canvasPolicy(id, state) : null;
  }

  saveCanvas(id: string, state: CanvasState): void {
    // Não recria o arquivo de um workspace/universo que acabou de ser removido.
    if (!this.place(id)) return;
    // Uma transferência já pode ter sido salva enquanto a tela antiga era desmontada.
    if ((state.revision ?? 0) < (this.loadCanvas(id)?.revision ?? 0)) return;
    this.write(this.canvasFile(id), this.canvasPolicy(id, state));
  }

  /** Grava sem checar se o canvas já está registrado (usado logo antes de registrar um universo). */
  saveCanvasUnchecked(id: string, state: CanvasState): void {
    this.write(this.canvasFile(id), this.canvasPolicy(id, state));
  }

  private canvasFile(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  /** Primeiro uso: cria o workspace "Principal" e migra o canvas.json antigo, se existir. */
  private bootstrap(): WorkspaceIndex {
    const ws: WorkspaceMeta = { id: randomUUID(), name: "Principal", dir: "" };
    const legacy = join(this.dataDir, "canvas.json");
    const legacyState = readJson<CanvasState>(legacy);
    if (legacyState?.version === 1) {
      writeAtomic(this.canvasFile(ws.id), legacyState);
      renameSync(legacy, `${legacy}.migrado`);
    }
    return this.writeIndex({ version: 1, workspaces: [ws], activeId: ws.id });
  }

  private writeIndex(index: WorkspaceIndex): WorkspaceIndex {
    this.write(this.indexFile, index);
    return index;
  }
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeAtomic(file: string, value: unknown): void {
  const dir = join(file, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, file);
}
