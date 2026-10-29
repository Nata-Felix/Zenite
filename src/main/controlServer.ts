import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { existsSync, statSync } from "node:fs";
import { basename, extname, resolve as resolvePath } from "node:path";
import { fileInfo, listDir } from "./files";
import { humanSize, shortDate } from "../shared/format";
import { parseCsv, tableToMarkdown } from "./elements";
import type { AccountAgent, AccountMeta, AgentProvider, CanvasState, ElementKind, ElementSpec, FlowSpec, FlowStatus, NodeKind, TaskStatus, TerminalSpec, TerminalUsage } from "../shared/types";
import { KIND_LABEL, nodeKind, TASK_STATES, type TaskState } from "../shared/types";
import { describeCanvas, labelOf, type CanvasOp, type CanvasOpsReply, type CanvasUiAction, type CanvasUiReply } from "../shared/canvasOps";
import type { RoleStore, SolLog } from "./solTools";
import {
  AGENT_LABEL,
  EFFORTS,
  ESC,
  SLASH,
  agentOf,
  listCommands,
  looksBusy,
  modelAndEffortOf,
  parseMenu,
  parseStatusFields,
  pick,
  runSlash,
  setModelEffort,
  settle,
  slide,
  whenIdle,
  withModelAndEffort,
  type AgentTerm,
} from "./agentControl";
import type { PtyManager } from "./ptyManager";
import type { WebDriver } from "./webDriver";
import type { WebInspector } from "./webInspector";
import type { IntegrationReply, ServiceRequest } from "../shared/types";

/** Um terminal como o CLI enxerga: id e nome mostrado no canvas. */
export interface Peer {
  id: string;
  title: string;
  /** Sol: o orquestrador da galáxia. */
  sun?: boolean;
}

/** Elemento do canvas (terminal, nota, imagem, vídeo ou site). */
export interface Item extends Peer {
  kind: ElementKind;
  /** Imagem/vídeo: arquivo na pasta de mídia. Nunca é mostrado para quem não está ligado. */
  file?: string;
  url?: string;
  /** Arquivo/pasta: caminho no disco. Nunca é mostrado para quem não está ligado. */
  path?: string;
  /** Torre de controle: o roteiro dela em palavras. */
  tower?: TowerMenu;
  /** Executor de rota de Torre: só é alcançado por ela (o Sol delega pela Torre). */
  viaTower?: { tower: string; route: string }[];
}

export interface TowerMenu {
  /** Modo "Classificar e executar". */
  executes: boolean;
  /** Ligada ao Sol, ele só delega por ela. */
  exclusive: boolean;
  routes: { label: string; criteria?: string; executor: string }[];
}

/**
 * Quem é o terminal, o que está ligado a ele (pode usar) e o resto do canvas
 * (pode saber que existe, mas não usar).
 */
export interface Neighborhood {
  me: Peer;
  /** Onde o terminal está: galáxia e universo (null = Origem). */
  place?: { galaxy: string; universe: string | null; branch: string | null; dir: string };
  linked: Item[];
  others: Item[];
}

export type GraphLookup = (terminalId: string) => Neighborhood | null;

/** Limite de uso dos agentes, mantido pelo processo principal (agentUsage.ts). */
export interface UsageInfo {
  /** Resumo para o zn list (ex.: "uso 5h 92%, semana 30%"). */
  note(id: string): string | undefined;
  /** Limite atingido: até quando (ms; 0 se não se sabe). null quando há folga. */
  blocked(id: string): { until: number } | null;
  /** Lê o uso de novo agora (antes de um zn list ou zn ask). */
  refresh?(): Promise<void>;
}

/** Git na pasta do terminal que chamou (Origem ou cópia do universo). */
export interface GitOps {
  commit(callerId: string, c: { title: string; why: string; todo?: string; agent: string }): Promise<{ hash: string; files: string[] } | { proposed: true; files: string[] }>;
  history(
    callerId: string,
    opts: { limit?: number; grep?: string; file?: string },
  ): Promise<{ commits: { hash: string; branch: string; title: string; when: string; author: string }[]; pending: { place: string; files: number }[] }>;
}

/** Operações sobre elementos, implementadas pelo processo principal. */
export interface ElementOps {
  isolatedSession?(id: string): boolean;
  isolatedRequest?(id: string, route: string, body: Record<string, unknown>): Promise<void>;
  directFile?(id: string, body: Record<string, unknown>): Promise<object>;
  integrationSkill?(id: string, file: string | undefined, caller: string): IntegrationReply;
  integrationService?(id: string, request: ServiceRequest, caller: string): Promise<IntegrationReply>;
  readNote(id: string): string;
  writeNote(id: string, content: string, fromAgent: boolean): void;
  mediaPath(file: string): string;
  importMedia(path: string): { file: string; name: string; kind: "image" | "video" } | null;
  cleanup(node: { kind?: ElementKind; element?: ElementSpec }): void;
  addLinkedElement(callerId: string, kind: ElementSpec["kind"], title: string, extra?: Partial<ElementSpec>): { element: ElementSpec } | null;
  updateElement(id: string, changes: Partial<ElementSpec>): void;
  readTable(id: string): string[][];
  writeTable(id: string, rows: string[][], fromAgent: boolean): void;
  /** Controle do site, se ele estiver aberto na tela. */
  web(id: string): WebDriver | null;
  /** O "F12" do site (console, rede, código), se ele estiver aberto na tela. */
  webInspect?(id: string): WebInspector | null;
  /** Começa o fluxo a partir deste astro, com o texto em {{entrada}} (não espera terminar). */
  /** callerId: quem pediu (zn flow run) e recebe a resposta de uma Torre que executa. */
  runFlow(id: string, input: string, callerId?: string): { ok: boolean; error?: string };
  /** Sol: canvas onde o terminal está e o lote de mudanças nele (vazio = só ler). */
  canvasOf?(id: string): string | null;
  canvasOps?(canvasId: string, ops: CanvasOp[], callerId: string): Promise<CanvasOpsReply>;
  /** Contas com login separado (o Sol recruta numa conta pelo nome). */
  accounts?(): AccountMeta[];
  /** Pedidos de tela (organizar, enquadrar, visão resumida, fundo, reiniciar terminal). */
  ui?(canvasId: string, action: CanvasUiAction, target?: string, value?: string): Promise<CanvasUiReply>;
  /** Print do canvas na tela (enquadrado no nó, se houver); devolve o caminho do PNG. */
  screenshot?(canvasId: string, target?: string): Promise<string>;
  /** Exporta o canvas para um arquivo .zenite, sem perguntar onde. */
  exportCanvas?(state: CanvasState, path: string, kinds: NodeKind[]): number;
  /** Encerra o processo do terminal (o nó continua no canvas). */
  stopTerminal?(id: string): boolean;
  /** Reinicia um terminal de um canvas fora da tela (na tela, quem reinicia é a interface). */
  restartTerminal?(id: string): Promise<{ ok: boolean; error?: string }>;
  /** Astros rodando agora e o último andamento de cada um. */
  flowStop?(id: string): boolean;
  flowSignal?(id: string, input?: string): { ok: boolean; error?: string };
  flowStatus?(): { running: string[]; statuses: Record<string, FlowStatus> };
  roles?: RoleStore;
  /** Terminal salvo no canvas (comando, conta) e o uso que o Zênite já mediu dele. */
  terminalSpec?(id: string): TerminalSpec | undefined;
  usageOf?(id: string): TerminalUsage | undefined;
  /** Cópia independente de uma mídia (zn node duplicate). */
  duplicateMedia?(file: string): string | null;
  solLog?: SolLog;
  /** Selos de andamento mudaram: a interface redesenha e o arquivo guarda. */
  tasksChanged?(all: Record<string, TaskStatus>): void;
  /** Selos guardados da última vez que o Zênite rodou. */
  savedTasks?(): Record<string, TaskStatus>;
  /** Universos da galáxia do terminal: listar, criar, status, commit, merge, apagar. */
  universes?(callerId: string, action: string, body: Record<string, unknown>): Promise<object>;
  /** Canvas e pasta de um universo da galáxia do terminal (para recrutar lá). */
  universeCanvas?(callerId: string, name: string): { canvasId: string; dir: string } | null;
}

/** Programa de cada agente que o Sol pode recrutar (os mesmos do "Novo terminal"). */
const RECRUIT: Record<string, { command: string; agent?: AccountAgent; provider?: AgentProvider }> = {
  claude: { command: "claude", agent: "claude" },
  codex: { command: "codex", agent: "codex" },
  antigravity: { command: "agy", agent: "antigravity" },
  agy: { command: "agy", agent: "antigravity" },
  openrouter: { command: "claude", provider: "openrouter" },
  grok: { command: "grok" },
  shell: { command: "" },
};
const MAX_OPS = 200;

type Ptys = Pick<PtyManager, "has" | "verify" | "write" | "snapshot" | "acceptsPaste"> & Partial<Pick<PtyManager, "quiet">>;

/** Lista de comandos de barra de cada programa, guardada por meia hora (descobrir leva alguns segundos). */
const COMMANDS_TTL_MS = 30 * 60_000;

/** O papel é entregue quando o agente recrutado termina de abrir: aberto há 4 s e quieto há 2,5 s. */
const ROLE_OPEN_MS = 4000;
const ROLE_QUIET_MS = 2500;
const ROLE_GIVE_UP_MS = 120_000;

/**
 * Pedido de `zn ask` esperando o `zn reply`. Enquanto o CLI de quem perguntou estiver aberto
 * (waiter), a resposta sai nele. Se ele não espera (--no-wait), desistiu (tempo esgotado) ou foi
 * encerrado (o Codex corta comandos longos), o pedido continua valendo e a resposta é entregue
 * como mensagem no terminal de quem perguntou, como um webhook.
 */
interface PendingAsk {
  id: number;
  from: Peer;
  to: Peer;
  waiter?: (result: AskResult) => void;
}

interface AskResult {
  status: "respondido" | "tempo esgotado" | "encerrado" | "limite atingido";
  reply?: string;
  screen?: string;
  /** "limite atingido": quando o limite zera (ms; 0 se não se sabe). */
  until?: number;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_SEC = 600;
const MAX_TIMEOUT_SEC = 3600;
const MAX_BODY = 1_000_000;
/**
 * Pausa entre colar o texto e apertar Enter, para TUIs processarem a colagem. O Codex no Windows
 * trata um Enter que chega logo depois de muitas teclas como parte da colagem (quebra de linha):
 * com 150 ms o texto ficava escrito, sem enviar.
 */
const SUBMIT_DELAY_MS = 600;

/**
 * Servidor HTTP local (named pipe no Windows, socket Unix nos outros) que o CLI `o`
 * usa. Cada chamada se identifica com o id e o token do terminal de onde veio, e só
 * pode atingir terminais ligados a ele no canvas.
 */
export class ControlServer {
  private integrationTokens = new Map<string, string>();

  /** Sessão temporária de um Satélite/Torre: só lista e consome integrações ligadas. */
  integrationSession(nodeId: string) {
    const token = randomUUID();
    this.integrationTokens.set(token, nodeId);
    return { token, close: () => { this.integrationTokens.delete(token); } };
  }
  private server: Server;
  private networkServer?: Server;
  private pending = new Map<number, PendingAsk>();
  private taskMap: Map<string, TaskStatus> | null = null;
  /** Selos de andamento; ao abrir, volta os de até 7 dias atrás. */
  private get tasks(): Map<string, TaskStatus> {
    if (!this.taskMap) {
      const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
      this.taskMap = new Map(Object.entries(this.elements.savedTasks?.() ?? {}).filter(([, t]) => t && typeof t.at === "number" && t.at > week));
    }
    return this.taskMap;
  }
  private commandsCache = new Map<string, { at: number; list: { name: string; description: string }[] }>();
  /** Um comando por vez em cada agente: dois zn agent ao mesmo tempo embaralhariam as teclas. */
  private agentBusy = new Set<string>();
  private nextAskId = 1;

  constructor(
    private ptys: Ptys,
    private graph: GraphLookup,
    private elements: ElementOps,
    private gitOps?: GitOps,
    /** Agente pediu a atenção do usuário (`zn notify`). */
    private notify?: (callerId: string, message: string) => void,
    /** Algo passou de um elemento para outro (pedido, resposta, leitura, escrita): anima a linha. */
    private onFlow?: (from: string, to: string) => void,
    /** Limite de uso de cada terminal: aparece no zn list e bloqueia pedidos a quem esgotou. */
    private usage?: UsageInfo,
  ) {
    this.server = createServer((req, res) => void this.handle(req, res));
    // Um `ask` pode esperar vários minutos pela resposta.
    this.server.requestTimeout = 0;
    this.server.headersTimeout = 30_000;
  }

  listen(address: string): Promise<void> {
    if (process.platform !== "win32") rmSync(address, { force: true });
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(address, () => resolve());
    });
  }

  /** Ponte autenticada para os contêineres. Não atende tokens de terminais nativos. */
  listenContainers(): Promise<number> {
    if (this.networkServer) throw new Error("Ponte dos ambientes já iniciada.");
    const server = createServer((req, res) => {
      const caller = header(req, "x-o-terminal"), token = header(req, "x-o-token");
      if (!this.elements.isolatedSession?.(caller) || !(this.ptys.verify(caller, token) || this.integrationTokens.get(token) === caller)) { send(res, 403, { error: "Ambiente não autorizado." }); return; }
      void this.handle(req, res);
    });
    this.networkServer = server;
    server.requestTimeout = 6 * 60_000;
    server.headersTimeout = 10_000;
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "0.0.0.0", () => { const address = server.address(); if (!address || typeof address === "string") reject(new Error("Ponte indisponível.")); else resolve(address.port); });
    });
  }

  close(): void {
    this.networkServer?.close();
    this.integrationTokens.clear();
    for (const ask of this.pending.values()) ask.waiter?.({ status: "encerrado" });
    this.pending.clear();
    this.server.close();
  }

  /**
   * O limite de uso de um terminal acabou: os pedidos abertos para ele não vão ser respondidos.
   * Quem ainda espera no CLI recebe "limite atingido"; quem já seguiu em frente é avisado no terminal.
   */
  terminalLimited(id: string, until = 0): void {
    for (const ask of [...this.pending.values()]) {
      if (ask.to.id !== id) continue;
      this.pending.delete(ask.id);
      if (ask.waiter) {
        ask.waiter({ status: "limite atingido", until });
        continue;
      }
      const when = until ? ` (zera ${clock(until)})` : "";
      this.deliver(ask.from, `[Zênite · pedido #${ask.id} não concluído]\n"${ask.to.title}" atingiu o limite de uso${when} e não vai responder. Mande o pedido para outro agente.`).catch(() => {});
    }
  }

  /** Avise quando um terminal encerrar: destrava quem espera resposta dele e esquece os pedidos dele. */
  terminalExited(id: string): void {
    for (const ask of [...this.pending.values()]) {
      if (ask.to.id !== id && ask.from.id !== id) continue;
      this.pending.delete(ask.id);
      if (ask.to.id === id) ask.waiter?.({ status: "encerrado" });
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method !== "POST") throw new HttpError(405, "Use POST.");
      const callerId = header(req, "x-o-terminal");
      const token = header(req, "x-o-token");
      const integrationOnly = !!token && this.integrationTokens.get(token) === callerId;
      if (!callerId || !token || !integrationOnly && !this.ptys.verify(callerId, token)) {
        throw new HttpError(401, "Terminal não autorizado. Rode o comando de dentro de um terminal do Zênite.");
      }
      if (integrationOnly && !["/list", "/skill", "/service", ...(this.elements.isolatedSession?.(callerId) ? ["/access-file", "/file", "/folder", "/note", "/table", "/media", "/web"] : [])].includes(req.url ?? "")) throw new HttpError(403, "Esta sessão de astro só acessa o conteúdo de elementos ligados.");
      const hood = this.graph(callerId);
      if (!hood) throw new HttpError(404, "Este terminal não está em nenhum canvas.");
      const body = await readJson(req);
      if (this.elements.isolatedSession?.(callerId)) await this.elements.isolatedRequest?.(callerId, req.url ?? "", body);
      // Decidir para quem mandar com o uso de agora, não com o de segundos atrás.
      if (req.url === "/list" || req.url === "/ask") await this.usage?.refresh?.().catch(() => {});

      switch (req.url) {
        case "/access-file": {
          if (!this.elements.isolatedSession?.(callerId) || !this.elements.directFile) throw new HttpError(403, "Este acesso exige um terminal isolado.");
          return send(res, 200, await this.elements.directFile(callerId, body));
        }
        case "/list":
          return send(res, 200, this.list(hood));
        case "/ask":
          return send(res, 200, await this.ask(hood, body, req));
        case "/reply":
          return send(res, 200, await this.reply(hood, body));
        case "/check":
          return send(res, 200, await this.check(hood, body));
        case "/send":
          return send(res, 200, this.sendRaw(hood, body));
        case "/note":
          return send(res, 200, this.note(hood, body));
        case "/skill": {
          const item = this.resolve({ ...hood, me: { ...hood.me, sun: false } }, body.target, ["skill"]);
          const r = this.elements.integrationSkill?.(item.id, typeof body.file === "string" ? body.file : undefined, callerId);
          if (!r) throw new HttpError(501, "Skills do canvas indisponíveis.");
          if (!r.ok) throw new HttpError(422, r.error);
          this.flow(callerId, item.id);
          return send(res, 200, r.data as object);
        }
        case "/service": {
          const item = this.resolve({ ...hood, me: { ...hood.me, sun: false } }, body.target, ["service"]);
          const r = await this.elements.integrationService?.(item.id, body.request as unknown as ServiceRequest, callerId);
          if (!r) throw new HttpError(501, "Serviços do canvas indisponíveis.");
          if (!r.ok) throw new HttpError(422, r.error);
          this.flow(callerId, item.id);
          return send(res, 200, { data: r.data });
        }
        case "/media":
          return send(res, 200, this.media(hood, body));
        case "/web":
          return send(res, 200, await this.web(hood, body));
        case "/file":
          return send(res, 200, this.file(hood, body));
        case "/folder":
          return send(res, 200, this.folder(hood, body));
        case "/table":
          return send(res, 200, this.table(hood, body));
        case "/flow": {
          const astro = this.resolve(hood, body.target, ["flow"]);
          if (body.action === "signal") {
            const r = this.elements.flowSignal?.(astro.id, typeof body.input === "string" ? body.input : undefined);
            if (!r?.ok) throw new HttpError(409, r?.error ?? "Espera por sinal indisponível.");
            return send(res, 200, { status: "sinal recebido", flow: astro.title });
          }
          if (body.action === "stop") {
            if (!this.elements.flowStop?.(astro.id)) throw new HttpError(409, `"${astro.title}" não está rodando.`);
            return send(res, 200, { status: "parando", flow: astro.title });
          }
          if (body.action === "status") return send(res, 200, await this.flowStatus(hood, astro));
          const input = typeof body.input === "string" ? body.input : "";
          const r = this.elements.runFlow(astro.id, input, hood.me.id);
          if (!r.ok) throw new HttpError(409, r.error ?? "Não deu para começar o fluxo.");
          this.flow(hood.me.id, astro.id);
          return send(res, 200, { status: "iniciado", flow: astro.title });
        }
        case "/canvas":
          return send(res, 200, await this.canvas(hood, body));
        case "/canvas-ui":
          return send(res, 200, await this.canvasUi(hood, body));
        case "/terminal":
          return send(res, 200, await this.terminal(hood, body));
        case "/agent":
          return send(res, 200, await this.agent(hood, body));
        case "/role":
          return send(res, 200, this.role(hood, body));
        case "/status":
          return send(res, 200, this.status(hood, body));
        case "/universe": {
          this.requireSun(hood);
          if (!this.elements.universes) throw new HttpError(501, "Universos indisponíveis.");
          try {
            return send(res, 200, await this.elements.universes(hood.me.id, String(body.action ?? "list"), body));
          } catch (err) {
            throw err instanceof HttpError ? err : new HttpError(422, (err as Error).message);
          }
        }
        case "/notify": {
          const message = typeof body.message === "string" ? body.message.slice(0, 500) : "";
          if (!this.notify) throw new HttpError(501, "Avisos não estão disponíveis.");
          this.notify(hood.me.id, message);
          return send(res, 200, { status: "avisado" });
        }
        case "/commit":
        case "/history":
          return send(res, 200, await this.gitRoute(req.url, hood, body));
        default:
          throw new HttpError(404, `Comando desconhecido: ${req.url}`);
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      send(res, status, { error: (err as Error).message });
    }
  }

  /** Só o que está ligado direto a quem chamou: o resto do canvas (e de outras galáxias) nem aparece. */
  private list(hood: Neighborhood) {
    const waitingFor = new Set([...this.pending.values()].map((a) => a.to.id));
    return {
      me: hood.me,
      place: hood.place,
      linked: hood.linked.map((p) => ({
        title: p.title,
        kind: p.kind,
        ...(p.sun ? { sun: true } : {}),
        ...(p.kind === "terminal"
          ? { status: [!this.ptys.has(p.id) ? "encerrado" : waitingFor.has(p.id) ? "com pedido pendente" : "ativo", this.taskText(p.id), this.usage?.note(p.id)].filter(Boolean).join(" · ") }
          : {}),
        ...(p.file ? { path: this.elements.mediaPath(p.file) } : {}),
        ...(p.path ? { path: p.path } : {}),
        ...(p.url ? { url: p.url } : {}),
        ...(p.tower ? { tower: p.tower } : {}),
        ...(p.viaTower?.length ? { viaTower: p.viaTower } : {}),
      })),
      ...(this.exclusiveTower(hood) ? { exclusiveTower: this.exclusiveTower(hood)!.title } : {}),
      pendingForMe: [...this.pending.values()].filter((a) => a.to.id === hood.me.id).map((a) => ({ id: a.id, from: a.from.title })),
    };
  }

  /** Torre exclusiva ligada ao Sol: com ela, toda delegação do Sol passa por ela. */
  private exclusiveTower(hood: Neighborhood): Item | undefined {
    return hood.me.sun ? hood.linked.find((p) => p.tower?.exclusive) : undefined;
  }

  /** O Sol delega pela Torre: executor de rota e Torre exclusiva recusam o caminho direto. */
  private requireTowerRoute(hood: Neighborhood, target?: Item): void {
    if (!hood.me.sun) return;
    const exclusive = this.exclusiveTower(hood);
    if (exclusive) throw new HttpError(403, `A Torre "${exclusive.title}" é exclusiva: delegue por ela com zn flow run ${JSON.stringify(exclusive.title)} "tarefa" (a resposta chega aqui).`);
    const via = target?.viaTower?.[0];
    if (via) throw new HttpError(403, `"${target!.title}" executa a rota "${via.route}" da Torre "${via.tower}". Delegue por: zn flow run ${JSON.stringify(via.tower)} "tarefa".`);
  }

  private async ask(hood: Neighborhood, body: Record<string, unknown>, req: IncomingMessage): Promise<object> {
    const target = this.resolve(hood, body.to, ["terminal"]);
    this.requireTowerRoute(hood, target);
    const message = requireText(body.message, "mensagem");
    const wait = body.wait !== false;
    // Quem esgotou o limite não vai responder: recusa já, dizendo quem tem folga (--force manda mesmo assim).
    const blocked = body.force === true ? null : this.usage?.blocked(target.id);
    if (blocked) throw new HttpError(409, this.blockedMessage(hood, target, blocked.until));
    const timeoutSec = clampTimeout(body.timeoutSec);

    const askId = this.nextAskId++;
    const framed = `[Zênite · pedido #${askId} de "${hood.me.title}"]\n${message}\n\nQuando terminar, responda executando: zn reply ${askId} "sua resposta"`;
    const ask: PendingAsk = { id: askId, from: hood.me, to: target };

    if (!wait) {
      this.pending.set(askId, ask);
      try {
        await this.deliver(target, framed);
        this.flow(hood.me.id, target.id);
      } catch (err) {
        this.pending.delete(askId);
        throw err;
      }
      return { status: "entregue", request: askId, to: target.title };
    }

    return new Promise<object>((resolve) => {
      const timer = setTimeout(async () => {
        ask.waiter?.({ status: "tempo esgotado", screen: target.sun && !hood.me.sun ? undefined : (await this.ptys.snapshot(target.id, 40)) ?? undefined });
      }, timeoutSec * 1000);
      // Responde ao CLI uma vez só. Depois disso, a resposta vai como mensagem para o terminal.
      ask.waiter = (result) => {
        ask.waiter = undefined;
        clearTimeout(timer);
        if (result.status !== "tempo esgotado") this.pending.delete(askId);
        resolve({ request: askId, to: target.title, ...result });
      };
      // CLI interrompido (Ctrl-C, ou o Codex cortou o comando): o pedido continua, sem quem espere.
      req.socket.once("close", () => {
        if (!ask.waiter) return;
        ask.waiter = undefined;
        clearTimeout(timer);
      });
      this.pending.set(askId, ask);
      this.deliver(target, framed).then(() => this.flow(hood.me.id, target.id), () => ask.waiter?.({ status: "encerrado" }));
    });
  }

  private async reply(hood: Neighborhood, body: Record<string, unknown>) {
    const message = requireText(body.message, "resposta");
    const mine = [...this.pending.values()].filter((a) => a.to.id === hood.me.id).sort((a, b) => a.id - b.id);
    if (mine.length === 0) throw new HttpError(409, "Ninguém está esperando resposta sua agora.");
    let ask = mine[0];
    if (body.request !== undefined && body.request !== null) {
      const found = mine.find((a) => a.id === Number(body.request));
      if (!found) throw new HttpError(404, `Não há pedido #${body.request} pendente para você. Pendentes: ${mine.map((a) => `#${a.id}`).join(", ")}.`);
      ask = found;
    }
    if (ask.waiter) {
      ask.waiter({ status: "respondido", reply: message });
    } else {
      // Ninguém esperando no CLI: a resposta chega como mensagem nova para quem perguntou.
      await this.deliver(ask.from, `[Zênite · resposta de "${hood.me.title}" ao seu pedido #${ask.id}]\n${message}`);
      this.pending.delete(ask.id);
    }
    this.flow(hood.me.id, ask.from.id);
    return { status: "enviado", request: ask.id, to: ask.from.title };
  }

  private async check(hood: Neighborhood, body: Record<string, unknown>) {
    const target = this.resolve(hood, body.to, ["terminal"]);
    if (target.sun && !hood.me.sun) throw new HttpError(403, "A tela do Sol é privada. Use zn ask para enviar um pedido.");
    const lines = Math.max(1, Math.min(2000, Number(body.lines) || 60));
    const screen = await this.ptys.snapshot(target.id, lines);
    if (screen === null) throw new HttpError(409, `"${target.title}" está encerrado.`);
    this.flow(target.id, hood.me.id);
    return { to: target.title, screen };
  }

  private sendRaw(hood: Neighborhood, body: Record<string, unknown>) {
    const target = this.resolve(hood, body.to, ["terminal"]);
    if (target.sun && !hood.me.sun) throw new HttpError(403, "Outro agente não pode enviar teclas ao Sol. Use zn ask para enviar um pedido.");
    this.requireTowerRoute(hood, target);
    const data = requireText(body.data, "texto", true);
    if (!this.ptys.has(target.id)) throw new HttpError(409, `"${target.title}" está encerrado.`);
    this.ptys.write(target.id, data);
    this.flow(hood.me.id, target.id);
    return { status: "enviado", to: target.title };
  }

  /**
   * Acha o elemento entre os ligados a quem chamou, por nome (sem diferenciar maiúsculas) ou id.
   * Elementos do canvas sem ligação existem, mas são recusados.
   */
  private resolve(hood: Neighborhood, raw: unknown, kinds: ElementKind[]): Item {
    const name = typeof raw === "string" ? raw.trim() : "";
    const what = kinds.map((k) => KIND_LABEL[k]).join("/");
    if (!name) throw new HttpError(400, `Informe o nome do ${what}.`);
    const pick = (items: Item[]) => {
      const byId = items.filter((p) => p.id === name);
      return byId.length ? byId : items.filter((p) => p.title.toLowerCase() === name.toLowerCase());
    };
    // O Sol usa qualquer elemento do canvas dele, ligado ou não.
    const matches = pick(hood.me.sun && !this.elements.isolatedSession?.(hood.me.id) ? [...hood.linked, ...hood.others] : hood.linked);
    if (matches.length > 1) {
      throw new HttpError(409, `Há ${matches.length} elementos chamados "${name}". Use o id: ${matches.map((m) => m.id).join(", ")}.`);
    }
    if (matches.length === 1) {
      const item = matches[0];
      if (!kinds.includes(item.kind)) {
        const hint = item.kind === "flow" ? ` Para mandar algo a ele, use: zn flow run "${item.title}" "texto".` : "";
        throw new HttpError(400, `"${item.title}" é ${KIND_LABEL[item.kind]}, não ${what}.${hint}`);
      }
      return item;
    }
    if (pick(hood.others).length) {
      throw new HttpError(403, `"${name}" existe no canvas, mas não está ligado a você. Peça ao usuário para ligar antes de usar.`);
    }
    const available = hood.linked.filter((p) => kinds.includes(p.kind));
    const list = available.length ? available.map((p) => `"${p.title}"`).join(", ") : "nenhum";
    throw new HttpError(404, `"${name}" não está ligado a este terminal. Ligados a você (${what}): ${list}.`);
  }

  /**
   * Sol: lê e muda o canvas inteiro (criar, mover, ligar, apagar, desenhar, montar astros).
   * O lote é tudo ou nada; com o canvas na tela, entra no Ctrl+Z do usuário como um passo só.
   */
  private requireSun(hood: Neighborhood): void {
    if (!hood.me.sun) throw new HttpError(403, "Só o Sol mexe no canvas inteiro. Peça ao usuário para promover este terminal a Sol (opções do terminal → Sol).");
  }

  private canvasOfSun(hood: Neighborhood): string {
    this.requireSun(hood);
    const canvasId = this.elements.canvasOf?.(hood.me.id);
    if (!canvasId || !this.elements.canvasOps) throw new HttpError(404, "Este terminal não está em nenhum canvas.");
    return canvasId;
  }

  /** Estado de agora do canvas do Sol e o nó pedido (por nome ou id). */
  private async nodeOnCanvas(hood: Neighborhood, raw: unknown) {
    const canvasId = this.canvasOfSun(hood);
    const reply = await this.elements.canvasOps!(canvasId, [], hood.me.id);
    if (!reply.ok) throw new HttpError(422, reply.error);
    const name = typeof raw === "string" ? raw.trim().replace(/^#/, "") : "";
    if (!name) throw new HttpError(400, "Informe o nome.");
    const hits = reply.state.nodes.filter((n) => n.id === name || (name.length >= 6 && n.id.startsWith(name)) || labelOf(n).toLowerCase() === name.toLowerCase());
    if (!hits.length) throw new HttpError(404, `"${name}" não existe neste canvas.`);
    if (hits.length > 1) throw new HttpError(409, `Há ${hits.length} itens chamados "${name}". Use o id: ${hits.map((n) => `#${n.id.slice(0, 8)}`).join(", ")}.`);
    return { canvasId, state: reply.state, node: hits[0] };
  }

  private async canvas(hood: Neighborhood, body: Record<string, unknown>): Promise<object> {
    let canvasId = this.canvasOfSun(hood);
    // Recrutar num universo: o lote vale no canvas dele, e os terminais abrem na pasta dele.
    let dir = hood.place?.dir ?? "";
    if (typeof body.universe === "string" && body.universe.trim()) {
      const target = this.elements.universeCanvas?.(hood.me.id, body.universe.trim());
      if (!target) throw new HttpError(404, `Universo "${body.universe}" não existe nesta galáxia. Veja: zn universe list`);
      canvasId = target.canvasId;
      dir = target.dir;
    }
    const raw = Array.isArray(body.ops) ? (body.ops as CanvasOp[]) : [];
    if (raw.length > MAX_OPS) throw new HttpError(413, `No máximo ${MAX_OPS} operações por lote.`);
    const roles = new Map<number, string>();
    const ops = raw.map((op, i) => {
      try {
        // Papel salvo: o texto vai como primeira mensagem quando o agente terminar de abrir.
        const role = (op as { role?: unknown }).role;
        if (typeof role === "string" && role.trim()) {
          const found = this.elements.roles?.read(role);
          if (!found) throw new Error(`Papel "${role}" não existe. Veja: zn role list`);
          roles.set(i, found.text);
        }
        return this.prepareOp(op, hood, dir);
      } catch (err) {
        throw new HttpError(400, raw.length > 1 ? `Operação ${i + 1}: ${(err as Error).message}` : (err as Error).message);
      }
    });
    if (ops.some((op) => op.op === "create" && op.kind === "terminal")) {
      const exclusive = this.exclusiveTower(hood);
      if (exclusive) throw new HttpError(403, `A Torre "${exclusive.title}" é exclusiva: o Sol não recruta. Delegue por zn flow run ${JSON.stringify(exclusive.title)} "tarefa"; se nenhuma rota serve, pergunte ao usuário.`);
    }
    // Recrutar só quando ninguém do canvas serve: um terminal livre do mesmo agente é reaproveitado.
    if (!(typeof body.universe === "string" && body.universe.trim()) && body.new !== true) {
      await this.requireNoIdleTerminal(canvasId, hood, ops);
      const notes = ops.flatMap((op) => (op.op === "create" && op.kind === "note" ? [op.title ?? "Nota"] : []));
      if (notes.length) {
        const state = await this.elements.canvasOps!(canvasId, [], hood.me.id);
        if (state.ok) this.requireWorthyNotes(notes, state.state.nodes.map((n) => ({ kind: nodeKind(n), title: labelOf(n) })));
      }
    }
    const reply = await this.elements.canvasOps!(canvasId, ops, hood.me.id);
    if (!reply.ok) {
      // Lote recusado: a mídia já copiada para a pasta do app não fica órfã.
      ops.forEach((op, i) => {
        if (op.op === "create" && (op.kind === "image" || op.kind === "video") && op.element?.file && op !== raw[i]) this.elements.cleanup({ kind: op.kind, element: op.element as ElementSpec });
      });
    }
    if (!reply.ok) throw new HttpError(422, reply.index !== undefined && ops.length > 1 ? `Operação ${reply.index + 1}: ${reply.error}` : reply.error);
    if (ops.length) {
      const verb: Record<string, string> = { create: "criou", update: "mudou", delete: "apagou", connect: "ligou", disconnect: "desligou" };
      this.elements.solLog?.append(canvasId, { at: Date.now(), by: hood.me.title, what: reply.results.map((r) => `${verb[r.op] ?? r.op} ${r.kind === "draw" ? "desenho" : KIND_LABEL[r.kind as ElementKind] ?? r.kind} "${r.title}"`) });
    }
    for (const [i, text] of roles) {
      const created = reply.results[i];
      if (created?.kind === "terminal") this.deliverWhenReady({ id: created.id, title: created.title }, text);
    }
    // Conteúdo das notas e tabelas novas: os arquivos são gravados aqui (o canvas só guarda o nó).
    ops.forEach((op, i) => {
      const copyOf = (op as { copyOf?: unknown }).copyOf;
      if (op.op === "create" && typeof copyOf === "string") {
        const id = reply.results[i]?.id;
        if (op.kind === "note") this.elements.writeNote(id, this.elements.readNote(copyOf), true);
        else if (op.kind === "table") this.elements.writeTable(id, this.elements.readTable(copyOf), true);
      }
      if (op.op !== "create" || typeof op.content !== "string" || !op.content) return;
      const id = reply.results[i]?.id;
      if (op.kind === "note") this.elements.writeNote(id, op.content, true);
      else if (op.kind === "table") this.elements.writeTable(id, parseCsv(op.content), true);
    });
    const out: Record<string, unknown> = { results: reply.results, canvas: describeCanvas(reply.state), tasks: this.tasksOf(reply.state) };
    if (typeof body.detail === "string" && body.detail.trim()) {
      const name = body.detail.trim().replace(/^#/, "");
      const hits = reply.state.nodes.filter((n) => n.id === name || (name.length >= 6 && n.id.startsWith(name)) || labelOf(n).toLowerCase() === name.toLowerCase());
      if (!hits.length) throw new HttpError(404, `"${name}" não existe neste canvas.`);
      if (hits.length > 1) throw new HttpError(409, `Há ${hits.length} itens chamados "${name}". Use o id: ${hits.map((n) => `#${n.id.slice(0, 8)}`).join(", ")}.`);
      const node = hits[0];
      const label = new Map(reply.state.nodes.map((n) => [n.id, labelOf(n)]));
      out.node = node;
      out.links = reply.state.edges
        .filter((e) => e.source === node.id || e.target === node.id)
        .map((e) => ({ from: label.get(e.source), to: label.get(e.target), ...(e.sourceHandle ? { output: e.sourceHandle } : {}) }));
    }
    return out;
  }

  /** Traduz o que o CLI manda em nomes (agente, conta) para o que o canvas guarda (comando, id da conta). */
  /**
   * Notas demais: várias notas com o mesmo molde de nome ("Vídeo 1", "Vídeo 2"...) são registros, e
   * registros pedem uma tabela (uma linha por item, uma coluna para o status). --new cria mesmo assim.
   */
  private requireWorthyNotes(titles: string[], existing: { kind: string; title: string }[]): void {
    const stem = (title: string) => title.toLowerCase().replace(/[\d\s\p{P}_]+/gu, "");
    const notes = existing.filter((e) => e.kind === "note");
    const seen = new Map<string, string>();
    for (const e of notes) seen.set(stem(e.title), e.title);
    let repeated: string | undefined;
    for (const title of titles) {
      const key = stem(title);
      if (key && seen.has(key)) { repeated = `"${title}" e "${seen.get(key)}"`; break; }
      seen.set(key, title);
    }
    if (!repeated && titles.length < 3) return;
    const tables = existing.filter((e) => e.kind === "table").map((e) => `"${e.title}"`);
    throw new Error([
      repeated ? `${repeated} parecem registros da mesma lista em notas separadas.` : `${titles.length} notas de uma vez parecem uma lista.`,
      "Lista, status ou registro por item é uma tabela (uma linha por item): zn table create \"Nome\" \"coluna1,coluna2\\n...\", ou grave na que já existe com zn table set/write.",
      tables.length ? `Tabelas que já existem no canvas: ${tables.join(", ")}.` : "",
      "Nota é só para texto corrido sobre um assunto; para acrescentar, use zn note append na nota existente. Se precisa mesmo de outra nota, use --new.",
    ].filter(Boolean).join(" "));
  }

  /**
   * zn recruit com terminal parado: se o canvas já tem um terminal vivo do mesmo agente (e da mesma
   * conta e modelo, quando pedidos) que não está trabalhando, o Sol deve usá-lo. --new recruta mesmo assim.
   */
  private async requireNoIdleTerminal(canvasId: string, hood: Neighborhood, ops: CanvasOp[]): Promise<void> {
    const wanted = ops.filter((op) => op.op === "create" && op.kind === "terminal");
    if (!wanted.length) return;
    const reply = await this.elements.canvasOps!(canvasId, [], hood.me.id);
    if (!reply.ok) return;
    const taken = new Set<string>();
    for (const op of wanted) {
      const t = (op.op === "create" ? op.terminal ?? {} : {}) as Record<string, unknown>;
      const command = typeof t.command === "string" ? t.command : "";
      const provider = t.provider as AgentProvider | undefined;
      const kind = agentOf(command, provider);
      // Shell e comandos soltos não têm "papel de agente" para reaproveitar.
      if (kind === "shell" || kind === "other") continue;
      const model = modelAndEffortOf(kind, command).model;
      const found: string[] = [];
      for (const n of reply.state.nodes) {
        if (!n.terminal || n.terminal.sun || n.id === hood.me.id || taken.has(n.id) || !this.ptys.has(n.id)) continue;
        if (agentOf(n.terminal.command ?? "", n.terminal.provider) !== kind) continue;
        if (typeof t.account === "string" && t.account !== n.terminal.account) continue;
        if (model && modelAndEffortOf(kind, n.terminal.command ?? "").model !== model) continue;
        const state = this.tasks.get(n.id)?.state;
        if (state === "trabalhando" || state === "bloqueado") continue;
        if (looksBusy((await this.ptys.snapshot(n.id, 40)) ?? "")) continue;
        found.push(n.id);
      }
      if (!found.length) continue;
      taken.add(found[0]);
      const list = found.map((id) => {
        const n = reply.state.nodes.find((x) => x.id === id)!;
        return `"${n.terminal!.title}"${n.terminal!.role ? ` (papel: ${n.terminal!.role})` : " (sem papel)"}`;
      }).join(", ");
      throw new Error(`Já há ${AGENT_LABEL[kind]} livre no canvas: ${list}. Reaproveite com zn ask "Nome" --no-wait "..." (se precisar, defina o papel com zn terminal edit "Nome" --role "..."). Se precisa mesmo de outro terminal, use zn recruit ... --new.`);
    }
  }

  private prepareOp(op: CanvasOp, hood: Neighborhood, dir = hood.place?.dir ?? ""): CanvasOp {
    if (!op || typeof op !== "object" || typeof op.op !== "string") throw new Error("Operação inválida.");
    if (this.elements.isolatedSession?.(hood.me.id)) {
      const copy = (op as { copyOf?: unknown }).copyOf;
      if (typeof copy === "string") this.resolve(hood, copy, ["note", "table", "image", "video", "file", "folder", "web", "flow", "skill", "service"]);
      const file = (op as { element?: { file?: unknown } }).element?.file;
      if (typeof file === "string" && !hood.linked.some(item => ["image", "video"].includes(item.kind) && item.file === file)) throw new Error("A mídia precisa vir de um elemento diretamente conectado. Não informe nomes de arquivos do armazenamento interno.");
    }
    if (op.op === "create" && op.kind === "terminal") {
      const t = { ...(op.terminal ?? {}) } as Record<string, unknown>;
      const agentName = typeof t.agent === "string" ? t.agent.toLowerCase() : "";
      delete t.agent;
      if (agentName) {
        const recipe = RECRUIT[agentName];
        if (!recipe) throw new Error(`Agente desconhecido: ${agentName}. Agentes: ${Object.keys(RECRUIT).join(", ")}.`);
        t.command ??= recipe.command;
        const model = typeof t.model === "string" ? t.model : undefined;
        const effort = typeof t.effort === "string" ? t.effort : undefined;
        delete t.model;
        delete t.effort;
        if (model || effort) t.command = this.flags(String(t.command), recipe.provider, model, effort);
        if (recipe.provider) t.provider = recipe.provider;
        const account = this.account(recipe.agent, typeof t.account === "string" ? t.account : undefined);
        delete t.account;
        if (account) Object.assign(t, { account: account.id, accountName: account.name });
      } else if (typeof t.account === "string") {
        throw new Error("Para escolher a conta, diga também o agente (--agent claude|codex|antigravity).");
      }
      t.cwd ??= dir;
      return { ...op, terminal: t };
    }
    // Duplicar imagem/vídeo: a cópia ganha o próprio arquivo (apagar uma não apaga a outra).
    const copyOf = (op as { copyOf?: unknown }).copyOf;
    if (op.op === "create" && typeof copyOf === "string" && op.element?.file) {
      const file = this.elements.duplicateMedia?.(op.element.file);
      if (!file) throw new Error("O arquivo da mídia original não existe mais.");
      return { ...op, element: { ...op.element, file } };
    }
    // Imagem e vídeo: o arquivo do disco é copiado para a pasta de mídia, como ao arrastar.
    if (op.op === "create" && (op.kind === "image" || op.kind === "video") && op.element?.path && !op.element.file) {
      const source = resolvePath(op.element.path);
      if (!existsSync(source)) throw new Error(`Arquivo não encontrado: ${source}`);
      const imported = this.elements.importMedia(source);
      if (!imported || imported.kind !== op.kind) throw new Error(`O arquivo precisa ser ${KIND_LABEL[op.kind]}.`);
      const { path: _path, ...element } = op.element;
      return { ...op, title: op.title ?? imported.name, element: { ...element, file: imported.file } };
    }
    if (op.op === "create" && (op.kind === "file" || op.kind === "folder") && op.element?.path) {
      const path = resolvePath(op.element.path);
      if (!existsSync(path) || statSync(path).isDirectory() !== (op.kind === "folder")) throw new Error(`${op.kind === "folder" ? "Pasta" : "Arquivo"} não encontrado: ${path}`);
      return { ...op, title: op.title ?? (op.kind === "folder" ? basename(path) : basename(path, extname(path))), element: { ...op.element, path } };
    }
    // Satélite e Torre (modo IA) escolhem a conta pelo nome também.
    const fixFlow = (flow: Partial<FlowSpec> | undefined) => {
      if (!flow || typeof flow.account !== "string" || !flow.account) return flow;
      const account = this.account(flow.agent ?? "codex", flow.account);
      return { ...flow, account: account?.id ?? flow.account };
    };
    if (op.op === "create" && op.element?.flow) return { ...op, element: { ...op.element, flow: fixFlow(op.element.flow) as FlowSpec } };
    // Terminal: modelo e esforço viram opções da linha de comando (valem no próximo restart).
    if (op.op === "update" && op.terminal && ("model" in op.terminal || "effort" in op.terminal)) {
      const t = { ...op.terminal } as Record<string, unknown>;
      const model = typeof t.model === "string" ? t.model : undefined;
      const effort = typeof t.effort === "string" ? t.effort : undefined;
      delete t.model;
      delete t.effort;
      const item = this.resolve(hood, op.target, ["terminal"]);
      const spec = this.elements.terminalSpec?.(item.id);
      if (!spec) throw new Error(`"${item.title}" não está em nenhum canvas.`);
      t.command = this.flags(typeof t.command === "string" ? t.command : spec.command, spec.provider, model, effort);
      return { ...op, terminal: t };
    }
    if (op.op === "update" && op.flow) return { ...op, flow: fixFlow(op.flow) };
    return op;
  }

  /** Põe modelo/esforço na linha de comando do agente, conferindo o esforço que ele aceita. */
  private flags(command: string, provider: AgentProvider | undefined, model?: string, effort?: string): string {
    const kind = agentOf(command, provider);
    const accepted = EFFORTS[kind];
    if (effort && accepted && !accepted.includes(effort)) throw new Error(`${AGENT_LABEL[kind]} aceita esforço ${accepted.join(", ")}.`);
    return withModelAndEffort(kind, command, model, effort);
  }

  /**
   * zn agent: o Sol comanda o CLI de outro terminal (Codex, Claude, Antigravity...) pelos
   * comandos de barra dele: ver status e uso, trocar modelo e esforço, rodar qualquer /comando,
   * escolher opções nos menus e interromper.
   */
  private async agent(hood: Neighborhood, body: Record<string, unknown>): Promise<object> {
    this.requireSun(hood);
    const action = String(body.action ?? "info");
    const wanted = typeof body.target === "string" ? body.target.trim() : "";
    if (wanted === hood.me.id || wanted.toLowerCase() === hood.me.title.toLowerCase()) throw new HttpError(409, "O Sol não comanda o próprio CLI pelo zn agent.");
    const target = this.resolve(hood, body.target, ["terminal"]);
    const spec = this.elements.terminalSpec?.(target.id);
    const kind = agentOf(spec?.command ?? "", spec?.provider);
    const alive = this.ptys.has(target.id);
    const t: AgentTerm = { write: (d) => this.ptys.write(target.id, d), snapshot: (n) => this.ptys.snapshot(target.id, n ?? 80), quiet: () => this.ptys.quiet?.(target.id) ?? null };
    const base = { title: target.title, agent: AGENT_LABEL[kind], kind };
    if (action === "info") {
      const screen = alive ? (await this.ptys.snapshot(target.id, 40)) ?? "" : "";
      return {
        ...base,
        alive,
        busy: alive && looksBusy(screen),
        command: spec?.command ?? "",
        ...(spec?.accountName ? { account: spec.accountName } : {}),
        ...modelAndEffortOf(kind, spec?.command ?? ""),
        ...(EFFORTS[kind] ? { efforts: EFFORTS[kind] } : {}),
        ...(this.tasks.get(target.id) ? { task: this.tasks.get(target.id) } : {}),
        ...(this.elements.usageOf?.(target.id) ? { usage: this.elements.usageOf!(target.id) } : {}),
        commands: SLASH[kind] ?? {},
      };
    }
    if (!alive) throw new HttpError(409, `"${target.title}" está encerrado. Abra de novo com: zn terminal restart "${target.title}"`);
    if (this.agentBusy.has(target.id)) throw new HttpError(409, `Já há um zn agent rodando em "${target.title}". Espere ele terminar.`);
    this.agentBusy.add(target.id);
    this.flow(hood.me.id, target.id);
    const force = body.force === true;
    try {
      switch (action) {
        case "commands": {
          const key = `${kind}:${spec?.command.split(/\s+/)[0] ?? ""}`;
          const cached = this.commandsCache.get(key);
          if (cached && Date.now() - cached.at < COMMANDS_TTL_MS && body.fresh !== true) return { ...base, commands: cached.list, cached: true };
          await whenIdle(t, force);
          const list = await listCommands(t);
          if (!list.length) throw new HttpError(422, `Não apareceu lista de comandos em "${target.title}" ao digitar "/". O programa aceita comandos de barra?`);
          this.commandsCache.set(key, { at: Date.now(), list });
          return { ...base, commands: list };
        }
        case "run": {
          const text = requireText(body.text, "comando (ex.: /status)");
          await whenIdle(t, force);
          const screen = await runSlash(t, text, { max: Math.min(120_000, Number(body.wait) * 1000 || 20_000) });
          return { ...base, screen: tail(screen, 60), ...(parseMenu(screen) ? { menu: parseMenu(screen) } : {}) };
        }
        case "pick": {
          const option = requireText(body.option, "opção do menu");
          const screen = await pick(t, option, body.enter === false ? null : "\r");
          return { ...base, screen: tail(screen, 60), ...(parseMenu(screen) ? { menu: parseMenu(screen) } : {}) };
        }
        case "slide": {
          const screen = await slide(t, requireText(body.option, "esforço"), body.enter !== false);
          return { ...base, screen: tail(screen, 40) };
        }
        case "interrupt": {
          t.write(ESC);
          await settle(t, { min: 400, quiet: 700, max: 5000 });
          return { ...base, status: "interrompido", screen: tail((await this.ptys.snapshot(target.id, 30)) ?? "", 20) };
        }
        case "status":
        case "usage": {
          const slash = SLASH[kind]?.[action];
          if (!slash) throw new HttpError(400, `${AGENT_LABEL[kind]}: não sei qual comando mostra ${action === "status" ? "o status" : "o uso"}. Use zn agent run "${target.title}" "/comando".`);
          await whenIdle(t, force);
          let screen = await runSlash(t, slash);
          // O /status do Codex demora a aparecer: espera mais um pouco pela tabela.
          if (kind === "codex") {
            await settle(t, { min: 2000, quiet: 1500, max: 15_000 });
            screen = (await this.ptys.snapshot(target.id, 80)) ?? screen;
          }
          // Painéis que ficam abertos (o /usage do Antigravity) fecham depois de lidos.
          if (parseMenu(screen) || /esc (close|to cancel|go back)/i.test(screen)) {
            t.write(ESC);
            await settle(t, { min: 300, quiet: 500, max: 4000 });
          }
          const fields = kind === "codex" ? parseStatusFields(screen) : undefined;
          return { ...base, ...(fields && Object.keys(fields).length ? { fields } : {}), screen: tail(screen, 60), ...(this.elements.usageOf?.(target.id) ? { usage: this.elements.usageOf!(target.id) } : {}) };
        }
        case "model":
        case "effort": {
          const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
          const effort = typeof body.effort === "string" && body.effort.trim() ? body.effort.trim().toLowerCase() : undefined;
          if (!model && !effort) throw new HttpError(400, "Diga o modelo e/ou o esforço.");
          const accepted = EFFORTS[kind];
          if (effort && accepted && !accepted.includes(effort)) throw new HttpError(400, `${AGENT_LABEL[kind]} aceita esforço ${accepted.join(", ")}.`);
          await whenIdle(t, force);
          const screen = await setModelEffort(kind, t, { model, effort, save: body.save === true });
          return { ...base, status: "trocado", ...(model ? { model } : {}), ...(effort ? { effort } : {}), saved: body.save === true, screen: tail(screen, 30) };
        }
        default:
          throw new HttpError(400, `Ação desconhecida: zn agent ${action}.`);
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(422, (err as Error).message);
    } finally {
      this.agentBusy.delete(target.id);
    }
  }

  /** Conta pelo nome ou id; sem nome, a primeira desse agente (como o "Novo terminal"). */
  private account(agent: AccountAgent | undefined, wanted: string | undefined): AccountMeta | undefined {
    if (!agent) {
      if (wanted) throw new Error("Este agente não usa conta do Zênite.");
      return undefined;
    }
    const mine = (this.elements.accounts?.() ?? []).filter((a) => a.agent === agent);
    if (!wanted) return mine[0];
    const hit = mine.find((a) => a.id === wanted || a.name.toLowerCase() === wanted.toLowerCase());
    if (!hit) throw new Error(`Conta "${wanted}" de ${agent} não existe. Contas: ${mine.map((a) => `"${a.name}"`).join(", ") || "nenhuma (usa o login padrão)"}.`);
    return hit;
  }

  /** Selos dos terminais do canvas, pelo nome. */
  private tasksOf(state: CanvasState): Record<string, TaskStatus> {
    const out: Record<string, TaskStatus> = {};
    for (const n of state.nodes) {
      const t = n.terminal && this.tasks.get(n.id);
      if (t) out[n.terminal!.title] = t;
    }
    return out;
  }

  private taskText(id: string): string | undefined {
    const t = this.tasks.get(id);
    return t && t.state !== "livre" ? `${t.state}${t.note ? `: ${t.note}` : ""}` : undefined;
  }

  /** zn status: cada terminal põe o próprio selo; sem estado, mostra o seu. */
  private status(hood: Neighborhood, body: Record<string, unknown>): object {
    const raw = typeof body.state === "string" ? body.state.trim().toLowerCase() : "";
    if (!raw) return { title: hood.me.title, status: this.tasks.get(hood.me.id) ?? { state: "livre", at: 0 } };
    const state = (raw === "pronto para revisão" || raw === "revisao" || raw === "revisão" ? "pronto" : raw) as TaskState;
    if (!TASK_STATES.includes(state)) throw new HttpError(400, `Estado desconhecido: ${raw}. Use: ${TASK_STATES.join(", ")}.`);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
    if (state === "livre") this.tasks.delete(hood.me.id);
    else this.tasks.set(hood.me.id, { state, ...(note ? { note } : {}), at: Date.now() });
    this.elements.tasksChanged?.(Object.fromEntries(this.tasks));
    return { title: hood.me.title, status: this.tasks.get(hood.me.id) ?? { state: "livre", at: Date.now() } };
  }

  /** Selos atuais (a interface pede ao abrir). */
  allTasks(): Record<string, TaskStatus> {
    return Object.fromEntries(this.tasks);
  }

  /** Espera o agente recrutado abrir e manda o papel como primeira mensagem. */
  private deliverWhenReady(target: Peer, text: string): void {
    const started = Date.now();
    const tick = () => {
      if (Date.now() - started > ROLE_GIVE_UP_MS) return;
      const q = this.ptys.quiet?.(target.id);
      if (q && q.open >= ROLE_OPEN_MS && q.idle >= ROLE_QUIET_MS) {
        this.deliver(target, text).catch(() => {});
        return;
      }
      setTimeout(tick, 500);
    };
    setTimeout(tick, 1000);
  }

  /** zn canvas arrange|fit|summary|background|screenshot|export|log. */
  private async canvasUi(hood: Neighborhood, body: Record<string, unknown>): Promise<object> {
    const canvasId = this.canvasOfSun(hood);
    const action = String(body.action ?? "");
    const target = typeof body.target === "string" && body.target.trim() ? body.target.trim() : undefined;
    const value = typeof body.value === "string" ? body.value : undefined;
    if (action === "log") {
      const limit = Math.max(1, Math.min(500, Number(body.limit) || 30));
      return { log: this.elements.solLog?.read(canvasId, limit) ?? [] };
    }
    if (action === "export") {
      if (!this.elements.exportCanvas) throw new HttpError(501, "Exportar não está disponível.");
      const path = resolvePath(requireText(body.path, "caminho do arquivo .zenite"));
      const reply = await this.elements.canvasOps!(canvasId, [], hood.me.id);
      if (!reply.ok) throw new HttpError(422, reply.error);
      const all: NodeKind[] = ["terminal", "note", "image", "video", "web", "file", "folder", "table", "flow", "skill", "service", "blackhole", "draw"];
      const kinds = Array.isArray(body.kinds) && body.kinds.length ? (body.kinds as NodeKind[]).filter((k) => all.includes(k)) : all;
      try {
        return { count: this.elements.exportCanvas(reply.state, path.endsWith(".zenite") ? path : `${path}.zenite`, kinds), path: path.endsWith(".zenite") ? path : `${path}.zenite` };
      } catch (err) {
        throw new HttpError(422, (err as Error).message);
      }
    }
    if (action === "screenshot") {
      if (!this.elements.screenshot) throw new HttpError(501, "Print não está disponível.");
      try {
        return { path: await this.elements.screenshot(canvasId, target) };
      } catch (err) {
        throw new HttpError(409, (err as Error).message);
      }
    }
    const allowed: CanvasUiAction[] = ["arrange", "fit", "summary", "background"];
    if (!allowed.includes(action as CanvasUiAction) || !this.elements.ui) throw new HttpError(400, `Ação desconhecida: ${action}.`);
    const reply = await this.elements.ui(canvasId, action as CanvasUiAction, target, value);
    if (!reply.ok) throw new HttpError(409, reply.error);
    return { status: "feito", ...(reply.info ? { info: reply.info } : {}) };
  }

  /** zn terminal restart|stop "Nome" (editar vai pelo /canvas, como qualquer mudança no nó). */
  private async terminal(hood: Neighborhood, body: Record<string, unknown>): Promise<object> {
    const action = String(body.action ?? "");
    const { canvasId, node } = await this.nodeOnCanvas(hood, body.target);
    if (!node.terminal) throw new HttpError(400, `"${labelOf(node)}" não é terminal.`);
    if (node.id === hood.me.id) throw new HttpError(409, "O Sol não pode reiniciar nem parar a si mesmo.");
    if (action === "stop") {
      if (!this.elements.stopTerminal?.(node.id)) throw new HttpError(409, `"${node.terminal.title}" já está encerrado.`);
      return { status: "encerrado", title: node.terminal.title };
    }
    if (action === "restart") {
      const onScreen = await this.elements.ui?.(canvasId, "restart", `#${node.id}`);
      if (onScreen?.ok) return { status: "reiniciado", title: node.terminal.title };
      const started = await this.elements.restartTerminal?.(node.id);
      if (!started?.ok) throw new HttpError(409, started?.error ?? (onScreen && !onScreen.ok ? onScreen.error : "Não deu para reiniciar."));
      return { status: "reiniciado", title: node.terminal.title };
    }
    throw new HttpError(400, `Ação desconhecida: zn terminal ${action}.`);
  }

  /** zn role list|show|save|delete: os papéis com que o Sol recruta. */
  private role(hood: Neighborhood, body: Record<string, unknown>): object {
    this.requireSun(hood);
    const roles = this.elements.roles;
    if (!roles) throw new HttpError(501, "Papéis indisponíveis.");
    const action = String(body.action ?? "list");
    const name = typeof body.name === "string" ? body.name.trim() : "";
    try {
      switch (action) {
        case "list":
          return { roles: roles.list().map((r) => ({ name: r.name, preview: r.preview })) };
        case "show": {
          const r = roles.read(name);
          if (!r) throw new HttpError(404, `Papel "${name}" não existe.`);
          return r;
        }
        case "save":
          return { status: "salvo", name, path: roles.save(name, requireText(body.text, "texto do papel")) };
        case "delete":
          if (!roles.remove(name)) throw new HttpError(404, `Papel "${name}" não existe.`);
          return { status: "apagado", name };
        default:
          throw new HttpError(400, `Ação desconhecida: zn role ${action}.`);
      }
    } catch (err) {
      throw err instanceof HttpError ? err : new HttpError(400, (err as Error).message);
    }
  }

  /** Andamento do fluxo que sai do astro: cada passo com estado, contagem e mensagem. */
  private async flowStatus(hood: Neighborhood, astro: Item): Promise<object> {
    const info = this.elements.flowStatus?.() ?? { running: [], statuses: {} };
    const canvasId = this.elements.canvasOf?.(astro.id);
    const reply = canvasId && this.elements.canvasOps ? await this.elements.canvasOps(canvasId, [], hood.me.id) : null;
    const state = reply?.ok ? reply.state : null;
    // Os passos alcançáveis a partir do astro, na ordem em que o fluxo anda.
    const order: string[] = [];
    const queue = [astro.id];
    while (queue.length && state) {
      const id = queue.shift()!;
      if (order.includes(id)) continue;
      order.push(id);
      for (const e of state.edges) if (e.source === id) queue.push(e.target);
    }
    const title = (id: string) => (state ? labelOf(state.nodes.find((n) => n.id === id)!) : id);
    return {
      flow: astro.title,
      running: info.running.includes(astro.id),
      steps: order.filter((id) => state?.nodes.find((n) => n.id === id)?.kind === "flow").map((id) => ({ title: title(id), ...(info.statuses[id] ?? { state: "parado" }) })),
    };
  }

  private note(hood: Neighborhood, body: Record<string, unknown>) {
    const action = String(body.action ?? "");
    if (action === "create") {
      this.requireSun(hood);
      if (body.new !== true) this.requireWorthyNotes([String(body.title ?? "Nota")], [...hood.linked, ...hood.others]);
      const created = this.elements.addLinkedElement(hood.me.id, "note", String(body.title ?? "Nota"));
      if (!created) throw new HttpError(404, "Este terminal não está em nenhum canvas.");
      this.elements.writeNote(created.element.id, typeof body.content === "string" ? body.content : "", true);
      return { status: "criada", title: created.element.title };
    }
    const note = this.resolve(hood, body.target, ["note"]);
    if (["read", "write", "append"].includes(action)) this.flow(...(action === "read" ? [note.id, hood.me.id] as const : [hood.me.id, note.id] as const));
    switch (action) {
      case "read":
        return { title: note.title, content: this.elements.readNote(note.id) };
      case "write":
        this.elements.writeNote(note.id, requireText(body.content, "conteúdo", true), true);
        return { status: "salva", title: note.title };
      case "append": {
        const current = this.elements.readNote(note.id);
        const add = requireText(body.content, "conteúdo");
        const sep = current && !current.endsWith("\n") ? "\n" : "";
        this.elements.writeNote(note.id, current + sep + add, true);
        return { status: "salva", title: note.title };
      }
      default:
        throw new HttpError(400, `Ação de nota desconhecida: ${action}`);
    }
  }

  private media(hood: Neighborhood, body: Record<string, unknown>) {
    const item = this.resolve(hood, body.target, ["image", "video"]);
    const action = String(body.action ?? "path");
    this.flow(...(action === "set" ? [hood.me.id, item.id] as const : [item.id, hood.me.id] as const));
    if (action === "path") {
      if (!item.file) throw new HttpError(409, `"${item.title}" ainda não tem arquivo.`);
      return { title: item.title, kind: item.kind, path: this.elements.mediaPath(item.file) };
    }
    if (action === "set") {
      this.requireSun(hood);
      const source = requireText(body.path, "caminho do arquivo");
      if (!existsSync(source)) throw new HttpError(404, `Arquivo não encontrado: ${source}`);
      const imported = this.elements.importMedia(source);
      if (!imported || imported.kind !== item.kind) throw new HttpError(400, `O arquivo precisa ser ${KIND_LABEL[item.kind]}.`);
      if (item.file) this.elements.cleanup({ kind: item.kind, element: { id: item.id, kind: item.kind as "image", title: item.title, file: item.file } });
      this.elements.updateElement(item.id, { file: imported.file });
      return { status: "substituída", title: item.title, path: this.elements.mediaPath(imported.file) };
    }
    throw new HttpError(400, `Ação de mídia desconhecida: ${action}`);
  }

  /** Arquivo qualquer do disco, mostrado no canvas sem ser copiado. */
  private file(hood: Neighborhood, body: Record<string, unknown>) {
    const action = String(body.action ?? "path");
    if (action === "create") {
      this.requireSun(hood);
      const path = resolvePath(requireText(body.path, "caminho do arquivo"));
      if (!existsSync(path) || statSync(path).isDirectory()) throw new HttpError(404, `Arquivo não encontrado: ${path}`);
      const created = this.elements.addLinkedElement(hood.me.id, "file", String(body.title || basename(path, extname(path))), { path });
      if (!created) throw new HttpError(404, "Este terminal não está em nenhum canvas.");
      return { status: "criado", title: created.element.title, path };
    }
    const item = this.resolve(hood, body.target, ["file"]);
    this.flow(item.id, hood.me.id);
    if (!item.path) throw new HttpError(409, `"${item.title}" ainda não tem arquivo.`);
    const info = fileInfo(item.path);
    if (!info.exists) throw new HttpError(404, `O arquivo de "${item.title}" não existe mais: ${item.path}`);
    return { title: item.title, path: item.path, size: humanSize(info.size), modified: shortDate(info.modified) };
  }

  /** Pasta do disco: o agente ligado recebe o caminho e o que há dentro (um nível). */
  private folder(hood: Neighborhood, body: Record<string, unknown>) {
    const item = this.resolve(hood, body.target, ["folder"]);
    this.flow(item.id, hood.me.id);
    if (!item.path) throw new HttpError(409, `"${item.title}" ainda não tem pasta.`);
    const listed = listDir(item.path);
    if (!listed.ok) throw new HttpError(404, `${listed.error} (${item.path})`);
    return {
      title: item.title,
      path: item.path,
      entries: listed.entries.map((e) => (e.isDir ? `${e.name}/` : `${e.name}  (${humanSize(e.size)})`)),
      more: listed.more,
    };
  }

  private table(hood: Neighborhood, body: Record<string, unknown>) {
    const action = String(body.action ?? "read");
    const rowsFrom = (raw: unknown): string[][] => {
      const text = requireText(raw, "conteúdo da tabela (CSV)");
      return parseCsv(text);
    };
    if (action === "create") {
      this.requireSun(hood);
      const created = this.elements.addLinkedElement(hood.me.id, "table", String(body.title || "Tabela"));
      if (!created) throw new HttpError(404, "Este terminal não está em nenhum canvas.");
      if (typeof body.content === "string" && body.content.trim()) this.elements.writeTable(created.element.id, rowsFrom(body.content), true);
      return { status: "criada", title: created.element.title };
    }
    const item = this.resolve(hood, body.target, ["table"]);
    if (["read", "write", "set"].includes(action)) this.flow(...(action === "read" ? [item.id, hood.me.id] as const : [hood.me.id, item.id] as const));
    switch (action) {
      case "read": {
        const rows = this.elements.readTable(item.id);
        return { title: item.title, markdown: tableToMarkdown(rows), rows };
      }
      case "write":
        this.elements.writeTable(item.id, rowsFrom(body.content), true);
        return { status: "salva", title: item.title };
      case "set": {
        const r = Number(body.row);
        const c = Number(body.col);
        if (!Number.isInteger(r) || !Number.isInteger(c) || r < 1 || c < 1) throw new HttpError(400, "Linha e coluna começam em 1 (a linha 1 é o cabeçalho).");
        const rows = this.elements.readTable(item.id);
        while (rows.length < r) rows.push(Array(rows[0].length).fill(""));
        if (c > rows[0].length) for (const row of rows) while (row.length < c) row.push("");
        rows[r - 1][c - 1] = typeof body.value === "string" ? body.value : "";
        this.elements.writeTable(item.id, rows, true);
        return { status: "salva", title: item.title };
      }
      default:
        throw new HttpError(400, `Ação de tabela desconhecida: ${action}`);
    }
  }

  private async web(hood: Neighborhood, body: Record<string, unknown>): Promise<object> {
    const action = String(body.action ?? "");
    if (action === "create") {
      this.requireSun(hood);
      const url = requireText(body.url, "endereço");
      const created = this.elements.addLinkedElement(hood.me.id, "web", String(body.title || "Site"), { url });
      if (!created) throw new HttpError(404, "Este terminal não está em nenhum canvas.");
      return { status: "criado", title: created.element.title, note: "O site carrega quando o workspace estiver aberto na tela." };
    }
    const site = this.resolve(hood, body.target, ["web"]);
    if (["console", "network", "request", "source", "cookies"].includes(action)) return this.webDevtools(site, action, body, hood);
    const driver = this.elements.web(site.id);
    if (!driver) throw new HttpError(409, `O site "${site.title}" não está aberto na tela. Abra a galáxia dele no Zênite.`);
    const ref = typeof body.ref === "string" ? body.ref : undefined;
    // Ler a página traz dados do site; navegar, clicar e digitar levam comandos até ele.
    this.flow(...(["snapshot", "info", "screenshot", "eval"].includes(action) ? [site.id, hood.me.id] as const : [hood.me.id, site.id] as const));
    try {
      switch (action) {
        case "snapshot":
          return { site: site.title, ...(await driver.snapshot()) };
        case "info":
          return { site: site.title, ...driver.info() };
        case "navigate": {
          const info = await driver.navigate(requireText(body.url, "endereço"));
          this.elements.updateElement(site.id, { url: info.url });
          return { site: site.title, ...info };
        }
        case "click":
          await driver.click(requireText(ref, "alvo (@ref, seletor ou x,y)"));
          return { status: "clicado", site: site.title };
        case "type":
          await driver.type(requireText(body.text, "texto", true), ref, body.replace === true);
          return { status: "digitado", site: site.title };
        case "key":
          driver.key(requireText(body.key, "tecla"));
          return { status: "pressionada", site: site.title };
        case "eval":
          return { site: site.title, result: await driver.evaluate(requireText(body.code, "código")) };
        case "screenshot":
          return { site: site.title, path: await driver.screenshot(site.title) };
        case "back":
          driver.back();
          return { status: "voltou", site: site.title };
        case "reload":
          driver.reload();
          return { status: "recarregado", site: site.title };
        default:
          throw new HttpError(400, `Ação de site desconhecida: ${action}`);
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(422, (err as Error).message);
    }
  }

  /** zn web console|network|request|source|cookies: o que o F12 mostraria. */
  private async webDevtools(site: Item, action: string, body: Record<string, unknown>, hood: Neighborhood): Promise<object> {
    const inspector = this.elements.webInspect?.(site.id);
    if (!inspector) throw new HttpError(409, `O site "${site.title}" não está aberto na tela. Abra a galáxia dele no Zênite.`);
    try {
      // Página que ainda não nasceu deixa o depurador esperando: não segura o agente mais que 3 s.
      await Promise.race([inspector.start(), new Promise((r) => setTimeout(r, 3000))]);
    } catch (err) {
      throw new HttpError(409, (err as Error).message);
    }
    this.flow(site.id, hood.me.id);
    const limit = Math.max(1, Math.min(500, Number(body.limit) || 50));
    try {
      switch (action) {
        case "console":
          return { site: site.title, entries: inspector.consoleEntries({ limit, errors: body.errors === true, clear: body.clear === true }) };
        case "network":
          return {
            site: site.title,
            entries: inspector.netEntries({ limit, filter: typeof body.filter === "string" ? body.filter : undefined, failed: body.failed === true, clear: body.clear === true })
              .map(({ requestHeaders: _rq, responseHeaders: _rs, postData: _pd, ...e }) => e),
          };
        case "request": {
          const n = Number(String(body.n ?? "").replace("#", ""));
          if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "Informe o número da requisição (o #N do zn web network).");
          return { site: site.title, request: await inspector.request(n, body.full === true ? Number.MAX_SAFE_INTEGER : 20_000) };
        }
        case "source": {
          const wanted = typeof body.url === "string" ? body.url.trim() : "";
          if (!wanted) return { site: site.title, resources: await inspector.resources() };
          const file = await inspector.source(wanted);
          const max = body.full === true || body.out ? Number.MAX_SAFE_INTEGER : 50_000;
          return { site: site.title, ...file, content: file.content.length > max ? file.content.slice(0, max) : file.content, length: file.content.length, cut: file.content.length > max };
        }
        case "cookies": {
          const url = this.elements.web(site.id)?.info().url || site.url || "";
          return { site: site.title, url, cookies: await inspector.cookies(url) };
        }
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(422, (err as Error).message);
    }
    throw new HttpError(400, `Ação de site desconhecida: ${action}`);
  }

  private async gitRoute(route: string, hood: Neighborhood, body: Record<string, unknown>): Promise<object> {
    if (!this.gitOps) throw new HttpError(501, "Git indisponível.");
    try {
      if (route === "/commit") {
        return await this.gitOps.commit(hood.me.id, {
          title: requireText(body.title, "título"),
          why: typeof body.why === "string" ? body.why : "",
          todo: typeof body.todo === "string" ? body.todo : undefined,
          agent: hood.me.title,
        });
      }
      return await this.gitOps.history(hood.me.id, {
        limit: Number(body.limit) || undefined,
        grep: typeof body.grep === "string" ? body.grep : undefined,
        file: typeof body.file === "string" ? body.file : undefined,
      });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(422, (err as Error).message);
    }
  }

  /** "Fulano está com o limite atingido" + quem, entre os ligados a quem pediu, tem folga. */
  private blockedMessage(hood: Neighborhood, target: Peer, until: number): string {
    const others = hood.linked
      .filter((p) => p.kind === "terminal" && p.id !== target.id && this.ptys.has(p.id) && !this.usage?.blocked(p.id))
      .map((p) => {
        const note = this.usage?.note(p.id);
        return `"${p.title}"${note ? ` (${note})` : ""}`;
      });
    const when = until ? ` (zera ${clock(until)})` : "";
    const alt = others.length ? ` Ligados a você e com folga: ${others.join(", ")}.` : " Nenhum outro terminal ligado a você tem folga agora.";
    return `"${target.title}" está com o limite de uso atingido${when} e não vai responder.${alt} Para mandar mesmo assim, use --force.`;
  }

  private flow(from: string, to: string): void {
    this.onFlow?.(from, to);
  }

  /** Cola o texto no terminal de destino e aperta Enter (também usado pelos astros). */
  async deliver(target: Peer, text: string): Promise<void> {
    if (!this.ptys.has(target.id)) throw new HttpError(409, `"${target.title}" está encerrado.`);
    if (this.ptys.acceptsPaste(target.id)) {
      // Colagem "entre colchetes" mantém as quebras de linha sem enviar a mensagem antes da hora.
      this.ptys.write(target.id, `\x1b[200~${text}\x1b[201~`);
    } else {
      // Sem esse modo, cada quebra de linha viraria um Enter: junta tudo numa linha.
      this.ptys.write(target.id, text.replace(/\s*\n+\s*/g, " — "));
    }
    await new Promise((r) => setTimeout(r, SUBMIT_DELAY_MS));
    this.ptys.write(target.id, "\r");
  }
}

/** As últimas linhas não vazias da tela. */
function tail(screen: string, lines: number): string {
  const all = screen.split("\n").map((l) => l.replace(/\s+$/, ""));
  while (all.length && !all[all.length - 1]) all.pop();
  return all.slice(-lines).join("\n");
}

function header(req: IncomingMessage, name: string): string {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) reject(new HttpError(413, "Mensagem grande demais."));
      else chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve({});
      try {
        const parsed = JSON.parse(text);
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        reject(new HttpError(400, "Corpo da requisição não é JSON válido."));
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: object): void {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function requireText(v: unknown, what: string, allowBlank = false): string {
  if (typeof v !== "string" || (!allowBlank && !v.trim()) || v.length === 0) {
    throw new HttpError(400, `Informe a ${what}.`);
  }
  return v;
}

function clampTimeout(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_TIMEOUT_SEC) : DEFAULT_TIMEOUT_SEC;
}

/** "às 14:28" hoje; "em 27/10 às 14:28" em outro dia. */
function clock(at: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `às ${time}` : `em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${time}`;
}
