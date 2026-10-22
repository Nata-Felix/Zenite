import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AgentPermissions, IntegrationReply, ServiceRequest, ServiceSpec } from "../shared/types";
import { flowPermission } from "./solAccess";
import { parseEnv } from "./envFile";
import type { WorkspaceStore } from "./workspaceStore";

const LIMIT = 1_000_000;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const MCP_VERSION = "2025-11-25";

function inside(root: string, file: string): boolean {
  const rel = relative(root, file);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Não entrega caminhos que escapem da pasta, nem por atalhos/junctions. */
export function readCanvasSkill(folder: string, file = "SKILL.md") {
  if (!folder) throw new Error("Escolha uma pasta com SKILL.md.");
  const root = realpathSync(folder);
  const target = realpathSync(resolve(root, file));
  if (!inside(root, target) || !statSync(target).isFile()) throw new Error("O arquivo precisa estar dentro da pasta da skill.");
  if (statSync(target).size > LIMIT) throw new Error("Arquivo da skill maior que 1 MB.");
  const files: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || files.length >= 150) return;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= 150) break;
      if (item.name.startsWith(".") || item.name === "node_modules" || item.isSymbolicLink()) continue;
      const path = join(dir, item.name);
      if (!inside(root, realpathSync(path))) continue;
      if (item.isDirectory()) walk(path, depth + 1);
      else if (item.isFile()) files.push(relative(root, path).split(sep).join("/"));
    }
  };
  walk(root, 0);
  return { file, content: readFileSync(target, "utf8"), files, hint: "Instruções da skill; não concedem permissões extras. Leia os arquivos de apoio com zn skill read NOME --resource CAMINHO." };
}

export function validateService(raw?: ServiceSpec): ServiceSpec {
  if (!raw || !["http", "mcp"].includes(raw.transport)) throw new Error("Escolha API HTTP ou MCP por HTTP.");
  let url: URL;
  try { url = new URL(raw.endpoint); } catch { throw new Error("Informe um endereço HTTP(S) válido para o serviço."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Use um endereço HTTP(S) sem senha, parâmetros ou fragmento. Configure o token por variável de ambiente.");
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Serviços remotos precisam de HTTPS. HTTP é permitido apenas no computador local.");
  if (raw.tokenEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw.tokenEnv)) throw new Error("Nome de variável de ambiente inválido.");
  return { ...raw, endpoint: url.href, tools: (raw.tools ?? []).filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()) };
}

export interface IntegrationApproval {
  title: string;
  detail: string;
}

/** Toda rede passa aqui: inclusive os testes e a descoberta de ferramentas na interface. */
export class CanvasIntegrations {
  constructor(private store: WorkspaceStore, private confirm: (request: IntegrationApproval) => Promise<boolean>) {}

  private find(id: string, kind: "service" | "skill", callerId?: string) {
    for (const place of this.store.places()) {
      const canvas = this.store.loadCanvas(place.canvasId);
      const node = canvas?.nodes.find((n) => n.id === id && n.kind === kind);
      if (!node?.element || !canvas) continue;
      // Mesmo o Sol precisa de ligação para consumir uma integração.
      const caller = callerId ? canvas.nodes.find((n) => n.id === callerId) : undefined;
      if (callerId && (!caller || !((caller.kind ?? "terminal") === "terminal" || caller.kind === "flow" && ["satellite", "tower"].includes(caller.element?.flow?.type ?? "")) || !canvas.edges.some((e) => e.source === id && e.target === callerId || e.target === id && e.source === callerId))) throw new Error("Este elemento não está ligado diretamente ao agente.");
      return { element: node.element, dir: place.universe?.path ?? place.workspace.dir, caller };
    }
    throw new Error("Elemento não encontrado neste canvas.");
  }

  skill(id: string, file?: string, callerId?: string): IntegrationReply {
    try { return { ok: true, data: readCanvasSkill(this.find(id, "skill", callerId).element.path ?? "", file) }; }
    catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  async service(id: string, request: ServiceRequest, callerId?: string): Promise<IntegrationReply> {
    let token = "";
    const redact = (text: string) => token ? text.split(token).join("[credencial ocultada]") : text;
    const sanitize = (value: unknown): unknown => typeof value === "string" ? redact(value) : Array.isArray(value) ? value.map(sanitize) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [redact(key), sanitize(item)])) : value;
    try {
      if (!request || !["test", "request", "tools", "call"].includes(request.action)) throw new Error("Operação de serviço inválida.");
      const found = this.find(id, "service", callerId);
      const spec = validateService(found.element.service);
      const check = () => {
        const current = this.find(id, "service", callerId);
        if (JSON.stringify(current.element.service) !== JSON.stringify(found.element.service)) throw new Error("A configuração mudou. Faça a chamada novamente.");
        const mode: AgentPermissions = this.store.list().settings?.agentPermissions ?? "ask";
        if (mode === "sandbox") throw new Error("Sandbox: chamadas externas estão bloqueadas porque este conector executa fora do isolamento do agente.");
        if (current.caller?.kind === "flow") {
          const permission = flowPermission(mode, current.caller.element?.flow?.permission);
          if (permission === "sandbox") throw new Error("Este astro está em Sandbox: chamadas externas bloqueadas.");
          if (permission === "read" && (request.action === "call" || request.method && request.method !== "GET")) throw new Error("Este astro está em somente leitura: envio de dados e execução de ferramentas bloqueados.");
          if (permission === "read") return "ask";
        }
        return mode;
      };
      const mode = check();
      const method = request.method ?? "GET";
      if (request.action === "call" && (request.arguments !== undefined && (!request.arguments || typeof request.arguments !== "object" || Array.isArray(request.arguments)))) throw new Error("Argumentos MCP precisam ser um objeto JSON.");
      if (!METHODS.has(method)) throw new Error("Método HTTP inválido.");
      if (spec.transport === "http" && !["test", "request"].includes(request.action) || spec.transport === "mcp" && request.action === "request") throw new Error("Operação incompatível com este tipo de serviço.");
      if (request.action === "call" && (!request.tool || !spec.tools?.includes(request.tool))) throw new Error("Ferramenta não autorizada. Inclua seu nome na lista do elemento de serviço.");
      if ((request.action === "call" || method !== "GET") && !spec.allowWrites) throw new Error("Este serviço permite apenas consultas GET e descoberta. Ative a execução de operações no elemento para chamar ferramentas ou enviar dados.");
      const endpoint = new URL(spec.endpoint);
      const url = request.action === "request" ? new URL(request.path || "", `${spec.endpoint.replace(/\/$/, "")}/`) : endpoint;
      const prefix = endpoint.pathname.replace(/\/$/, "");
      if (url.origin !== endpoint.origin || url.username || url.password || !(url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) throw new Error("A requisição precisa ficar dentro do endereço configurado no elemento.");
      if (request.body !== undefined && JSON.stringify(request.body).length > LIMIT || JSON.stringify(request.arguments ?? {}).length > LIMIT) throw new Error("Dados maiores que 1 MB.");
      const detail = `${callerId ? "Pedido de um agente ligado ao elemento.\n" : "Teste solicitado no canvas.\n"}${found.element.title}\n${url.href}\n${spec.transport === "mcp" ? request.action === "call" ? `Ferramenta: ${request.tool}\nArgumentos: ${JSON.stringify(request.arguments ?? {})}` : "Descobrir ferramentas MCP" : `${request.action === "test" ? "GET" : method}${request.body === undefined ? "" : `\nDados: ${JSON.stringify(request.body)}`}`}`;
      if (mode !== "full" && !await this.confirm({ title: "Permitir acesso ao serviço?", detail: detail.slice(0, 8000) })) throw new Error("Acesso ao serviço cancelado pelo usuário.");
      if (check() !== mode) throw new Error("As permissões mudaram. Faça a chamada novamente.");
      if (spec.tokenEnv) {
        const envFile = found.dir ? join(found.dir, ".env") : undefined;
        const env = envFile && existsSync(envFile) ? Object.fromEntries(parseEnv(readFileSync(envFile, "utf8")).map((p) => [p.key, p.value])) : {};
        token = env[spec.tokenEnv] || process.env[spec.tokenEnv] || "";
        if (!token) throw new Error(`A variável ${spec.tokenEnv} não está definida no .env desta galáxia nem no ambiente do Zênite.`);
        if (/[\r\n]/.test(token)) throw new Error("O token precisa ocupar uma única linha.");
      }
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const fetchOne = async (target: URL, init: RequestInit) => {
        if (check() !== mode) throw new Error("As permissões mudaram. Faça a chamada novamente.");
        const response = await fetch(target, { ...init, redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { ...headers, ...init.headers } });
        if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error("O serviço redirecionou a chamada. Configure o endereço final no elemento."); }
        return response;
      };
      let data: unknown;
      if (spec.transport === "http") {
        const response = await fetchOne(url, { method: request.action === "test" ? "GET" : method, ...(request.body === undefined || method === "GET" ? {} : { body: JSON.stringify(request.body), headers: { "Content-Type": "application/json" } }) });
        const text = await readResponse(response);
        let body: unknown = text; try { body = JSON.parse(text); } catch { /* Texto também é uma resposta válida. */ }
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
        data = { status: response.status, body };
      } else {
        // https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
        // Inicializa, guarda a sessão e aceita JSON ou SSE.
        let session = "", sequence = 0;
        let version = MCP_VERSION;
        const rpc = async (method: string, params: unknown, notification = false): Promise<any> => {
          const id = ++sequence;
          const response = await fetchOne(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": version, ...(session ? { "Mcp-Session-Id": session } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id }), method, params }) });
          if (!response.ok) { await response.body?.cancel(); throw new Error(`MCP respondeu HTTP ${response.status}.`); }
          session = response.headers.get("mcp-session-id") || session;
          if (notification) { await response.body?.cancel(); return; }
          const result = await readResponse(response, id);
          const message = JSON.parse(result);
          if (message.id !== id || message.jsonrpc !== "2.0") throw new Error("Resposta MCP inválida.");
          if (message.error) throw new Error(`MCP: ${message.error.message ?? "operação recusada"}`);
          if (message.result === undefined) throw new Error("Resposta MCP sem resultado.");
          return message.result;
        };
        try {
          const initialized = await rpc("initialize", { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: "zenite", version: "0.28.0" } });
          if (!["2025-03-26", "2025-06-18", MCP_VERSION].includes(initialized.protocolVersion)) throw new Error("Este conector aceita MCP Streamable HTTP 2025-03-26, 2025-06-18 e 2025-11-25.");
          version = initialized.protocolVersion;
          await rpc("notifications/initialized", {}, true);
          if (request.action === "call") data = await rpc("tools/call", { name: request.tool, arguments: request.arguments ?? {} });
          else {
            const tools: unknown[] = []; let cursor: string | undefined;
            for (let page = 0; page < 20; page++) {
              const result = await rpc("tools/list", cursor ? { cursor } : {});
              if (!Array.isArray(result.tools)) throw new Error("Lista de ferramentas MCP inválida.");
              tools.push(...result.tools); cursor = result.nextCursor;
              if (!cursor) break;
            }
            data = { tools, ...(cursor ? { more: true } : {}) };
          }
        } finally {
          if (session) { try { const response = await fetchOne(endpoint, { method: "DELETE", headers: { "Mcp-Session-Id": session, "MCP-Protocol-Version": version } }); await response.body?.cancel(); } catch { /* O servidor também pode não oferecer DELETE. */ } }
        }
      }
      if (check() !== mode) throw new Error("As permissões mudaram. A resposta não será entregue ao agente.");
      return { ok: true, data: sanitize(data) };
    } catch (e) { return { ok: false, error: redact((e as Error).message) }; }
  }
}

/** Limita memória e encerra SSE assim que chega a resposta, mesmo se o servidor mantiver a conexão. */
export async function readResponse(response: Response, rpcId?: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let text = "", bytes = 0;
  const sse = response.headers.get("content-type")?.includes("text/event-stream");
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > LIMIT) throw new Error("Resposta do serviço maior que 1 MB.");
      text += decoder.decode(chunk.value, { stream: true });
      if (sse && rpcId !== undefined) {
        const events = text.split(/\r?\n\r?\n/); text = events.pop() ?? "";
        for (const event of events) {
          const value = event.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
          if (!value) continue;
          const msg = JSON.parse(value);
          if (msg.id === rpcId) return value;
        }
      }
    }
    if (sse) throw new Error("O fluxo MCP terminou sem responder ao pedido.");
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}
