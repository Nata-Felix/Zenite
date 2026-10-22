import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { AgentPermissions, CanvasNode, CanvasState } from "../shared/types";

export type AccessOperation = "read" | "write" | "connect" | "execute" | "network";
export interface DirectAccessRequest {
  operation: AccessOperation;
  /** Caminho absoluto, URL ou comando exato. Nunca é executado pelo gerenciador. */
  resource: string;
  cwd?: string;
}
export interface AccessDecision { allowed: boolean; reason: string }
export interface AccessPrompt extends DirectAccessRequest {
  terminalId: string;
  terminalTitle: string;
  rememberAllowed: boolean;
}
export interface AccessGrant extends DirectAccessRequest { id: string; terminalId: string; terminalTitle: string }
interface Host {
  mediaPath?(node: CanvasNode): string | undefined;
  canvas(terminalId: string): CanvasState | null | undefined;
  permissions(): AgentPermissions | undefined;
  /** A sessão é registrada pelo lançador confiável, nunca pelo agente. */
  alive(terminalId: string): boolean;
  confirm(request: AccessPrompt, signal: AbortSignal): Promise<{ allow: boolean; remember: boolean }>;
}

/** Resolve junctions também em destinos novos, sem conceder o diretório pai inteiro. */
function physicalPath(path: string): string {
  if (!isAbsolute(path) || /[\0\r\n]/.test(path)) throw new Error("Informe um caminho absoluto válido.");
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  if (parent === absolute) throw new Error("Raiz de arquivo inexistente.");
  return resolve(physicalPath(parent), relative(parent, absolute));
}
const keyPath = (path: string) => process.platform === "win32" ? path.toLowerCase() : path;
function inside(root: string, path: string): boolean {
  const rel = relative(keyPath(root), keyPath(path));
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}
function normalize(request: DirectAccessRequest): DirectAccessRequest {
  if (!request || !["read", "write", "connect", "execute", "network"].includes(request.operation) || typeof request.resource !== "string" || !request.resource.trim() || request.resource.length > 32000) throw new Error("Pedido de acesso inválido.");
  if (["read", "write", "connect"].includes(request.operation)) return { operation: request.operation, resource: physicalPath(request.resource) };
  if (request.operation === "execute") {
    if (!request.cwd || /\0/.test(request.resource)) throw new Error("Informe o comando exato e a pasta de execução.");
    return { ...request, cwd: physicalPath(request.cwd) };
  }
  const url = new URL(request.resource);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("Endereço de rede inválido.");
  return { operation: "network", resource: url.href };
}

/**
 * Decisão comum a qualquer adaptador. Não é uma sandbox: o lançador precisa impedir
 * a execução da operação até receber allowed=true. Um terminal nativo não fica protegido
 * apenas porque esta classe existe ou porque o agente conhece seu protocolo.
 */
export class CanvasAccess {
  private grants = new Map<string, AccessGrant & { context: string }>();
  private pending = new Map<string, { terminalId: string; controller: AbortController }>();
  constructor(private host: Host) {}

  list(): AccessGrant[] { return [...this.grants.values()].map(({ context: _context, ...grant }) => grant); }
  revoke(id?: string): void {
    if (id) this.grants.delete(id); else this.grants.clear();
    // Uma revogação enquanto o diálogo está aberto também cancela a decisão em curso.
    for (const request of this.pending.values()) request.controller.abort();
  }
  close(terminalId: string): void {
    for (const [id, grant] of this.grants) if (grant.terminalId === terminalId) this.grants.delete(id);
    for (const request of this.pending.values()) if (request.terminalId === terminalId) request.controller.abort();
  }

  private context(terminalId: string) {
    if (!this.host.alive(terminalId)) throw new Error("O terminal foi encerrado.");
    const canvas = this.host.canvas(terminalId);
    const node = canvas?.nodes.find(n => n.id === terminalId);
    if (!canvas || !node) throw new Error("Terminal não encontrado no canvas.");
    const linkedIds = new Set(canvas.edges.flatMap(e => e.source === terminalId ? [e.target] : e.target === terminalId ? [e.source] : []));
    const linked = canvas.nodes.filter(n => linkedIds.has(n.id));
    const roots = linked.flatMap(n => {
      const media = ["image", "video"].includes(n.kind ?? "") ? this.host.mediaPath?.(n) : undefined;
      const path = media || (["file", "folder"].includes(n.kind ?? "") ? n.element?.path : undefined);
      if (!path) return [];
      try { return [{ id: n.id, kind: media ? "file" : n.kind, path: physicalPath(path), writable: !media }]; } catch { return []; }
    }).sort((a, b) => a.id.localeCompare(b.id));
    const mode = this.host.permissions() ?? "ask";
    const fingerprint = createHash("sha256").update(JSON.stringify({ mode, roots })).digest("hex");
    return { mode, roots, fingerprint, title: node.terminal?.title ?? node.element?.title ?? terminalId };
  }

  async request(terminalId: string, raw: DirectAccessRequest, signal?: AbortSignal): Promise<AccessDecision> {
    let id = "", registered = false;
    try {
      const request = normalize(raw), initial = this.context(terminalId);
      if (signal?.aborted) return { allowed: false, reason: "Acesso cancelado." };
      const isPath = ["read", "write", "connect"].includes(request.operation);
      const connected = isPath && initial.roots.some(root => (request.operation === "read" || root.writable) && (root.kind === "folder" ? inside(root.path, request.resource) : keyPath(root.path) === keyPath(request.resource)));
      // A permissão aqui nunca suspende o isolamento do sistema operacional.
      if (connected) return { allowed: true, reason: "Arquivo ou pasta diretamente conectado ao terminal; isolamento continua valendo." };
      if (initial.mode === "sandbox") return { allowed: false, reason: "Sandbox: acesso direto fora dos elementos conectados está bloqueado. Conecte o recurso e mantenha os limites do isolamento." };
      id = createHash("sha256").update(JSON.stringify({ terminalId, request, context: initial.fingerprint })).digest("hex");
      const grant = this.grants.get(id);
      if (initial.mode === "full" && grant) return { allowed: true, reason: "Permissão específica lembrada nesta sessão." };
      // Não compartilha a resposta de um clique entre operações concorrentes.
      if (this.pending.has(id)) return { allowed: false, reason: "Já há uma decisão pendente para esta operação." };
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      this.pending.set(id, { terminalId, controller });
      registered = true;
      let decision: { allow: boolean; remember: boolean };
      try {
        decision = await this.host.confirm({ ...request, terminalId, terminalTitle: initial.title, rememberAllowed: initial.mode === "full" }, controller.signal);
      } finally { signal?.removeEventListener("abort", cancel); }
      if (controller.signal.aborted || signal?.aborted) return { allowed: false, reason: "Acesso cancelado." };
      const current = this.context(terminalId);
      if (current.fingerprint !== initial.fingerprint || JSON.stringify(normalize(raw)) !== JSON.stringify(request)) return { allowed: false, reason: "As conexões, o caminho ou as permissões mudaram. Solicite o acesso novamente." };
      if (!decision.allow) return { allowed: false, reason: "Acesso cancelado pelo usuário." };
      if (decision.remember && current.mode === "full") this.grants.set(id, { id, terminalId, terminalTitle: current.title, ...request, context: current.fingerprint });
      return { allowed: true, reason: "Operação específica autorizada pelo usuário; isolamento continua valendo." };
    } catch (e) { return { allowed: false, reason: (e as Error).message }; }
    finally { if (registered) this.pending.delete(id); }
  }
}
