import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { CanvasNode, CanvasState, AgentPermissions } from "../shared/types";
import { DATA_LIMIT, fillData, jsonBody, type DataItem } from "../shared/flowData";
import { parseEnv } from "./envFile";
import { readResponse, validateService } from "./canvasIntegrations";
import { prepareCodeRuntime, executeCode } from "./codeRuntime";

export interface ActionHost {
  forceConfirm?: boolean;
  cwd: string;
  signal: AbortSignal;
  canvas(): CanvasState | undefined;
  permissions(): AgentPermissions | undefined;
  confirm(title: string, detail: string): Promise<boolean>;
  open(path: string): Promise<string>;
}

/** Ações do fluxo usam as permissões globais e nunca interpretam comandos por um shell. */
export class FlowActions {
  constructor(private host: ActionHost) {}

  async run(node: CanvasNode, item: DataItem): Promise<DataItem> {
    const h = this.host;
    const snapshot = JSON.stringify(node.element);
    const check = () => {
      if (h.signal.aborted) throw new Error("Fluxo parado.");
      const current = h.canvas()?.nodes.find(n => n.id === node.id);
      if (!current || JSON.stringify(current.element) !== snapshot) throw new Error("O elemento mudou. Execute o fluxo novamente.");
      const mode = h.permissions() ?? "ask";
      if (mode === "sandbox") throw new Error("Sandbox: esta ação executa fora do isolamento e está bloqueada.");
      return mode;
    };
    const authorize = async (title: string, detail: string) => {
      const mode = check();
      if ((mode !== "full" || h.forceConfirm) && !await h.confirm(title, detail.slice(0, 8000))) throw new Error("Ação cancelada pelo usuário.");
      if (check() !== mode) throw new Error("As permissões mudaram. Execute novamente.");
    };
    check();
    const spec = node.element?.flow;
    if (spec?.type === "code") {
      const code = spec.code;
      if (!code?.source?.trim() || Buffer.byteLength(code.source) > DATA_LIMIT) throw new Error("Escreva um bloco de código de até 1 MB.");
      const mode = check();
      const checkCode = () => { if (check() !== mode) throw new Error("As permissões mudaram. Execute novamente."); };
      const runtime = await prepareCodeRuntime(code.language, { cwd: h.cwd, signal: h.signal, check: checkCode, confirm: (title, detail) => h.confirm(title, detail) });
      checkCode();
      await authorize("Executar o astro Código?", `${node.element?.title}\n${runtime.version}\nPasta: ${h.cwd}\n\n${code.source}`);
      checkCode();
      const output = await executeCode(runtime, code.language, code.source, item, h.cwd, h.signal);
      checkCode();
      return { entrada: output, vars: { ...item.vars, saida: output } };
    }
    if (spec?.type === "request") {
      const http = spec.http;
      if (!http) throw new Error("Configure a requisição HTTP.");
      const connected = http.serviceId ? h.canvas()?.nodes.find(n => n.id === http.serviceId && n.kind === "service") : undefined;
      const linked = () => !!h.canvas()?.edges.some(e => e.source === node.id && e.target === http.serviceId || e.target === node.id && e.source === http.serviceId);
      const serviceSnapshot = JSON.stringify(connected?.element?.service);
      const service = http.serviceId ? connected?.element?.service : undefined;
      if (http.serviceId && (!service || service.transport !== "http" || !linked())) throw new Error("Ligue um serviço HTTP diretamente a este astro.");
      let ownUrl: URL | undefined;
      if (!service) { try { ownUrl = new URL(http.url ?? ""); } catch { throw new Error("Informe um endereço HTTP(S) válido."); } }
      const ownBase = ownUrl ? new URL(ownUrl.href) : undefined;
      if (ownBase) ownBase.search = "";
      const base = validateService(service ?? { transport: "http", endpoint: ownBase!.href, tokenEnv: http.tokenEnv });
      const url = service ? new URL(fillData(http.path ?? "", item), `${base.endpoint.replace(/\/$/, "")}/`) : ownUrl!;
      const prefix = new URL(base.endpoint).pathname.replace(/\/$/, "");
      if (url.origin !== new URL(base.endpoint).origin || url.username || url.password || url.hash || service && !(url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) throw new Error("O caminho precisa permanecer dentro do serviço conectado.");
      const method = http.method ?? "GET";
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new Error("Método HTTP inválido.");
      if (service && method !== "GET" && !service.allowWrites) throw new Error("Ative o envio de dados no serviço conectado.");
      const body = method !== "GET" && http.body ? http.bodyType === "text" ? fillData(http.body, item) : JSON.stringify(jsonBody(http.body, item)) : undefined;
      if (body && Buffer.byteLength(body) > DATA_LIMIT) throw new Error("Dados maiores que 1 MB.");
      const requestMode = check();
      const checkRequest = () => {
        if (check() !== requestMode) throw new Error("As permissões mudaram. Execute novamente.");
        if (service && (!linked() || JSON.stringify(h.canvas()?.nodes.find(n => n.id === http.serviceId)?.element?.service) !== serviceSnapshot)) throw new Error("O serviço ou sua conexão mudou. Execute novamente.");
      };
      await authorize("Permitir requisição HTTP?", `${node.element?.title}\n${method} ${url.href}\n${body ?? ""}`);
      checkRequest();
      let token = "";
      if (base.tokenEnv) {
        const file = join(h.cwd, ".env");
        const env = existsSync(file) ? Object.fromEntries(parseEnv(readFileSync(file, "utf8")).map(p => [p.key, p.value])) : {};
        token = env[base.tokenEnv] || process.env[base.tokenEnv] || "";
        if (!token || /[\r\n]/.test(token)) throw new Error(`Defina ${base.tokenEnv} no .env da galáxia ou no ambiente, em uma única linha.`);
      }
      const redact = (text: string) => token ? text.split(token).join("[credencial ocultada]") : text;
      try {
        const response = await fetch(url, { method, body, redirect: "manual", signal: AbortSignal.any([h.signal, AbortSignal.timeout(20_000)]), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": http.bodyType === "text" ? "text/plain; charset=utf-8" : "application/json" }) } });
        if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error("Redirecionamento bloqueado. Configure o endereço final."); }
        const text = redact(await readResponse(response));
        checkRequest();
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
        return { entrada: text, vars: { ...item.vars, resposta: text, status_http: String(response.status) } };
      } catch (e) { throw new Error(redact((e as Error).message)); }
    }
    const launch = spec?.launch;
    if (node.kind !== "file" && spec?.type !== "launch") throw new Error("Ação desconhecida.");
    if (node.kind === "file" && !node.element?.openOnFlow) throw new Error("Ative a abertura por fluxo neste arquivo.");
    const target = launch?.targetId ? h.canvas()?.nodes.find(n => n.id === launch.targetId && n.kind === "file") : undefined;
    const targetSnapshot = JSON.stringify(target?.element);
    const checkTarget = () => {
      check();
      if (launch?.targetId && (!target || JSON.stringify(h.canvas()?.nodes.find(n => n.id === launch.targetId)?.element) !== targetSnapshot || !h.canvas()?.edges.some(e => e.source === node.id && e.target === target.id || e.target === node.id && e.source === target.id))) throw new Error("O arquivo ou sua conexão mudou. Ligue o arquivo diretamente ao astro.");
    };
    checkTarget();
    const rawPath = node.kind === "file" ? node.element?.path : launch?.targetId ? target?.element?.path : launch?.path;
    if (!rawPath?.trim() || rawPath.includes("\0")) throw new Error("Escolha um arquivo, atalho ou executável.");
    const path = isAbsolute(rawPath) ? rawPath : resolve(h.cwd, rawPath);
    if (!existsSync(path)) throw new Error("Arquivo ou executável não encontrado.");
    const command = launch?.mode === "command";
    if (launch?.mode && !["command", "open"].includes(launch.mode)) throw new Error("Modo de abertura inválido.");
    if (command && (!Array.isArray(launch.args ?? []) || (launch.args ?? []).some(a => typeof a !== "string"))) throw new Error("Argumentos precisam ser uma lista de textos.");
    const args = command ? (launch!.args ?? []).map(a => fillData(a, item)) : [];
    if (args.length > 100 || args.some(a => a.includes("\0")) || args.join("").length > 32000) throw new Error("Argumentos inválidos ou grandes demais.");
    await authorize("Permitir abrir aplicativo?", `${node.element?.title}\n${path}\n${args.map(a => JSON.stringify(a)).join(" ")}\n${command && launch?.waitForExit ? "Aguardar conclusão (limite de 10 minutos)." : "O aplicativo pode continuar aberto após o fluxo."}`);
    checkTarget();
    if (!command) {
      const error = await h.open(path);
      if (error) throw new Error(error);
      return { entrada: item.entrada, vars: { ...item.vars, aplicativo: path } };
    }
    const output = await new Promise<string>((resolveOutput, reject) => {
      const wait = !!launch?.waitForExit;
      const child = spawn(path, args, { cwd: h.cwd, shell: false, windowsHide: true, stdio: wait ? ["ignore", "pipe", "pipe"] : "ignore", signal: h.signal });
      let text = "", bytes = 0;
      const timer = wait ? setTimeout(() => { child.kill(); reject(new Error("O aplicativo excedeu o limite de 10 minutos.")); }, 600_000) : undefined;
      const cleanup = () => { if (timer) clearTimeout(timer); };
      const collect = (chunk: string) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > DATA_LIMIT) { child.kill(); cleanup(); reject(new Error("Saída do aplicativo maior que 1 MB.")); return; }
        text += chunk;
      };
      child.stdout?.setEncoding("utf8"); child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", collect); child.stderr?.on("data", collect);
      child.once("error", e => { cleanup(); reject(e); });
      child.once("spawn", () => { if (!wait) { child.unref(); resolveOutput(String(child.pid)); } });
      child.once("close", code => { cleanup(); if (wait) code === 0 ? resolveOutput(text.trim()) : reject(new Error(`Aplicativo encerrou com código ${code}: ${text.slice(0, 500)}`)); });
    });
    return { entrada: launch?.waitForExit ? output : item.entrada, vars: { ...item.vars, aplicativo: path, [launch?.waitForExit ? "saida" : "pid"]: output } };
  }
}
