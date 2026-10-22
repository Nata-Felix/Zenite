import { File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, type LucideIcon } from "lucide-react";

const GROUPS: [LucideIcon, string[]][] = [
  [FileCode, ["js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt", "c", "h", "cpp", "cs", "php", "html", "css", "scss", "json", "yml", "yaml", "toml", "xml", "sh", "ps1", "bat", "sql", "vue", "svelte"]],
  [FileSpreadsheet, ["csv", "tsv", "xls", "xlsx", "ods"]],
  [FileArchive, ["zip", "rar", "7z", "gz", "tar", "tgz", "bz2"]],
  [FileImage, ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "psd", "ai", "fig"]],
  [FileVideo, ["mp4", "webm", "mov", "mkv", "avi", "m4v"]],
  [FileAudio, ["mp3", "wav", "ogg", "flac", "m4a"]],
  [FileText, ["txt", "md", "pdf", "doc", "docx", "rtf", "odt", "log", "ppt", "pptx"]],
];

/** Ícone pelo tipo do arquivo (extensão com ou sem ponto). */
export function fileIcon(ext: string): LucideIcon {
  const e = ext.replace(/^\./, "").toLowerCase();
  return GROUPS.find(([, list]) => list.includes(e))?.[0] ?? File;
}

/** Último trecho do caminho (nome do arquivo ou da pasta). */
export function lastSegment(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Pasta que contém o caminho. */
export function parentDir(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (i <= 0) return trimmed.slice(0, i + 1) || trimmed;
  // "C:\" continua com a barra.
  return /^[A-Za-z]:$/.test(trimmed.slice(0, i)) ? trimmed.slice(0, i + 1) : trimmed.slice(0, i);
}

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : `${dir}${sep}${name}`;
}
