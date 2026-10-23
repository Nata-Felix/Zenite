import { nearestFreeSpot } from "../shared/freeSpot";
import { DEFAULT_GAPS, type LayoutGaps } from "./autoLayout";
import type { Box } from "./layout";

type Link = { source: string; target: string };
type Point = { x: number; y: number };

const TAU = Math.PI * 2;
const center = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Distância em conexões de cada elemento até o Sol (sem olhar o sentido da ligação). */
export function levelsFrom(sunId: string, edges: Link[]): Map<string, number> {
  const next = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.source === e.target) continue;
    if (!next.has(e.source)) next.set(e.source, new Set());
    if (!next.has(e.target)) next.set(e.target, new Set());
    next.get(e.source)!.add(e.target);
    next.get(e.target)!.add(e.source);
  }
  const level = new Map([[sunId, 0]]);
  const queue = [sunId];
  for (let i = 0; i < queue.length; i++) {
    for (const id of next.get(queue[i]) ?? []) {
      if (level.has(id)) continue;
      level.set(id, level.get(queue[i])! + 1);
      queue.push(id);
    }
  }
  return level;
}

/**
 * Organização por nível: quem se liga direto ao Sol forma o primeiro anel, quem está a duas
 * conexões forma o segundo, e assim por diante. O Sol não sai do lugar. Elementos sem caminho
 * até o Sol ficam no anel de fora. Cada anel é espaçado para ninguém se cobrir, e a ordem segue
 * a dos vizinhos do anel de dentro, para as linhas se cruzarem pouco.
 */
export function levelLayout(boxes: Box[], edges: Link[], sun: Box, obstacles: Box[] = [], gaps: LayoutGaps = DEFAULT_GAPS): Record<string, Point> {
  const movable = boxes.filter((b) => b.id !== sun.id);
  if (!movable.length) return {};
  const level = levelsFrom(sun.id, edges);
  const reached = movable.map((b) => level.get(b.id)).filter((l): l is number => l !== undefined);
  const outer = Math.max(0, ...reached) + 1;
  const rings = new Map<number, Box[]>();
  for (const b of movable) {
    const l = level.get(b.id) ?? outer;
    rings.set(l, [...(rings.get(l) ?? []), b]);
  }

  const origin = center(sun);
  const angleOf = (b: Box) => Math.atan2(center(b).y - origin.y, center(b).x - origin.x);
  const span = (b: Box) => Math.max(b.w, b.h);
  const placedAngle = new Map<string, number>();
  const centers = new Map<string, Point>();
  let previousRadius = Math.max(sun.w, sun.h) / 2;
  let previousSpan = 0;

  const neighbors = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!neighbors.has(e.source)) neighbors.set(e.source, new Set());
    if (!neighbors.has(e.target)) neighbors.set(e.target, new Set());
    neighbors.get(e.source)!.add(e.target);
    neighbors.get(e.target)!.add(e.source);
  }

  for (const l of [...rings.keys()].sort((a, b) => a - b)) {
    const ring = rings.get(l)!;
    const widest = Math.max(...ring.map(span));
    // Raio: depois do anel de dentro, e grande o bastante para os elementos caberem lado a lado.
    const clear = previousRadius + previousSpan / 2 + gaps.column + widest / 2;
    const around = (ring.length * (widest + gaps.row)) / TAU;
    const radius = Math.max(clear, around);
    // Ângulo ideal: o da média dos vizinhos já posicionados; senão, onde o elemento já estava.
    const ideal = new Map(ring.map((b) => {
      const known = [...(neighbors.get(b.id) ?? [])].filter((id) => placedAngle.has(id)).map((id) => placedAngle.get(id)!);
      if (!known.length) return [b.id, angleOf(b)] as const;
      return [b.id, Math.atan2(known.reduce((s, a) => s + Math.sin(a), 0), known.reduce((s, a) => s + Math.cos(a), 0))] as const;
    }));
    const ordered = [...ring].sort((a, b) => ideal.get(a.id)! - ideal.get(b.id)! || a.id.localeCompare(b.id));
    const step = TAU / ordered.length;
    // Gira o anel todo para ficar o mais perto possível dos ângulos ideais.
    const offset = Math.atan2(
      ordered.reduce((s, b, i) => s + Math.sin(ideal.get(b.id)! - i * step), 0),
      ordered.reduce((s, b, i) => s + Math.cos(ideal.get(b.id)! - i * step), 0),
    );
    ordered.forEach((b, i) => {
      const angle = offset + i * step;
      placedAngle.set(b.id, angle);
      centers.set(b.id, { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius });
    });
    previousRadius = radius;
    previousSpan = widest;
  }

  // Quem ficou em cima de um elemento que não está sendo organizado vai para o lugar livre mais perto.
  const taken: Box[] = [sun, ...obstacles];
  const result: Record<string, Point> = {};
  for (const b of movable) {
    const c = centers.get(b.id)!;
    const spot = nearestFreeSpot({ width: b.w, height: b.h }, { x: c.x - b.w / 2, y: c.y - b.h / 2 }, taken.map((o) => ({ x: o.x, y: o.y, width: o.w, height: o.h })), 8);
    result[b.id] = spot;
    taken.push({ id: b.id, x: spot.x, y: spot.y, w: b.w, h: b.h });
  }
  return result;
}
