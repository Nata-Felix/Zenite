import type { CanvasOpsReply, CanvasOpsRequest, CanvasUiReply, CanvasUiRequest } from "./canvasOps";

/** Provedor alternativo para o agente (ex.: Claude Code falando com a OpenRouter). */
export type AgentProvider = "openrouter";

/** Preferências próprias; campos ausentes acompanham as configurações gerais. */
export interface TerminalAppearance {
  color?: string;
  font?: string;
  fontSize?: number;
  colors?: string;
}

export interface TerminalSpec {
  id: string;
  title: string;
  /** Linha de comando a executar dentro do shell; vazio abre só o shell. */
  command: string;
  /** Diretório de trabalho; vazio usa a pasta do usuário. */
  cwd: string;
  /** Conta do agente (id em WorkspaceIndex.accounts); ausente = login padrão. */
  account?: string;
  /** Nome da conta, só para mostrar no cabeçalho. */
  accountName?: string;
  /** Provedor do agente; ausente = o padrão do programa. */
  provider?: AgentProvider;
  appearance?: TerminalAppearance;
  /** Sol: o orquestrador da galáxia (um por canvas). Ganha o contorno de sol e o papel no zn list. */
  sun?: boolean;
}

export type AccountAgent = "claude" | "codex" | "antigravity";

/** Login separado de um agente: cada conta tem a própria pasta de configuração. */
export interface AccountMeta {
  id: string;
  name: string;
  agent: AccountAgent;
}

export type ElementKind = "terminal" | "note" | "image" | "video" | "web" | "file" | "folder" | "table" | "flow" | "skill" | "service" | "blackhole";

/** Credenciais ficam no .env da galáxia; o canvas guarda apenas o nome da variável. */
export interface ServiceSpec {
  transport: "http" | "mcp";
  endpoint: string;
  tokenEnv?: string;
  allowWrites?: boolean;
  /** Ferramentas MCP autorizadas na configuração (uma por linha na interface). */
  tools?: string[];
}

export interface ServiceRequest {
  action: "test" | "request" | "tools" | "call";
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path?: string;
  body?: unknown;
  tool?: string;
  arguments?: Record<string, unknown>;
}

export type IntegrationReply = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * Astro: um passo de fluxo no canvas (estilo n8n). Só o Satélite (e a Torre no modo IA) usa IA;
 * o resto é código, igual toda vez. O texto que anda pelo fluxo é {{entrada}}.
 *  - ignition (Ignição): começa o fluxo sozinho (intervalo, horário, arquivo novo) ou pelo ▶.
 *  - satellite (Satélite): agente fixo, CLI sem tela com conta, modelo e prompt já escolhidos.
 *  - orbit (Órbita): loop; volta a um passo anterior até a condição bater ou acabar as voltas.
 *  - gemini (Gêmeos): se/senão; segue pelo caminho A ou B.
 *  - tower (Torre de controle): roteador; manda para um de vários caminhos, por regra ou pela IA.
 *  - gravity (Gravidade): balanceador; reparte entre os caminhos ligados (revezando ou por folga).
 *  - thruster (Propulsor): roda um script do PowerShell; a saída vira a nova {{entrada}}.
 *  - convergence (Convergência): reúne entradas de caminhos paralelos.
 *  - wait (Espera): aguarda um tempo ou sinal enquanto o aplicativo estiver aberto.
 *  - approval (Aprovação): segue pelo caminho aprovado ou recusado pelo usuário.
 */
export type FlowType = "ignition" | "satellite" | "orbit" | "gemini" | "tower" | "gravity" | "thruster" | "convergence" | "wait" | "approval" | "request" | "transform" | "launch" | "chronos" | "code";

export type CodeLanguage = "python" | "javascript";
export type CodeRuntimeResult = { ok: true; version: string } | { ok: false; error: string };

export interface ChronosSpec {
  mode: "startup" | "after-start" | "interval" | "daily" | "date" | "delay" | "signal";
  value?: number;
  unit?: "seconds" | "minutes" | "hours" | "days";
  at?: string;
  days?: number[];
  date?: string;
  output?: string;
  timeoutSeconds?: number;
  signalName?: string;
}

export interface FlowHttpSpec {
  serviceId?: string;
  url?: string;
  path?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  tokenEnv?: string;
  body?: string;
  bodyType?: "json" | "text";
}
export interface FlowTransformSpec {
  operation: "template" | "json-field" | "json-format" | "replace" | "split" | "join" | "set-variable";
  value?: string;
  field?: string;
  search?: string;
  replacement?: string;
  separator?: string;
  variable?: string;
}
export interface FlowLaunchSpec {
  mode: "open" | "command";
  targetId?: string;
  path?: string;
  /** Um argumento por item, sem shell intermediário. */
  args?: string[];
  waitForExit?: boolean;
}

export interface FlowCondition {
  /** O que comparar, com {{campo}} (vazio = {{entrada}}). */
  field?: string;
  op: "contains" | "equals" | "starts" | "empty" | "filled" | "gt" | "lt" | "regex";
  value?: string;
}

export interface FlowRoute {
  id: string;
  label: string;
  /** Modo regra: palavras separadas por vírgula; a primeira rota com alguma delas no texto ganha. */
  match?: string;
}

export interface FlowSpec {
  type: FlowType;
  chronos?: ChronosSpec;
  http?: FlowHttpSpec;
  transform?: FlowTransformSpec;
  launch?: FlowLaunchSpec;
  code?: { language: CodeLanguage; source: string };
  /** Ignição: como começa sozinha (manual = só pelo ▶). */
  schedule?: "manual" | "interval" | "daily" | "folder";
  everyMinutes?: number;
  /** Horário "HH:MM" e dias da semana (0 = domingo; vazio = todo dia). */
  at?: string;
  days?: number[];
  /** Pasta vigiada: cada arquivo novo começa o fluxo com o caminho dele em {{entrada}}. */
  folder?: string;
  /** Texto inicial ({{entrada}}) quando começa pelo ▶ ou pelo relógio. */
  input?: string;
  /** Ignição pausada: o relógio e a pasta vigiada não disparam (o ▶ continua valendo). */
  paused?: boolean;
  /** Satélite (e Torre no modo IA): CLI, conta (vazio = padrão), modelo e esforço, permissão e prompt. */
  agent?: AccountAgent;
  account?: string;
  model?: string;
  effort?: string;
  permission?: "read" | "sandbox" | "full";
  prompt?: string;
  /** Órbita: máximo de voltas e, opcional, quando parar antes. */
  times?: number;
  until?: FlowCondition;
  /** Gêmeos: a condição do caminho A (senão, B). */
  condition?: FlowCondition;
  /** Torre: rotas e quem decide. */
  routes?: FlowRoute[];
  decide?: "rules" | "agent";
  /** Gravidade: revezar ou mandar para quem tem mais folga de limite. */
  strategy?: "rotate" | "quota";
  /** Propulsor: script do PowerShell, com {{campo}}. */
  script?: string;
  /** Convergência: uma coleta por execução, isolada de outros fluxos. */
  joinMode?: "all" | "first" | "count";
  joinCount?: number;
  /** Espera: mantém o fluxo suspenso enquanto o Zênite estiver aberto. */
  waitMode?: "timer" | "signal";
  waitSeconds?: number;
  signalName?: string;
  timeoutSeconds?: number;
  /** Aprovação: mensagem apresentada ao usuário junto da entrada e próximos passos. */
  approvalMessage?: string;
}

/** Selo de andamento que cada terminal põe em si (zn status) e o Sol lê de uma vez. */
export type TaskState = "trabalhando" | "bloqueado" | "pronto" | "livre";
export const TASK_STATES: TaskState[] = ["trabalhando", "bloqueado", "pronto", "livre"];
export interface TaskStatus {
  state: TaskState;
  note?: string;
  at: number;
}

/** Andamento de um astro, mandado pelo processo principal enquanto o fluxo roda. */
export interface FlowStatus {
  nodeId: string;
  state: "running" | "ok" | "error";
  done: number;
  total: number;
  message?: string;
  at: number;
}

/** "Enquanto você esteve fora": o que cada terminal, o Sol, os astros e o Git fizeram. */
export interface AwayTerminal {
  id: string;
  title: string;
  /** Galáxia (e universo) onde o terminal está. */
  where: string;
  /** Turnos de trabalho que terminaram. */
  turns: number;
  /** Pedidos de atenção (zn notify). */
  requests: string[];
  /** Último selo (zn status) posto enquanto isso. */
  status?: TaskStatus;
}
export interface AwaySummary {
  since: number;
  until: number;
  terminals: AwayTerminal[];
  sol: { count: number; recent: string[] };
  flows: { title: string; ok: number; errors: number; lastError?: string }[];
  commits: { hash: string; title: string; branch: string; author: string; galaxy: string }[];
}

/** Opções dos menus do Satélite: contas com login e modelos/esforços de cada CLI. */
export interface FlowAgentOptions {
  accounts: { id: string; name: string; agent: AccountAgent; loggedIn: boolean }[];
  /** Por conta do Codex ("" = conta padrão): modelos com os esforços que cada um aceita. */
  codexModels: Record<string, { slug: string; name: string; efforts: string[]; defaultEffort?: string }[]>;
  antigravityModels: { slug: string; name: string }[];
  claudeModels: { slug: string; name: string }[];
  /** CLIs encontrados neste computador. */
  installed: Record<AccountAgent, boolean>;
}

/** Elemento que não é terminal: nota, imagem, vídeo, site, arquivo, pasta ou tabela. */
export interface ElementSpec {
  id: string;
  kind: Exclude<ElementKind, "terminal">;
  title: string;
  /** Imagem/vídeo: nome do arquivo na pasta de mídia do app. */
  file?: string;
  /** Site: endereço atual. */
  url?: string;
  /** Nota: mostrar formatada (Markdown) em vez do texto para editar. */
  formatted?: boolean;
  /** Nota: cor do papel. */
  color?: string;
  /** Zoom do conteúdo (1 = 100%). No site, é o zoom da página. */
  zoom?: number;
  /** Arquivo/pasta: caminho no disco. O arquivo continua onde está (não é copiado). */
  path?: string;
  /** Astro: tipo e configuração. */
  flow?: FlowSpec;
  /** Arquivo/atalho: abrir pelo sistema quando um fluxo chegar a este elemento. Opt-in. */
  openOnFlow?: boolean;
  /** Serviço externo, acessível somente aos agentes ligados diretamente. */
  service?: ServiceSpec;
  /** Agrupador visual; os nós e suas conexões reais permanecem no canvas. */
  blackHole?: { members: string[]; collapsed: boolean };
}

export type DrawShape = "rectangle" | "ellipse" | "diamond" | "line" | "arrow" | "pen" | "text" | "frame";

/**
 * Desenho do canvas (estilo Excalidraw): decoração do usuário. Não aparece para os
 * agentes e não pode ser ligado a nada.
 */
export interface DrawSpec {
  shape: DrawShape;
  /** Cor do traço; "auto" acompanha o tema (texto do app). */
  stroke: string;
  /** Cor de fundo; "transparent" = sem fundo. */
  fill: string;
  fillStyle: "hachure" | "cross-hatch" | "solid";
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  /** 0 = limpo, 1 = rabiscado, 2 = bem rabiscado. */
  roughness: number;
  /** 0–100. */
  opacity: number;
  /** Semente do traço rabiscado, para o desenho não "tremer" a cada pintura. */
  seed: number;
  /** Lápis, linha e seta: pontos relativos à caixa do nó (0–1). */
  points?: [number, number][];
  text?: string;
  font?: "hand" | "sans" | "serif" | "mono" | "comic";
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
}

export type NodeKind = ElementKind | "draw";

export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Ausente em canvases antigos: era sempre terminal. */
  kind?: NodeKind;
  terminal?: TerminalSpec;
  element?: ElementSpec;
  draw?: DrawSpec;
  /** Ordem de empilhamento (desenhos podem ir para frente ou para trás). */
  z?: number;
  /** Posição do cartão na visão resumida (independente da visão normal). Ausente: centrado no elemento. */
  summary?: { x: number; y: number };
}

export function nodeKind(n: Pick<CanvasNode, "kind">): NodeKind {
  return n.kind ?? "terminal";
}

/** Desenhos são decoração: os agentes não enxergam. */
export function isDrawing(n: Pick<CanvasNode, "kind">): boolean {
  return n.kind === "draw";
}

/** A linha como é salva: só guarda a saída quando ela tem nome (astros com mais de um caminho). */
export function storedEdge(e: { id: string; source: string; target: string; sourceHandle?: string | null }): CanvasEdge {
  return { id: e.id, source: e.source, target: e.target, ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}) };
}

export function nodeTitle(n: Pick<CanvasNode, "kind" | "terminal" | "element">): string {
  return (nodeKind(n) === "terminal" ? n.terminal?.title : n.element?.title) ?? "";
}

export const KIND_LABEL: Record<ElementKind, string> = {
  terminal: "terminal",
  note: "nota",
  image: "imagem",
  video: "vídeo",
  web: "site",
  file: "arquivo",
  folder: "pasta",
  table: "tabela",
  flow: "astro",
  skill: "skill",
  service: "serviço",
  blackhole: "buraco negro",
};

/** Arquivo do disco mostrado num elemento "arquivo". */
export interface FileInfo {
  exists: boolean;
  isDir: boolean;
  size: number;
  /** ms desde 1970. */
  modified: number;
  ext: string;
  /** Começo do arquivo, se for texto. */
  preview?: string;
  truncated?: boolean;
}

/** Item de uma pasta mostrada num elemento "pasta". */
export interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: number;
}

/** Mudança no canvas pedida pelo processo principal (ex.: um agente criou uma nota). */
export type CanvasPatch =
  | { type: "add"; canvasId: string; node: CanvasNode; edge?: CanvasEdge }
  | { type: "update"; canvasId: string; id: string; element: Partial<ElementSpec> };

export interface UniverseStatus {
  /** Arquivos alterados e ainda não commitados no universo. */
  pending: string[];
  /** Commits do universo que a Origem ainda não tem. */
  ahead: number;
  branch: string;
  originBranch: string;
  /** Commits da Origem que o universo ainda não tem. */
  behind: number;
  /** Atualização com a Origem parada em conflito, esperando resolução. */
  updating: boolean;
  /** Arquivos ainda marcados como em conflito. */
  conflicts: string[];
}

export type UniverseResult<T = WorkspaceIndex> = { ok: true; index: T } | { ok: false; error: string; conflicts?: string[] };

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  /** Saída de onde a linha sai, nos astros com mais de um caminho (ex.: "a"/"b" no Gêmeos). */
  sourceHandle?: string;
}

export interface CanvasState {
  version: 1;
  /** Impede que um salvamento antigo desfaça uma transferência entre canvases. */
  revision?: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: { x: number; y: number; zoom: number };
}

export interface CanvasClipboardState {
  mode: "copy" | "cut";
  count: number;
  sourceCanvasId: string;
}

export type CanvasTransferResult =
  | { ok: true; state: CanvasState; inserted: string[]; clipboard: CanvasClipboardState | null; restoredCanvasId?: string }
  | { ok: false; error: string; /** O usuário fechou a janela de escolher arquivo. */ canceled?: boolean };

export type CanvasExportResult = { ok: true; count: number; path: string } | { ok: false; error: string; canceled?: boolean };

export interface GalaxyArchiveOptions {
  contents: boolean;
  media: boolean;
  env: boolean;
}
export interface GalaxyArchiveInfo {
  name: string;
  canvases: number;
  elements: number;
  files: number;
  bytes: number;
  options: GalaxyArchiveOptions;
}
export type GalaxyArchivePick = { ok: true; ticket: string; info: GalaxyArchiveInfo } | { ok: false; canceled?: boolean; error?: string };
export type GalaxyImportResult = { ok: true; index: WorkspaceIndex; workspaceId: string } | { ok: false; error: string };

/**
 * Universo paralelo de uma galáxia: cópia isolada do projeto numa branch própria
 * (git worktree), com canvas próprio. O canvas da Origem usa o id da galáxia.
 */
export interface UniverseMeta {
  id: string;
  name: string;
  /** Branch do universo; vazia quando o projeto não é um repositório git. */
  branch: string;
  /** Pasta onde os terminais do universo abrem (equivale à pasta da galáxia, dentro da cópia). */
  path: string;
  /** Raiz da cópia (git worktree); pode ser acima de `path` se a galáxia é uma subpasta do repositório. */
  worktree: string;
  /** false: o projeto não usa git, então o universo só separa o canvas. */
  isolated: boolean;
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  /** Pasta do projeto; terminais novos abrem nela. Vazio = pasta do usuário. */
  dir: string;
  universes?: UniverseMeta[];
  /** Universo aberto na tela; ausente = Origem. */
  activeUniverse?: string;
  /**
   * Arquivos fora do git (ex.: .env) copiados da Origem para cada universo novo.
   * Padrões relativos à raiz do repositório; ausente = DEFAULT_COPY_PATTERNS.
   */
  copyPatterns?: string[];
  /** auto: agentes commitam com `zn commit`; suggest: só deixam uma proposta para o usuário. */
  agentCommits?: "auto" | "suggest";
  /** Propostas de commit deixadas por agentes no modo "suggest". */
  proposals?: CommitProposal[];
}

export interface CommitProposal {
  id: string;
  /** Universo onde o agente trabalhou; ausente = Origem. */
  universeId?: string;
  agent: string;
  title: string;
  why: string;
  todo?: string;
  /** Arquivos alterados quando a proposta foi feita. */
  files: string[];
  at: string;
}

export const DEFAULT_COPY_PATTERNS = [".env", ".env.*", "**/.env", "**/.env.*"];

/** Onde um canvas vive: a Origem de uma galáxia ou um dos universos dela. */
export interface CanvasPlace {
  canvasId: string;
  workspace: WorkspaceMeta;
  universe?: UniverseMeta;
}

export interface WorkspaceIndex {
  version: 1;
  workspaces: WorkspaceMeta[];
  activeId: string;
  /** Contas de agentes, valem para todas as galáxias. */
  accounts?: AccountMeta[];
  settings?: AppSettings;
}

export interface AppSettings {
  /** Terminais em contêiner sem acesso direto ao disco do host. Depende do Docker; padrão: desligado. */
  isolatedAgents?: boolean;
  /** Memória (GB) e processadores de cada terminal isolado. Padrão: 6 GB e 4. */
  isolatedMemoryGb?: number;
  isolatedCpus?: number;
  /** Escreve as regras de git no CLAUDE.md / AGENTS.md globais e das contas (padrão: sim). */
  agentGuide?: boolean;
  /** Notificação do Windows quando um terminal termina um turno (padrão: não). */
  notifyDone?: boolean;
  /** Notificação do Windows quando um agente pede atenção com `zn notify` (padrão: sim). */
  notifyRequest?: boolean;
  /** Resumo do que aconteceu ao voltar depois de N minutos sem usar o Zênite (padrão: 10; 0 = desligado). */
  awaySummaryMinutes?: number;
  /** Número de avisos no ícone da barra de tarefas (padrão: sim). */
  taskbarBadge?: boolean;
  /** Piscar o botão da barra de tarefas quando alguém precisa de você (padrão: não). */
  flashTaskbar?: boolean;
  /** Impedir que o computador durma (padrão: enquanto os agentes trabalham). */
  preventSleep?: "never" | "working" | "always";
  /** Perguntar antes de fechar se há terminais abertos (padrão: sim). */
  confirmQuit?: boolean;
  /** Shell dos terminais novos (padrão: automático). */
  shell?: ShellChoice;
  /** Escala da interface (1 = 100%). */
  uiScale?: number;
  /** Backup automático (ao abrir, a cada 6 h e ao fechar). Padrão: sim. */
  autoBackup?: boolean;
  /** Modelo usado pelo Claude Code via OpenRouter (ex.: anthropic/claude-sonnet-4.5); vazio = o padrão. */
  openrouterModel?: string;
  /** Como abrir links clicados no app (padrão: perguntar). */
  linkOpen?: LinkOpen;
  /** Como Claude, Codex e Antigravity pedem permissão (padrão: sempre perguntar). */
  agentPermissions?: AgentPermissions;
}

/** "ask": pergunta a cada link; "external": navegador do sistema; "zenite": navegador do Zênite. */
export type LinkOpen = "ask" | "external" | "zenite";

/** "ask": pergunta sempre; "sandbox": sem perguntar, dentro da área protegida; "full": sem perguntar e sem sandbox. */
export type AgentPermissions = "ask" | "sandbox" | "full";

export type ShellChoice = "auto" | "pwsh" | "powershell" | "cmd" | "gitbash";

export interface SearchItem {
  id: string;
  title: string;
  kind: ElementKind;
  workspaceId: string;
  universeId: string | null;
  /** "Loja · Checkout novo" */
  place: string;
}

export interface BackupInfoView {
  id: string;
  created: number;
  reason: string;
  bytes: number;
  canvases: number;
}

export interface SkillInfoView {
  name: string;
  description: string;
  dir: string;
  builtin?: boolean;
  /** Só nas encontradas: de qual agente veio. */
  source?: string;
}

export interface SkillsState {
  skills: SkillInfoView[];
  results: { target: { label: string; root: string }; installed: string[]; conflicts: string[] }[];
  discovered: SkillInfoView[];
  library: string;
}

/** Por que um terminal pede atenção, e onde ele está. */
export interface AttentionInfo {
  reason: "done" | "request";
  message?: string;
  since: number;
  workspaceId?: string;
  universeId?: string | null;
}

export interface CreatePtyRequest {
  id: string;
  command: string;
  cwd: string;
  cols: number;
  rows: number;
  account?: string;
  provider?: AgentProvider;
  /** Papel de Sol; continua sujeito às permissões globais dos agentes. */
  sun?: boolean;
}

export interface GitRepoState {
  isRepo: boolean;
  hasCommits: boolean;
  /** Raiz do repositório. */
  top: string | null;
  /** Arquivos alterados e ainda não commitados. */
  pending: number;
}

export interface GitIdentity {
  name: string;
  email: string;
}

export interface EnvVar {
  key: string;
  value: string;
}

/** O .env da pasta do canvas aberto (Origem da galáxia ou cópia do universo). */
export interface EnvInfo {
  file: string;
  exists: boolean;
  entries: EnvVar[];
  /** true: o git ignora o .env; false: ele seria commitado; null: pasta sem git. */
  gitignored: boolean | null;
  error?: string;
}

/** Uso de recursos de um terminal: o shell e tudo que rodou a partir dele. */
/** Uma janela de limite de uso (Codex: 5 h e semanal). */
export interface UsageWindow {
  usedPercent: number;
  windowMinutes: number;
  /** Quando a janela zera (ms desde 1970); 0 se não informado. */
  resetsAt: number;
}

/** Limite de uso do agente de um terminal. */
export interface TerminalUsage {
  /** "codex": números do arquivo da sessão; "screen": só a mensagem de limite vista na tela. */
  source: "codex" | "screen";
  primary?: UsageWindow;
  secondary?: UsageWindow;
  /** O limite acabou. */
  reached: boolean;
  /** Linha da tela com o aviso, quando foi vista. */
  message?: string;
  /** Quando estes dados foram gravados (ms). */
  updatedAt: number;
}

export interface TerminalStats {
  /** Memória somada, em bytes. */
  total: number;
  processes: { pid: number; name: string; rss: number; root: boolean }[];
}

export interface CreatePtyResult {
  ok: boolean;
  /** Já existia um PTY com esse id (ex.: o renderer recarregou). */
  reused?: boolean;
  /** Saída acumulada para repintar o terminal quando reused = true. */
  backlog?: string;
  error?: string;
}

export interface UpdateState {
  /** Versão instalada. */
  current: string;
  /** dev = rodando com `npm start` (sem atualização automática). */
  status: "dev" | "idle" | "checking" | "downloading" | "ready" | "error";
  /** Versão nova encontrada. */
  version?: string;
  percent?: number;
  /** true = só os arquivos do app (mesmo Electron); false = instalador completo. */
  light?: boolean;
  /** Tamanho do download, em bytes. */
  size?: number;
  /** O que mudou, em Markdown simples (títulos, listas, negrito). */
  notes?: string;
  error?: string;
  checkedAt?: number;
}

/** Pergunta no visual do app: `ok` é o botão principal; sem `cancel`, é só um aviso. */
export interface AppDialogRequest {
  id: number;
  title: string;
  message: string;
  detail?: string;
  ok: string;
  cancel?: string;
  danger?: boolean;
  checkbox?: string;
}

export interface OApi {
  galaxyArchive: {
    export(workspaceId: string, options: GalaxyArchiveOptions): Promise<CanvasExportResult>;
    pick(): Promise<GalaxyArchivePick>;
    import(ticket: string, options: GalaxyArchiveOptions): Promise<GalaxyImportResult>;
  };
  pty: {
    runtime(id: string): Promise<{ isolated: boolean; running: boolean }>;
    create(req: CreatePtyRequest): Promise<CreatePtyResult>;
    restart(req: CreatePtyRequest): Promise<CreatePtyResult>;
    /** Atualiza as permissões da sessão ao promover a Sol; outros CLIs precisam reabrir. */
    promoteSun(req: CreatePtyRequest): Promise<{ ok: boolean; restart?: boolean; fullAccess?: boolean; error?: string }>;
    /** Tema do próprio CLI ("dark", "light" ou nome de esquema); null se ele não tem tema. */
    cliTheme(command: string, account?: string, provider?: AgentProvider): Promise<string | null>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    kill(id: string): void;
    onData(listener: (id: string, data: string) => void): () => void;
    onExit(listener: (id: string, exitCode: number) => void): () => void;
    /** A cada poucos segundos: memória e processos de cada terminal aberto. */
    onStats(listener: (stats: Record<string, TerminalStats>) => void): () => void;
    /** Limite de uso do agente de cada terminal (a cada ~4 s). */
    onUsage(listener: (usage: Record<string, TerminalUsage>) => void): () => void;
    /** Selos de andamento (zn status) de todos os terminais. */
    tasks(): Promise<Record<string, TaskStatus>>;
    onTasks(listener: (all: Record<string, TaskStatus>) => void): () => void;
    /** Dispensa o aviso de limite atingido visto na tela. */
    dismissLimit(id: string): void;
    /** Encerra um processo (e filhos) que pertence ao terminal. Não encerra o shell. */
    killProcess(terminalId: string, pid: number): Promise<boolean>;
  };
  workspaces: {
    isolationStatus(): Promise<{ available: boolean; prepared: boolean; installed: boolean; error?: string }>;
    prepareIsolation(): Promise<{ ok: boolean; error?: string }>;
    /** Instala o Docker Desktop pelo WinGet (a pessoa confirma antes, na interface). */
    installDocker(): Promise<{ ok: boolean; error?: string }>;
    revokeDirectAccess(): Promise<void>;
    list(): Promise<WorkspaceIndex>;
    create(name: string, dir: string): Promise<WorkspaceIndex>;
    update(id: string, changes: Partial<Omit<WorkspaceMeta, "id">>): Promise<WorkspaceIndex>;
    /** Encerra os terminais do workspace e apaga o canvas dele. */
    remove(id: string): Promise<WorkspaceIndex>;
    setActive(id: string): Promise<WorkspaceIndex>;
    /** Abre o seletor de pastas do sistema; `start` é onde ele começa. */
    pickDirectory(start?: string): Promise<string | null>;
    /** O processo principal mudou o índice (ex.: um agente deixou uma proposta de commit). */
    onChanged(listener: (index: WorkspaceIndex) => void): () => void;
    setSettings(settings: AppSettings): Promise<WorkspaceIndex>;
  };
  search: {
    /** Terminais e elementos de todas as galáxias e universos (sem desenhos). */
    items(): Promise<SearchItem[]>;
  };
  skills: {
    state(): Promise<SkillsState>;
    /** Sem `dir`, abre o seletor de pasta. */
    add(dir?: string): Promise<{ ok: boolean; error?: string; state: SkillsState }>;
    remove(name: string): Promise<SkillsState>;
    sync(): Promise<SkillsState>;
    open(path: string): void;
  };
  backups: {
    list(): Promise<BackupInfoView[]>;
    create(): Promise<BackupInfoView[]>;
    remove(id: string): Promise<BackupInfoView[]>;
    /** Restaura e recarrega a interface. */
    restore(id: string): Promise<{ ok: boolean; error?: string }>;
    open(): void;
  };
  system: {
    /** Espaço usado pelo app, por parte. */
    usage(): Promise<{ label: string; bytes: number }[]>;
    info(): Promise<{ version: string; dataDir: string; platform: string; electron: string; sleepBlocked: boolean; shells: { value: ShellChoice; label: string; available: boolean }[] }>;
    openDataDir(): void;
    /** Abre um endereço http(s) do jeito escolhido nas configurações (ou pergunta). */
    openUrl(url: string): void;
    /** Abre já decidido: navegador do sistema ou do Zênite. */
    openLink(url: string, how: "external" | "zenite"): void;
    /** O processo principal pede para perguntar como abrir o link. */
    onLinkAsk(listener: (url: string) => void): () => void;
    /** "+ Canvas" no navegador do Zênite: pôr o site no canvas aberto. */
    onAddSite(listener: (site: { url: string; title: string }) => void): () => void;
    readClipboard(): Promise<string>;
    writeClipboard(text: string): Promise<void>;
    /** Menu do botão direito do terminal; devolve o que foi escolhido (null = fechou sem escolher). */
    terminalMenu(opts: { hasSelection: boolean; link: boolean }): Promise<"copy" | "copyLink" | "paste" | "selectAll" | "clear" | null>;
    /** Pedido para confirmar o fechamento: quantos terminais estão abertos. */
    onConfirmClose(listener: (openTerminals: number) => void): () => void;
    /** O diálogo de confirmação apareceu (sem isso, o app usa a caixa do Windows). */
    closeShown(): void;
    answerClose(close: boolean, dontAskAgain: boolean): void;
  };
  dialogs: {
    onAsk(listener: (request: AppDialogRequest) => void): () => void;
    /** O processo principal desistiu da pergunta (fluxo parado, tempo esgotado). */
    onClose(listener: (id: number) => void): () => void;
    /** A interface recebeu a pergunta (sem isso, o app usa a caixa do Windows). */
    shown(id: number): void;
    answer(id: number, ok: boolean, checked: boolean): void;
  };
  attention: {
    get(): Promise<Record<string, AttentionInfo>>;
    onChanged(listener: (all: Record<string, AttentionInfo>) => void): () => void;
    /** Notificação clicada: ir até o terminal. */
    onJump(listener: (terminalId: string) => void): () => void;
    /** Ao voltar depois de um tempo fora: o que aconteceu enquanto isso. */
    onAwaySummary(listener: (summary: AwaySummary) => void): () => void;
    /** Terminal em foco (null = nenhum). */
    focus(terminalId: string | null): void;
    clear(terminalId: string): void;
    /** Número e desenho do selo do ícone na barra de tarefas (dataURL PNG; vazio = sem selo). */
    badge(count: number, dataUrl: string): void;
  };
  proposals: {
    /** Commita a proposta (com edições do usuário) na pasta onde o agente trabalhou. */
    apply(workspaceId: string, proposalId: string, edited: { title: string; why: string; todo?: string }): Promise<{ ok: boolean; error?: string; index: WorkspaceIndex }>;
    discard(workspaceId: string, proposalId: string): Promise<WorkspaceIndex>;
  };
  elements: {
    pickSkill(): Promise<{ path: string; title: string } | null>;
    readSkill(id: string, file?: string): Promise<IntegrationReply>;
    useService(id: string, request: ServiceRequest): Promise<IntegrationReply>;
    readNote(id: string): Promise<string>;
    writeNote(id: string, content: string): void;
    onNoteChanged(listener: (id: string, content: string) => void): () => void;
    /** Abre o seletor de arquivos e copia a mídia escolhida para o app. */
    pickMedia(kind: "image" | "video"): Promise<{ file: string; name: string } | null>;
    /** Copia um arquivo (ex.: arrastado para a janela) para a pasta de mídia. */
    importMedia(path: string): Promise<{ file: string; name: string; kind: "image" | "video" } | null>;
    pathForFile(file: File): string;
    /** Avisa o processo principal qual webview mostra o site do nó. */
    registerWeb(nodeId: string, webContentsId: number): void;
    /** Espera o depurador do site ligar (no máximo 2 s) antes de carregar o endereço. */
    inspectReady(webContentsId: number): Promise<void>;
    /** Elemento removido do canvas: os arquivos que só ele usava vão para a lixeira. */
    removed(node: CanvasNode): void;
    /** Remoção desfeita (Ctrl+Z): os arquivos voltam da lixeira. */
    restored(node: CanvasNode): void;
    readTable(id: string): Promise<string[][]>;
    writeTable(id: string, rows: string[][]): void;
    onTableChanged(listener: (id: string, rows: string[][]) => void): () => void;
    fileInfo(path: string): Promise<FileInfo>;
    listDir(path: string): Promise<{ ok: true; entries: DirEntry[]; more: number } | { ok: false; error: string }>;
    /** Seletor de arquivo do sistema (qualquer tipo); devolve o caminho. */
    pickFile(): Promise<string | null>;
    /** Abre com o programa padrão do Windows. Devolve "" ou a mensagem de erro. */
    openPath(path: string): Promise<string>;
    /** Abre o Explorer com o arquivo selecionado. */
    revealPath(path: string): void;
    /** Muda o zoom de um site do canvas (webContents do <webview>). */
    setWebZoom(webContentsId: number, factor: number): void;
    /** Script que roda dentro dos sites do canvas (Ctrl + rodinha = zoom). */
    webviewPreload: string;
  };
  git: {
    /** Versão do git instalada, ou null se não estiver instalado. */
    version(): Promise<string | null>;
    state(workspaceId: string, universeId: string | null): Promise<GitRepoState>;
    identity(workspaceId: string): Promise<GitIdentity>;
    setIdentity(name: string, email: string): Promise<GitIdentity>;
    /** Cria o repositório (se preciso) e o .gitignore padrão; devolve o que entraria no 1º commit. */
    init(workspaceId: string): Promise<{ ok: boolean; error?: string; files: string[] }>;
    firstCommit(workspaceId: string): Promise<{ ok: boolean; error?: string; needsIdentity?: boolean }>;
    openInstallPage(): void;
  };
  env: {
    read(workspaceId: string, universeId: string | null): Promise<EnvInfo>;
    write(workspaceId: string, universeId: string | null, entries: EnvVar[]): Promise<EnvInfo>;
    /** Acrescenta .env ao .gitignore do repositório. */
    ignore(workspaceId: string, universeId: string | null): Promise<EnvInfo>;
    /** Vigia o .env enquanto a janela está aberta; `listener` roda a cada mudança. Devolve o "parar". */
    watch(workspaceId: string, universeId: string | null, listener: () => void): () => void;
  };
  accounts: {
    create(name: string, agent: AccountAgent): Promise<WorkspaceIndex>;
    /** Remove a conta e apaga o login guardado nela. */
    remove(id: string): Promise<WorkspaceIndex>;
    /** Por conta: se já tem login guardado e em que pasta. */
    status(): Promise<Record<string, { loggedIn: boolean; dir: string }>>;
  };
  universes: {
    /** Abre um universo paralelo a partir da Origem. */
    create(workspaceId: string, name: string, cloneLayout: boolean): Promise<UniverseResult>;
    /** Universo aberto na tela; null = Origem. */
    setActive(workspaceId: string, universeId: string | null): Promise<WorkspaceIndex>;
    status(workspaceId: string, universeId: string): Promise<UniverseStatus | null>;
    /** O que um universo novo receberia: se há git e quais arquivos fora do git seriam copiados. */
    preview(workspaceId: string): Promise<{ isolated: boolean; files: string[] }>;
    /** Commita tudo que está pendente no universo. */
    commit(workspaceId: string, universeId: string, message: string): Promise<UniverseResult<UniverseStatus>>;
    /** Faz o merge do universo na Origem; `keep` mantém o universo depois. */
    converge(workspaceId: string, universeId: string, keep: boolean): Promise<UniverseResult>;
    /** Traz para o universo os commits novos da Origem. Em conflito, para e deixa os arquivos para resolver. */
    update(workspaceId: string, universeId: string): Promise<UniverseResult<UniverseStatus>>;
    /** Conclui a atualização depois dos conflitos resolvidos. */
    finishUpdate(workspaceId: string, universeId: string): Promise<UniverseResult<UniverseStatus>>;
    /** Desiste da atualização: o universo volta a como estava antes dela. */
    abortUpdate(workspaceId: string, universeId: string): Promise<UniverseResult<UniverseStatus>>;
    /** Descarta o universo, sua cópia e sua branch. */
    collapse(workspaceId: string, universeId: string): Promise<UniverseResult>;
  };
  canvas: {
    /** Avisa qual canvas está na tela (ou null), para receber mudanças ao vivo. */
    mounted(canvasId: string | null): void;
    onPatch(listener: (patch: CanvasPatch) => void): () => void;
    /** Lote de mudanças do Sol: a interface aplica (entra no Ctrl+Z) e responde com opsResult. */
    onOps(listener: (request: CanvasOpsRequest) => void): () => void;
    opsResult(requestId: number, reply: CanvasOpsReply): void;
    /** Pedido de tela do Sol (organizar, enquadrar, print...). */
    onUi(listener: (request: CanvasUiRequest) => void): () => void;
    uiResult(requestId: number, reply: CanvasUiReply): void;
    /** Algo passou de `from` para `to` (pedido, resposta, leitura, escrita de um agente). */
    onFlow(listener: (from: string, to: string) => void): () => void;
    load(canvasId: string): Promise<CanvasState | null>;
    save(canvasId: string, state: CanvasState): Promise<void>;
    /** Gravação síncrona, usada ao fechar a janela. */
    saveNow(canvasId: string, state: CanvasState): void;
    /** Grava os tipos escolhidos num .zenite (o usuário escolhe onde). */
    export(state: CanvasState, kinds: NodeKind[], name: string): Promise<CanvasExportResult>;
    /** Escolhe um .zenite e põe os elementos dele neste canvas, centrados em `at`. */
    import(canvasId: string, state: CanvasState, at: { x: number; y: number }): Promise<CanvasTransferResult>;
  };
  flows: {
    prepareCode(language: CodeLanguage, nodeId: string): Promise<CodeRuntimeResult>;
    signal(nodeId: string, input?: string): Promise<{ ok: boolean; error?: string }>;
    stop(nodeId: string): Promise<{ ok: boolean; error?: string }>;
    /** Contas com login, modelos e esforços de cada CLI, para os menus do nó Agente. */
    options(): Promise<FlowAgentOptions>;
    /** Roda o fluxo que começa neste Gatilho (o canvas é salvo antes). */
    run(canvasId: string, state: CanvasState, triggerId: string): Promise<{ ok: boolean; error?: string }>;
    onStatus(listener: (status: FlowStatus) => void): () => void;
  };
  canvasClipboard: {
    get(): Promise<CanvasClipboardState | null>;
    capture(canvasId: string, state: CanvasState, ids: string[], mode: "copy" | "cut"): Promise<CanvasTransferResult>;
    paste(canvasId: string, state: CanvasState, at: { x: number; y: number }): Promise<CanvasTransferResult>;
    clear(canvasId: string, state: CanvasState): Promise<CanvasTransferResult>;
    onChanged(listener: (state: CanvasClipboardState | null) => void): () => void;
  };
  updates: {
    get(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    /** Fecha o app, instala a versão baixada e abre de novo. */
    install(): void;
    onState(listener: (state: UpdateState) => void): () => void;
  };
  secrets: {
    /** Só diz se a chave existe; o valor nunca vem para a página. */
    status(): Promise<{ openrouter: boolean; encryption: boolean }>;
    setOpenRouterKey(key: string): Promise<{ ok: boolean; error?: string }>;
    removeOpenRouterKey(): Promise<void>;
  };
  platform: NodeJS.Platform;
}
