import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EnvInfo } from "../shared/types";
import { git } from "./universes";

/**
 * Leitura e escrita de arquivos .env preservando comentários, linhas em branco e a ordem.
 * Formato aceito: CHAVE=valor, "valor com espaços", 'literal', `export CHAVE=...`.
 */

export interface EnvEntry {
  key: string;
  value: string;
}

type Line = { kind: "pair"; key: string; value: string; raw: string } | { kind: "other"; raw: string };

const PAIR = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/;
export const VALID_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseLines(text: string): Line[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  if (raw.length && raw[raw.length - 1] === "") raw.pop();
  const lines: Line[] = [];
  for (let i = 0; i < raw.length; i++) {
    const m = PAIR.exec(raw[i]);
    if (!m) {
      lines.push({ kind: "other", raw: raw[i] });
      continue;
    }
    let rest = m[2];
    let block = raw[i];
    // Valor entre aspas duplas pode continuar nas linhas seguintes.
    if (rest.startsWith('"') && !closesQuote(rest.slice(1))) {
      while (i + 1 < raw.length) {
        i++;
        rest += `\n${raw[i]}`;
        block += `\n${raw[i]}`;
        if (closesQuote(raw[i])) break;
      }
    }
    lines.push({ kind: "pair", key: m[1], value: unquote(rest), raw: block });
  }
  return lines;
}

function closesQuote(s: string): boolean {
  return /(^|[^\\])"(\s*(#.*)?)?$/.test(s);
}

function unquote(rest: string): string {
  const v = rest.trim();
  if (v.startsWith('"')) {
    const end = v.lastIndexOf('"');
    const inner = end > 0 ? v.slice(1, end) : v.slice(1);
    return inner.replace(/\\(n|r|t|"|\\)/g, (_m, c: string) => ({ n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" })[c] ?? c);
  }
  if (v.startsWith("'")) {
    const end = v.lastIndexOf("'");
    return end > 0 ? v.slice(1, end) : v.slice(1);
  }
  // Comentário no fim da linha só conta com espaço antes do #.
  return v.replace(/\s+#.*$/, "").trim();
}

export function formatValue(value: string): string {
  if (/^[A-Za-z0-9_./:@+,=%-]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
}

/** Pares do arquivo, na ordem; se uma chave aparece duas vezes, vale a última (como no dotenv). */
export function parseEnv(text: string): EnvEntry[] {
  const map = new Map<string, string>();
  for (const l of parseLines(text)) if (l.kind === "pair") map.set(l.key, l.value);
  return [...map].map(([key, value]) => ({ key, value }));
}

/**
 * Aplica `entries` sobre o texto atual: atualiza valores, remove chaves que sumiram,
 * acrescenta as novas no fim e mantém comentários e linhas em branco.
 */
export function serializeEnv(original: string, entries: EnvEntry[]): string {
  const wanted = new Map(entries.map((e) => [e.key, e.value]));
  const written = new Set<string>();
  const out: string[] = [];
  for (const l of parseLines(original)) {
    if (l.kind === "other") {
      out.push(l.raw);
      continue;
    }
    if (!wanted.has(l.key) || written.has(l.key)) continue;
    const value = wanted.get(l.key)!;
    out.push(value === l.value ? l.raw : `${l.key}=${formatValue(value)}`);
    written.add(l.key);
  }
  for (const e of entries) if (!written.has(e.key)) out.push(`${e.key}=${formatValue(e.value)}`);
  return out.length ? `${out.join("\n")}\n` : "";
}

export function validateEntries(entries: EnvEntry[]): string | null {
  const seen = new Set<string>();
  for (const e of entries) {
    if (!VALID_KEY.test(e.key)) return `Chave inválida: "${e.key}". Use letras, números e _ (sem espaços), começando por letra. Ex.: OPENAI_API_KEY`;
    if (seen.has(e.key)) return `A chave "${e.key}" aparece duas vezes.`;
    seen.add(e.key);
  }
  return null;
}

// ---- arquivo .env de uma pasta ----


export async function readEnvInfo(dir: string): Promise<EnvInfo> {
  const file = join(dir, ".env");
  if (!dir || !existsSync(dir)) return { file, exists: false, entries: [], gitignored: null, error: "Defina a pasta do projeto desta galáxia (Editar galáxia) para usar o .env." };
  const exists = existsSync(file);
  const entries = exists ? parseEnv(readFileSync(file, "utf8")) : [];
  const check = await git(["check-ignore", "-q", ".env"], dir);
  const gitignored = check.code === 0 ? true : check.code === 1 ? false : null;
  return { file, exists, entries, gitignored };
}

export async function writeEnv(dir: string, entries: EnvEntry[]): Promise<EnvInfo> {
  const clean = entries.map((e) => ({ key: e.key.trim(), value: e.value })).filter((e) => e.key);
  const error = validateEntries(clean);
  if (error) return { ...(await readEnvInfo(dir)), error };
  const file = join(dir, ".env");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  writeFileSync(`${file}.tmp`, serializeEnv(current, clean), "utf8");
  renameSync(`${file}.tmp`, file);
  return readEnvInfo(dir);
}

/** Acrescenta ".env" ao .gitignore da raiz do repositório. */
export async function ignoreEnv(dir: string): Promise<EnvInfo> {
  const top = await git(["rev-parse", "--show-toplevel"], dir);
  if (top.code !== 0) return readEnvInfo(dir);
  const gitignore = join(top.stdout.trim(), ".gitignore");
  const current = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  appendFileSync(gitignore, `${prefix}# Segredos (adicionado pelo Zênite)\n.env\n`, "utf8");
  return readEnvInfo(dir);
}
