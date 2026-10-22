/**
 * O "F12" dos sites do canvas para os agentes: liga o depurador da página (o mesmo canal do
 * DevTools) assim que o site abre e guarda o que acontece nele, para o `zn web console|network|
 * request|source|cookies` responder sem o usuário abrir nada:
 *  - console: console.log/warn/error da página, erros não tratados e avisos do navegador;
 *  - rede: cada requisição com método, status, tipo, tempo, tamanho e cabeçalhos (inclusive os
 *    cookies HttpOnly, que o JavaScript da página não enxerga); o corpo é lido sob pedido;
 *  - código: o conteúdo de qualquer arquivo carregado (HTML, JS, CSS...).
 */

/** O pedaço do `webContents.debugger` do Electron que usamos (facilita testar sem Electron). */
export interface DebugChannel {
  attach(protocolVersion?: string): void;
  isAttached(): boolean;
  detach(): void;
  sendCommand(method: string, params?: Record<string, unknown>): Promise<any>;
  on(event: "message", listener: (event: unknown, method: string, params: any) => void): unknown;
  on(event: "detach", listener: (event: unknown, reason: string) => void): unknown;
}

export interface ConsoleEntry {
  n: number;
  at: number;
  level: "log" | "info" | "warn" | "error" | "debug";
  /** console = console.* da página; exception = erro não tratado; browser = aviso do navegador; nav = navegou. */
  source: "console" | "exception" | "browser" | "nav";
  text: string;
  where?: string;
}

export interface NetEntry {
  n: number;
  requestId: string;
  at: number;
  method: string;
  url: string;
  type: string;
  status?: number;
  statusText?: string;
  mime?: string;
  /** Bytes que vieram pela rede. */
  size?: number;
  ms?: number;
  failed?: string;
  fromCache?: boolean;
  requestHeaders: Record<string, string>;
  responseHeaders?: Record<string, string>;
  hasPostData?: boolean;
  postData?: string;
}

const MAX_CONSOLE = 1000;
const MAX_NET = 500;
const MAX_TEXT = 4000;

/** Valor de console.log(...) em texto, como o DevTools mostra (objetos pela prévia). */
function remoteText(arg: any): string {
  if (!arg) return "";
  if (arg.type === "string") return arg.value;
  if ("value" in arg && arg.value !== undefined) return typeof arg.value === "object" ? JSON.stringify(arg.value) : String(arg.value);
  if (arg.unserializableValue) return arg.unserializableValue;
  if (arg.preview?.properties) {
    const props = arg.preview.properties.map((p: any) => (arg.subtype === "array" ? p.value : `${p.name}: ${p.value}`)).join(", ");
    const open = arg.subtype === "array" ? "[" : "{";
    const close = arg.subtype === "array" ? "]" : "}";
    return `${arg.subtype === "array" ? "" : arg.className && arg.className !== "Object" ? `${arg.className} ` : ""}${open}${props}${arg.preview.overflow ? ", …" : ""}${close}`;
  }
  return arg.description ?? arg.type ?? "";
}

/** Os argumentos do console.log juntos; "%c" (estilo) some junto com o CSS que o acompanha. */
function consoleText(args: any[]): string {
  const texts = args.map(remoteText);
  if (args[0]?.type === "string" && texts[0].includes("%c")) {
    const styles = (texts[0].match(/%c/g) ?? []).length;
    return [texts[0].replace(/%c/g, ""), ...texts.slice(1 + styles)].join(" ").trim();
  }
  return texts.join(" ");
}

const where = (url?: string, line?: number) => (url ? `${url}${line !== undefined ? `:${line + 1}` : ""}` : undefined);

export class WebInspector {
  private console: ConsoleEntry[] = [];
  private net = new Map<string, NetEntry>();
  private order: string[] = [];
  private seq = { console: 0, net: 0 };
  private ready: Promise<void> | null = null;
  /** O ExtraInfo da resposta pode chegar antes da própria requisição ser vista. */
  private pendingExtra = new Map<string, Record<string, string>>();

  constructor(private channel: DebugChannel) {
    channel.on("message", (_e, method, params) => this.onMessage(method, params));
    channel.on("detach", () => (this.ready = null));
  }

  /** Liga o depurador e os domínios que alimentam o console e a rede (só uma vez). */
  start(): Promise<void> {
    if (this.ready && this.channel.isAttached()) return this.ready;
    this.ready = (async () => {
      if (!this.channel.isAttached()) this.channel.attach("1.3");
      // Tudo de uma vez, sem esperar um pelo outro: antes de a página existir os comandos ficam na
      // fila e só respondem quando ela nasce, e assim já valem para o carregamento inicial.
      await Promise.all([
        this.channel.sendCommand("Runtime.enable"),
        this.channel.sendCommand("Log.enable"),
        this.channel.sendCommand("Network.enable", { maxPostDataSize: 65536 }),
        this.channel.sendCommand("Page.enable"),
      ]);
    })().catch((err) => {
      this.ready = null;
      throw new Error(`Não consegui ligar o depurador da página: ${(err as Error).message}`);
    });
    return this.ready;
  }

  private pushConsole(e: Omit<ConsoleEntry, "n">): void {
    this.console.push({ ...e, text: e.text.length > MAX_TEXT ? `${e.text.slice(0, MAX_TEXT)}…` : e.text, n: ++this.seq.console });
    if (this.console.length > MAX_CONSOLE) this.console.splice(0, this.console.length - MAX_CONSOLE);
  }

  private onMessage(method: string, p: any): void {
    switch (method) {
      case "Runtime.consoleAPICalled": {
        const level = p.type === "warning" ? "warn" : p.type === "error" || p.type === "assert" ? "error" : p.type === "debug" ? "debug" : p.type === "info" ? "info" : "log";
        const frame = p.stackTrace?.callFrames?.[0];
        this.pushConsole({ at: Date.now(), level, source: "console", text: consoleText(p.args ?? []), where: where(frame?.url, frame?.lineNumber) });
        break;
      }
      case "Runtime.exceptionThrown": {
        const d = p.exceptionDetails ?? {};
        const text = d.exception?.description ?? `${d.text ?? "Erro"}`;
        this.pushConsole({ at: Date.now(), level: "error", source: "exception", text, where: where(d.url, d.lineNumber) });
        break;
      }
      case "Log.entryAdded": {
        const e = p.entry ?? {};
        const level = e.level === "warning" ? "warn" : e.level === "error" ? "error" : e.level === "verbose" ? "debug" : "info";
        // O endereço vai uma vez só: no texto, ou como "onde" quando há linha.
        const line = e.lineNumber !== undefined ? where(e.url, e.lineNumber) : undefined;
        this.pushConsole({ at: Date.now(), level, source: "browser", text: `${e.text ?? ""}${e.url && !line && !String(e.text).includes(e.url) ? ` (${e.url})` : ""}`, where: line });
        break;
      }
      case "Page.frameNavigated":
        if (!p.frame?.parentId) this.pushConsole({ at: Date.now(), level: "info", source: "nav", text: `Navegou para ${p.frame?.url}` });
        break;
      case "Network.requestWillBeSent": {
        const r = p.request ?? {};
        // Redirecionamento reaproveita o id: a etapa anterior fica registrada com o status dela.
        const old = this.net.get(p.requestId);
        if (old && p.redirectResponse) {
          old.status = p.redirectResponse.status;
          old.statusText = p.redirectResponse.statusText;
          old.responseHeaders = p.redirectResponse.headers;
          this.net.delete(p.requestId);
          this.net.set(`${p.requestId}#${old.n}`, { ...old, requestId: `${p.requestId}#${old.n}` });
          this.order = this.order.map((id) => (id === p.requestId ? `${p.requestId}#${old.n}` : id));
        }
        this.net.set(p.requestId, {
          n: ++this.seq.net,
          requestId: p.requestId,
          at: Date.now(),
          method: r.method ?? "GET",
          url: r.url ?? "",
          type: p.type ?? "Other",
          requestHeaders: r.headers ?? {},
          hasPostData: !!r.hasPostData,
          ...(typeof r.postData === "string" ? { postData: r.postData } : {}),
        });
        this.order.push(p.requestId);
        while (this.order.length > MAX_NET) this.net.delete(this.order.shift()!);
        break;
      }
      case "Network.requestWillBeSentExtraInfo": {
        const e = this.net.get(p.requestId);
        // Cabeçalhos de verdade, com o Cookie (inclusive HttpOnly), que o requestWillBeSent não traz.
        if (e && p.headers) e.requestHeaders = { ...e.requestHeaders, ...p.headers };
        break;
      }
      case "Network.responseReceived": {
        const e = this.net.get(p.requestId);
        if (!e) break;
        const r = p.response ?? {};
        Object.assign(e, { status: r.status, statusText: r.statusText, mime: r.mimeType, responseHeaders: { ...r.headers, ...e.responseHeaders }, fromCache: !!(r.fromDiskCache || r.fromServiceWorker), type: p.type ?? e.type });
        break;
      }
      case "Network.responseReceivedExtraInfo": {
        const e = this.net.get(p.requestId);
        // Set-Cookie (inclusive HttpOnly) só aparece aqui.
        if (e && p.headers) e.responseHeaders = { ...e.responseHeaders, ...p.headers };
        else if (!e && p.headers) this.pendingExtra.set(p.requestId, p.headers);
        break;
      }
      case "Network.loadingFinished": {
        const e = this.net.get(p.requestId);
        if (!e) break;
        e.size = p.encodedDataLength;
        e.ms = Date.now() - e.at;
        const extra = this.pendingExtra.get(p.requestId);
        if (extra) {
          e.responseHeaders = { ...e.responseHeaders, ...extra };
          this.pendingExtra.delete(p.requestId);
        }
        break;
      }
      case "Network.loadingFailed": {
        const e = this.net.get(p.requestId);
        if (!e) break;
        e.failed = p.canceled ? "cancelada" : p.blockedReason ? `bloqueada (${p.blockedReason})` : p.errorText || "falhou";
        e.ms = Date.now() - e.at;
        break;
      }
    }
  }

  consoleEntries(opts: { limit?: number; errors?: boolean; clear?: boolean } = {}): ConsoleEntry[] {
    let list = opts.errors ? this.console.filter((e) => e.level === "error" || e.level === "warn") : this.console;
    list = list.slice(-(opts.limit ?? 50));
    if (opts.clear) this.console = [];
    return list;
  }

  netEntries(opts: { limit?: number; filter?: string; failed?: boolean; clear?: boolean } = {}): NetEntry[] {
    const f = opts.filter?.toLowerCase();
    let list = this.order.map((id) => this.net.get(id)!).filter(Boolean);
    if (f) list = list.filter((e) => e.url.toLowerCase().includes(f) || e.type.toLowerCase() === f || e.method.toLowerCase() === f || String(e.status) === f);
    if (opts.failed) list = list.filter((e) => e.failed || (e.status ?? 0) >= 400);
    list = list.slice(-(opts.limit ?? 50));
    if (opts.clear) {
      this.net.clear();
      this.order = [];
    }
    return list;
  }

  /** Uma requisição pelo número da lista (#12), com o corpo da resposta (e o do pedido, se houver). */
  async request(n: number, maxBody = 20_000): Promise<NetEntry & { body?: string; bodyNote?: string }> {
    const e = this.order.map((id) => this.net.get(id)!).find((x) => x?.n === n);
    if (!e) throw new Error(`Não há requisição #${n} guardada. Veja os números com: zn web network`);
    let postData = e.postData;
    if (e.hasPostData && postData === undefined) {
      postData = await this.channel.sendCommand("Network.getRequestPostData", { requestId: e.requestId }).then((r) => r.postData, () => undefined);
    }
    let body: string | undefined;
    let bodyNote: string | undefined;
    if (e.failed) bodyNote = `Sem corpo: a requisição ${e.failed}.`;
    else {
      try {
        const r = await this.channel.sendCommand("Network.getResponseBody", { requestId: e.requestId.split("#")[0] });
        if (r.base64Encoded) bodyNote = `Corpo binário (${e.mime ?? "?"}, ${Math.round((r.body.length * 3) / 4)} bytes): não mostrado.`;
        else {
          body = r.body.length > maxBody ? r.body.slice(0, maxBody) : r.body;
          if (r.body.length > maxBody) bodyNote = `Corpo cortado em ${maxBody} de ${r.body.length} caracteres (use --full).`;
        }
      } catch {
        bodyNote = "O navegador já descartou o corpo desta resposta (ou ela não tem corpo).";
      }
    }
    return { ...e, ...(postData !== undefined ? { postData } : {}), ...(body !== undefined ? { body } : {}), ...(bodyNote ? { bodyNote } : {}) };
  }

  /** Arquivos que a página carregou (HTML, scripts, estilos, imagens...). */
  async resources(): Promise<{ url: string; type: string; mime: string }[]> {
    const tree = await this.channel.sendCommand("Page.getResourceTree");
    const out: { url: string; type: string; mime: string }[] = [];
    const walk = (node: any) => {
      out.push({ url: node.frame.url, type: "Document", mime: node.frame.mimeType ?? "text/html" });
      for (const r of node.resources ?? []) out.push({ url: r.url, type: r.type, mime: r.mimeType });
      for (const child of node.childFrames ?? []) walk(child);
    };
    walk(tree.frameTree);
    return out;
  }

  /** Conteúdo de um arquivo carregado (URL inteira, ou um pedaço único dela). */
  async source(wanted: string): Promise<{ url: string; mime: string; content: string; base64: boolean }> {
    const tree = await this.channel.sendCommand("Page.getResourceTree");
    const all: { frameId: string; url: string; mime: string }[] = [];
    const walk = (node: any) => {
      all.push({ frameId: node.frame.id, url: node.frame.url, mime: node.frame.mimeType ?? "text/html" });
      for (const r of node.resources ?? []) all.push({ frameId: node.frame.id, url: r.url, mime: r.mimeType });
      for (const child of node.childFrames ?? []) walk(child);
    };
    walk(tree.frameTree);
    const exact = all.filter((r) => r.url === wanted);
    const hits = exact.length ? exact : all.filter((r) => r.url.includes(wanted));
    const unique = [...new Map(hits.map((h) => [h.url, h])).values()];
    if (!unique.length) {
      // Pode ser algo baixado por fetch/XHR, que não entra na árvore de recursos: vale pelo corpo da rede.
      const net = this.order.map((id) => this.net.get(id)!).filter((e) => e && (e.url === wanted || e.url.includes(wanted)));
      if (net.length === 1) {
        const r = await this.request(net[0].n, Number.MAX_SAFE_INTEGER);
        if (r.body === undefined) throw new Error(r.bodyNote ?? "Sem conteúdo.");
        return { url: r.url, mime: r.mime ?? "", content: r.body, base64: false };
      }
      throw new Error(`Nenhum arquivo carregado com "${wanted}". Veja a lista com: zn web source "Site"`);
    }
    if (unique.length > 1) throw new Error(`"${wanted}" bate com ${unique.length} arquivos: ${unique.slice(0, 8).map((u) => u.url).join(", ")}. Seja mais específico.`);
    const r = await this.channel.sendCommand("Page.getResourceContent", { frameId: unique[0].frameId, url: unique[0].url });
    return { url: unique[0].url, mime: unique[0].mime, content: r.content, base64: !!r.base64Encoded };
  }

  /** Cookies do site (inclusive HttpOnly e Secure, que o document.cookie esconde). */
  async cookies(url: string): Promise<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite?: string; expires?: number }[]> {
    const r = await this.channel.sendCommand("Network.getCookies", { urls: [url] });
    return (r.cookies ?? []).map((c: any) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, httpOnly: !!c.httpOnly, secure: !!c.secure, ...(c.sameSite ? { sameSite: c.sameSite } : {}), ...(c.expires > 0 ? { expires: c.expires } : {}) }));
  }
}
