import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Skills para todos os agentes.
 *
 * O Zênite guarda uma biblioteca (pasta do app) e copia cada skill para onde cada agente
 * procura:
 *   - Claude Code: ~/.claude/skills e a pasta de cada conta (CLAUDE_CONFIG_DIR/skills);
 *   - Codex, Gemini e outros que seguem o padrão Agent Skills: ~/.agents/skills
 *     (fica fora da pasta das contas, então vale para todas).
 * Copia em vez de criar atalhos: no Windows, links simbólicos pedem permissão de admin.
 * Cada cópia leva um arquivo-marca; o Zênite só atualiza ou apaga o que tem a marca dele,
 * nunca uma skill que você criou à mão com o mesmo nome.
 */

const MARK = ".zenite-skill";
/** Versões antigas marcavam dentro do SKILL.md (e a skill se chamava o-canvas). */
const LEGACY = ["<!-- gerado pelo Zênite -->", "<!-- gerado pelo app O -->"];

function owned(dir: string): boolean {
  if (existsSync(join(dir, MARK))) return true;
  try {
    const text = readFileSync(join(dir, "SKILL.md"), "utf8");
    return LEGACY.some((m) => text.includes(m));
  } catch {
    return false;
  }
}

export interface SkillInfo {
  name: string;
  description: string;
  /** Pasta da skill na biblioteca (ou de onde ela foi encontrada). */
  dir: string;
  /** A skill do próprio Zênite (gerada pelo app, não pode ser removida). */
  builtin?: boolean;
}

export interface SkillTarget {
  /** Nome mostrado: "Claude Code", "Claude · conta Trabalho", "Codex, Gemini e outros". */
  label: string;
  root: string;
}

export interface SyncResult {
  target: SkillTarget;
  installed: string[];
  /** Já existe uma skill com o mesmo nome que não é do Zênite: fica como está. */
  conflicts: string[];
}

/** Skill gerada pelo app (texto fixo). */
export interface BuiltinSkill {
  name: string;
  content: string;
}

/** Lê nome e descrição do cabeçalho do SKILL.md. */
export function readSkill(dir: string): SkillInfo | null {
  const file = join(dir, "SKILL.md");
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const field = (k: string) => new RegExp(`^${k}:\\s*(.+)$`, "m").exec(front)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  return { name: safeSkillName(field("name") || basename(dir)), description: field("description"), dir };
}

export function safeSkillName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "skill"
  );
}

export class SkillLibrary {
  constructor(
    private root: string,
    private targets: () => SkillTarget[],
    private builtins: () => BuiltinSkill[],
  ) {
    mkdirSync(root, { recursive: true });
  }

  /** Skills da biblioteca, a do Zênite primeiro. */
  list(): SkillInfo[] {
    const own = this.builtins().map((b) => ({ ...(parseContent(b.name, b.content) as SkillInfo), dir: "", builtin: true }));
    const lib = readdirSync(this.root)
      .map((n) => join(this.root, n))
      .filter((d) => statSync(d).isDirectory())
      .map(readSkill)
      .filter((s): s is SkillInfo => !!s)
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...own, ...lib];
  }

  /** Copia uma pasta com SKILL.md para a biblioteca. */
  add(sourceDir: string): { ok: true; skill: SkillInfo } | { ok: false; error: string } {
    const found = readSkill(sourceDir);
    if (!found) return { ok: false, error: "A pasta não tem um arquivo SKILL.md." };
    if (this.builtins().some((b) => b.name === found.name)) return { ok: false, error: `"${found.name}" é o nome da skill do próprio Zênite.` };
    const dest = join(this.root, found.name);
    rmSync(dest, { recursive: true, force: true });
    cpSync(sourceDir, dest, { recursive: true, filter: (src) => basename(src) !== MARK && basename(src) !== ".git" });
    return { ok: true, skill: readSkill(dest)! };
  }

  remove(name: string): void {
    const dest = join(this.root, safeSkillName(name));
    if (dest.startsWith(this.root) && dest !== this.root) rmSync(dest, { recursive: true, force: true });
  }

  /** Coloca cada skill em cada destino e tira de lá as que saíram da biblioteca. */
  sync(): SyncResult[] {
    const skills = this.list();
    const wanted = new Set(skills.map((s) => s.name));
    return this.targets().map((target) => {
      const result: SyncResult = { target, installed: [], conflicts: [] };
      mkdirSync(target.root, { recursive: true });
      for (const skill of skills) {
        const dest = join(target.root, skill.name);
        if (existsSync(dest) && !owned(dest)) {
          // A sua original, igual à da biblioteca (ex.: a que você compartilhou): já está lá.
          if (!skill.builtin && sameSkill(dest, skill.dir)) result.installed.push(skill.name);
          else result.conflicts.push(skill.name);
          continue;
        }
        rmSync(dest, { recursive: true, force: true });
        if (skill.builtin) {
          mkdirSync(dest, { recursive: true });
          writeFileSync(join(dest, "SKILL.md"), this.builtins().find((b) => b.name === skill.name)!.content, "utf8");
        } else cpSync(skill.dir, dest, { recursive: true });
        writeFileSync(join(dest, MARK), "Copiada pelo Zênite. Edite na biblioteca do app: mudanças feitas aqui são substituídas.\n", "utf8");
        result.installed.push(skill.name);
      }
      // Removidas da biblioteca: só apaga cópias que têm a marca do Zênite.
      for (const name of readdirSync(target.root)) {
        const dir = join(target.root, name);
        if (!wanted.has(name) && owned(dir)) rmSync(dir, { recursive: true, force: true });
      }
      return result;
    });
  }

  /** Skills que já existem nos agentes e ainda não estão na biblioteca (para compartilhar). */
  discover(): (SkillInfo & { source: string })[] {
    const inLib = new Set(this.list().map((s) => s.name));
    const out: (SkillInfo & { source: string })[] = [];
    const seen = new Set<string>();
    for (const t of this.targets()) {
      if (!existsSync(t.root)) continue;
      for (const name of readdirSync(t.root)) {
        const dir = join(t.root, name);
        if (!statSync(dir).isDirectory() || owned(dir)) continue;
        const s = readSkill(dir);
        if (!s || inLib.has(s.name) || seen.has(s.name)) continue;
        seen.add(s.name);
        out.push({ ...s, source: t.label });
      }
    }
    return out;
  }

  /** Índice para agentes sem suporte a skills: nome, descrição e onde ler. */
  index(): string {
    const lines = this.list()
      .filter((s) => !s.builtin)
      .map((s) => `- **${s.name}**: ${s.description || "sem descrição"} → leia \`${join(this.root, s.name, "SKILL.md")}\``);
    return lines.length ? lines.join("\n") : "";
  }
}

function sameSkill(a: string, b: string): boolean {
  try {
    return readFileSync(join(a, "SKILL.md"), "utf8") === readFileSync(join(b, "SKILL.md"), "utf8");
  } catch {
    return false;
  }
}

function parseContent(name: string, content: string): Omit<SkillInfo, "dir"> {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] ?? "";
  const description = /^description:\s*(.+)$/m.exec(front)?.[1]?.trim() ?? "";
  return { name, description };
}
