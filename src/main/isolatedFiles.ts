import { closeSync, existsSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, rmdirSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { CanvasAccess } from "./canvasAccess";

/** Base64 + JSON permanecem abaixo do limite HTTP de 1 MB. */
export const FILE_CHUNK_SIZE = 512 * 1024;

/** Caminho real, resolvendo links do ancestral mais próximo que existe (mkdir cria vários níveis). */
function physical(path: string): string {
  let base = path;
  while (!existsSync(base) && dirname(base) !== base) base = dirname(base);
  return join(realpathSync(base), path.slice(base.length));
}

/** Única passagem de arquivos host → terminal. Não devolve handles nem monta pastas. */
export async function isolatedFile(access: CanvasAccess, id: string, body: Record<string, unknown>): Promise<object> {
  const action = body.action, path = body.path;
  if (!["read", "write", "list", "mkdir", "delete"].includes(String(action)) || typeof path !== "string" || !isAbsolute(path)) throw new Error("Informe read, write, list, mkdir ou delete e um caminho absoluto do computador.");
  const canonical = physical(path);
  const decision = await access.request(id, { operation: action === "read" || action === "list" ? "read" : "write", resource: canonical });
  if (!decision.allowed) throw new Error(decision.reason);
  if (resolve(physical(path)) !== resolve(canonical)) throw new Error("O caminho mudou enquanto a autorização estava aberta.");
  if (action === "mkdir") { mkdirSync(canonical, { recursive: true }); return { path, created: true }; }
  if (action === "delete") {
    if (!existsSync(canonical)) throw new Error("Caminho não encontrado.");
    // Só arquivo ou pasta vazia: apagar árvores inteiras fica com o usuário.
    if (statSync(canonical).isDirectory()) rmdirSync(canonical); else unlinkSync(canonical);
    return { path, deleted: true };
  }
  if (action === "list") return { path, entries: readdirSync(canonical, { withFileTypes: true }).slice(0, 300).map(e => ({ name: e.name, directory: e.isDirectory(), link: e.isSymbolicLink() })) };
  if (action === "read") {
    const stat = statSync(canonical);
    if (!stat.isFile()) throw new Error("Escolha um arquivo.");
    const offset = body.offset ?? 0, length = body.length ?? FILE_CHUNK_SIZE;
    if (!Number.isSafeInteger(offset) || (offset as number) < 0 || !Number.isSafeInteger(length) || (length as number) < 1 || (length as number) > FILE_CHUNK_SIZE) throw new Error("Offset ou tamanho da parte inválido (máximo 512 KB).");
    if (body.offset === undefined && body.length === undefined && stat.size > FILE_CHUNK_SIZE) throw new Error("Use zn access read CAMINHO --out ARQUIVO para receber arquivos grandes em partes.");
    const fd = openSync(canonical, "r");
    try {
      const bytes = Buffer.alloc(Math.min(length as number, Math.max(0, stat.size - (offset as number))));
      const count = readSync(fd, bytes, 0, bytes.length, offset as number);
      return { path, encoding: body.encoding === "base64" ? "base64" : "utf8", content: bytes.subarray(0, count).toString(body.encoding === "base64" ? "base64" : "utf8"), offset, read: count, size: stat.size, modified: stat.mtimeMs, eof: (offset as number) + count >= stat.size };
    } finally { closeSync(fd); }
  }
  if (typeof body.content !== "string" || Buffer.byteLength(body.content) > 1_000_000) throw new Error("Envie conteúdo de até 1 MB.");
  const data = body.encoding === "base64" ? Buffer.from(body.content, "base64") : Buffer.from(body.content);
  if (body.encoding === "base64" && data.toString("base64") !== body.content) throw new Error("Conteúdo base64 inválido.");
  if (data.length > FILE_CHUNK_SIZE) throw new Error("Envie partes de até 512 KB.");
  if (body.offset === undefined) writeFileSync(canonical, data);
  else {
    const offset = body.offset;
    if (!Number.isSafeInteger(offset) || (offset as number) < 0 || (offset as number) > (existsSync(canonical) ? statSync(canonical).size : 0)) throw new Error("Offset de escrita inválido.");
    const fd = openSync(canonical, offset === 0 ? "w" : "r+");
    try { writeSync(fd, data, 0, data.length, offset as number); }
    finally { closeSync(fd); }
  }
  return { path, written: data.length };
}
