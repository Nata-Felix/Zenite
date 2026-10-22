import { randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, readSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { extname } from "node:path";
import { nodeKind, storedEdge, type CanvasEdge, type CanvasNode, type CanvasState, type NodeKind } from "../shared/types";

/**
 * Canvas exportado (.zenite): só a distribuição dos itens. Um arquivo só, com um cabeçalho JSON
 * (elementos, ligações, notas e tabelas) seguido dos bytes das imagens e vídeos, na ordem da
 * lista `media`. Contas, chaves de API e .env nunca entram: dos terminais vão só nome, comando,
 * pasta e aparência.
 */
const MAGIC = Buffer.from("ZENITE-CANVAS\n", "utf8");
const MAX_HEADER = 256 * 1024 * 1024;
const CHUNK = 4 * 1024 * 1024;

export const ARCHIVE_KINDS: NodeKind[] = ["terminal", "note", "table", "image", "video", "web", "file", "folder", "flow", "skill", "service", "blackhole", "draw"];

interface Header {
  version: 1;
  exportedAt: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  notes: Record<string, string>;
  tables: Record<string, string[][]>;
  /** Na mesma ordem dos bytes depois do cabeçalho. */
  media: { file: string; size: number }[];
}

export interface ArchiveSource {
  readNote(id: string): string;
  readTable(id: string): string[][];
  mediaPath(file: string): string;
}

/** O que vem de um .zenite: elementos com mídia já copiada para a pasta do app. */
export interface ArchiveBatch {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  notes: Record<string, string>;
  tables: Record<string, string[][]>;
}

/** Tira do terminal o que é da máquina ou da pessoa: conta e provedor (chave de API). */
function cleanNode(node: CanvasNode): CanvasNode {
  const n = structuredClone(node);
  if (n.terminal) {
    const { id, title, command, cwd, appearance, sun } = n.terminal;
    n.terminal = { id, title, command: command ?? "", cwd: cwd ?? "", ...(appearance ? { appearance } : {}), ...(sun ? { sun: true } : {}) };
  }
  return n;
}

/** Grava o .zenite com os tipos escolhidos. Ligações só entre elementos que foram junto. */
export function writeCanvasArchive(path: string, state: CanvasState, kinds: NodeKind[], src: ArchiveSource): number {
  const wanted = new Set(kinds);
  const nodes = state.nodes.filter((n) => wanted.has(nodeKind(n))).map(cleanNode);
  if (!nodes.length) throw new Error("Nada para exportar: marque ao menos um tipo que exista no canvas.");
  const ids = new Set(nodes.map((n) => n.id));
  const header: Header = {
    version: 1,
    exportedAt: Date.now(),
    nodes,
    edges: state.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map(storedEdge),
    notes: {},
    tables: {},
    media: [],
  };
  const files: string[] = [];
  for (const n of nodes) {
    if (n.kind === "note") header.notes[n.id] = src.readNote(n.id);
    if (n.kind === "table") header.tables[n.id] = src.readTable(n.id);
    if ((n.kind === "image" || n.kind === "video") && n.element?.file) {
      const file = src.mediaPath(n.element.file);
      if (!existsSync(file)) throw new Error(`O arquivo de "${n.element.title}" não existe mais.`);
      header.media.push({ file: n.element.file, size: statSync(file).size });
      files.push(file);
    }
  }

  const json = Buffer.from(JSON.stringify(header), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(json.length);
  const tmp = `${path}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, MAGIC);
    writeSync(fd, length);
    writeSync(fd, json);
    const buf = Buffer.alloc(CHUNK);
    files.forEach((file, i) => {
      const input = openSync(file, "r");
      try {
        let left = header.media[i].size;
        while (left > 0) {
          const read = readSync(input, buf, 0, Math.min(CHUNK, left), null);
          if (read <= 0) throw new Error(`O arquivo "${file}" mudou durante a exportação.`);
          writeSync(fd, buf, 0, read);
          left -= read;
        }
      } finally {
        closeSync(input);
      }
    });
  } catch (error) {
    closeSync(fd);
    rmSync(tmp, { force: true });
    throw error;
  }
  closeSync(fd);
  renameSync(tmp, path);
  return nodes.length;
}

const isNumber = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Lê um .zenite. Imagens e vídeos são copiados para a pasta de mídia com nomes novos. */
export function readCanvasArchive(path: string, mediaPath: (file: string) => string): ArchiveBatch {
  const fd = openSync(path, "r");
  const created: string[] = [];
  try {
    const read = (size: number, what: string) => {
      const buf = Buffer.alloc(size);
      if (readSync(fd, buf, 0, size, null) !== size) throw new Error(`Arquivo incompleto (${what}).`);
      return buf;
    };
    if (!read(MAGIC.length, "início").equals(MAGIC)) throw new Error("Este arquivo não é um canvas exportado pelo Zênite.");
    const size = read(4, "cabeçalho").readUInt32LE();
    if (size > MAX_HEADER) throw new Error("Arquivo inválido.");
    const header = JSON.parse(read(size, "cabeçalho").toString("utf8")) as Header;
    if (header.version !== 1 || !Array.isArray(header.nodes) || !Array.isArray(header.edges) || !Array.isArray(header.media)) {
      throw new Error("Este arquivo é de uma versão do Zênite que esta não entende.");
    }

    // Copia cada mídia em pedaços, sem carregar vídeos inteiros na memória.
    const renamed = new Map<string, string>();
    const buf = Buffer.alloc(CHUNK);
    for (const m of header.media) {
      if (typeof m?.file !== "string" || !isNumber(m.size) || m.size < 0) throw new Error("Arquivo inválido (mídia).");
      const ext = extname(m.file).toLowerCase();
      const name = `${randomUUID()}${/^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ""}`;
      const dest = mediaPath(name);
      created.push(dest);
      const out = openSync(dest, "w");
      try {
        let left = m.size;
        while (left > 0) {
          const n = readSync(fd, buf, 0, Math.min(CHUNK, left), null);
          if (n <= 0) throw new Error("Arquivo incompleto (mídia).");
          writeSync(out, buf, 0, n);
          left -= n;
        }
      } finally {
        closeSync(out);
      }
      renamed.set(m.file, name);
    }

    const nodes = header.nodes
      .filter((n) => n && typeof n.id === "string" && ARCHIVE_KINDS.includes(nodeKind(n)) && [n.x, n.y, n.width, n.height].every(isNumber))
      .filter((n) => (nodeKind(n) === "terminal" ? !!n.terminal : n.kind === "draw" ? !!n.draw : !!n.element))
      .map((n) => {
        const node = cleanNode(n);
        if (node.element?.file) node.element.file = renamed.get(node.element.file) ?? "";
        return node;
      });
    const ids = new Set(nodes.map((n) => n.id));
    const edges = header.edges.filter((e) => e && ids.has(e.source) && ids.has(e.target));
    if (!nodes.length) throw new Error("O arquivo não tem elementos.");
    return { nodes, edges, notes: header.notes ?? {}, tables: header.tables ?? {} };
  } catch (error) {
    for (const file of created) rmSync(file, { force: true });
    if (error instanceof SyntaxError) throw new Error("Arquivo inválido.");
    throw error;
  } finally {
    closeSync(fd);
  }
}
