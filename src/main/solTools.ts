import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Papéis salvos: o texto com que um terminal recrutado pelo Sol começa ("você é o revisor...").
 * Um arquivo .md por papel, na pasta de dados do app; o nome do arquivo é o nome do papel.
 */
export class RoleStore {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private file(name: string): string {
    const safe = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim();
    if (!safe) throw new Error("Dê um nome ao papel.");
    return join(this.dir, `${safe}.md`);
  }

  list(): { name: string; preview: string; modified: number }[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const path = join(this.dir, f);
        const text = readFileSync(path, "utf8");
        return { name: f.slice(0, -3), preview: text.replace(/\s+/g, " ").trim().slice(0, 80), modified: statSync(path).mtimeMs };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  /** Acha sem diferenciar maiúsculas. */
  read(name: string): { name: string; text: string } | null {
    const hit = this.list().find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    return hit ? { name: hit.name, text: readFileSync(join(this.dir, `${hit.name}.md`), "utf8") } : null;
  }

  save(name: string, text: string): string {
    if (!text.trim()) throw new Error("O papel está vazio.");
    const old = this.read(name);
    if (old) rmSync(join(this.dir, `${old.name}.md`), { force: true });
    const path = this.file(name);
    writeFileSync(path, text, "utf8");
    return path;
  }

  remove(name: string): boolean {
    const old = this.read(name);
    if (!old) return false;
    rmSync(join(this.dir, `${old.name}.md`), { force: true });
    return true;
  }
}

export interface SolLogEntry {
  at: number;
  by: string;
  what: string[];
}

/** Registro do que o Sol mudou em cada canvas (zn canvas log), uma linha JSON por lote. */
export class SolLog {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private file(canvasId: string): string {
    return join(this.dir, `${canvasId.replace(/[^\w-]+/g, "_")}.jsonl`);
  }

  append(canvasId: string, entry: SolLogEntry): void {
    appendFileSync(this.file(canvasId), `${JSON.stringify(entry)}\n`, "utf8");
  }

  /** Os últimos `limit` lotes, do mais antigo para o mais novo. */
  read(canvasId: string, limit = 30): SolLogEntry[] {
    const file = this.file(canvasId);
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as SolLogEntry];
        } catch {
          return [];
        }
      });
  }
}
