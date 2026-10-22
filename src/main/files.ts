import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { DirEntry, FileInfo } from "../shared/types";

/** Extensões que nunca são texto, mesmo sem byte zero no começo. */
const BINARY_EXT = new Set([".pdf", ".zip", ".7z", ".rar", ".gz", ".exe", ".dll", ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt", ".psd", ".ai", ".fig", ".mp3", ".wav", ".ogg"]);
const PREVIEW_BYTES = 64 * 1024;

export function fileInfo(path: string): FileInfo {
  const ext = extname(path).toLowerCase();
  if (!path || !existsSync(path)) return { exists: false, isDir: false, size: 0, modified: 0, ext };
  const st = statSync(path);
  const info: FileInfo = { exists: true, isDir: st.isDirectory(), size: st.size, modified: st.mtimeMs, ext };
  if (info.isDir || BINARY_EXT.has(ext)) return info;
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(Math.min(PREVIEW_BYTES, st.size));
    const n = readSync(fd, buf, 0, buf.length, 0);
    const head = buf.subarray(0, n);
    // Byte zero nos primeiros 8 KB: binário.
    if (head.subarray(0, 8192).includes(0)) return info;
    info.preview = head.toString("utf8");
    info.truncated = st.size > n;
  } finally {
    closeSync(fd);
  }
  return info;
}

const MAX_ENTRIES = 2000;

/** Conteúdo de uma pasta: pastas primeiro, depois arquivos, em ordem alfabética. */
export function listDir(path: string): { ok: true; entries: DirEntry[]; more: number } | { ok: false; error: string } {
  if (!path || !existsSync(path)) return { ok: false, error: "Pasta não encontrada." };
  let names: string[];
  try {
    names = readdirSync(path);
  } catch (err) {
    return { ok: false, error: `Sem acesso à pasta: ${(err as Error).message}` };
  }
  const entries: DirEntry[] = [];
  for (const name of names) {
    try {
      const st = statSync(join(path, name));
      entries.push({ name, isDir: st.isDirectory(), size: st.size, modified: st.mtimeMs });
    } catch {
      // Arquivo de sistema bloqueado ou link quebrado: fica de fora.
    }
  }
  entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true }) : a.isDir ? -1 : 1));
  return { ok: true, entries: entries.slice(0, MAX_ENTRIES), more: Math.max(0, entries.length - MAX_ENTRIES) };
}
