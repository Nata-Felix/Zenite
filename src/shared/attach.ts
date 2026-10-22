import type { DrawSpec } from "./types";

/**
 * Desenhos que andam junto com os elementos:
 *  - Quadro: o que está inteiro dentro dele (elementos, textos, setas) e o texto logo acima
 *    (o título que a pessoa escreveu) formam um bloco. O Organizar move o bloco inteiro.
 *  - Linha e seta: a ponta que começa ou termina sobre um elemento fica presa a ele; quando o
 *    elemento anda (arrastando ou pelo Organizar), a ponta vai junto e a seta se redesenha.
 */
export interface Piece {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Desenho (ausente = terminal ou elemento). */
  draw?: DrawSpec;
}
type XY = { x: number; y: number };

/** Folga para achar o elemento na ponta da seta (a seta costuma parar um pouco antes da borda). */
const NEAR = 28;
/** Texto até esta distância acima do quadro é o título dele. */
const TITLE_GAP = 90;

const isLine = (p: Piece) => p.draw?.shape === "line" || p.draw?.shape === "arrow";
const inside = (a: Piece, b: Piece) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

/** Pontas absolutas de uma linha/seta (primeiro e último ponto). */
export function endpoints(p: Piece): [XY, XY] | null {
  const pts = p.draw?.points;
  if (!isLine(p) || !pts || pts.length < 2) return null;
  const at = ([rx, ry]: [number, number]) => ({ x: p.x + rx * p.w, y: p.y + ry * p.h });
  return [at(pts[0]), at(pts[pts.length - 1])];
}

/** Elemento (não desenho) sob o ponto, com folga; o menor ganha (o de dentro, num grupo). */
function elementAt(pieces: Piece[], pt: XY): string | undefined {
  const hits = pieces.filter((p) => !p.draw && pt.x >= p.x - NEAR && pt.y >= p.y - NEAR && pt.x <= p.x + p.w + NEAR && pt.y <= p.y + p.h + NEAR);
  hits.sort((a, b) => a.w * a.h - b.w * b.h);
  return hits[0]?.id;
}

export type Bindings = Map<string, { start?: string; end?: string }>;

/** Para cada linha/seta, a que elemento cada ponta está presa. */
export function arrowBindings(pieces: Piece[]): Bindings {
  const out: Bindings = new Map();
  for (const p of pieces) {
    const ends = endpoints(p);
    if (!ends) continue;
    const start = elementAt(pieces, ends[0]);
    const end = elementAt(pieces, ends[1]);
    if (start || end) out.set(p.id, { start, end });
  }
  return out;
}

/** Quadro → o que anda com ele (elementos e desenhos de dentro, e o título logo acima). */
export function frameMembers(pieces: Piece[]): Map<string, string[]> {
  const frames = pieces.filter((p) => p.draw?.shape === "frame").sort((a, b) => a.w * a.h - b.w * b.h);
  const taken = new Set<string>();
  const out = new Map<string, string[]>();
  // Do menor para o maior: um quadro dentro de outro leva os seus; o de fora leva o de dentro.
  for (const f of frames) {
    const members = pieces.filter((p) => {
      if (p.id === f.id || taken.has(p.id)) return false;
      if (inside(p, f)) return true;
      const title = p.draw?.shape === "text" && p.y + p.h <= f.y + 4 && f.y - (p.y + p.h) <= TITLE_GAP && p.x < f.x + f.w && p.x + p.w > f.x;
      return title;
    });
    members.forEach((m) => taken.add(m.id));
    out.set(f.id, members.map((m) => m.id));
  }
  return out;
}

/** A linha/seta redesenhada com as pontas novas: caixa e pontos relativos (os do meio acompanham). */
export function refit(p: Piece, start: XY, end: XY): { x: number; y: number; w: number; h: number; points: [number, number][] } {
  const pts = p.draw!.points!;
  const [a, b] = endpoints(p)!;
  // Pontos do meio (curvas do lápis não entram aqui): reposiciona na proporção entre as pontas.
  const abs = pts.map(([rx, ry], i) => {
    if (i === 0) return start;
    if (i === pts.length - 1) return end;
    const t = pts.length > 1 ? i / (pts.length - 1) : 0;
    const orig = { x: p.x + rx * p.w, y: p.y + ry * p.h };
    const lerpOld = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const lerpNew = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    return { x: lerpNew.x + orig.x - lerpOld.x, y: lerpNew.y + orig.y - lerpOld.y };
  });
  // Mesma folga em volta do traço que o desenho original tinha.
  const pad = Math.max(0, Math.min(...pts.map(([rx]) => rx * p.w)));
  const xs = abs.map((q) => q.x);
  const ys = abs.map((q) => q.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  const w = Math.max(1, Math.max(...xs) - Math.min(...xs) + pad * 2);
  const h = Math.max(1, Math.max(...ys) - Math.min(...ys) + pad * 2);
  return { x, y, w, h, points: abs.map((q) => [(q.x - x) / w, (q.y - y) / h]) };
}

/**
 * Setas presas a elementos que andaram (deslocamento por id). Setas que já andaram inteiras
 * (estão em `moved`, ex.: dentro de um quadro arrastado) ficam como estão.
 */
export function followArrows(pieces: Piece[], bindings: Bindings, delta: Map<string, XY>, moved: Set<string> = new Set()): Map<string, ReturnType<typeof refit>> {
  const out = new Map<string, ReturnType<typeof refit>>();
  for (const p of pieces) {
    const b = bindings.get(p.id);
    if (!b || moved.has(p.id)) continue;
    const ds = b.start ? delta.get(b.start) : undefined;
    const de = b.end ? delta.get(b.end) : undefined;
    if (!ds && !de) continue;
    const [s, e] = endpoints(p)!;
    out.set(p.id, refit(p, ds ? { x: s.x + ds.x, y: s.y + ds.y } : s, de ? { x: e.x + de.x, y: e.y + de.y } : e));
  }
  return out;
}
