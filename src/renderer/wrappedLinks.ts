/**
 * URLs que o CLI quebra em várias linhas de verdade (ex.: o login do agy imprime a URL em pedaços,
 * cada um começando com espaço). O terminal vê linhas separadas: o clique abria só o primeiro
 * pedaço e o copiar levava as quebras junto. Aqui os pedaços são juntados de volta.
 */

const URL_CHARS = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/;
const isPiece = (line: string) => URL_CHARS.test(line.trim());

/**
 * Se a linha `row` faz parte de uma URL quebrada em mais de uma linha, devolve a URL inteira e as
 * linhas que ela ocupa. A URL começa numa linha cujo texto (sem espaços nas pontas) começa com
 * http(s):// e continua pelas linhas seguintes formadas só por caracteres de URL.
 */
export function wrappedUrlAt(lines: string[], row: number): { url: string; first: number; last: number } | null {
  if (!isPiece(lines[row] ?? "")) return null;
  let first = row;
  while (!/^https?:\/\//i.test(lines[first].trim())) {
    first--;
    if (first < 0 || !isPiece(lines[first])) return null;
  }
  let last = first;
  while (last + 1 < lines.length && isPiece(lines[last + 1])) last++;
  if (last === first || row > last) return null;
  return { url: lines.slice(first, last + 1).map((l) => l.trim()).join(""), first, last };
}

/** Rodapé de rolagem que o agy põe embaixo de textos longos: "(1–17 of 29 lines)". */
const PAGER = /^\(\d+\s*[–-]\s*\d+ of \d+ lines?\)$/i;

/** Texto copiado: se a seleção é uma URL quebrada em linhas, copia a URL inteira, sem as quebras. */
export function joinCopiedUrl(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  // O rodapé de rolagem vem junto quando a seleção passa do fim da URL.
  if (lines.length && PAGER.test(lines[lines.length - 1].trim())) lines.pop();
  if (lines.length < 2 || !/^https?:\/\//i.test(lines[0].trim()) || !lines.every(isPiece)) return text;
  return lines.map((l) => l.trim()).join("");
}
