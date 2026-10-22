import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { app, BrowserWindow, clipboard, Menu, powerMonitor, safeStorage, dialog, ipcMain as electronIpcMain, nativeImage, net, Notification, powerSaveBlocker, protocol, shell, webContents } from "electron";
import { homedir } from "node:os";
import { basename, delimiter, join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { AccountAgent, AccountMeta, AppSettings, AttentionInfo, CanvasExportResult, CanvasNode, CanvasState, CanvasTransferResult, NodeKind, CreatePtyRequest, EnvVar, FlowAgentOptions, FlowSpec, FlowStatus, TaskStatus, TerminalStats, TerminalUsage, WorkspaceMeta } from "../shared/types";
import { nodeTitle } from "../shared/types";
import type { CanvasOpsReply, CanvasUiReply } from "../shared/canvasOps";
import { RoleStore, SolLog } from "./solTools";
import { plural } from "../shared/plural";
import { AttentionTracker, type Attention } from "./attention";
import { AwayLog, hasNews } from "./awaySummary";
import { composeSteps, MAX_ATTACHMENT, stashAttachment, waitingForChoice } from "./composer";
import { Accounts } from "./accounts";
import { CanvasAccess } from "./canvasAccess";
import { installDocker, IsolatedRuntime } from "./isolatedRuntime";
import { isolatedFile } from "./isolatedFiles";
import { cliTheme } from "./cliTheme";
import { installGuide, uninstallGuide } from "./agentGuide";
import { commitAsAgent, commitsSince, pendingCount, recentHistory } from "./gitMemory";
import { git } from "./universes";
import { firstCommit, gitVersion, identity, initRepo, repoState, setIdentity } from "./gitSetup";
import { neighborhoodFromStore } from "./canvasGraph";
import { controlAddress, installCliShims, ZENITE_SKILL } from "./cliInstall";
import { SkillLibrary, type SkillTarget } from "./skills";
import { ControlServer } from "./controlServer";
import { ElementService } from "./elements";
import { CanvasIntegrations, readCanvasSkill } from "./canvasIntegrations";
import { FlowActions } from "./flowActions";
import { prepareCodeRuntime } from "./codeRuntime";
import { fileInfo, listDir } from "./files";
import { ignoreEnv, readEnvInfo, writeEnv } from "./envFile";
import { killTree, processTree, sampleProcesses, stopSampler } from "./processes";
import { PtyManager } from "./ptyManager";
import { BackupService, dirSize } from "./backup";
import { availableShells } from "./shell";
import { UniverseService } from "./universes";
import { openRouterEnv, Secrets } from "./secrets";
import { isInstallingUpdate, startUpdater } from "./updater";
import { WebDriver, type WebTarget } from "./webDriver";
import { WebInspector, type DebugChannel } from "./webInspector";
import { WorkspaceStore } from "./workspaceStore";
import { readCanvasArchive, writeCanvasArchive } from "./canvasArchive";
import { exportGalaxy, inspectGalaxy, importGalaxy } from "./galaxyArchive";
import type { AppDialogRequest, GalaxyArchiveOptions } from "../shared/types";
import { randomUUID } from "node:crypto";
import { CanvasClipboard } from "./canvasClipboard";
import { ZeniteBrowser } from "./zeniteBrowser";
import { killTrees, killZeniteCodex, killZeniteCodexOf } from "./terminalCleanup";
import { missingFrom, readPathNow, refreshPath } from "./freshPath";
import { programOf, withPermissions, withSolAccess } from "./fullAccess";
import { agentOf, looksBusy, parseMenu, pick } from "./agentControl";
import { canGrantSolAccess, flowPermission, grantCodexSolAccess, scriptPermission, solWelcomeMessage } from "./solAccess";
import { FlowWaits } from "./flowWaits";
import { SunAuthority } from "./sunAuthority";
import { protectOutputStreams } from "./stdio";
import { cleanUserAgent } from "./userAgent";
import { mediaResponse } from "./mediaResponse";
import { ignitionDue, runFlow } from "./flowRunner";
import { ChronosScheduler } from "../shared/chronos";
import { codexModels as codexModelsOf, parseAgyModels, runHeadless } from "./headlessAgent";
import { codexUsage, limitMessage, limitUntil } from "./agentUsage";

protectOutputStreams();

let win: BrowserWindow | null = null;
let control: ControlServer | null = null;

// Imagens e vídeos do canvas são servidos por o-media://arquivo/<nome>.
protocol.registerSchemesAsPrivileged([
  { scheme: "o-media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Nome do app e pasta de dados. Quem já usava o app quando ele se chamava "O" continua na pasta
// antiga: as cópias dos universos (git worktree) estão registradas com o caminho absoluto dela.
app.setName("Zênite");
const legacyData = join(app.getPath("appData"), "o");
// ZENITE_DATA_DIR: pasta de dados separada, para testes e medições sem tocar nos dados reais.
// Nessa cópia de teste, não encerra os processos de fundo do Codex das contas: seriam os do Zênite
// de verdade, aberto ao mesmo tempo.
const testInstance = !!process.env.ZENITE_DATA_DIR;
app.setPath("userData", process.env.ZENITE_DATA_DIR || (existsSync(legacyData) ? legacyData : join(app.getPath("appData"), "Zenite")));
if (process.platform === "win32") app.setAppUserModelId("app.zenite");
// Sites se identificam como o Chrome: o nome "Zênite" (com acento) na identificação fazia o Instagram
// recusar a página ("4xx Client Error"), e "Electron" faz o Google recusar login. Vale para os sites do
// canvas e o navegador do Zênite.
app.userAgentFallback = cleanUserAgent(app.userAgentFallback);

const ICON = join(__dirname, "../../build", process.platform === "win32" ? "icon.ico" : "icon.png");
const clampZoom = (f: number) => Math.min(3, Math.max(0.25, Math.round(f * 100) / 100));

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#08090b",
    title: "Zênite",
    icon: ICON,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Sites no canvas usam <webview>.
      webviewTag: true,
    },
  });
  // Menu escondido de vez (os atalhos dele continuam valendo): com autoHideMenuBar, soltar o Alt
  // mostrava a barra, e Alt + arrastar é o jeito de mover elementos no canvas.
  win.setMenuBarVisibility(false);
  win.loadFile(join(__dirname, "../renderer/index.html"));
  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(async () => {
  const dataDir = app.getPath("userData");
  const suns = new SunAuthority();
  const store = new WorkspaceStore(dataDir, (id, state) => suns.present(id, state)!);
  store.protectRuntimeState();
  const isMainUI = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => {
    try {
      return !!win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame
        && event.senderFrame.url.split("#")[0] === pathToFileURL(join(__dirname, "../renderer/index.html")).href;
    } catch { return false; }
  };
  const requireMainUI = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => {
    if (!isMainUI(event)) throw new Error("Esta ação só pode partir da janela principal do Zênite.");
  };
  // Todos os canais internos desta janela ficam fora do alcance de sites, subframes e outras janelas.
  const ipcMain = {
    handle: (channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) => electronIpcMain.handle(channel, (event, ...args) => {
      requireMainUI(event);
      return listener(event, ...args);
    }),
    on: (channel: string, listener: (event: Electron.IpcMainEvent, ...args: any[]) => void) => electronIpcMain.on(channel, (event, ...args) => {
      if (!isMainUI(event)) { event.returnValue = false; return; }
      listener(event, ...args);
    }),
  };
  // Perguntas (permissões, aprovações, erros) no visual do app, não na caixa do Windows. Se a
  // página não receber a pergunta em 1,5 s (travada ou carregando), usa a caixa do Windows.
  type AskOptions = Omit<AppDialogRequest, "id"> & { signal?: AbortSignal };
  type AskResult = { ok: boolean; checked: boolean };
  const asks = new Map<number, { shown: boolean; done: (r: AskResult) => void }>();
  let askSeq = 0;
  const ask = ({ signal, ...request }: AskOptions): Promise<AskResult> => new Promise(resolve => {
    const target = win;
    if (!target || target.isDestroyed() || signal?.aborted) return resolve({ ok: false, checked: false });
    const id = ++askSeq;
    const done = (r: AskResult) => {
      if (!asks.delete(id)) return;
      signal?.removeEventListener("abort", abort);
      resolve(r);
    };
    const abort = () => { if (!target.isDestroyed()) target.webContents.send("dialog:close", id); done({ ok: false, checked: false }); };
    const native = () => {
      const buttons = request.cancel ? [request.cancel, request.ok] : [request.ok];
      void dialog.showMessageBox(target, { type: "question", title: request.title, message: request.message, detail: request.detail, buttons, defaultId: 0, cancelId: 0, signal, ...(request.checkbox ? { checkboxLabel: request.checkbox } : {}) })
        .then(r => done({ ok: !request.cancel || r.response === 1, checked: r.checkboxChecked }), () => done({ ok: false, checked: false }));
    };
    asks.set(id, { shown: false, done });
    signal?.addEventListener("abort", abort, { once: true });
    // Os testes de janela respondem pela caixa do Windows (substituída por eles).
    if (process.env.ZENITE_NATIVE_DIALOGS === "1") return native();
    target.webContents.send("dialog:ask", { id, ...request });
    setTimeout(() => {
      if (asks.get(id)?.shown !== false || target.isDestroyed()) return;
      target.webContents.send("dialog:close", id);
      native();
    }, 1500);
  });
  ipcMain.on("dialog:shown", (_e, id: number) => { const a = asks.get(id); if (a) a.shown = true; });
  ipcMain.on("dialog:answer", (_e, id: number, ok: boolean, checked: boolean) => asks.get(id)?.done({ ok: ok === true, checked: checked === true }));
  const backups = new BackupService(dataDir);
  let restoring = false;
  const elements = new ElementService(dataDir, store, {
    noteChanged: (id, content) => win?.webContents.send("note:changed", id, content),
    tableChanged: (id, rows) => win?.webContents.send("table:changed", id, rows),
    patch: (patch) => win?.webContents.send("canvas:patch", patch),
    ops: (request) => win?.webContents.send("canvas:ops", request),
    ui: (request) => win?.webContents.send("canvas:ui", request),
    killTerminal: (id) => ptys.kill(id),
    // Recrutado num canvas fora da tela: já roda sem tela; ao abrir a galáxia, a tela pega a sessão.
    startTerminal: (t) => {
      terminalAccount.set(t.id, t.account);
      terminalCommand.set(t.id, t.command ?? "");
      const started = createTerminal({ id: t.id, command: t.command, cwd: t.cwd, account: t.account, provider: t.provider, sun: t.sun, cols: 120, rows: 32 });
      // Sem tela ninguém via a falha: o terminal ficava "encerrado" sem motivo.
      if (!started.ok) attention.request(t.id, started.error ?? "Não deu para abrir o terminal.");
    },
  });
  const roles = new RoleStore(join(dataDir, "papeis"));
  const integrations = new CanvasIntegrations(store, async ({ title, detail }) => {
    if (!win || win.isDestroyed()) return false;
    return (await ask({ title, message: title, detail, cancel: "Cancelar", ok: "Permitir esta vez" })).ok;
  });
  const tasksFile = join(dataDir, "selos.json");
  const solLog = new SolLog(join(dataDir, "registro-do-sol"));
  // Cada lote do Sol também entra no resumo de ausência.
  const appendSolLog = solLog.append.bind(solLog);
  solLog.append = (canvasId, entry) => { appendSolLog(canvasId, entry); awayLog.record({ kind: "sol", what: entry.what }); };
  const canvasClipboard = new CanvasClipboard(dataDir, store, elements);

  // Com pedaços (Range): o vídeo pula para qualquer ponto e toca de novo depois do fim (mediaResponse.ts).
  protocol.handle("o-media", (req) => {
    const file = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ""));
    return mediaResponse(elements.mediaPath(file), req.headers.get("range"));
  });

  // Webviews de sites: id do nó -> webContents, e o "F12" de cada um (console, rede, código).
  const webViews = new Map<string, number>();
  const inspectors = new Map<number, WebInspector>();
  const inspectorFor = (wcId: number): WebInspector | null => {
    const wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed()) return null;
    let inspector = inspectors.get(wcId);
    if (!inspector) {
      inspector = new WebInspector(wc.debugger as unknown as DebugChannel);
      inspectors.set(wcId, inspector);
      wc.once("destroyed", () => inspectors.delete(wcId));
    }
    return inspector;
  };
  // Liga o depurador assim que o site nasce, antes de carregar: o F12 pega também o carregamento inicial.
  // Exceção: o login do Google recusa navegador com depurador ligado ("Esse navegador ou app pode
  // não ser seguro"). Nessas páginas o depurador sai e volta quando o site sai delas.
  const isGoogleLogin = (url: string) => /^https:\/\/accounts\.google\.com\//i.test(url);
  app.on("web-contents-created", (_e, wc) => {
    if (wc.getType() !== "webview") return;
    void inspectorFor(wc.id)?.start().catch(() => {});
    wc.on("did-start-navigation", (details) => {
      if (!details.isMainFrame || details.isSameDocument) return;
      if (isGoogleLogin(details.url)) {
        if (wc.debugger.isAttached()) wc.debugger.detach();
      } else void inspectorFor(wc.id)?.start().catch(() => {});
    });
  });
  const webInspect = (nodeId: string): WebInspector | null => {
    const id = webViews.get(nodeId);
    return id !== undefined ? inspectorFor(id) : null;
  };
  const webFor = (nodeId: string): WebDriver | null => {
    const id = webViews.get(nodeId);
    const wc = id !== undefined ? webContents.fromId(id) : undefined;
    return wc && !wc.isDestroyed() ? new WebDriver(wc as unknown as WebTarget) : null;
  };

  // CLI `o`: servidor local + atalhos no PATH de cada terminal.
  const address = controlAddress();
  const binDir = join(dataDir, "bin");
  // No app instalado o CLI fica fora do .asar (app.asar.unpacked): o Node puro não lê dentro dele.
  const cliScript = join(__dirname, "../cli/index.js").replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
  installCliShims(binDir, process.execPath, cliScript);
  // Regras de git para os agentes: CLAUDE.md global do Claude Code e AGENTS.md global do Codex,
  // mais os das contas. Bloco marcado (não toca no resto do arquivo); desligável em Configurações.
  const accounts = new Accounts(join(dataDir, "contas"));
  // Claude Code via OpenRouter usa uma pasta de configuração própria, tratada como mais uma conta
  // (recebe o guia e as skills), para o login normal da Anthropic não interferir.
  const OPENROUTER_ACCOUNT: AccountMeta = { id: "openrouter", name: "OpenRouter", agent: "claude" };
  const allAccounts = () => [...(store.list().accounts ?? []), OPENROUTER_ACCOUNT];
  const secrets = new Secrets(join(dataDir, "segredos"), safeStorage);
  const globalGuides = [join(homedir(), ".claude", "CLAUDE.md"), join(homedir(), ".codex", "AGENTS.md")];
  // Skills para todos os agentes: Claude (padrão e cada conta) e ~/.agents/skills (Codex, Gemini...).
  const skillTargets = (): SkillTarget[] => {
    const targets: SkillTarget[] = [];
    if (existsSync(join(homedir(), ".claude"))) targets.push({ label: "Claude Code", root: join(homedir(), ".claude", "skills") });
    targets.push({ label: "Codex, Gemini e outros (padrão Agent Skills)", root: join(homedir(), ".agents", "skills") });
    for (const a of allAccounts()) {
      const dir = accounts.skillsDir(a);
      if (dir) targets.push({ label: `Claude · conta ${a.name}`, root: dir });
    }
    return targets;
  };
  const skills = new SkillLibrary(join(dataDir, "skills"), skillTargets, () => [ZENITE_SKILL]);
  /** Para agentes que não carregam skills sozinhos: a lista vai junto do guia (AGENTS.md / CLAUDE.md). */
  const guideExtra = () => {
    const list = skills.index();
    return list ? `## Skills deste computador\n\nSe você não carrega skills sozinho, estas existem aqui. Quando a tarefa combinar, leia o SKILL.md indicado e siga.\n\n${list}\n` : "";
  };
  const applyGuide = (enabled: boolean) => {
    const extra = guideExtra();
    for (const f of globalGuides) {
      if (enabled) installGuide(f, true, extra);
      else uninstallGuide(f);
    }
    for (const a of allAccounts()) accounts.prepare(a, enabled, extra);
  };
  let lastSync = skills.sync();
  applyGuide(store.list().settings?.agentGuide !== false);

  // ---- Quem precisa de você: selos, avisos do Windows, barra de tarefas ----
  const settings = (): AppSettings => store.list().settings ?? {};
  const nodeInfo = (id: string) => {
    for (const place of store.places()) {
      const n = store.loadCanvas(place.canvasId)?.nodes.find((x) => x.id === id);
      if (n) return { place, title: nodeTitle(n) };
    }
    return null;
  };
  const enrich = (all: Record<string, Attention>): Record<string, AttentionInfo> =>
    Object.fromEntries(
      Object.entries(all).map(([id, a]) => {
        const info = nodeInfo(id);
        return [id, { ...a, workspaceId: info?.place.workspace.id, universeId: info?.place.universe?.id ?? null }];
      }),
    );
  const announce = (id: string, a: Attention) => {
    const s = settings();
    const away = !win?.isFocused();
    if (away && s.flashTaskbar) win?.flashFrame(true);
    const wanted = a.reason === "request" ? s.notifyRequest !== false : s.notifyDone === true;
    if (!wanted || !away || !Notification.isSupported()) return;
    const info = nodeInfo(id);
    const where = info ? (info.place.universe ? `${info.place.workspace.name} · ${info.place.universe.name}` : info.place.workspace.name) : "";
    const n = new Notification({
      title: `${info?.title ?? "Terminal"} ${a.reason === "request" ? "pede sua atenção" : "terminou e está esperando"}`,
      body: a.message ?? (where ? `Galáxia ${where}` : ""),
      icon: ICON,
    });
    n.on("click", () => {
      win?.show();
      win?.focus();
      win?.webContents.send("attention:jump", id);
    });
    n.show();
  };
  // "Enquanto você esteve fora": o que aconteceu com o Zênite sem uso, mostrado ao voltar.
  const awayLog = new AwayLog();
  const attention = new AttentionTracker((all, added) => {
    win?.webContents.send("attention:changed", enrich(all));
    if (added) {
      announce(added.id, added.attention);
      awayLog.record(added.attention.reason === "request" ? { kind: "request", id: added.id, message: added.attention.message } : { kind: "done", id: added.id });
    }
  });

  let lastTasks: Record<string, TaskStatus> = {};
  const cameBack = async () => {
    if (!awayLog.away) return;
    const minutes = settings().awaySummaryMinutes ?? 10;
    const summary = awayLog.back(Date.now(), minutes ? minutes * 60_000 : Infinity, {
      terminal: (id) => {
        const info = nodeInfo(id);
        return info ? { title: info.title, where: info.place.universe ? `${info.place.workspace.name} · ${info.place.universe.name}` : info.place.workspace.name } : undefined;
      },
      flow: (id) => nodeInfo(id)?.title,
    });
    if (!summary) return;
    for (const ws of store.list().workspaces) {
      if (!ws.dir) continue;
      for (const c of await commitsSince(ws.dir, summary.since).catch(() => [])) summary.commits.push({ ...c, galaxy: ws.name });
    }
    if (hasNews(summary)) win?.webContents.send("away:summary", summary);
  };

  // Impedir a suspensão: nunca, enquanto algum terminal trabalha, ou sempre.
  let sleepBlocker: number | null = null;
  const updatePower = () => {
    const mode = settings().preventSleep ?? "working";
    const want = mode === "always" || (mode === "working" && attention.busy());
    if (want && sleepBlocker === null) sleepBlocker = powerSaveBlocker.start("prevent-app-suspension");
    else if (!want && sleepBlocker !== null) {
      powerSaveBlocker.stop(sleepBlocker);
      sleepBlocker = null;
    }
  };
  setInterval(updatePower, 15_000);

  // ---- Limite de uso dos agentes (base para rotear e balancear entre contas) ----
  /** Comando de cada terminal aberto, para saber qual agente roda nele. */
  const terminalCommand = new Map<string, string>();
  /** Terminais com saída nova desde a última olhada na tela (procura o aviso de limite). */
  const usageDirty = new Set<string>();
  /** Aviso de limite visto na tela, e o que o usuário dispensou (não volta a acender pelo mesmo texto). */
  const limitSeen = new Map<string, { message: string; at: number }>();
  const limitDismissed = new Map<string, string>();
  let lastUsage: Record<string, TerminalUsage> = {};
  let isolationPort = 0;
  const isolatedRuntime = new IsolatedRuntime(dataDir, cliScript, () => {
    if (!isolationPort) throw new Error("Ponte do canvas ainda indisponível.");
    return `http://host.docker.internal:${isolationPort}`;
  }, () => ({ memoryGb: settings().isolatedMemoryGb, cpus: settings().isolatedCpus }));
  const protectedTerminals = () => settings().isolatedAgents === true;

  const ptys = new PtyManager(
    {
      onData: (id, data) => {
        win?.webContents.send("pty:data", id, data);
        attention.output(id, data.length);
        usageDirty.add(id);
      },
      onInput: (id) => attention.input(id),
      onExit: (id, code) => {
        directAccess.close(id);
        control?.terminalExited(id);
        attention.remove(id);
        win?.webContents.send("pty:exit", id, code);
      },
    },
    (_id, token, req) => {
      const account = req.account ? store.account(req.account) : undefined;
      const base = { O_PIPE: address, O_TOKEN: token, O_BIN: binDir, ZENITE_SKILLS: join(dataDir, "skills"), O_RUNTIME: process.execPath, O_CLI: cliScript, PATH: [binDir, ...missingFrom(process.env.PATH ?? process.env.Path ?? "")].join(delimiter) };
      if (req.provider === "openrouter") {
        // A chave sai do cofre direto para este terminal (checada em pty:create).
        return { ...base, ...openRouterEnv(secrets.get("openrouter") ?? "", accounts.dir(OPENROUTER_ACCOUNT), settings().openrouterModel) };
      }
      return { ...base, ...(account ? accounts.env(account) : {}) };
    },
    () => settings().shell ?? "auto",
    (req, token) => protectedTerminals() ? isolatedRuntime.launch(req, token, req.provider === "openrouter" ? openRouterEnv(secrets.get("openrouter") ?? "", "", settings().openrouterModel) : undefined, placeOf(req.id)?.workspace.id) : undefined,
  );
  const directAccess = new CanvasAccess({
    mediaPath: node => node.element?.file ? elements.mediaPath(node.element.file) : undefined,
    canvas: id => { const canvasId = elements.canvasOf(id); return canvasId ? store.loadCanvas(canvasId) : null; },
    alive: id => ptys.has(id) || isolatedRuntime.has(id), permissions: () => settings().agentPermissions,
    confirm: async (request, signal) => {
      if (!win || win.isDestroyed()) return { allow: false, remember: false };
      const action = { read: "ler", write: "gravar", connect: "conectar um recurso para leitura e gravação", execute: "executar", network: "acessar a rede" }[request.operation];
      const result = await ask({
        title: "Acesso fora do canvas", message: `${request.terminalTitle} quer ${action} fora dos elementos conectados.`,
        detail: `${request.resource}\n\n${request.operation === "connect" ? "Conectar uma pasta permite ler e gravar seus arquivos e subpastas enquanto a conexão existir. Para revogar esse escopo, remova a conexão no canvas. " : ""}A autorização vale somente para esta operação neste terminal. O isolamento continua valendo.${request.rememberAllowed ? "" : " Sempre perguntar exige uma decisão a cada tentativa."}`,
        cancel: "Cancelar", ok: "Permitir",
        ...(request.rememberAllowed ? { checkbox: "Não perguntar novamente para esta permissão nesta sessão" } : {}), signal,
      });
      return { allow: result.ok, remember: result.ok && result.checked };
    },
  });

  /** Pasta onde o terminal trabalha: cópia do universo ou pasta da galáxia. */
  const placeOf = (terminalId: string) =>
    store.places().find((p) => store.loadCanvas(p.canvasId)?.nodes.some((n) => n.id === terminalId)) ?? null;
  const gitOps = {
    commit: async (callerId: string, c: { title: string; why: string; todo?: string; agent: string }) => {
      const place = placeOf(callerId);
      const dir = place?.universe?.path ?? place?.workspace.dir;
      if (!place || !dir) throw new Error("Este terminal não está numa galáxia com pasta definida.");
      if (place.workspace.agentCommits === "suggest") {
        // Modo "só sugerir": quem commita é o usuário; a mensagem fica como proposta no app.
        if (!c.title.trim() || !c.why.trim()) throw new Error('Informe título e --why "porquê".');
        const files = (await git(["status", "--porcelain", "-uall"], dir)).stdout.split("\n").filter(Boolean).map((l) => l.slice(3));
        const { index } = store.addProposal(place.workspace.id, { universeId: place.universe?.id, agent: c.agent, title: c.title.trim(), why: c.why.trim(), todo: c.todo?.trim() || undefined, files });
        win?.webContents.send("index:changed", index);
        return { proposed: true as const, files };
      }
      return commitAsAgent(dir, c);
    },
    history: async (callerId: string, opts: { limit?: number; grep?: string; file?: string }) => {
      const place = placeOf(callerId);
      const ws = place?.workspace;
      if (!ws?.dir) throw new Error("Este terminal não está numa galáxia com pasta definida.");
      const commits = await recentHistory(place?.universe?.path ?? ws.dir, opts);
      const places = [{ place: "Origem", dir: ws.dir }, ...(ws.universes ?? []).filter((u) => u.isolated).map((u) => ({ place: u.name, dir: u.path }))];
      const pending = [];
      for (const p of places) pending.push({ place: p.place, files: (await pendingCount(p.dir)) ?? 0 });
      return { commits, pending };
    },
  };

  // zn flow run: o motor dos astros é montado mais abaixo (startFlow); até lá, recusa.
  let flowFromZn: (id: string, input: string) => { ok: boolean; error?: string } = () => ({ ok: false, error: "O Zênite ainda está abrindo." });
  let flowStop: (id: string) => boolean = () => false;
  const flowWaits = new FlowWaits();
  let flowStatus: () => { running: string[]; statuses: Record<string, FlowStatus> } = () => ({ running: [], statuses: {} });
  /** Nó de terminal salvo em qualquer canvas (para reiniciar um que não está na tela). */
  const terminalSpec = (id: string) => {
    for (const p of store.places()) {
      const t = store.loadCanvas(p.canvasId)?.nodes.find((n) => n.id === id)?.terminal;
      if (t) return t;
    }
    return undefined;
  };
  const indexChanged = () => win?.webContents.send("index:changed", store.list());
  control = new ControlServer(ptys, (id) => neighborhoodFromStore(store, id, (terminalId, canvasId) => suns.has(terminalId, canvasId)), {
    isolatedSession: id => isolatedRuntime.has(id),
    directFile: (id, body) => isolatedFile(directAccess, id, body),
    isolatedRequest: async (id, route, body) => {
      // Lista fechada: nenhuma rota nova passa a conceder acesso host por acidente.
      const safe = ["/access-file", "/list", "/ask", "/reply", "/check", "/send", "/note", "/table", "/file", "/folder", "/media", "/web", "/canvas", "/canvas-ui", "/terminal", "/agent", "/role", "/status", "/notify", "/skill", "/service", "/flow", "/history"];
      if (!safe.includes(route)) throw new Error("Esta operação do computador não está disponível no ambiente isolado. Use os elementos do canvas.");
      if (route === "/flow" && !["status", "stop", "signal"].includes(String(body.action))) throw new Error("Inicie fluxos pela interface do Zênite; um terminal isolado não pode disparar processos no computador por esta rota.");
      const inspect = async (value: unknown, key = "", depth = 0): Promise<void> => {
        if (depth > 25) throw new Error("Pedido muito profundo.");
        if (typeof value === "string" && /^(path|folder)$/i.test(key) && value && !/^(?:[A-Za-z]:[\\/]|[\\/])/.test(value)) {
          throw new Error("Use um caminho absoluto do computador para solicitar acesso. Caminhos relativos do terminal não são caminhos do host.");
        } else if (typeof value === "string" && /^(path|file|folder)$/i.test(key) && /^(?:[A-Za-z]:[\\/]|[\\/])/.test(value)) {
          const decision = await directAccess.request(id, { operation: route === "/canvas-ui" && body.action === "export" ? "write" : route === "/canvas" || route === "/file" && body.action === "create" ? "connect" : "read", resource: value });
          if (!decision.allowed) throw new Error(decision.reason);
        } else if (typeof value === "string" && key === "url" && !/^https?:\/\//i.test(value) && value !== "about:blank") {
          throw new Error("O ambiente isolado só navega para endereços HTTP(S). Use a ponte de arquivos para conteúdo do computador.");
        } else if (Array.isArray(value)) { for (const item of value) await inspect(item, key, depth + 1); }
        else if (value && typeof value === "object") { for (const [k, item] of Object.entries(value)) await inspect(item, k, depth + 1); }
      };
      if (route !== "/access-file") await inspect(body);
    },
    integrationSkill: (id, file, caller) => integrations.skill(id, file, caller),
    integrationService: (id, request, caller) => integrations.service(id, request, caller),
    readNote: (id) => elements.readNote(id),
    writeNote: (id, content, fromAgent) => elements.writeNote(id, content, fromAgent),
    mediaPath: (file) => elements.mediaPath(file),
    importMedia: (path) => elements.importMedia(path),
    cleanup: (node) => elements.cleanup(node),
    addLinkedElement: (callerId, kind, title, extra) => elements.addLinkedElement(callerId, kind, title, extra),
    updateElement: (id, changes) => elements.updateElement(id, changes),
    readTable: (id) => elements.readTable(id),
    writeTable: (id, rows, fromAgent) => elements.writeTable(id, rows, fromAgent),
    web: webFor,
    webInspect,
    runFlow: (id, input) => flowFromZn(id, input),
    canvasOf: (id) => elements.canvasOf(id),
    canvasOps: (canvasId, ops, callerId) => elements.canvasOps(canvasId, ops, callerId),
    accounts: () => store.list().accounts ?? [],
    ui: (canvasId, action, target, value) => elements.ui(canvasId, action, target, value),
    screenshot: async (canvasId, target) => {
      const ready = await elements.ui(canvasId, "shot", target);
      if (!ready.ok) throw new Error(ready.error);
      if (!win || win.isDestroyed()) throw new Error("A janela do Zênite está fechada.");
      const image = await win.webContents.capturePage();
      const dir = join(dataDir, "prints");
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `canvas-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
      writeFileSync(file, image.toPNG());
      return file;
    },
    exportCanvas: (state, path, kinds) => writeCanvasArchive(path, state, kinds, elements),
    stopTerminal: (id) => {
      if (!ptys.has(id)) return false;
      ptys.kill(id);
      return true;
    },
    restartTerminal: async (id) => {
      const t = terminalSpec(id);
      if (!t) return { ok: false, error: "Terminal não encontrado no canvas salvo." };
      // Mesmo caminho do Reload da interface: encerra contêiner e processos antes de abrir de novo.
      return restartTerminal({ id, command: t.command, cwd: t.cwd, account: t.account, provider: t.provider, sun: t.sun, cols: 120, rows: 32 });
    },
    flowStop: (id) => flowStop(id),
    flowSignal: (id, input) => flowWaits.signal(id, input),
    flowStatus: () => flowStatus(),
    roles,
    solLog,
    duplicateMedia: (file) => elements.duplicateMedia(file),
    terminalSpec: (id) => terminalSpec(id),
    usageOf: (id) => lastUsage[id],
    tasksChanged: (all) => {
      win?.webContents.send("tasks:changed", all);
      for (const [id, status] of Object.entries(all)) if (lastTasks[id]?.at !== status.at) awayLog.record({ kind: "status", id, status });
      lastTasks = { ...all };
      try {
        writeFileSync(tasksFile, JSON.stringify(all), "utf8");
      } catch {
        // sem disco: os selos ficam só na memória até a próxima mudança
      }
    },
    savedTasks: () => {
      try {
        return JSON.parse(readFileSync(tasksFile, "utf8"));
      } catch {
        return {};
      }
    },
    universeCanvas: (callerId, name) => {
      const ws = placeOf(callerId)?.workspace;
      if (ws && /^origem$/i.test(name)) return { canvasId: ws.id, dir: ws.dir };
      const u = ws?.universes?.find((x) => x.id === name || x.name.toLowerCase() === name.toLowerCase());
      return u ? { canvasId: u.id, dir: u.path } : null;
    },
    universes: async (callerId, action, body) => {
      const place = placeOf(callerId);
      if (!place) throw new Error("Este terminal não está em nenhuma galáxia.");
      const ws = place.workspace;
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const list = () => store.list().workspaces.find((w) => w.id === ws.id)?.universes ?? [];
      const find = () => {
        const u = list().find((x) => x.id === name || x.name.toLowerCase() === name.toLowerCase());
        if (!u) throw new Error(`Universo "${name}" não existe nesta galáxia. Universos: ${list().map((x) => `"${x.name}"`).join(", ") || "nenhum"}.`);
        return u;
      };
      const check = <T,>(r: { ok: true; index: T } | { ok: false; error: string; conflicts?: string[] }): T => {
        if (!r.ok) throw new Error(r.conflicts?.length ? `${r.error} Arquivos: ${r.conflicts.join(", ")}.` : r.error);
        return r.index;
      };
      const mine = (u: { id: string }) => place.universe?.id === u.id;
      switch (action) {
        case "list":
          return { here: place.universe?.name ?? "Origem", universes: list().map((u) => ({ name: u.name, branch: u.branch || null, path: u.path, isolated: u.isolated })) };
        case "create": {
          if (!name) throw new Error('Uso: zn universe create "Nome"');
          // Criar pelo Sol não troca a tela do usuário: o universo ativo volta a ser o de antes.
          const active = store.list().workspaces.find((w) => w.id === ws.id)?.activeUniverse ?? null;
          check(await universes.create(ws.id, name, body.clone === true));
          const created = list().at(-1)!;
          store.setActiveUniverse(ws.id, active);
          indexChanged();
          return { status: "criado", name: created.name, branch: created.branch || null, path: created.path };
        }
        case "status": {
          const u = find();
          return { name: u.name, ...(await universes.status(ws.id, u.id)) };
        }
        case "commit": {
          const u = find();
          const st = check(await universes.commit(ws.id, u.id, typeof body.message === "string" ? body.message : ""));
          return { status: "commitado", name: u.name, ...st };
        }
        case "merge": {
          const u = find();
          const keep = body.keep === true;
          if (!keep && mine(u)) throw new Error("O Sol está neste universo: use --keep para juntar sem apagá-lo.");
          check(await universes.converge(ws.id, u.id, keep));
          indexChanged();
          return { status: keep ? "juntado (universo mantido)" : "juntado e fechado", name: u.name };
        }
        case "delete": {
          const u = find();
          if (body.force !== true) throw new Error(`Apagar o universo descarta os terminais, o canvas, a cópia e a branch dele, sem volta. Para confirmar: zn universe delete "${u.name}" --force`);
          if (mine(u)) throw new Error("O Sol está neste universo e não pode apagá-lo.");
          check(await universes.collapse(ws.id, u.id));
          indexChanged();
          return { status: "apagado", name: u.name };
        }
        default:
          throw new Error(`Ação desconhecida: zn universe ${action}.`);
      }
    },
  }, gitOps, (callerId, message) => attention.request(callerId, message), (from, to) => win?.webContents.send("canvas:flow", from, to), { note: (id) => usageNote(id), blocked: (id) => usageBlocked(id), refresh: () => refreshUsage() });
  await control.listen(address);
  isolationPort = await control.listenContainers();
  ipcMain.handle("isolation:status", () => isolatedRuntime.status());
  ipcMain.handle("isolation:prepare", () => isolatedRuntime.prepare());
  ipcMain.handle("isolation:install-docker", (e) => { requireMainUI(e); return installDocker(); });

  // Caixa de mensagem (Ctrl+K): texto e anexos direto no CLI escolhido, sem passar pelo canvas.
  const attachmentsDir = join(dataDir, "anexos");
  const activePlace = () => {
    const index = store.list();
    const ws = index.workspaces.find((w) => w.id === index.activeId) ?? index.workspaces[0];
    return store.places().find((p) => p.workspace.id === ws?.id && (p.universe?.id ?? null) === (ws?.activeUniverse ?? null));
  };
  ipcMain.handle("composer:targets", (e) => {
    requireMainUI(e);
    const place = activePlace();
    const nodes = place ? store.loadCanvas(place.canvasId)?.nodes ?? [] : [];
    return nodes.filter((n) => n.kind === "terminal" && n.terminal).map((n) => ({
      id: n.id,
      title: nodeTitle(n),
      agent: agentOf(n.terminal!.command ?? "", n.terminal!.provider),
      running: ptys.has(n.id),
      sun: !!n.terminal!.sun,
      status: lastTasks[n.id],
    }));
  });
  ipcMain.handle("composer:pick", async (e) => {
    requireMainUI(e);
    const r = await dialog.showOpenDialog(win!, { title: "Anexar arquivos", properties: ["openFile", "multiSelections"] });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle("composer:save-image", (e, name: string, bytes: Uint8Array) => {
    requireMainUI(e);
    if (bytes.byteLength > MAX_ATTACHMENT) throw new Error("A imagem passa de 50 MB.");
    mkdirSync(attachmentsDir, { recursive: true });
    const ext = /\.(png|jpe?g|gif|webp|bmp)$/i.exec(name)?.[0] ?? ".png";
    const file = join(attachmentsDir, `${Date.now()}-print${ext.toLowerCase()}`);
    writeFileSync(file, Buffer.from(bytes));
    return file;
  });
  // Microfone da caixa de mensagem: abre o ditado do Windows (Win+H), que escreve no campo em foco.
  ipcMain.handle("composer:dictate", (e) => {
    requireMainUI(e);
    const script = "Add-Type -Namespace Z -Name K -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);'; [Z.K]::keybd_event(0x5B,0,0,[UIntPtr]::Zero); [Z.K]::keybd_event(0x48,0,0,[UIntPtr]::Zero); [Z.K]::keybd_event(0x48,0,2,[UIntPtr]::Zero); [Z.K]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)";
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 10000 }, () => {});
  });
  // Agente esperando: as últimas linhas da tela e, se houver, as opções do menu aberto.
  ipcMain.handle("composer:context", async (e, id: string) => {
    requireMainUI(e);
    const screen = (await ptys.snapshot(id, 60)) ?? "";
    const menu = parseMenu(screen);
    const lines = screen.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
    return { screen: lines.slice(-14).join("\n"), choices: menu?.items.map((i) => i.text) ?? [] };
  });
  ipcMain.handle("composer:choose", async (e, id: string, choice: string) => {
    requireMainUI(e);
    if (!ptys.has(id)) throw new Error("O terminal não está aberto.");
    await pick({ write: (d) => ptys.write(id, d), snapshot: (n) => ptys.snapshot(id, n ?? 80), quiet: () => ptys.quiet(id) }, choice);
    attention.clear(id);
  });
  ipcMain.handle("composer:send", async (e, targets: string[], text: string, files: string[]) => {
    requireMainUI(e);
    const errors: string[] = [];
    let stashed: string[];
    try { stashed = files.map((f) => f.startsWith(attachmentsDir) ? f : stashAttachment(attachmentsDir, f)); }
    catch (error) { return { ok: false, errors: [(error as Error).message] }; }
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await Promise.all(targets.map(async (id) => {
      const spec = terminalSpec(id);
      const title = spec?.title ?? "Terminal";
      try {
        if (!spec || !ptys.has(id)) throw new Error(`"${title}" não está aberto.`);
        const screen = (await ptys.snapshot(id, 40)) ?? "";
        if (waitingForChoice(screen, !!parseMenu(screen))) throw new Error(`"${title}" está esperando uma resposta na tela (menu, termos ou permissão). Responda no terminal e envie de novo.`);
        const paths = isolatedRuntime.has(id) ? await Promise.all(stashed.map((f) => isolatedRuntime.copyIn(id, f))) : stashed;
        for (const step of composeSteps(agentOf(spec.command ?? "", spec.provider), text, paths)) {
          if ("submit" in step) { await pause(600); ptys.write(id, "\r"); continue; }
          // Colagem "entre colchetes": o CLI recebe o bloco inteiro e reconhece caminhos de imagem.
          ptys.write(id, ptys.acceptsPaste(id) ? `\x1b[200~${step.paste}\x1b[201~` : step.paste.replace(/\s*\n+\s*/g, " "));
          await pause(450);
        }
      } catch (error) { errors.push(`${title}: ${(error as Error).message}`); }
    }));
    // Respondeu pela caixa: o aviso de "esperando você" desse terminal some.
    for (const id of targets) if (!errors.some((e) => e.startsWith(`${terminalSpec(id)?.title ?? "Terminal"}:`))) attention.clear(id);
    return { ok: errors.length === 0, errors };
  });
  ipcMain.handle("isolation:revoke", () => directAccess.revoke());
  ipcMain.handle("pty:runtime", (_e, id: string) => ({ isolated: isolatedRuntime.has(id), running: ptys.has(id) }));

  const universes = new UniverseService(join(dataDir, "universos"), store, {
    killTerminals: async (ids) => {
      const alive = ids.filter((id) => ptys.has(id));
      await endTerminals(alive);
      // Dá tempo ao Windows de soltar os arquivos antes de apagar a cópia.
      if (alive.length) await new Promise((r) => setTimeout(r, 600));
    },
    cleanupNodes: (nodes) => nodes.forEach((n) => elements.cleanup(n)),
    copyNote: (from, to) => elements.writeNote(to, elements.readNote(from), false),
    copyTable: (from, to) => elements.writeTable(to, elements.readTable(from), false),
    copyMedia: (file) => elements.duplicateMedia(file),
  });
  ipcMain.handle("universes:create", (_e, wsId: string, name: string, clone: boolean) => universes.create(wsId, name, clone));
  ipcMain.handle("universes:setActive", (_e, wsId: string, uid: string | null) => store.setActiveUniverse(wsId, uid));
  ipcMain.handle("universes:preview", (_e, wsId: string) => universes.preview(wsId));
  ipcMain.handle("universes:status", (_e, wsId: string, uid: string) => universes.status(wsId, uid));
  ipcMain.handle("universes:commit", (_e, wsId: string, uid: string, msg: string) => universes.commit(wsId, uid, msg));
  ipcMain.handle("universes:converge", (_e, wsId: string, uid: string, keep: boolean) => universes.converge(wsId, uid, keep));
  ipcMain.handle("universes:collapse", (_e, wsId: string, uid: string) => universes.collapse(wsId, uid));
  ipcMain.handle("universes:update", (_e, wsId: string, uid: string) => universes.update(wsId, uid));
  ipcMain.handle("universes:finishUpdate", (_e, wsId: string, uid: string) => universes.finishUpdate(wsId, uid));
  ipcMain.handle("universes:abortUpdate", (_e, wsId: string, uid: string) => universes.abortUpdate(wsId, uid));

  // Memória e processos de cada terminal, a cada 4 s (só com a janela visível).
  let sampling = false;
  const sample = async () => {
    if (sampling || !win || win.isMinimized() || !win.isVisible() || !ptys.roots().length) return;
    sampling = true;
    try {
      const all = await sampleProcesses();
      const stats: Record<string, TerminalStats> = {};
      for (const { id, pid } of ptys.roots()) {
        const tree = processTree(all, pid);
        stats[id] = { total: tree.total, processes: tree.processes.map((p) => ({ pid: p.pid, name: p.name, rss: p.rss, root: p.pid === pid })) };
      }
      win?.webContents.send("pty:stats", stats);
    } finally {
      sampling = false;
    }
  };
  setInterval(() => void sample(), 4000);

  const AGENT_PROGRAMS = new Set(["codex", "claude", "agy", "gemini", "grok"]);
  /** O aviso de limite visto na tela vale por até 5 h (a janela mais curta dos planos). */
  const LIMIT_TTL_MS = 5 * 60 * 60 * 1000;
  const usageOfTerminals = async (): Promise<Record<string, TerminalUsage>> => {
    const out: Record<string, TerminalUsage> = {};
    const now = Date.now();
    for (const { id } of ptys.roots()) {
      const prog = programOf(terminalCommand.get(id) ?? "");
      if (!AGENT_PROGRAMS.has(prog)) continue;
      if (usageDirty.delete(id)) {
        const line = limitMessage((await ptys.snapshot(id, 15)) ?? "");
        if (line && line !== limitDismissed.get(id)) limitSeen.set(id, { message: line, at: now });
      }
      const seen = limitSeen.get(id);
      if (seen && now - seen.at > LIMIT_TTL_MS) limitSeen.delete(id);
      let usage: TerminalUsage | null = null;
      if (prog === "codex") {
        const accountId = terminalAccount.get(id);
        const account = accountId ? store.account(accountId) : undefined;
        const home = account?.agent === "codex" ? accounts.codexHomePath(account) : process.env.CODEX_HOME || join(homedir(), ".codex");
        try {
          usage = codexUsage(home, now);
        } catch {
          usage = null;
        }
        // O Codex respondeu de novo depois do aviso, dizendo que há limite: o aviso da tela caducou.
        if (usage && seen && usage.updatedAt > seen.at && !usage.reached) limitSeen.delete(id);
      }
      const hit = limitSeen.get(id);
      if (hit) usage = { ...(usage ?? { source: "screen" as const, updatedAt: hit.at }), reached: true, message: hit.message };
      if (usage) out[id] = usage;
    }
    return out;
  };
  ipcMain.on("usage:dismiss", (_e, id: string) => {
    const seen = limitSeen.get(id);
    if (seen) limitDismissed.set(id, seen.message);
    limitSeen.delete(id);
    if (lastUsage[id]?.source === "screen") delete lastUsage[id];
    else if (lastUsage[id]) lastUsage[id] = { ...lastUsage[id], reached: false, message: undefined };
    win?.webContents.send("usage:update", lastUsage);
  });
  // A cada 4 s (mesmo com a janela minimizada) e a cada zn list / zn ask: quem esgotou o limite
  // derruba os pedidos abertos para ele. É barato: o arquivo do Codex só é lido quando muda.
  let usageRun: Promise<void> | null = null;
  const refreshUsage = (): Promise<void> =>
    (usageRun ??= (async () => {
      const next = await usageOfTerminals();
      for (const [id, u] of Object.entries(next)) if (u.reached && !lastUsage[id]?.reached) control?.terminalLimited(id, limitUntil(u));
      lastUsage = next;
      win?.webContents.send("usage:update", lastUsage);
    })().finally(() => (usageRun = null)));
  setInterval(() => void refreshUsage(), 4000);
  const usageBlocked = (id: string) => {
    const u = lastUsage[id];
    return u?.reached ? { until: limitUntil(u) } : null;
  };
  /** Resumo para o `zn list` de quem orquestra: quem está com o limite no fim. */
  const usageNote = (id: string): string | undefined => {
    const u = lastUsage[id];
    if (!u) return undefined;
    if (u.reached) return "limite de uso atingido";
    const parts = [u.primary && `5h ${Math.round(u.primary.usedPercent)}%`, u.secondary && `semana ${Math.round(u.secondary.usedPercent)}%`].filter(Boolean);
    return parts.length ? `uso ${parts.join(", ")}` : undefined;
  };
  ipcMain.handle("proc:kill", async (_e, terminalId: string, pid: number) => {
    const root = ptys.roots().find((r) => r.id === terminalId);
    if (!root || pid === root.pid) return false;
    // Só encerra processos que são de fato deste terminal.
    const tree = processTree(await sampleProcesses(), root.pid);
    if (!tree.processes.some((p) => p.pid === pid)) return false;
    const sub = processTree(tree.processes, pid);
    await killTree(pid, sub.processes.filter((p) => p.pid !== pid).map((p) => p.pid));
    void sample();
    return true;
  });

  // ---- Encerrar terminais: só o que é do Zênite (veja terminalCleanup.ts) ----
  /** Conta de cada terminal aberto, para saber quando uma conta do Codex fica sem terminal. */
  const terminalAccount = new Map<string, string | undefined>();
  const isCodexAccount = (id?: string) => !!id && store.account(id)?.agent === "codex";
  /** Contas do Codex dos terminais dados que nenhum outro terminal aberto usa. */
  const freedCodexAccounts = (ids: string[]) => {
    const used = new Set([...terminalAccount].filter(([t]) => !ids.includes(t) && ptys.has(t)).map(([, a]) => a));
    return [...new Set(ids.map((t) => terminalAccount.get(t)))].filter((a): a is string => isCodexAccount(a) && !used.has(a));
  };
  /** Fecha os terminais com tudo que rodou neles e, se a conta do Codex ficou sem uso, o processo de fundo dela. */
  const endTerminals = async (ids: string[]) => {
    ids.forEach(id => { directAccess.close(id); isolatedRuntime.close(id); });
    const freed = freedCodexAccounts(ids);
    killTrees(ptys.roots().filter((r) => ids.includes(r.id)).map((r) => r.pid));
    ids.forEach((t) => {
      ptys.kill(t);
      terminalAccount.delete(t);
      terminalCommand.delete(t);
      limitSeen.delete(t);
      limitDismissed.delete(t);
    });
    if (freed.length) await killZeniteCodexOf(freed);
  };
  /** Permissões dos agentes (configurações): opções de abertura de cada CLI. */
  const isSunRequest = (req: CreatePtyRequest) => !!terminalSpec(req.id)?.sun;
  const agentRequest = (req: CreatePtyRequest): CreatePtyRequest => ({ ...req, command: isSunRequest(req) && canGrantSolAccess(settings().agentPermissions) ? withSolAccess(req.command ?? "") : withPermissions(req.command ?? "", settings().agentPermissions) });
  const solWelcomes = new Map<string, symbol>();
  const welcomeSol = (req: CreatePtyRequest) => {
    if (!isSunRequest(req) || !["codex", "claude", "antigravity"].includes(agentOf(req.command, req.provider))) return;
    const session = Symbol();
    solWelcomes.set(req.id, session);
    const started = Date.now();
    const tick = async () => {
      if (solWelcomes.get(req.id) !== session || !ptys.has(req.id) || !terminalSpec(req.id)?.sun || Date.now() - started > 120_000) return;
      const q = ptys.quiet(req.id);
      const screen = (await ptys.snapshot(req.id, 35)) ?? "";
      if (q && q.open >= 6000 && q.idle >= 1200 && ptys.acceptsPaste(req.id) && !looksBusy(screen) && !/Trust this folder\?|Enable full access\?|enter select|Press enter to confirm/i.test(screen)) {
        if (!terminalSpec(req.id)?.sun) return;
        solWelcomes.delete(req.id);
        await control?.deliver({ id: req.id, title: terminalSpec(req.id)?.title ?? "Sol" }, solWelcomeMessage(settings().agentPermissions)).catch((error) => attention.request(req.id, String(error)));
        return;
      }
      setTimeout(() => void tick(), 500);
    };
    setTimeout(() => void tick(), 1000);
  };
  const createTerminal = (req: CreatePtyRequest) => {
    const result = ptys.create(agentRequest(req));
    if (result.ok && !result.reused) welcomeSol(req);
    return result;
  };
  /** Reload: o Codex reaproveitaria o processo de fundo antigo, com o endereço e a senha velhos. */
  const restartTerminal = async (req: CreatePtyRequest) => {
    await endTerminals([req.id]);
    terminalAccount.set(req.id, req.account);
    terminalCommand.set(req.id, req.command ?? "");
    solWelcomes.delete(req.id);
    return createTerminal(req);
  };

  /** Ao fechar: cada terminal com tudo que rodou nele e os processos de fundo do Codex das contas do Zênite. */
  const shutdownTerminals = () => {
    isolatedRuntime.closeAll();
    directAccess.revoke();
    killTrees(ptys.roots().map((r) => r.pid));
    ptys.killAll();
    if (!testInstance) killZeniteCodex();
  };

  ipcMain.handle("pty:create", (e, req: CreatePtyRequest) => {
    requireMainUI(e);
    if (req.provider === "openrouter" && !ptys.has(req.id) && !secrets.get("openrouter")) {
      return { ok: false, error: "Falta a chave da OpenRouter. Salve em Configurações → Agentes → OpenRouter e abra o terminal de novo." };
    }
    if (!ptys.has(req.id)) {
      terminalAccount.set(req.id, req.account);
      terminalCommand.set(req.id, req.command ?? "");
    }
    return createTerminal(req);
  });
  ipcMain.handle("pty:promoteSun", async (e, req: CreatePtyRequest) => {
    requireMainUI(e);
    const place = placeOf(req.id);
    const canvas = place && store.loadCanvas(place.canvasId);
    if (!place || !canvas?.nodes.some((n) => n.id === req.id && n.kind === "terminal")) return { ok: false, error: "Terminal não encontrado no canvas salvo." };
    suns.set(place.canvasId, req.id, req.sun === true);
    store.saveCanvas(place.canvasId, canvas);
    if (req.sun !== true) { solWelcomes.delete(req.id); return { ok: true, fullAccess: false }; }
    try {
      if (!canGrantSolAccess(settings().agentPermissions)) {
        welcomeSol({ ...req, sun: true });
        return { ok: true, fullAccess: false };
      }
      const kind = agentOf(req.command, req.provider);
      if (kind === "shell" || kind === "other") return { ok: true, fullAccess: false };
      if (!ptys.has(req.id) || kind !== "codex") return { ok: true, restart: true, fullAccess: true };
      await grantCodexSolAccess({ write: (text) => {
        if (!canGrantSolAccess(settings().agentPermissions)) throw new Error("As permissões globais mudaram; Full Access não será ativado para o Sol.");
        ptys.write(req.id, text);
      }, snapshot: (lines) => ptys.snapshot(req.id, lines), quiet: () => ptys.quiet(req.id) });
      welcomeSol({ ...req, sun: true });
      return { ok: true, fullAccess: true };
    } catch (error) {
      return { ok: false, error: String((error as Error).message) };
    }
  });
  ipcMain.handle("pty:restart", (e, req: CreatePtyRequest) => {
    requireMainUI(e);
    if (req.provider === "openrouter" && !secrets.get("openrouter")) {
      return { ok: false, error: "Falta a chave da OpenRouter. Salve em Configurações → Agentes → OpenRouter e tente novamente." };
    }
    return restartTerminal(req);
  });
  ipcMain.handle("pty:cliTheme", (_e, command: string, accountId?: string, provider?: string) => {
    const account = accountId ? store.account(accountId) : undefined;
    const dir = provider === "openrouter" ? accounts.dir(OPENROUTER_ACCOUNT) : account ? accounts.dir(account) : homedir();
    return cliTheme(command ?? "", dir);
  });
  ipcMain.handle("secrets:status", () => ({ openrouter: secrets.has("openrouter"), encryption: secrets.available() }));
  ipcMain.handle("secrets:setOpenRouter", (_e, key: string) => secrets.set("openrouter", key));
  ipcMain.handle("secrets:removeOpenRouter", () => secrets.remove("openrouter"));
  ipcMain.on("pty:write", (_e, id: string, data: string) => ptys.write(id, data));
  ipcMain.on("pty:resize", (_e, id: string, cols: number, rows: number) => ptys.resize(id, cols, rows));
  ipcMain.on("pty:kill", (_e, id: string) => void endTerminals([id]));

  ipcMain.handle("note:read", (_e, id: string) => elements.readNote(id));
  ipcMain.handle("integration:pickSkill", async (e) => {
    requireMainUI(e);
    const picked = await dialog.showOpenDialog(win!, { title: "Escolha a pasta da skill (com SKILL.md)", properties: ["openDirectory"] });
    if (picked.canceled || !picked.filePaths[0]) return null;
    const path = picked.filePaths[0];
    try { readCanvasSkill(path); return { path, title: basename(path) }; }
    catch (e) { await ask({ title: "Não foi possível carregar a skill", message: (e as Error).message, ok: "OK" }); return null; }
  });
  ipcMain.handle("integration:skill", (e, id: string, file?: string) => { requireMainUI(e); return integrations.skill(id, file); });
  ipcMain.handle("integration:service", (e, id: string, request) => { requireMainUI(e); return integrations.service(id, request); });
  ipcMain.on("note:write", (_e, id: string, content: string) => elements.writeNote(id, content, false));
  ipcMain.handle("media:pick", async (_e, kind: "image" | "video") => {
    const filters =
      kind === "image"
        ? [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"] }]
        : [{ name: "Vídeos", extensions: ["mp4", "webm", "mov", "m4v", "mkv", "ogv"] }];
    const result = await dialog.showOpenDialog(win!, { properties: ["openFile"], filters });
    if (result.canceled || !result.filePaths[0]) return null;
    const imported = elements.importMedia(result.filePaths[0]);
    return imported && imported.kind === kind ? { file: imported.file, name: imported.name } : null;
  });
  ipcMain.handle("media:import", (_e, path: string) => elements.importMedia(path));

  // Tabelas, arquivos e pastas do disco.
  ipcMain.handle("table:read", (_e, id: string) => elements.readTable(id));
  ipcMain.on("table:write", (_e, id: string, rows: string[][]) => elements.writeTable(id, rows, false));
  ipcMain.handle("file:info", (_e, path: string) => fileInfo(path));
  ipcMain.handle("dir:list", (_e, path: string) => listDir(path));
  ipcMain.handle("file:pick", async () => {
    const result = await dialog.showOpenDialog(win!, { properties: ["openFile"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("file:open", async (_e, path: string) => {
    // Programas e scripts rodam ao abrir: pede confirmação, como o Explorer faz com downloads.
    if (/\.(exe|msi|bat|cmd|ps1|vbs|js|jar|scr|com|lnk)$/i.test(path)) {
      const r = await ask({ title: `Executar ${basename(path)}?`, message: "Este arquivo é um programa ou script: abrir significa executá-lo.", cancel: "Cancelar", ok: "Executar", danger: true });
      if (!r.ok) return "";
    }
    return shell.openPath(path);
  });
  ipcMain.on("file:reveal", (_e, path: string) => shell.showItemInFolder(path));
  // Sites do canvas: pop-up de verdade (login do Google, TikTok...) abre numa janela filha com a
  // mesma sessão e com window.opener, para o site receber a resposta. Link de "nova aba" abre no
  // próprio site.
  app.on("web-contents-created", (_e, wc) => {
    if (wc.getType() !== "webview") return;
    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (disposition === "new-window") {
        return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, parent: win ?? undefined, title: "Zênite" } };
      }
      if (/^https?:\/\//i.test(url)) void wc.loadURL(url);
      return { action: "deny" };
    });
  });
  ipcMain.handle("web:inspectReady", async (_e, wcId: number) => {
    const started = isGoogleLogin(webContents.fromId(wcId)?.getURL() ?? "") ? undefined : inspectorFor(wcId)?.start().catch(() => {});
    await Promise.race([started, new Promise((r) => setTimeout(r, 2000))]);
  });
  ipcMain.on("web:register", (_e, nodeId: string, wcId: number) => {
    webViews.set(nodeId, wcId);
    // Liga o depurador já ao abrir: o agente vê também o que a página fez antes de ele perguntar.
    if (!isGoogleLogin(webContents.fromId(wcId)?.getURL() ?? "")) void inspectorFor(wcId)?.start().catch(() => {});
  });
  ipcMain.on("web:zoom", (_e, wcId: number, factor: number) => {
    const wc = webContents.fromId(wcId);
    if (wc && !wc.isDestroyed() && wc.getType() === "webview") wc.setZoomFactor(clampZoom(factor));
  });
  ipcMain.on("element:removed", (_e, node: CanvasNode) => {
    webViews.delete(node.id);
    elements.trash(node);
  });
  ipcMain.on("element:restored", (_e, node: CanvasNode) => elements.untrash(node));
  ipcMain.on("canvas:opsResult", (_e, requestId: number, reply: CanvasOpsReply) => elements.opsReply(requestId, reply));
  ipcMain.on("canvas:uiResult", (_e, requestId: number, reply: CanvasUiReply) => elements.uiReply(requestId, reply));
  ipcMain.handle("tasks:get", () => control?.allTasks() ?? {});

  // Pasta do canvas: Origem (pasta da galáxia) ou cópia do universo.
  const envDir = (wsId: string, uid: string | null) => {
    const ws = store.list().workspaces.find((w) => w.id === wsId);
    const u = uid ? ws?.universes?.find((x) => x.id === uid) : undefined;
    return (u ? u.path : ws?.dir) ?? "";
  };
  const wsDir = (wsId: string) => store.list().workspaces.find((w) => w.id === wsId)?.dir ?? "";
  ipcMain.handle("git:version", () => gitVersion());
  ipcMain.handle("git:state", (_e, wsId: string, uid: string | null) => repoState(envDir(wsId, uid)));
  ipcMain.handle("git:identity", (_e, wsId: string) => identity(wsDir(wsId)));
  ipcMain.handle("git:setIdentity", (_e, name: string, email: string) => setIdentity(name, email));
  ipcMain.handle("git:init", (_e, wsId: string) => initRepo(wsDir(wsId)));
  ipcMain.handle("git:firstCommit", (_e, wsId: string) => firstCommit(wsDir(wsId)));
  ipcMain.on("git:installPage", () => void shell.openExternal("https://git-scm.com/download/win"));

  ipcMain.handle("env:read", (_e, wsId: string, uid: string | null) => readEnvInfo(envDir(wsId, uid)));
  ipcMain.handle("env:write", (_e, wsId: string, uid: string | null, entries: EnvVar[]) => writeEnv(envDir(wsId, uid), entries));
  ipcMain.handle("env:ignore", (_e, wsId: string, uid: string | null) => ignoreEnv(envDir(wsId, uid)));
  // Janela do .env aberta: avisa quando o arquivo muda por fora (Explorer, editor, agente).
  let envWatcher: FSWatcher | null = null;
  let envTimer: ReturnType<typeof setTimeout> | undefined;
  const stopEnvWatch = () => {
    envWatcher?.close();
    envWatcher = null;
    clearTimeout(envTimer);
  };
  ipcMain.on("env:watch", (e, wsId: string, uid: string | null) => {
    stopEnvWatch();
    const dir = envDir(wsId, uid);
    if (!dir || !existsSync(dir)) return;
    try {
      // A pasta, não o arquivo: o .env pode ainda não existir, e editores salvam trocando o arquivo.
      envWatcher = watch(dir, (_event, name) => {
        if (String(name ?? "").toLowerCase() !== ".env") return;
        clearTimeout(envTimer);
        envTimer = setTimeout(() => !e.sender.isDestroyed() && e.sender.send("env:changed"), 250);
      });
    } catch {
      envWatcher = null;
    }
  });
  ipcMain.on("env:unwatch", stopEnvWatch);

  ipcMain.handle("accounts:create", (_e, name: string, agent: AccountAgent) => {
    const { index, account } = store.createAccount(name, agent);
    accounts.prepare(account, store.list().settings?.agentGuide !== false, guideExtra());
    lastSync = skills.sync();
    return index;
  });
  ipcMain.handle("accounts:remove", async (_e, id: string) => {
    const account = store.account(id);
    if (account) await isolatedRuntime.removeProfile(account.id, account.agent);
    if (account) accounts.remove(account);
    return store.removeAccount(id);
  });
  ipcMain.handle("accounts:status", async () => Object.fromEntries(await Promise.all((store.list().accounts ?? []).map(async a => [a.id, {
    loggedIn: protectedTerminals() ? await isolatedRuntime.loginStatus(a.id, a.agent) : accounts.loggedIn(a),
    dir: protectedTerminals() ? "Perfil persistente no ambiente isolado" : accounts.dir(a),
  }]))));

  ipcMain.handle("workspaces:list", () => store.list());
  const galaxyTickets = new Map<string, { path: string; stamp: string }>();
  const galaxyStamp = (path: string) => { const info = statSync(path); return `${info.size}:${info.mtimeMs}:${info.ctimeMs}`; };
  ipcMain.handle("galaxy:export", async (_e, workspaceId: string, options: GalaxyArchiveOptions) => {
    const workspace = store.list().workspaces.find(w => w.id === workspaceId);
    if (!workspace) return { ok: false, error: "Galáxia não encontrada." };
    const name = workspace.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    const result = await dialog.showSaveDialog(win!, { title: "Exportar galáxia", defaultPath: join(app.getPath("documents"), `${name}.zenite-galaxia`), filters: [{ name: "Galáxia do Zênite", extensions: ["zenite-galaxia"] }] });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try { const info = exportGalaxy(result.filePath, workspaceId, options, store, elements); return { ok: true, path: result.filePath, count: info.elements }; }
    catch (error) { return { ok: false, error: (error as Error).message }; }
  });
  ipcMain.handle("galaxy:pickImport", async () => {
    const result = await dialog.showOpenDialog(win!, { title: "Importar galáxia", properties: ["openFile"], filters: [{ name: "Galáxia do Zênite", extensions: ["zenite-galaxia"] }] });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    try {
      const path = result.filePaths[0], info = inspectGalaxy(path), ticket = randomUUID();
      galaxyTickets.clear(); galaxyTickets.set(ticket, { path, stamp: galaxyStamp(path) });
      return { ok: true, ticket, info };
    } catch (error) { return { ok: false, error: (error as Error).message }; }
  });
  ipcMain.handle("galaxy:import", (_e, ticket: string, options: GalaxyArchiveOptions) => {
    const picked = galaxyTickets.get(ticket); galaxyTickets.delete(ticket);
    if (!picked) return { ok: false, error: "Selecione novamente o pacote de galáxia." };
    try {
      if (galaxyStamp(picked.path) !== picked.stamp) throw new Error("O arquivo mudou. Selecione o pacote novamente.");
      return { ok: true, ...importGalaxy(picked.path, options, dataDir, store, elements) };
    } catch (error) { return { ok: false, error: (error as Error).message }; }
  });
  ipcMain.handle("settings:set", (e, changes: AppSettings) => {
    requireMainUI(e);
    if (changes.isolatedAgents !== undefined && changes.isolatedAgents !== settings().isolatedAgents) {
      isolatedRuntime.closeAll(); directAccess.revoke(); ptys.killAll();
    }
    const index = store.setSettings(changes);
    if (changes.agentGuide !== undefined) applyGuide(changes.agentGuide);
    if (changes.preventSleep !== undefined) updatePower();
    if (changes.uiScale !== undefined) win?.webContents.setZoomFactor(changes.uiScale);
    if (changes.taskbarBadge === false) setBadge(0, "");
    return index;
  });

  ipcMain.handle("search:items", () =>
    store.places().flatMap((place) =>
      (store.loadCanvas(place.canvasId)?.nodes ?? [])
        .filter((n) => n.kind !== "draw")
        .map((n) => ({
          id: n.id,
          title: nodeTitle(n),
          kind: n.kind ?? "terminal",
          workspaceId: place.workspace.id,
          universeId: place.universe?.id ?? null,
          place: place.universe ? `${place.workspace.name} · ${place.universe.name}` : place.workspace.name,
        })),
    ),
  );

  // ---- Skills ----
  const skillsState = () => ({ skills: skills.list(), results: lastSync, discovered: skills.discover(), library: join(dataDir, "skills") });
  const afterSkillChange = () => {
    lastSync = skills.sync();
    applyGuide(store.list().settings?.agentGuide !== false);
    return skillsState();
  };
  ipcMain.handle("skills:state", () => skillsState());
  ipcMain.handle("skills:add", async (_e, dir?: string) => {
    let source = dir;
    if (!source) {
      const r = await dialog.showOpenDialog(win!, { title: "Pasta da skill (com SKILL.md)", properties: ["openDirectory"] });
      if (r.canceled || !r.filePaths[0]) return { ok: true, state: skillsState() };
      source = r.filePaths[0];
    }
    const added = skills.add(source);
    if (!added.ok) return { ok: false, error: added.error, state: skillsState() };
    return { ok: true, state: afterSkillChange() };
  });
  ipcMain.handle("skills:remove", (_e, name: string) => {
    skills.remove(name);
    return afterSkillChange();
  });
  ipcMain.handle("skills:sync", () => afterSkillChange());
  ipcMain.on("skills:open", (_e, path: string) => void shell.openPath(path));

  ipcMain.handle("attention:get", () => enrich(attention.snapshot()));
  ipcMain.on("attention:focus", (_e, id: string | null) => attention.focus(id));
  ipcMain.on("attention:clear", (_e, id: string) => attention.clear(id));
  const setBadge = (count: number, dataUrl: string) => {
    if (!win) return;
    if (settings().taskbarBadge === false) count = 0;
    if (process.platform === "win32") win.setOverlayIcon(count && dataUrl ? nativeImage.createFromDataURL(dataUrl) : null, count ? plural(count, "terminal esperando", "terminais esperando") : "");
    else app.setBadgeCount(count);
  };
  ipcMain.on("attention:badge", (_e, count: number, dataUrl: string) => setBadge(count, dataUrl));
  ipcMain.handle("system:info", () => ({
    version: app.getVersion(),
    dataDir,
    platform: process.platform,
    electron: process.versions.electron,
    sleepBlocked: sleepBlocker !== null,
    shells: availableShells(),
  }));
  ipcMain.on("system:openDataDir", () => void shell.openPath(dataDir));
  // Todo link clicado no app passa por aqui: segue a preferência ou pergunta como abrir.
  const zeniteBrowser = new ZeniteBrowser((url, title) => {
    if (!win || !elements.mounted()) return false;
    win.webContents.send("browser:addSite", { url, title });
    return true;
  });
  const openLink = (url: string, how: "external" | "zenite") => {
    if (!/^https?:\/\//i.test(url)) return;
    if (how === "zenite") zeniteBrowser.open(url);
    else void shell.openExternal(url);
  };
  ipcMain.on("system:openUrl", (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    const mode = settings().linkOpen ?? "ask";
    if (mode === "ask") win?.webContents.send("link:ask", url);
    else openLink(url, mode);
  });
  ipcMain.on("system:openLink", (_e, url: string, how: "external" | "zenite") => openLink(url, how === "zenite" ? "zenite" : "external"));
  ipcMain.handle("clipboard:read", () => clipboard.readText());
  ipcMain.handle("clipboard:write", (_e, text: string) => clipboard.writeText(String(text)));
  ipcMain.handle("terminal:menu", (e, opts: { hasSelection: boolean; link: boolean }) =>
    new Promise((resolve) => {
      const pick = (choice: string) => () => resolve(choice);
      const menu = Menu.buildFromTemplate([
        { label: "Copiar", accelerator: "Ctrl+C", enabled: opts.hasSelection, click: pick("copy") },
        ...(opts.link ? [{ label: "Copiar link", click: pick("copyLink") }] : []),
        { label: "Colar", accelerator: "Ctrl+V", click: pick("paste") },
        { type: "separator" as const },
        { label: "Selecionar tudo", click: pick("selectAll") },
        { label: "Limpar tela", click: pick("clear") },
      ]);
      // O menu fecha antes de o clique ser entregue: espera um instante antes de dar "nada escolhido".
      menu.popup({ window: BrowserWindow.fromWebContents(e.sender) ?? undefined, callback: () => setTimeout(() => resolve(null), 100) });
    }),
  );
  ipcMain.handle("proposals:apply", async (_e, wsId: string, pid: string, edited: { title: string; why: string; todo?: string }) => {
    const ws = store.list().workspaces.find((w) => w.id === wsId);
    const p = ws?.proposals?.find((x) => x.id === pid);
    if (!ws || !p) return { ok: false, error: "Proposta não encontrada.", index: store.list() };
    const dir = (p.universeId ? ws.universes?.find((u) => u.id === p.universeId)?.path : ws.dir) ?? "";
    try {
      await commitAsAgent(dir, { ...edited, agent: p.agent });
    } catch (err) {
      return { ok: false, error: (err as Error).message, index: store.list() };
    }
    return { ok: true, index: store.removeProposal(wsId, pid) };
  });
  ipcMain.handle("proposals:discard", (_e, wsId: string, pid: string) => store.removeProposal(wsId, pid));
  ipcMain.handle("workspaces:create", (_e, name: string, dir: string) => store.create(name, dir));
  ipcMain.handle("workspaces:update", (_e, id: string, changes: Partial<Omit<WorkspaceMeta, "id">>) => store.update(id, changes));
  ipcMain.handle("workspaces:remove", async (_e, id: string) => {
    const ws = store.list().workspaces.find((w) => w.id === id);
    if (!ws || store.list().workspaces.length <= 1) return store.list();
    const canvasIds = [id, ...(ws.universes ?? []).map((u) => u.id)];
    const nodes = canvasIds.flatMap((c) => store.loadCanvas(c)?.nodes ?? []);
    const { index, terminalIds } = store.remove(id);
    await endTerminals(terminalIds);
    nodes.forEach((n) => elements.cleanup(n));
    // As cópias dos universos saem; as branches ficam no git com o trabalho feito.
    await universes.removeCopies(ws);
    return index;
  });
  ipcMain.handle("workspaces:setActive", (_e, id: string) => store.setActive(id));
  ipcMain.handle("workspaces:pickDirectory", async (_e, start?: string) => {
    const defaultPath = start && existsSync(start) ? start : undefined;
    const result = await dialog.showOpenDialog(win!, { properties: ["openDirectory", "createDirectory"], defaultPath });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.on("canvas:mounted", (_e, id: string | null) => elements.setMounted(id));
  ipcMain.handle("canvas:load", (e, id: string) => { requireMainUI(e); return store.loadCanvas(id); });
  // Durante a restauração de um backup a interface recarrega; o que ela tentar salvar
  // nesse meio-tempo é o estado antigo e não pode cobrir o restaurado.
  ipcMain.handle("canvas:save", (e, id: string, state: CanvasState) => {
    requireMainUI(e);
    if (!restoring) store.saveCanvas(id, state);
  });
  ipcMain.on("canvas:saveNow", (e, id: string, state: CanvasState) => {
    if (!win || e.sender !== win.webContents || e.senderFrame !== win.webContents.mainFrame) { e.returnValue = false; return; }
    if (!restoring) store.saveCanvas(id, state);
    e.returnValue = true;
  });
  const transfer = (run: () => CanvasTransferResult): CanvasTransferResult => {
    if (restoring) return { ok: false, error: "Espere a restauração terminar antes de transferir elementos." };
    try {
      const result = run();
      win?.webContents.send("canvas-clipboard:changed", canvasClipboard.state());
      return result;
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  };
  ipcMain.handle("canvas-clipboard:get", () => canvasClipboard.state());
  ipcMain.handle("canvas-clipboard:capture", (_e, id: string, state: CanvasState, ids: string[], mode: "copy" | "cut") => transfer(() => canvasClipboard.capture(id, state, ids, mode)));
  ipcMain.handle("canvas-clipboard:paste", (_e, id: string, state: CanvasState, at: { x: number; y: number }) => transfer(() => canvasClipboard.paste(id, state, at)));
  ipcMain.handle("canvas-clipboard:clear", (_e, id: string, state: CanvasState) => transfer(() => canvasClipboard.clear(id, state)));

  // ---- Astros (Ignição, Satélite, Órbita, Gêmeos, Torre, Gravidade, Propulsor): flowRunner.ts e headlessAgent.ts ----
  let agyModelsCache: { slug: string; name: string }[] | null = null;
  const listAgyModels = () =>
    new Promise<{ slug: string; name: string }[]>((resolve) => {
      if (agyModelsCache) return resolve(agyModelsCache);
      const agy = join(process.env.LOCALAPPDATA ?? "", "agy", "bin", "agy.exe");
      if (!existsSync(agy)) return resolve([]);
      execFile(agy, ["models"], { windowsHide: true, timeout: 40_000 }, (err, stdout) => {
        agyModelsCache = err ? [] : parseAgyModels(String(stdout));
        resolve(agyModelsCache);
      });
    });
  const onPath = (name: string) => {
    const dirs = [...(process.env.PATH ?? "").split(delimiter), ...missingFrom(process.env.PATH ?? "")];
    const exts = process.platform === "win32" ? ["", ".cmd", ".exe", ".bat"] : [""];
    return dirs.some((d) => exts.some((x) => d && existsSync(join(d, name + x))));
  };
  ipcMain.handle("flows:options", async (): Promise<FlowAgentOptions> => {
    const all = store.list().accounts ?? [];
    const isolatedPrepared = protectedTerminals() && (await isolatedRuntime.status()).prepared;
    const codexModels: FlowAgentOptions["codexModels"] = { "": codexModelsOf(process.env.CODEX_HOME || join(homedir(), ".codex")) };
    for (const a of all) if (a.agent === "codex") codexModels[a.id] = codexModelsOf(accounts.codexHomePath(a));
    return {
      accounts: await Promise.all(all.map(async a => ({ id: a.id, name: a.name, agent: a.agent, loggedIn: protectedTerminals() ? await isolatedRuntime.loginStatus(a.id, a.agent) : accounts.loggedIn(a) }))),
      codexModels,
      // O agy busca a lista na internet (alguns segundos): o modal não espera mais que 1,5 s por ela.
      antigravityModels: await Promise.race([listAgyModels(), new Promise<{ slug: string; name: string }[]>((r) => setTimeout(() => r(agyModelsCache ?? []), 1500))]),
      claudeModels: [{ slug: "opus", name: "Opus" }, { slug: "sonnet", name: "Sonnet" }, { slug: "haiku", name: "Haiku" }],
      installed: protectedTerminals() ? { codex: !!isolatedPrepared, claude: !!isolatedPrepared, antigravity: !!isolatedPrepared } : { codex: onPath("codex"), claude: onPath("claude"), antigravity: existsSync(join(process.env.LOCALAPPDATA ?? "", "agy", "bin", "agy.exe")) || onPath("agy") },
    };
  });

  ipcMain.handle("flows:prepareCode", async (_e, language: import("../shared/types").CodeLanguage, nodeId: string) => {
    try {
      const place = store.places().find(p => store.loadCanvas(p.canvasId)?.nodes.some(n => n.id === nodeId && n.element?.flow?.type === "code"));
      if (!place) throw new Error("Salve o astro Código no canvas antes de verificar a linguagem.");
      const mode = settings().agentPermissions ?? "ask";
      const runtime = await prepareCodeRuntime(language, {
        cwd: place.universe?.path ?? place.workspace.dir,
        check: () => {
          if (!store.loadCanvas(place.canvasId)?.nodes.some(n => n.id === nodeId && n.element?.flow?.type === "code")) throw new Error("O astro Código foi removido. Abra sua configuração novamente.");
          if ((settings().agentPermissions ?? "ask") !== mode) throw new Error("As permissões mudaram. Verifique novamente.");
          if (mode === "sandbox") throw new Error("Sandbox: a instalação de linguagens no computador está bloqueada.");
        },
        confirm: async (title, detail) => (await ask({ title, message: title, detail, cancel: "Cancelar", ok: "Instalar" })).ok,
      });
      return { ok: true, version: runtime.version };
    } catch (error) { return { ok: false, error: (error as Error).message }; }
  });
  // Já começa a buscar a lista do agy ao abrir, para o modal do Agente encontrá-la pronta.
  setTimeout(() => void listAgyModels(), 5000);
  const runningFlows = new Set<string>();
  const freshPath = () => [...missingFrom(process.env.PATH ?? ""), process.env.PATH ?? ""].filter(Boolean).join(delimiter);
  /** Conta do Codex esgotada? (o selo de limite do terminal usa os mesmos dados). */
  const codexReached = (spec: FlowSpec) => {
    if (protectedTerminals()) return false; // Não confundir o limite de um login do Windows com o novo perfil isolado.
    if ((spec.agent ?? "codex") !== "codex") return false;
    const account = spec.account ? store.account(spec.account) : undefined;
    const home = account?.agent === "codex" ? accounts.codexHomePath(account) : process.env.CODEX_HOME || join(homedir(), ".codex");
    try { return !!codexUsage(home)?.reached; } catch { return false; }
  };
  // zn flow stop / status: pedidos de parada e o último andamento de cada astro.
  const stopFlows = new Set<string>();
  const flowControllers = new Map<string, AbortController>();
  const activeFlowSteps = new Map<string, Set<string>>();
  const lastFlowStatus = new Map<string, FlowStatus>();
  flowStop = (id) => {
    const owners = runningFlows.has(id) ? [id] : [...activeFlowSteps].filter(([, steps]) => steps.has(id)).map(([root]) => root);
    if (owners.length !== 1) return false;
    stopFlows.add(owners[0]);
    flowControllers.get(owners[0])?.abort();
    return true;
  };
  flowStatus = () => ({ running: [...runningFlows], statuses: Object.fromEntries(lastFlowStatus) });
  const startFlow = async (canvasId: string, state: CanvasState, startId: string, input?: string): Promise<{ ok: boolean; error?: string }> => {
    if (runningFlows.has(startId)) return { ok: false, error: "Este fluxo já está rodando." };
    runningFlows.add(startId);
    const controller = new AbortController();
    flowControllers.set(startId, controller);
    activeFlowSteps.set(startId, new Set());
    stopFlows.delete(startId);
    const place = store.place(canvasId);
    const cwd = place?.universe?.path ?? place?.workspace.dir ?? homedir();
    const actions = new FlowActions({
      get forceConfirm() { return protectedTerminals(); },
      cwd, signal: controller.signal, canvas: () => store.loadCanvas(canvasId) ?? undefined, permissions: () => settings().agentPermissions,
      open: path => shell.openPath(path),
      confirm: async (title, detail) => {
        if (!win || win.isDestroyed()) throw new Error("Abra o Zênite para autorizar esta ação.");
        const result = await ask({ title, message: title, detail, cancel: "Cancelar", ok: "Permitir esta vez", signal: controller.signal });
        return result.ok && !controller.signal.aborted;
      },
    });
    try {
      await runFlow(state, startId, {
        action: (node, item) => actions.run(node, item),
        signal: controller.signal,
        waitForSignal: (id, seconds) => flowWaits.wait(id, seconds, controller.signal),
        approve: async (node, message, input, next) => {
          if (!win || win.isDestroyed()) throw new Error("Abra o Zênite para aprovar esta etapa.");
          if (controller.signal.aborted) throw new Error("Fluxo parado.");
          const preview = next.map((n) => {
            const spec = n.element?.flow;
            return `${n.element?.title ?? n.terminal?.title ?? n.id}${spec?.script ? `\nScript: ${spec.script}` : spec?.prompt ? `\nPrompt: ${spec.prompt}` : ""}`;
          }).join("\n\n");
          const answer = await ask({
            title: `Aprovação · ${node.element?.title ?? "Astro"}`, message,
            detail: `Entrada:\n${input}\n\nPróximos passos aprovados:\n${preview || "Nenhum passo ligado."}\n\nA decisão vale para esta passagem. As permissões globais continuam valendo.`,
            cancel: "Recusar", ok: "Aprovar esta etapa", signal: controller.signal,
          });
          return answer.ok && !controller.signal.aborted;
        },
        status: (s) => {
          if (s.state === "running") activeFlowSteps.get(startId)?.add(s.nodeId);
          else activeFlowSteps.get(startId)?.delete(s.nodeId);
          lastFlowStatus.set(s.nodeId, s);
          awayLog.record({ kind: "flow", status: s });
          win?.webContents.send("flow:status", s);
        },
        stopped: () => stopFlows.has(startId),
        hasQuota: (spec) => !codexReached(spec),
        deliver: async (terminalId, text) => {
          const t = state.nodes.find((n) => n.id === terminalId)?.terminal;
          if (t && text.trim()) await control?.deliver({ id: terminalId, title: t.title }, text);
        },
        runScript: async (script) => {
          if (scriptPermission(settings().agentPermissions) === "deny") return { ok: false as const, error: "O Propulsor executa PowerShell sem isolamento e não pode rodar no modo Sandbox." };
          if (protectedTerminals() || scriptPermission(settings().agentPermissions) === "confirm") {
            if (!win || win.isDestroyed()) return { ok: false as const, error: "Abra o Zênite para aprovar a execução do Propulsor." };
            const answer = await ask({
              title: "Executar o Propulsor?", message: "Permitir a execução deste script PowerShell?",
              detail: `Pasta: ${cwd}\n\n${script}`, cancel: "Cancelar", ok: "Executar", danger: true,
              signal: controller.signal,
            });
            if (!answer.ok) return { ok: false as const, error: "Execução do Propulsor cancelada pelo usuário." };
            if (controller.signal.aborted) return { ok: false as const, error: "Fluxo parado." };
            if (scriptPermission(settings().agentPermissions) === "deny") return { ok: false as const, error: "As permissões mudaram para Sandbox; o Propulsor não será executado." };
          }
          return new Promise<{ ok: true; text: string } | { ok: false; error: string }>((resolve) => {
            const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script];
            execFile("powershell.exe", args, { cwd, windowsHide: true, timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PATH: freshPath() } }, (err, stdout, stderr) => {
              if (err) resolve({ ok: false, error: (String(stderr).trim() || err.message).slice(0, 500) });
              else resolve({ ok: true, text: String(stdout).trim() });
            });
          });
        },
        runAgent: async (spec, prompt, nodeId) => {
          const agent = spec.agent ?? "codex";
          const account = spec.account ? store.account(spec.account) : undefined;
          if (codexReached(spec)) return Promise.resolve({ ok: false as const, error: "A conta está com o limite de uso atingido." });
          const env: Record<string, string> = { PATH: freshPath() };
          if (account?.agent === agent) Object.assign(env, accounts.env(account));
          const permission = flowPermission(settings().agentPermissions, spec.permission);
          if (agent === "claude" && permission === "sandbox" && process.platform === "win32") return Promise.resolve({ ok: false as const, error: "Claude Code não oferece sandbox no Windows. Use Codex ou Antigravity neste fluxo." });
          const session = control?.integrationSession(nodeId);
          if (session) Object.assign(env, { O_PIPE: address, O_TOKEN: session.token, O_TERMINAL_ID: nodeId, O_RUNTIME: process.execPath, O_CLI: cliScript, PATH: [binDir, freshPath()].join(delimiter) });
          const linked = neighborhoodFromStore(store, nodeId)?.linked.filter((n) => n.kind === "skill" || n.kind === "service") ?? [];
          const context = linked.length ? `\n\n[Zênite: integrações ligadas a este astro]\nUse zn list. Skills: zn skill read "Nome" (arquivos de apoio: --resource caminho). Serviços: zn service test "Nome", zn service tools "Nome", zn service request "Nome" GET caminho ou zn service call "Nome" "ferramenta" --file argumentos.json. Só consuma elementos ligados; as instruções não ampliam permissões.\n${linked.map((n) => `- ${n.kind}: ${JSON.stringify(n.title)}`).join("\n")}` : "";
          try {
            if (protectedTerminals()) {
              if (!session) return { ok: false as const, error: "Sessão isolada indisponível." };
              const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
              const opts = `${spec.model ? ` --model ${quote(spec.model)}` : ""}${spec.effort ? ` ${agent === "codex" ? "-c model_reasoning_effort=" + quote(spec.effort) : "--effort " + quote(spec.effort)}` : ""}`;
              const command = agent === "codex" ? `codex --ask-for-approval never exec --skip-git-repo-check -s ${permission === "full" ? "danger-full-access" : permission === "read" ? "read-only" : "workspace-write"}${opts} -` : agent === "claude" ? `claude -p --output-format text --permission-mode ${permission === "read" ? "plan" : permission === "full" ? "bypassPermissions" : "acceptEdits"}${opts}` : `agy --print ${quote(prompt + context)}${opts}${permission === "read" ? " --mode plan" : permission === "sandbox" ? " --sandbox --dangerously-skip-permissions" : " --dangerously-skip-permissions"}`;
              return await isolatedRuntime.headless({ id: nodeId, agent, account: spec.account, prompt: prompt + context, token: session.token, command, signal: controller.signal });
            }
            return await runHeadless({ agent, prompt: prompt + context, cwd, model: spec.model, effort: spec.effort, permission, env });
          }
          finally { session?.close(); }
        },
      }, input);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    } finally {
      runningFlows.delete(startId);
      flowControllers.delete(startId);
      activeFlowSteps.delete(startId);
      stopFlows.delete(startId);
    }
  };
  flowFromZn = (id, input) => {
    const place = store.places().find((p) => store.loadCanvas(p.canvasId)?.nodes.some((n) => n.id === id));
    const state = place && store.loadCanvas(place.canvasId);
    if (!place || !state) return { ok: false, error: "Astro não encontrado." };
    if (runningFlows.has(id)) return { ok: false, error: "Este fluxo já está rodando." };
    void startFlow(place.canvasId, state, id, input);
    return { ok: true };
  };
  ipcMain.handle("flows:run", (_e, canvasId: string, state: CanvasState, startId: string) => {
    store.saveCanvas(canvasId, state);
    return startFlow(canvasId, state, startId);
  });
  ipcMain.handle("flows:signal", (_e, nodeId: string, input?: string) => flowWaits.signal(nodeId, input));
  ipcMain.handle("flows:stop", (_e, nodeId: string) => flowStop(nodeId) ? { ok: true } : { ok: false, error: "Não há uma execução única ativa neste astro." });

  // Gatilhos automáticos: enquanto o Zênite está aberto, verifica todos os canvases a cada segundo
  // (galáxias e universos); a primeira vez que vê uma Ignição só marca a hora, para não disparar
  // tudo ao abrir o app. Pasta vigiada: cada arquivo novo dispara com o caminho em {{entrada}}.
  const lastIgnition = new Map<string, number>();
  const chronosScheduler = new ChronosScheduler();
  const folderWatch = new Map<string, { folder: string; watcher: FSWatcher }>();
  const igniteTick = () => {
    const now = new Date();
    const seen = new Set<string>();
    for (const place of store.places()) {
      const state = store.loadCanvas(place.canvasId);
      for (const n of state?.nodes ?? []) {
        const spec = n.element?.flow;
        if (n.kind === "flow" && spec?.type === "chronos") {
          seen.add(n.id);
          try {
            if (chronosScheduler.tick(n.id, spec, now)) void startFlow(place.canvasId, state!, n.id);
          } catch (error) {
            const status: FlowStatus = { nodeId: n.id, state: "error", done: 0, total: 0, message: (error as Error).message, at: now.getTime() };
            lastFlowStatus.set(n.id, status);
            win?.webContents.send("flow:status", status);
          }
          continue;
        }
        if (n.kind !== "flow" || spec?.type !== "ignition" || !spec.schedule || spec.schedule === "manual" || spec.paused) continue;
        seen.add(n.id);
        if (spec.schedule === "folder") {
          const folder = spec.folder?.trim();
          const cur = folderWatch.get(n.id);
          if (cur && cur.folder === folder) continue;
          cur?.watcher.close();
          folderWatch.delete(n.id);
          if (!folder || !existsSync(folder)) continue;
          const canvasId = place.canvasId;
          const nodeId = n.id;
          try {
            const watcher = watch(folder, (event, name) => {
              const file = name ? join(folder, String(name)) : "";
              if (event !== "rename" || !file || !existsSync(file)) return; // só arquivo que apareceu
              const fresh = store.loadCanvas(canvasId);
              if (fresh) void startFlow(canvasId, fresh, nodeId, file);
            });
            folderWatch.set(n.id, { folder, watcher });
          } catch {
            // pasta sem acesso: tenta de novo no próximo giro
          }
          continue;
        }
        if (!lastIgnition.has(n.id)) {
          lastIgnition.set(n.id, now.getTime());
          continue;
        }
        if (ignitionDue(spec, lastIgnition.get(n.id)!, now)) {
          lastIgnition.set(n.id, now.getTime());
          void startFlow(place.canvasId, state!, n.id);
        }
      }
    }
    for (const [id, w] of folderWatch) if (!seen.has(id)) { w.watcher.close(); folderWatch.delete(id); }
    for (const id of lastIgnition.keys()) if (!seen.has(id)) lastIgnition.delete(id);
    chronosScheduler.retain(seen);
  };
  setInterval(igniteTick, 1000);
  setTimeout(igniteTick, 3000);
  // ---- Exportar e importar canvas (.zenite) ----
  const ZENITE_FILTER = [{ name: "Canvas do Zênite", extensions: ["zenite"] }];
  ipcMain.handle("canvas:export", async (_e, state: CanvasState, kinds: NodeKind[], name: string): Promise<CanvasExportResult> => {
    const safe = (name || "canvas").replace(/[<>:"/\\|?*\x00-\x1f]+/g, " ").trim() || "canvas";
    const result = await dialog.showSaveDialog(win!, { title: "Exportar canvas", defaultPath: join(app.getPath("documents"), `${safe}.zenite`), filters: ZENITE_FILTER });
    if (result.canceled || !result.filePath) return { ok: false, error: "", canceled: true };
    try {
      return { ok: true, count: writeCanvasArchive(result.filePath, state, kinds, elements), path: result.filePath };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });
  ipcMain.handle("canvas:import", async (_e, id: string, state: CanvasState, at: { x: number; y: number }): Promise<CanvasTransferResult> => {
    const result = await dialog.showOpenDialog(win!, { title: "Importar canvas", properties: ["openFile"], filters: ZENITE_FILTER });
    const file = result.filePaths[0];
    if (result.canceled || !file) return { ok: false, error: "", canceled: true };
    return transfer(() => canvasClipboard.insert(id, state, readCanvasArchive(file, (f) => elements.mediaPath(f)), at));
  });

  // ---- Backups e dados ----
  const BACKUP_EVERY_MS = 6 * 60 * 60 * 1000;
  const autoBackup = (reason: string, force = false) => {
    if (settings().autoBackup === false) return;
    const last = backups.latest();
    if (force || !last || Date.now() - last.created > BACKUP_EVERY_MS) backups.create(reason);
  };
  autoBackup("Automático (ao abrir)");
  setInterval(() => autoBackup("Automático"), 30 * 60 * 1000);
  ipcMain.handle("backups:list", () => backups.list());
  ipcMain.handle("backups:create", () => {
    backups.create("Feito por você");
    return backups.list();
  });
  ipcMain.handle("backups:remove", (_e, id: string) => {
    backups.remove(id);
    return backups.list();
  });
  ipcMain.handle("backups:restore", (e, id: string) => {
    requireMainUI(e);
    restoring = true;
    const r = backups.restore(id);
    if (!r.ok) {
      restoring = false;
      return r;
    }
    store.protectRuntimeState();
    win?.webContents.once("did-finish-load", () => {
      restoring = false;
    });
    win?.webContents.reload();
    return { ok: true };
  });
  ipcMain.on("backups:open", () => void shell.openPath(backups.dir));
  ipcMain.handle("system:usage", () =>
    [
      { label: "Galáxias, canvases, notas e tabelas", bytes: ["workspaces", "notes", "tables"].reduce((s, d) => s + dirSize(join(dataDir, d)), 0) },
      { label: "Imagens e vídeos do canvas", bytes: dirSize(join(dataDir, "media")) },
      { label: "Cópias dos universos", bytes: dirSize(join(dataDir, "universos")) },
      { label: "Contas (logins dos agentes)", bytes: dirSize(join(dataDir, "contas")) },
      { label: "Backups", bytes: dirSize(backups.dir) },
    ],
  );

  app.on("window-all-closed", () => {
    autoBackup("Ao fechar", true);
    control?.close();
    shutdownTerminals();
    stopSampler();
    app.quit();
  });
  // Ctrl+C no terminal do `npm start` ou "Encerrar tarefa": também leva só o que é do Zênite.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      shutdownTerminals();
      app.exit(0);
    });
  }

  // Sobras de uma vez em que o Zênite não fechou direito (travou, foi encerrado à força). Antes de
  // abrir a janela: ainda não há terminal nenhum, então todo processo de fundo de conta é sobra.
  if (!testInstance) killZeniteCodex();
  createWindow();
  const w = win as BrowserWindow | null;
  w?.webContents.setZoomFactor(settings().uiScale ?? 1);
  // PATH atual do Windows antes de os terminais voltarem; ao ganhar foco, relê (programa instalado com o Zênite aberto).
  readPathNow();
  w?.on("focus", () => {
    refreshPath();
    attention.windowFocus(true);
    w.flashFrame(false);
    void cameBack();
  });
  w?.on("blur", () => {
    attention.windowFocus(false);
    awayLog.leave(Date.now());
  });
  // Com a janela em foco, o computador parado também conta como ausência.
  const idleTimer = setInterval(() => {
    const idle = powerMonitor.getSystemIdleTime();
    const minutes = settings().awaySummaryMinutes ?? 10;
    if (!minutes || !w?.isFocused()) return;
    if (!awayLog.away && idle * 1000 >= minutes * 60_000) awayLog.leave(Date.now() - idle * 1000);
    else if (awayLog.away && idle < 5) void cameBack();
  }, 15_000);
  app.on("will-quit", () => clearInterval(idleTimer));
  // Fechar por engano não pode matar agentes no meio do trabalho. A pergunta aparece num
  // diálogo do próprio app; se a página não responder (travada), usa a caixa do Windows.
  let closing = false;
  let asking = false;
  const answer = (close: boolean, dontAskAgain: boolean) => {
    asking = false;
    if (dontAskAgain) store.setSettings({ confirmQuit: false });
    if (close && w) {
      closing = true;
      w.close();
    }
  };
  ipcMain.on("app:closeAnswer", (_e, close: boolean, dontAskAgain: boolean) => answer(close, dontAskAgain));
  w?.on("close", (e) => {
    const open = ptys.count();
    if (closing || isInstallingUpdate() || settings().confirmQuit === false || open === 0) return;
    e.preventDefault();
    if (asking) return;
    asking = true;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
    let shown = false;
    const onShown = (event: Electron.IpcMainEvent) => {
      if (!isMainUI(event)) return;
      shown = true;
      electronIpcMain.removeListener("app:closeShown", onShown);
    };
    electronIpcMain.on("app:closeShown", onShown);
    w.webContents.send("app:confirmClose", open);
    setTimeout(() => {
      electronIpcMain.removeListener("app:closeShown", onShown);
      if (!shown && asking) nativeConfirm(open);
    }, 1500);
  });
  const nativeConfirm = (open: number) => {
    if (!w) return;
    void dialog
      .showMessageBox(w, {
        type: "question",
        buttons: ["Fechar e encerrar", "Cancelar"],
        defaultId: 1,
        cancelId: 1,
        title: "Fechar o Zênite?",
        message: "Fechar o Zênite?",
        detail: `${plural(open, "terminal aberto vai ser encerrado", "terminais abertos vão ser encerrados")}, inclusive agentes que estejam trabalhando.`,
        checkboxLabel: "Não perguntar de novo",
      })
      .then((r) => answer(r.response === 0, r.checkboxChecked));
  };
  startUpdater(() => win);
});
