import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, renameSync } from "node:fs";
import { extname, join, basename, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { CanvasEdge, CanvasNode, CanvasPatch, ElementSpec, TerminalSpec } from "../shared/types";
import { nodeKind, nodeTitle } from "../shared/types";
import { tryCanvasOps, type CanvasOp, type CanvasOpsReply, type CanvasOpsRequest, type CanvasUiAction, type CanvasUiReply, type CanvasUiRequest } from "../shared/canvasOps";
import type { WorkspaceStore } from "./workspaceStore";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif", ".ico"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv", ".ogv"]);

export const DEFAULT_SIZES: Record<ElementSpec["kind"], { width: number; height: number }> = {
  note: { width: 360, height: 300 },
  image: { width: 420, height: 320 },
  video: { width: 520, height: 340 },
  web: { width: 900, height: 600 },
  file: { width: 380, height: 300 },
  folder: { width: 420, height: 420 },
  table: { width: 520, height: 260 },
  flow: { width: 280, height: 132 },
  skill: { width: 400, height: 400 },
  service: { width: 420, height: 520 },
  blackhole: { width: 200, height: 210 },
};

/** Tabela nova: cabeçalho e duas linhas vazias. */
export const NEW_TABLE: string[][] = [
  ["Coluna 1", "Coluna 2", "Coluna 3"],
  ["", "", ""],
  ["", "", ""],
];

/** Garante uma grade retangular de textos (agentes e arquivos antigos podem mandar qualquer coisa). */
export function normalizeTable(raw: unknown): string[][] {
  if (!Array.isArray(raw) || !raw.length) return NEW_TABLE.map((r) => [...r]);
  const rows = raw.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c))) : [String(r ?? "")]));
  const width = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array(width - r.length).fill("")]);
}

/** CSV simples (vírgula ou ponto e vírgula, aspas duplas) para grade. */
export function parseCsv(text: string): string[][] {
  // Separador decidido fora das aspas: "a;b" numa célula não vira coluna.
  const firstLine = (text.split(/\r?\n/, 1)[0] ?? "").replace(/"(?:[^"]|"")*"/g, "");
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return normalizeTable(rows);
}

/** Tabela em Markdown (o que o agente lê com `zn table read`). */
export function tableToMarkdown(rows: string[][]): string {
  const esc = (c: string) => c.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const [head, ...body] = rows;
  return [`| ${head.map(esc).join(" | ")} |`, `|${head.map(() => " --- ").join("|")}|`, ...body.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");
}

export function mediaKind(path: string): "image" | "video" | null {
  const ext = extname(path).toLowerCase();
  return IMAGE_EXT.has(ext) ? "image" : VIDEO_EXT.has(ext) ? "video" : null;
}

export interface ElementEvents {
  noteChanged(id: string, content: string): void;
  tableChanged(id: string, rows: string[][]): void;
  patch(patch: CanvasPatch): void;
  /** Lote de mudanças do Sol para a interface aplicar no canvas aberto. */
  ops?(request: CanvasOpsRequest): void;
  /** Terminal apagado pelo Sol num canvas que não está na tela. */
  killTerminal?(id: string): void;
  /** Terminal criado pelo Sol num canvas fora da tela: já começa a rodar (sem tela). */
  startTerminal?(terminal: TerminalSpec): void;
  /** Pedido de tela do Sol (organizar, enquadrar, print...). */
  ui?(request: CanvasUiRequest): void;
}

/** Quanto esperar a interface aplicar um lote antes de desistir. */
const OPS_TIMEOUT_MS = 8000;

/**
 * Dono dos dados dos elementos que não são terminais: texto das notas (arquivos .md)
 * e arquivos de mídia copiados para o app. Também aplica no canvas as mudanças feitas
 * por agentes — ao vivo se o canvas está na tela, direto no arquivo se não está.
 */
export class ElementService {
  readonly notesDir: string;
  readonly mediaDir: string;
  readonly tablesDir: string;
  readonly trashDir: string;
  private mountedCanvas: string | null = null;
  private pendingOps = new Map<number, (reply: CanvasOpsReply) => void>();
  private pendingUi = new Map<number, (reply: CanvasUiReply) => void>();
  private nextOpsId = 1;

  constructor(
    dataDir: string,
    private store: WorkspaceStore,
    private events: ElementEvents,
  ) {
    this.notesDir = join(dataDir, "notes");
    this.mediaDir = join(dataDir, "media");
    this.tablesDir = join(dataDir, "tables");
    this.trashDir = join(dataDir, "trash");
    mkdirSync(this.notesDir, { recursive: true });
    mkdirSync(this.trashDir, { recursive: true });
    mkdirSync(this.tablesDir, { recursive: true });
    mkdirSync(this.mediaDir, { recursive: true });
    this.purgeTrash();
  }

  /** Canvas que está na tela agora (null se nenhum). */
  mounted(): string | null {
    return this.mountedCanvas;
  }

  setMounted(canvasId: string | null): void {
    this.mountedCanvas = canvasId;
  }

  // ---- notas ----

  readNote(id: string): string {
    try {
      return readFileSync(this.notePath(id), "utf8");
    } catch {
      return "";
    }
  }

  /** `fromAgent`: avisa a interface para mostrar o texto novo. */
  writeNote(id: string, content: string, fromAgent: boolean): void {
    const file = this.notePath(id);
    writeFileSync(`${file}.tmp`, content, "utf8");
    renameSync(`${file}.tmp`, file);
    if (fromAgent) this.events.noteChanged(id, content);
  }

  notePath(id: string): string {
    return join(this.notesDir, `${safeName(id)}.md`);
  }

  // ---- tabelas ----

  readTable(id: string): string[][] {
    try {
      return normalizeTable(JSON.parse(readFileSync(this.tablePath(id), "utf8")));
    } catch {
      return normalizeTable(null);
    }
  }

  writeTable(id: string, rows: string[][], fromAgent: boolean): void {
    const file = this.tablePath(id);
    const clean = normalizeTable(rows);
    writeFileSync(`${file}.tmp`, JSON.stringify(clean), "utf8");
    renameSync(`${file}.tmp`, file);
    if (fromAgent) this.events.tableChanged(id, clean);
  }

  tablePath(id: string): string {
    return join(this.tablesDir, `${safeName(id)}.json`);
  }

  // ---- mídia ----

  /** Copia o arquivo para a pasta de mídia do app. Devolve null se não for imagem/vídeo. */
  importMedia(source: string): { file: string; name: string; kind: "image" | "video" } | null {
    const kind = mediaKind(source);
    if (!kind || !existsSync(source)) return null;
    const file = `${randomUUID()}${extname(source).toLowerCase()}`;
    copyFileSync(source, join(this.mediaDir, file));
    return { file, name: basename(source, extname(source)), kind };
  }

  /** Cópia independente de um arquivo de mídia (ao clonar um canvas). */
  duplicateMedia(file: string): string | null {
    const source = this.mediaPath(file);
    if (!existsSync(source)) return null;
    const copy = `${randomUUID()}${extname(file).toLowerCase()}`;
    copyFileSync(source, join(this.mediaDir, copy));
    return copy;
  }

  mediaPath(file: string): string {
    return join(this.mediaDir, safeName(file));
  }

  /** Apaga os arquivos que pertenciam ao elemento removido. */
  cleanup(node: Pick<CanvasNode, "kind" | "element">): void {
    for (const file of this.ownFiles(node)) rmSync(file, { force: true });
  }

  /** Arquivos que só o elemento usa (texto da nota, linhas da tabela, mídia copiada). */
  private ownFiles(node: Pick<CanvasNode, "kind" | "element">): string[] {
    if (node.kind === "note" && node.element) return [this.notePath(node.element.id)];
    if (node.kind === "table" && node.element) return [this.tablePath(node.element.id)];
    if ((node.kind === "image" || node.kind === "video") && node.element?.file) return [this.mediaPath(node.element.file)];
    return [];
  }

  private trashPath(file: string): string {
    return join(this.trashDir, basename(dirname(file)), basename(file));
  }

  /** Removido pelo usuário: os arquivos vão para a lixeira, e o Ctrl+Z do canvas pode trazer de volta. */
  trash(node: Pick<CanvasNode, "kind" | "element">): void {
    for (const file of this.ownFiles(node)) {
      if (!existsSync(file)) continue;
      const to = this.trashPath(file);
      mkdirSync(dirname(to), { recursive: true });
      renameSync(file, to);
      // A semana da lixeira conta a partir de agora, não da última edição.
      const now = new Date();
      utimesSync(to, now, now);
    }
  }

  /** Desfeita a remoção: os arquivos voltam da lixeira. */
  untrash(node: Pick<CanvasNode, "kind" | "element">): void {
    for (const file of this.ownFiles(node)) {
      const from = this.trashPath(file);
      if (existsSync(from) && !existsSync(file)) renameSync(from, file);
    }
  }

  /** A lixeira guarda uma semana; depois disso ninguém mais desfaz. */
  private purgeTrash(): void {
    const old = Date.now() - 7 * 24 * 60 * 60 * 1000;
    try {
      for (const dir of readdirSync(this.trashDir)) {
        for (const name of readdirSync(join(this.trashDir, dir))) {
          const file = join(this.trashDir, dir, name);
          if (statSync(file).mtimeMs < old) rmSync(file, { force: true });
        }
      }
    } catch {
      // Lixeira ilegível: fica para a próxima abertura.
    }
  }

  // ---- mudanças no canvas feitas por agentes ----

  /** Canvas onde o nó está (null se em nenhum). */
  canvasOf(id: string): string | null {
    return this.findNode(id)?.canvasId ?? null;
  }

  /**
   * Lote de mudanças do Sol (zn canvas/node/draw/flow/recruit). Canvas na tela: a interface aplica
   * (entra no Ctrl+Z) e devolve o estado novo. Fora da tela: aplica direto no arquivo. Lote vazio
   * só lê o estado de agora.
   */
  async canvasOps(canvasId: string, ops: CanvasOp[], callerId?: string): Promise<CanvasOpsReply> {
    if (canvasId === this.mountedCanvas && this.events.ops) {
      const requestId = this.nextOpsId++;
      const reply = await new Promise<CanvasOpsReply>((resolve) => {
        this.pendingOps.set(requestId, resolve);
        this.events.ops!({ requestId, canvasId, callerId, ops });
        setTimeout(() => {
          if (this.pendingOps.delete(requestId)) resolve({ ok: false, error: "O canvas na tela não respondeu. Tente de novo." });
        }, OPS_TIMEOUT_MS);
      });
      // Grava já: o próximo zn lê o canvas salvo, e a interface só grava com atraso.
      if (reply.ok && ops.length) this.store.saveCanvas(canvasId, reply.state);
      return reply;
    }
    // Galáxia ou universo que nunca foi aberto ainda não tem arquivo: começa vazio.
    const canvas = this.store.loadCanvas(canvasId) ?? (this.store.place(canvasId) ? { version: 1 as const, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } : null);
    if (!canvas) return { ok: false, error: "Canvas não encontrado." };
    const { reply, removed } = tryCanvasOps(canvas, ops, { callerId, newId: () => randomUUID(), seed: () => Math.floor(Math.random() * 2 ** 31) });
    if (!reply.ok || !ops.length) return reply;
    for (const n of removed) {
      if (nodeKind(n) === "terminal") this.events.killTerminal?.(n.id);
      else this.trash(n);
    }
    this.store.saveCanvas(canvasId, reply.state);
    const before = new Set(canvas.nodes.map((n) => n.id));
    for (const n of reply.state.nodes) if (n.terminal && !before.has(n.id)) this.events.startTerminal?.(n.terminal);
    return reply;
  }

  /** Pedido de tela do Sol: só vale com o canvas aberto. */
  async ui(canvasId: string, action: CanvasUiAction, target?: string, value?: string): Promise<CanvasUiReply> {
    if (canvasId !== this.mountedCanvas || !this.events.ui) return { ok: false, error: "Este canvas não está aberto na tela. Peça ao usuário para abrir a galáxia." };
    const requestId = this.nextOpsId++;
    return new Promise<CanvasUiReply>((resolve) => {
      this.pendingUi.set(requestId, resolve);
      this.events.ui!({ requestId, canvasId, action, target, value });
      setTimeout(() => {
        if (this.pendingUi.delete(requestId)) resolve({ ok: false, error: "O canvas na tela não respondeu. Tente de novo." });
      }, OPS_TIMEOUT_MS);
    });
  }

  uiReply(requestId: number, reply: CanvasUiReply): void {
    const resolve = this.pendingUi.get(requestId);
    this.pendingUi.delete(requestId);
    resolve?.(reply);
  }

  /** Resposta da interface a um lote. */
  opsReply(requestId: number, reply: CanvasOpsReply): void {
    const resolve = this.pendingOps.get(requestId);
    this.pendingOps.delete(requestId);
    resolve?.(reply);
  }

  /** Cria um elemento ligado ao terminal `callerId`, ao lado dele. */
  addLinkedElement(callerId: string, kind: ElementSpec["kind"], title: string, extra: Partial<ElementSpec> = {}): { canvasId: string; element: ElementSpec } | null {
    const found = this.findNode(callerId);
    if (!found) return null;
    const { canvasId, node: caller, nodes } = found;
    const size = DEFAULT_SIZES[kind];
    const id = randomUUID();
    const element: ElementSpec = { id, kind, title: uniqueTitle(title, nodes.map((n) => nodeTitle(n))), ...extra };
    // Empilha à direita do terminal, abaixo dos elementos que já estão lá.
    const x = caller.x + caller.width + 80;
    const column = nodes.filter((n) => n.x >= x - 1 && n.x < x + 40);
    const y = column.length ? Math.max(...column.map((n) => n.y + n.height)) + 40 : caller.y;
    const node: CanvasNode = { id, kind, x, y, ...size, element };
    const edge: CanvasEdge = { id: `${callerId}->${id}`, source: callerId, target: id };
    this.apply({ type: "add", canvasId, node, edge });
    return { canvasId, element };
  }

  updateElement(id: string, changes: Partial<ElementSpec>): void {
    const found = this.findNode(id);
    if (found) this.apply({ type: "update", canvasId: found.canvasId, id, element: changes });
  }

  private apply(patch: CanvasPatch): void {
    if (patch.canvasId === this.mountedCanvas) {
      // A interface é dona do estado enquanto o canvas está aberto; ela aplica e salva.
      this.events.patch(patch);
      return;
    }
    const canvas = this.store.loadCanvas(patch.canvasId);
    if (!canvas) return;
    if (patch.type === "add") {
      canvas.nodes.push(patch.node);
      if (patch.edge) canvas.edges.push(patch.edge);
    } else {
      const n = canvas.nodes.find((x) => x.id === patch.id);
      if (n?.element) n.element = { ...n.element, ...patch.element };
    }
    this.store.saveCanvas(patch.canvasId, canvas);
  }

  private findNode(id: string): { canvasId: string; node: CanvasNode; nodes: CanvasNode[] } | null {
    for (const { canvasId } of this.store.places()) {
      const canvas = this.store.loadCanvas(canvasId);
      const node = canvas?.nodes.find((n) => n.id === id);
      if (canvas && node) return { canvasId, node, nodes: canvas.nodes };
    }
    return null;
  }
}

/** "Nota", "Nota 2", "Nota 3"... sem repetir nomes do canvas. */
export function uniqueTitle(wanted: string, existing: string[]): string {
  const base = wanted.trim() || "Sem nome";
  const taken = new Set(existing.map((t) => t.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

/** Impede que um id/nome de arquivo saia da pasta (ex.: "../"). */
function safeName(name: string): string {
  return basename(name).replace(/[^\w.\-]/g, "_");
}
