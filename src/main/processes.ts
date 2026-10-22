import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface ProcInfo {
  pid: number;
  ppid: number;
  name: string;
  /** Memória residente em bytes. */
  rss: number;
}

function run(file: string, args: string[], timeout = 10_000): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => resolve(err ? "" : stdout.toString()));
  });
}

// WorkingSetSize vem em bytes. Uma linha por processo, separada por tabulação.
const WIN_QUERY =
  "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,Name | ForEach-Object { \"$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.WorkingSetSize)`t$($_.Name)\" }";
const END = "<<zenite-fim>>";

function parseWin(out: string): ProcInfo[] {
  return out
    .split(/\r?\n/)
    .map((l) => l.split("\t"))
    .filter((p) => p.length >= 4)
    .map(([pid, ppid, rss, ...name]) => ({ pid: Number(pid), ppid: Number(ppid), rss: Number(rss) || 0, name: name.join("\t").trim() }))
    .filter((p) => p.pid > 0);
}

/**
 * Um PowerShell que fica aberto e responde a cada pedido. Abrir um PowerShell novo a cada
 * medição custava ~0,6 s e ~0,4 s de CPU por vez (a cada 4 s), o que dava engasgos no app.
 */
class WinSampler {
  private ps: ChildProcessWithoutNullStreams | null = null;
  private buf = "";
  private waiting: ((out: string | null) => void) | null = null;

  private start(): ChildProcessWithoutNullStreams {
    const ps = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"], { windowsHide: true });
    ps.stdout.setEncoding("utf8");
    ps.stdout.on("data", (chunk: string) => {
      this.buf += chunk;
      const i = this.buf.indexOf(END);
      if (i < 0) return;
      const out = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + END.length);
      this.finish(out);
    });
    ps.stderr.resume();
    const gone = () => {
      if (this.ps === ps) this.ps = null;
      this.finish(null);
    };
    ps.on("exit", gone);
    ps.on("error", gone);
    return ps;
  }

  private finish(out: string | null): void {
    const w = this.waiting;
    this.waiting = null;
    w?.(out);
  }

  private queue: Promise<unknown> = Promise.resolve();

  /** Pedidos ao mesmo tempo (medição periódica e "Encerrar") esperam a vez. */
  sample(timeout = 10_000): Promise<string | null> {
    const next = this.queue.then(() => this.once(timeout));
    this.queue = next;
    return next;
  }

  private once(timeout: number): Promise<string | null> {
    if (!this.ps) this.ps = this.start();
    const ps = this.ps;
    this.buf = "";
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // Travou: descarta este PowerShell; o próximo pedido abre outro.
        this.waiting = null;
        this.stop();
        resolve(null);
      }, timeout);
      this.waiting = (out) => {
        clearTimeout(timer);
        resolve(out);
      };
      ps.stdin.write(`${WIN_QUERY}; '${END}'\n`);
    });
  }

  stop(): void {
    const ps = this.ps;
    this.ps = null;
    if (ps && !ps.killed) ps.kill();
  }
}

let winSampler: WinSampler | null = null;

/** Encerra o PowerShell de medição (ao fechar o app). */
export function stopSampler(): void {
  winSampler?.stop();
  winSampler = null;
}

/** Todos os processos do sistema com pai, nome e memória. Vazio se não conseguir ler. */
export async function sampleProcesses(platform: NodeJS.Platform = process.platform): Promise<ProcInfo[]> {
  if (platform === "win32") {
    winSampler ??= new WinSampler();
    const out = await winSampler.sample();
    return out === null ? [] : parseWin(out);
  }
  // rss em KB; comm pode ter espaços, então vem por último.
  const out = await run("ps", ["-A", "-o", "pid=,ppid=,rss=,comm="]);
  return out
    .split("\n")
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]) * 1024, name: m[4].split("/").pop() ?? m[4] }));
}

/** O processo raiz e todos os descendentes, com a memória somada. */
export function processTree(all: ProcInfo[], rootPid: number): { total: number; processes: ProcInfo[] } {
  const children = new Map<number, ProcInfo[]>();
  for (const p of all) {
    if (p.pid === p.ppid) continue;
    const list = children.get(p.ppid) ?? [];
    list.push(p);
    children.set(p.ppid, list);
  }
  const root = all.find((p) => p.pid === rootPid);
  if (!root) return { total: 0, processes: [] };
  const out: ProcInfo[] = [];
  const seen = new Set<number>();
  const queue = [root];
  while (queue.length) {
    const p = queue.shift()!;
    if (seen.has(p.pid)) continue;
    seen.add(p.pid);
    out.push(p);
    queue.push(...(children.get(p.pid) ?? []));
  }
  return { total: out.reduce((s, p) => s + p.rss, 0), processes: out };
}

/** Encerra o processo e os filhos dele. */
export async function killTree(pid: number, descendants: number[], platform: NodeJS.Platform = process.platform): Promise<void> {
  if (platform === "win32") {
    await run("taskkill", ["/PID", String(pid), "/T", "/F"]);
    return;
  }
  // Filhos primeiro, para não virarem órfãos adotados por outro processo.
  for (const p of [...descendants].reverse()) {
    try {
      process.kill(p, "SIGKILL");
    } catch {
      // Já tinha saído.
    }
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  await new Promise((r) => setTimeout(r, 1500));
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Saiu com o SIGTERM.
  }
}
