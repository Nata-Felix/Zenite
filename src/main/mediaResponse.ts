import { createReadStream, statSync } from "node:fs";
import { extname } from "node:path";
import { Readable } from "node:stream";

/**
 * Resposta do protocolo o-media (imagens e vídeos do canvas) com suporte a pedaços (HTTP Range).
 * O player de vídeo pede pedaços do arquivo para pular para um ponto e para tocar de novo depois do
 * fim. O net.fetch de arquivo local ignorava o pedido e mandava o arquivo inteiro: o vídeo tocava uma
 * vez e travava ao recomeçar, e pular para o meio não saía do lugar.
 */
const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
  ".mkv": "video/x-matroska",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
};

/** "bytes=100-199" → { start: 100, end: 199 }. null se não houver pedido válido. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (m[1] === "") {
    // "bytes=-500": os últimos 500.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

export function mediaResponse(file: string, rangeHeader: string | null): Response {
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return new Response("Arquivo não encontrado", { status: 404 });
  }
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const range = parseRange(rangeHeader, size);
  if (range === "invalid") return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = size === 0 ? null : (Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream);
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Length": String(size === 0 ? 0 : end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
