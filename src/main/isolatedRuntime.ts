import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { CreatePtyRequest } from "../shared/types";
import { wingetPath } from "./codeRuntime";
import { readPathNow } from "./freshPath";
import type { ShellLaunch } from "./shell";

export const AGENT_IMAGE = "zenite-agents:3";
/** Recursos de cada contêiner quando as Configurações não dizem outro valor. */
export const DEFAULT_LIMITS = { memoryGb: 6, cpus: 4 };
export type IsolatedLimits = { memoryGb?: number; cpus?: number };
export const ISOLATED_GUIDE = `Você está em um terminal isolado do Zênite. Sua pasta /workspace é uma área de trabalho privada, não a pasta do computador. Comece por zn list e zn help.
Os arquivos do computador não estão montados aqui. Para obter um arquivo, use zn access read CAMINHO --out arquivo-local; para gravar no computador, use zn access write CAMINHO --file arquivo-local. Para listar uma pasta use zn access list CAMINHO. O Zênite autoriza conforme as conexões do canvas e pede Permitir/Cancelar fora delas. Não há comando para executar processos no computador hospedeiro.
A pasta /exchange é compartilhada entre os terminais isolados da mesma galáxia, de qualquer conta: use-a para trocar arquivos entre agentes. O perfil /home/agent é persistente e separado por conta. Faça login uma primeira vez aqui. No Codex, use codex login --device-auth para autenticar pelo navegador sem porta local. Fechar o terminal preserva o perfil. Nunca tente acessar perfis de outras contas.
O isolamento continua valendo em Controle total e ao virar Sol. O Sol organiza o canvas usando zn, sem ler o armazenamento interno do aplicativo.`;

const DOCKER_DESKTOP = join(process.env.ProgramFiles ?? "C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe");

/** Instala o Docker Desktop pelo WinGet. Baixa centenas de MB e pode pedir autorização do Windows. */
export async function installDocker(): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== "win32") return { ok: false, error: "Instale o Docker pelo gerenciador de pacotes do sistema e tente novamente." };
  const winget = wingetPath();
  if (!winget) return { ok: false, error: "O WinGet não está disponível. Instale o Docker Desktop pelo site docker.com ou pelo Instalador de Aplicativo do Windows." };
  return new Promise(resolve => execFile(winget, ["install", "--id", "Docker.DockerDesktop", "--exact", "--source", "winget", "--silent", "--no-upgrade", "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"], { windowsHide: true, timeout: 30 * 60_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
    readPathNow();
    if (!error || existsSync(DOCKER_DESKTOP)) return resolve({ ok: true });
    resolve({ ok: false, error: (String(stderr).trim() || String(stdout).trim() || error.message).slice(-1000) });
  }));
}

export interface IsolatedLaunch extends ShellLaunch { cwd: string; env: Record<string, string>; close(): void }
export function profileVolume(account: string, agent: string): string {
  if (agent === "agy") agent = "antigravity";
  return `zenite-profile-${createHash("sha256").update(JSON.stringify([agent, account])).digest("hex").slice(0, 32)}`;
}
/** Área de troca da galáxia: todos os terminais isolados dela veem /exchange, sem tocar nos perfis de login. */
export function exchangeVolume(galaxy: string): string {
  return `zenite-exchange-${createHash("sha256").update(galaxy).digest("hex").slice(0, 32)}`;
}
export function containerArgs(options: { name: string; profile: string; image: string; cli: string; token: string; terminalId: string; endpoint: string; command: string; providerEnv?: Record<string, string>; limits?: IsolatedLimits; exchange?: string }): string[] {
  if (!/^zenite-terminal-[a-f0-9]{24}$/.test(options.name) || !/^zenite-profile-[a-f0-9]{32}$/.test(options.profile) || options.exchange && !/^zenite-exchange-[a-f0-9]{32}$/.test(options.exchange)) throw new Error("Identificador de isolamento inválido.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,200}$/.test(options.image)) throw new Error("Imagem do ambiente inválida.");
  const memoryGb = Math.min(64, Math.max(1, Math.round(Number(options.limits?.memoryGb) || DEFAULT_LIMITS.memoryGb)));
  const cpus = Math.min(32, Math.max(1, Math.round(Number(options.limits?.cpus) || DEFAULT_LIMITS.cpus)));
  const args = ["run", "--rm", "--interactive", "--tty", "--name", options.name,
    "--label", "app.zenite.isolated=1", "--user", "1000:1000", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
    // Chromium e FFmpeg abrem muitas threads (contam como pids) e usam /dev/shm; render gera milhares de PNGs em /tmp.
    "--pids-limit=4096", `--memory=${memoryGb}g`, `--cpus=${cpus}`, "--shm-size=1g", "--init", "--workdir=/workspace",
    "--tmpfs", "/tmp:rw,nosuid,nodev,size=2g,mode=1777", "--tmpfs", "/workspace:rw,nosuid,nodev,size=512m,uid=1000,gid=1000,mode=700",
    "--mount", `type=volume,source=${options.profile},target=/home/agent`,
    ...(options.exchange ? ["--mount", `type=volume,source=${options.exchange},target=/exchange`] : []),
    "--mount", `type=bind,source=${options.cli},target=/opt/zenite/cli.cjs,readonly`,
    "--env", "HOME=/home/agent", "--env", "CODEX_HOME=/home/agent/.codex", "--env", "CLAUDE_CONFIG_DIR=/home/agent/.claude",
    "--env", `O_PIPE=${options.endpoint}`, "--env", `O_TERMINAL_ID=${options.terminalId}`, "--env", `O_TOKEN=${options.token}`,
    "--env", "O_ISOLATED=1", "--env", "SSH_CONNECTION=127.0.0.1 0 127.0.0.1 0"];
  // Somente credenciais explicitamente selecionadas do provedor; nunca herda o ambiente do host.
  for (const [key, value] of Object.entries(options.providerEnv ?? {})) {
    if (!["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL"].includes(key)) continue;
    if (/[\0\r\n]/.test(value)) throw new Error("Variável do provedor inválida.");
    args.push("--env", `${key}=${value}`);
  }
  args.push(options.image, "bash", "-lc", options.command ? `${options.command}\nexec bash -i` : "exec bash -i");
  return args;
}

/** Não monta projeto, disco, pasta de contas do host nem socket do Docker. */
export class IsolatedRuntime {
  private building: Promise<{ ok: boolean; error?: string }> | null = null;
  private active = new Map<string, string>();
  /** Perfis de contas removidas que ainda estavam em uso: apagados quando o terminal fecha. */
  private pendingFile: string;
  constructor(private dataDir: string, private cli: string, private endpoint: () => string, private limits: () => IsolatedLimits = () => ({})) {
    this.pendingFile = join(dataDir, "isolated-runtime", "perfis-a-remover.json");
    this.retryRemovals();
  }

  async status(): Promise<{ available: boolean; prepared: boolean; installed: boolean; error?: string }> {
    let missing = false;
    const call = (args: string[]) => new Promise<string>((resolve, reject) => execFile("docker", args, { windowsHide: true, timeout: 5000 }, (error, stdout, stderr) => {
      if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") missing = true;
      return error ? reject(new Error(String(stderr).trim() || error.message)) : resolve(String(stdout).trim());
    }));
    try {
      if (await call(["info", "--format", "{{.OSType}}"]) !== "linux") throw new Error("O ambiente precisa do Docker com contêineres Linux.");
      try { await call(["image", "inspect", AGENT_IMAGE]); return { available: true, prepared: true, installed: true }; }
      catch { return { available: true, prepared: false, installed: true }; }
    } catch (error) {
      // Sem o comando docker no PATH e sem o Docker Desktop na pasta padrão: não está instalado (não só fechado).
      const installed = !missing || existsSync(DOCKER_DESKTOP);
      return { available: false, prepared: false, installed, error: installed ? (error as Error).message : "O Docker não está instalado neste computador." };
    }
  }

  prepare(progress?: (line: string) => void): Promise<{ ok: boolean; error?: string }> {
    if (this.building) return this.building;
    const folder = join(this.dataDir, "isolated-runtime"); mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "Dockerfile"), `FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git python3 python3-pip python3-venv curl ca-certificates bash procps xz-utils ffmpeg chromium fonts-liberation && rm -rf /var/lib/apt/lists/*
RUN npm install -g @openai/codex@0.163.0 @anthropic-ai/claude-code
RUN curl -fsSL https://antigravity.google/cli/install.sh -o /tmp/install-agy.sh && bash /tmp/install-agy.sh && install -m 755 /root/.local/bin/agy /usr/local/bin/agy && rm /tmp/install-agy.sh
RUN mkdir -p /opt/zenite /workspace /exchange /home/agent/.codex /home/agent/.claude /home/agent/.gemini && chown -R 1000:1000 /home/agent /workspace /exchange
RUN printf '#!/bin/sh\\nexec node /opt/zenite/cli.cjs "$@"\\n' > /usr/local/bin/zn && chmod 755 /usr/local/bin/zn && ln -s /usr/local/bin/zn /usr/local/bin/o
COPY guide.md /opt/zenite/guide.md
COPY setup.cjs /opt/zenite/setup.cjs
ENV HOME=/home/agent
USER 1000:1000
WORKDIR /workspace
CMD ["bash", "-i"]
`, "utf8");
    writeFileSync(join(folder, "guide.md"), ISOLATED_GUIDE, "utf8");
    writeFileSync(join(folder, "setup.cjs"), String.raw`const fs = require('node:fs'), path = require('node:path');
const guide = fs.readFileSync('/opt/zenite/guide.md', 'utf8');
const start = '<!-- zenite:isolated:start -->', end = '<!-- zenite:isolated:end -->';
for (const name of ['.codex/AGENTS.md', '.claude/CLAUDE.md', '.gemini/GEMINI.md']) {
  const file = path.join('/home/agent', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const a = current.indexOf(start), b = current.indexOf(end, a);
  const block = start + '\n' + guide + '\n' + end;
  current = a >= 0 && b > a ? current.slice(0, a) + block + current.slice(b + end.length) : current + '\n' + block + '\n';
  fs.writeFileSync(file, current);
}
const config = '/home/agent/.codex/config.toml';
const currentConfig = fs.existsSync(config) ? fs.readFileSync(config, 'utf8') : '';
if (!/^\s*cli_auth_credentials_store\s*=/m.test(currentConfig)) fs.writeFileSync(config, 'cli_auth_credentials_store = "file"\n' + currentConfig);
`, "utf8");
    // Persistência das instruções na imagem: não copia nenhum login do computador.
    this.building = new Promise(resolve => {
      const child = spawn("docker", ["build", "--tag", AGENT_IMAGE, folder], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let tail = "", finished = false;
      const finish = (result: { ok: boolean; error?: string }) => { if (!finished) { finished = true; clearTimeout(timer); resolve(result); } };
      const timer = setTimeout(() => { child.kill(); finish({ ok: false, error: "A preparação excedeu 20 minutos. Confira o Docker e tente novamente." }); }, 20 * 60_000);
      const output = (chunk: Buffer) => { tail = (tail + chunk.toString()).slice(-6000); progress?.(chunk.toString()); };
      child.stdout.on("data", output); child.stderr.on("data", output);
      child.once("error", error => finish({ ok: false, error: error.message }));
      child.once("close", code => finish(code === 0 ? { ok: true } : { ok: false, error: tail }));
    });
    return this.building.finally(() => { this.building = null; });
  }

  launch(req: CreatePtyRequest, token: string, providerEnv?: Record<string, string>, galaxy?: string): IsolatedLaunch {
    // Falha fechada. Nunca troca por um terminal nativo quando Docker/imagem não existem.
    try { execFileSync("docker", ["image", "inspect", AGENT_IMAGE], { windowsHide: true, timeout: 4000, stdio: "ignore" }); }
    catch { throw new Error("Prepare o ambiente isolado em Configurações → Agentes. O terminal não foi aberto fora da proteção."); }
    const name = `zenite-terminal-${randomBytes(12).toString("hex")}`;
    const program = (req.command.trim().split(/\s+/)[0] || "shell").replace(/.*[\\/]/, "").replace(/\.(cmd|exe)$/i, "");
    const profile = profileVolume(req.account || "default", req.provider || program);
    const setup = "node /opt/zenite/setup.cjs && ";
    // O Codex dentro do contêiner não pode usar o servidor de fundo compartilhado (--no-daemon).
    // Só a TUI aceita a opção: subcomandos (exec, login...) ficam como estão.
    const parts = req.command.trim().split(/s+/);
    const noDaemon = program === "codex" && !/^[a-z]/i.test(parts[1] ?? "") && !parts.includes("--no-daemon");
    // Sem login salvo no perfil, entra pelo código no navegador (device-auth): o login normal volta
    // para 127.0.0.1:1455, porta que o navegador do Windows não alcança dentro do contêiner.
    // Com provedor próprio (providerEnv) não há conta para entrar.
    const login = noDaemon && !Object.keys(providerEnv ?? {}).length ? 'test -s "$CODEX_HOME/auth.json" || codex login --device-auth; ' : "";
    const command = setup + (noDaemon ? login + [parts[0], "--no-daemon", ...parts.slice(1)].join(" ") : req.command.trim());
    const args = containerArgs({ name, profile, image: AGENT_IMAGE, cli: this.cli, token, terminalId: req.id, endpoint: this.endpoint(), command, providerEnv, limits: this.limits(), ...(galaxy ? { exchange: exchangeVolume(galaxy) } : {}) });
    this.active.set(req.id, name);
    return { file: "docker", args, cwd: this.dataDir, env: {}, close: () => this.stop(req.id, name) };
  }
  async headless(options: { id: string; agent: string; account?: string; prompt: string; token: string; command: string; signal?: AbortSignal }): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
    let launch: IsolatedLaunch;
    try { launch = this.launch({ id: options.id, command: options.command, account: options.account, cwd: "", cols: 100, rows: 30 }, options.token); }
    catch (e) { return { ok: false, error: (e as Error).message }; }
    const args = launch.args.filter(a => a !== "--tty");
    // Remove o shell interativo que manteria o job vivo depois de terminar a resposta.
    args[args.length - 1] = args[args.length - 1].replace(/\nexec bash -i$/, "");
    return new Promise(resolve => {
      const child = spawn(launch.file, args, { cwd: launch.cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      let text = "", errorText = "", done = false;
      const finish = (result: { ok: true; text: string } | { ok: false; error: string }) => { if (done) return; done = true; clearTimeout(timer); options.signal?.removeEventListener("abort", stop); launch.close(); resolve(result); };
      const stop = () => { child.kill(); finish({ ok: false, error: "Agente isolado interrompido." }); };
      const timer = setTimeout(stop, 10 * 60_000);
      options.signal?.addEventListener("abort", stop, { once: true });
      child.stdout.on("data", chunk => { text += chunk.toString(); if (text.length > 1_000_000) { child.kill(); finish({ ok: false, error: "Resposta maior que 1 MB." }); } });
      child.stderr.on("data", chunk => { errorText = (errorText + chunk.toString()).slice(-2000); });
      child.once("error", e => finish({ ok: false, error: e.message }));
      child.once("close", code => finish(code === 0 ? { ok: true, text: text.trim() } : { ok: false, error: errorText || `Agente encerrou com código ${code}.` }));
      child.stdin.on("error", () => {});
      child.stdin.end(options.prompt);
      if (options.signal?.aborted) stop();
    });
  }
  private stop(id: string, expected: string): void {
    if (this.active.get(id) === expected) this.active.delete(id);
    execFile("docker", ["rm", "--force", expected], { windowsHide: true, timeout: 10000 }, () => this.retryRemovals());
  }
  close(id: string): void { const name = this.active.get(id); if (name) this.stop(id, name); }
  has(id: string): boolean { return this.active.has(id); }
  /** Copia um arquivo do computador para /exchange/anexos do contêiner do terminal e devolve o caminho lá dentro. */
  async copyIn(id: string, file: string): Promise<string> {
    const name = this.active.get(id);
    if (!name) throw new Error("O terminal isolado não está rodando.");
    const target = `/exchange/anexos/${basename(file)}`;
    const run = (args: string[]) => new Promise<void>((resolve, reject) => execFile("docker", args, { windowsHide: true, timeout: 60000 }, (error, _out, stderr) => error ? reject(new Error(String(stderr).trim() || error.message)) : resolve()));
    await run(["exec", "--user", "1000:1000", name, "mkdir", "-p", "/exchange/anexos"]);
    await run(["cp", file, `${name}:${target}`]);
    return target;
  }
  closeAll(): void { for (const id of [...this.active.keys()]) this.close(id); }
  async loginStatus(account: string, agent: string): Promise<boolean> {
    const volume = profileVolume(account, agent);
    const file = agent === "codex" ? ".codex/auth.json" : agent === "claude" ? ".claude/.credentials.json" : ".gemini/antigravity-cli/antigravity-oauth-token";
    const run = (args: string[]) => new Promise<boolean>(resolve => execFile("docker", args, { windowsHide: true, timeout: 5000 }, error => resolve(!error)));
    // Inspecionar antes evita criar volumes para contas que nunca foram abertas no isolamento.
    if (!await run(["volume", "inspect", volume])) return false;
    return run(["run", "--rm", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=1000:1000", "--mount", `type=volume,source=${volume},target=/home/agent,readonly`, AGENT_IMAGE, "test", "-s", `/home/agent/${file}`]);
  }
  /** Apaga o perfil da conta; se um terminal ainda o usa, fica para quando ele fechar. */
  async removeProfile(account: string, agent: string): Promise<void> {
    const volume = profileVolume(account, agent);
    if (!await this.docker(["volume", "inspect", volume])) return;
    if (!await this.docker(["volume", "rm", volume])) this.savePending([...new Set([...this.pending(), volume])]);
  }
  private docker(args: string[]): Promise<boolean> {
    return new Promise(resolve => execFile("docker", args, { windowsHide: true, timeout: 5000 }, error => resolve(!error)));
  }
  private pending(): string[] {
    try { return existsSync(this.pendingFile) ? JSON.parse(readFileSync(this.pendingFile, "utf8")) : []; } catch { return []; }
  }
  private savePending(volumes: string[]): void {
    mkdirSync(join(this.dataDir, "isolated-runtime"), { recursive: true });
    writeFileSync(this.pendingFile, JSON.stringify(volumes), "utf8");
  }
  private async retryRemovals(): Promise<void> {
    const volumes = this.pending();
    if (!volumes.length) return;
    const left: string[] = [];
    for (const volume of volumes) {
      if (await this.docker(["volume", "inspect", volume]) && !await this.docker(["volume", "rm", volume])) left.push(volume);
    }
    this.savePending(left);
  }
}
