import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Backups do que só existe no app: galáxias e canvases (workspaces/), notas e tabelas.
 * Arquivos de mídia, cópias dos universos e logins das contas ficam de fora: são grandes,
 * ou já estão no git, ou são segredos.
 */
const PARTS = ["workspaces", "notes", "tables"];
const KEEP = 30;

export interface BackupInfo {
  id: string;
  created: number;
  reason: string;
  bytes: number;
  canvases: number;
}

export class BackupService {
  readonly dir: string;

  constructor(private dataDir: string) {
    this.dir = join(dataDir, "backups");
    mkdirSync(this.dir, { recursive: true });
  }

  /** Cria um backup agora. `now` existe para os testes. */
  create(reason: string, now = Date.now()): BackupInfo {
    let id = stamp(now);
    for (let n = 2; existsSync(join(this.dir, id)); n++) id = `${stamp(now)}-${n}`;
    const dest = join(this.dir, id);
    mkdirSync(dest, { recursive: true });
    for (const part of PARTS) {
      const src = join(this.dataDir, part);
      if (existsSync(src)) cpSync(src, join(dest, part), { recursive: true });
    }
    const canvases = existsSync(join(dest, "workspaces")) ? readdirSync(join(dest, "workspaces")).filter((f) => f.endsWith(".json") && f !== "index.json").length : 0;
    writeFileSync(join(dest, "backup.json"), JSON.stringify({ created: now, reason, canvases }), "utf8");
    this.prune();
    return { id, created: now, reason, bytes: dirSize(dest), canvases };
  }

  list(): BackupInfo[] {
    return readdirSync(this.dir)
      .filter((id) => existsSync(join(this.dir, id, "backup.json")))
      .map((id) => {
        const meta = JSON.parse(readFileSync(join(this.dir, id, "backup.json"), "utf8")) as { created: number; reason: string; canvases: number };
        return { id, ...meta, bytes: dirSize(join(this.dir, id)) };
      })
      .sort((a, b) => b.created - a.created);
  }

  /** Último backup, para saber se já é hora de outro. */
  latest(): BackupInfo | undefined {
    return this.list()[0];
  }

  /**
   * Volta os dados ao estado do backup. Antes, guarda o estado atual (dá para desfazer).
   * Quem chama precisa recarregar a interface sem deixar ela salvar por cima.
   */
  restore(id: string): { ok: true; safety: BackupInfo } | { ok: false; error: string } {
    const src = join(this.dir, id);
    if (!/^[\w-]+$/.test(id) || !existsSync(join(src, "backup.json"))) return { ok: false, error: "Backup não encontrado." };
    const safety = this.create("Antes de restaurar um backup");
    for (const part of PARTS) {
      const target = join(this.dataDir, part);
      rmSync(target, { recursive: true, force: true });
      if (existsSync(join(src, part))) cpSync(join(src, part), target, { recursive: true });
      else mkdirSync(target, { recursive: true });
    }
    return { ok: true, safety };
  }

  remove(id: string): void {
    if (/^[\w-]+$/.test(id)) rmSync(join(this.dir, id), { recursive: true, force: true });
  }

  private prune(): void {
    for (const old of this.list().slice(KEEP)) this.remove(old.id);
  }
}

function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Tamanho de uma pasta (soma dos arquivos). */
export function dirSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      const p = join(cur, name);
      try {
        const st = statSync(p);
        if (st.isDirectory()) stack.push(p);
        else total += st.size;
      } catch {
        // Arquivo em uso ou removido no meio da contagem.
      }
    }
  }
  return total;
}
