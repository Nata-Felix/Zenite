import { execFile, spawnSync } from "node:child_process";

/**
 * Encerrar só o que é do Zênite. Codex, Claude e outros CLIs abertos por fora (no Windows Terminal,
 * no app do Codex...) não são tocados. São do Zênite:
 *  - a árvore de processos de cada terminal (shell + o que rodou nele);
 *  - o processo de fundo do Codex (app-server daemon) das contas do Zênite. Ele se solta do terminal
 *    e continuaria vivo, guardando o endereço e a senha antigos do Zênite. Ele roda de dentro da
 *    pasta da conta, ~/.zenite/<8 primeiros do id>, e é por ela que é reconhecido. O Codex de fora
 *    usa ~/.codex e fica de fora.
 */
const ACCOUNT_DIR = /[\\/]\.zenite[\\/]([0-9a-f]{8})[\\/]/i;

/** Linha de comando "pid<TAB>comando" → processos do Codex que vivem numa pasta de conta do Zênite. */
export function parseZeniteCodex(output: string): { pid: number; account: string }[] {
  return output
    .split(/\r?\n/)
    .map((line) => {
      const tab = line.indexOf("\t");
      const pid = Number(line.slice(0, tab));
      const account = ACCOUNT_DIR.exec(line.slice(tab + 1))?.[1]?.toLowerCase();
      return tab > 0 && Number.isInteger(pid) && pid > 0 && account ? { pid, account } : null;
    })
    .filter((p): p is { pid: number; account: string } => p !== null);
}

const LIST_WIN = ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process -Filter \"Name like 'codex%'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"];

function fromListing(stdout: string, platform: NodeJS.Platform): { pid: number; account: string }[] {
  // No ps vem "  123 /caminho/codex ..."; o PowerShell já filtrou pelo nome e separou com tab.
  const out = platform === "win32" ? stdout : stdout.split("\n").filter((l) => /codex/i.test(l)).map((l) => l.replace(/^\s*(\d+)\s+/, "$1\t")).join("\n");
  return parseZeniteCodex(out);
}

/** Processos do Codex rodando com uma pasta de conta do Zênite. Síncrono (leva ~1 s no Windows). */
export function zeniteCodexProcesses(platform: NodeJS.Platform = process.platform): { pid: number; account: string }[] {
  const r =
    platform === "win32"
      ? spawnSync("powershell.exe", LIST_WIN, { encoding: "utf8", windowsHide: true, timeout: 15_000 })
      : spawnSync("ps", ["-A", "-o", "pid=,args="], { encoding: "utf8", timeout: 15_000 });
  return r.status === 0 && r.stdout ? fromListing(r.stdout, platform) : [];
}

/** O mesmo, sem travar o app: para Reload e fechar terminal. */
export function zeniteCodexProcessesAsync(platform: NodeJS.Platform = process.platform): Promise<{ pid: number; account: string }[]> {
  const [file, args] = platform === "win32" ? ["powershell.exe", LIST_WIN] : ["ps", ["-A", "-o", "pid=,args="]];
  return new Promise((resolve) =>
    execFile(file, args, { encoding: "utf8", windowsHide: true, timeout: 15_000 }, (err, stdout) => resolve(err ? [] : fromListing(stdout, platform))),
  );
}
/** Encerra os processos e tudo que eles abriram. Síncrono: serve também ao fechar o app. */
export function killTrees(pids: number[], platform: NodeJS.Platform = process.platform): void {
  if (!pids.length) return;
  if (platform === "win32") {
    spawnSync("taskkill", [...pids.flatMap((p) => ["/PID", String(p)]), "/T", "/F"], { windowsHide: true, timeout: 15_000 });
    return;
  }
  for (const pid of pids) {
    try {
      process.kill(-pid, "SIGKILL"); // grupo do processo (o PTY cria um grupo por terminal)
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Já tinha saído.
      }
    }
  }
}

/** Processo de fundo do Codex de todas as contas do Zênite (ao abrir e ao fechar o app). */
export function killZeniteCodex(): number {
  const pids = zeniteCodexProcesses().map((p) => p.pid);
  killTrees(pids);
  return pids.length;
}

/** Processo de fundo do Codex das contas dadas (ids), sem travar o app. */
export async function killZeniteCodexOf(accountIds: string[]): Promise<number> {
  const wanted = new Set(accountIds.map((a) => a.slice(0, 8).toLowerCase()));
  if (!wanted.size) return 0;
  const pids = (await zeniteCodexProcessesAsync()).filter((p) => wanted.has(p.account)).map((p) => p.pid);
  killTrees(pids);
  return pids.length;
}
