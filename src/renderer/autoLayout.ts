import type { Box } from "./layout";

type Link = { source: string; target: string };
type Point = { x: number; y: number };
/** Espaços entre colunas, linhas e grupos. O padrão é para janelas grandes; os cartões da visão resumida usam menos. */
export interface LayoutGaps {
  column: number;
  row: number;
  group: number;
}
export const DEFAULT_GAPS: LayoutGaps = { column: 160, row: 80, group: 160 };
const byId = (a: Box, b: Box) => a.id.localeCompare(b.id);

/** Organiza pelas conexões, respeitando os tamanhos reais. Não altera nós nem ligações. */
export function autoLayout(boxes: Box[], edges: Link[], obstacles: Box[] = [], gaps: LayoutGaps = DEFAULT_GAPS): Record<string, Point> {
  const { column: COLUMN_GAP, row: ROW_GAP, group: GROUP_GAP } = gaps;
  if (!boxes.length) return {};
  const byKey = new Map(boxes.map((b) => [b.id, b]));
  const outgoing = new Map(boxes.map((b) => [b.id, new Set<string>()]));
  const incoming = new Map(boxes.map((b) => [b.id, new Set<string>()]));
  const neighbors = new Map(boxes.map((b) => [b.id, new Set<string>()]));
  for (const e of edges) {
    if (e.source === e.target || !byKey.has(e.source) || !byKey.has(e.target)) continue;
    outgoing.get(e.source)!.add(e.target);
    incoming.get(e.target)!.add(e.source);
    neighbors.get(e.source)!.add(e.target);
    neighbors.get(e.target)!.add(e.source);
  }

  // Grupos independentes ficam separados. Elementos soltos formam uma grade ao final.
  const unseen = new Set(boxes.map((b) => b.id));
  const groups: Box[][] = [];
  const loose: Box[] = [];
  for (const start of [...boxes].sort(byId)) {
    if (!unseen.delete(start.id)) continue;
    const group: Box[] = [start];
    for (let i = 0; i < group.length; i++) {
      for (const id of neighbors.get(group[i].id)!) {
        if (unseen.delete(id)) group.push(byKey.get(id)!);
      }
    }
    if (group.length === 1) loose.push(start);
    else groups.push(group.sort(byId));
  }

  const left = Math.min(...boxes.map((b) => b.x));
  let top = Math.min(...boxes.map((b) => b.y));
  const positions: Record<string, Point> = {};
  for (const group of groups) {
    const ranks = new Map(group.map((b) => [b.id, 0]));
    const remaining = new Map(group.map((b) => [b.id, incoming.get(b.id)!.size]));
    const done = new Set<string>();
    let ready = group.filter((b) => remaining.get(b.id) === 0);
    while (done.size < group.length) {
      // Em um ciclo, trata uma ligação como retorno apenas para posicionar os nós.
      // A ligação original continua no canvas, e cada nó é processado uma única vez.
      if (!ready.length) ready = [group.filter((b) => !done.has(b.id)).sort((a, b) => remaining.get(a.id)! - remaining.get(b.id)! || byId(a, b))[0]];
      const current = ready.shift()!;
      done.add(current.id);
      for (const id of outgoing.get(current.id)!) {
        if (done.has(id)) continue;
        ranks.set(id, Math.max(ranks.get(id)!, ranks.get(current.id)! + 1));
        remaining.set(id, remaining.get(id)! - 1);
        if (remaining.get(id) === 0) ready.push(byKey.get(id)!);
      }
      ready.sort(byId);
    }

    const layers: Box[][] = [];
    for (const b of group) (layers[ranks.get(b.id)!] ??= []).push(b);
    const rankedColumns = layers.filter((layer) => layer?.length);
    // Ordena ramos pela posição dos vizinhos para reduzir linhas cruzadas.
    for (let pass = 0; pass < 4; pass++) {
      for (const direction of [1, -1]) {
        const slots = new Map(rankedColumns.flatMap((col) => col.map((b, i) => [b.id, (i + 0.5) / col.length] as const)));
        for (const col of direction === 1 ? rankedColumns : [...rankedColumns].reverse()) {
          const score = (b: Box) => {
            const adjacent = [...neighbors.get(b.id)!].filter((id) => direction === 1 ? ranks.get(id)! < ranks.get(b.id)! : ranks.get(id)! > ranks.get(b.id)!);
            return adjacent.length ? adjacent.reduce((sum, id) => sum + slots.get(id)!, 0) / adjacent.length : slots.get(b.id)!;
          };
          col.sort((a, b) => score(a) - score(b) || byId(a, b));
          col.forEach((b, i) => slots.set(b.id, (i + 0.5) / col.length));
        }
      }
    }

    const heightOf = (col: Box[]) => col.reduce((h, b) => h + b.h, 0) + (col.length - 1) * ROW_GAP;
    // Um hub pode ter dezenas de vizinhos na mesma etapa. Experimente alturas
    // para dobrar essas colunas em blocos: o conjunto deve caber melhor numa tela
    // horizontal, sem mudar a ordem das etapas ou separar ramos pequenos.
    const tallest = Math.max(...rankedColumns.map(heightOf));
    const minimum = Math.max(...group.map((b) => b.h));
    const splitAt = (limit: number) => rankedColumns.flatMap((col) => {
      if (col.length < 4 || heightOf(col) <= limit) return [col];
      const chunks: Box[][] = [];
      let chunk: Box[] = [];
      let height = 0;
      for (const b of col) {
        if (chunk.length && height + ROW_GAP + b.h > limit) {
          chunks.push(chunk);
          chunk = [];
          height = 0;
        }
        height += (chunk.length ? ROW_GAP : 0) + b.h;
        chunk.push(b);
      }
      if (chunk.length) chunks.push(chunk);
      return chunks;
    });
    const extent = (cols: Box[][]) => {
      const width = cols.reduce((sum, col) => sum + Math.max(...col.map((b) => b.w)), 0) + (cols.length - 1) * COLUMN_GAP;
      const height = Math.max(...cols.map(heightOf));
      return { fit: Math.max(width / 1.6, height), area: width * height };
    };
    let columns = rankedColumns;
    let best = extent(columns);
    for (let step = 0; step < 32; step++) {
      const candidate = splitAt(minimum + (tallest - minimum) * step / 32);
      const score = extent(candidate);
      if (score.fit < best.fit || (score.fit === best.fit && score.area < best.area)) {
        columns = candidate;
        best = score;
      }
    }
    const height = Math.max(...columns.map(heightOf));
    let x = left;
    for (const col of columns) {
      let y = top + (height - heightOf(col)) / 2;
      for (const b of col) { positions[b.id] = { x, y }; y += b.h + ROW_GAP; }
      x += Math.max(...col.map((b) => b.w)) + COLUMN_GAP;
    }

    // Alinha o centro de cada janela com seus vizinhos, sem sobrepor janelas na coluna.
    for (let pass = 0; pass < 4; pass++) {
      for (const col of pass % 2 ? [...columns].reverse() : columns) {
        let bottom = top - ROW_GAP;
        for (const b of col) {
          const adjacent = [...neighbors.get(b.id)!].filter((id) => ranks.get(id) !== ranks.get(b.id));
          const center = adjacent.length ? adjacent.reduce((sum, id) => sum + positions[id].y + byKey.get(id)!.h / 2, 0) / adjacent.length : positions[b.id].y + b.h / 2;
          positions[b.id].y = Math.max(top, bottom + ROW_GAP, center - b.h / 2);
          bottom = positions[b.id].y + b.h;
        }
        let ceiling = top + height;
        for (const b of [...col].reverse()) {
          positions[b.id].y = Math.min(positions[b.id].y, ceiling - b.h);
          ceiling = positions[b.id].y - ROW_GAP;
        }
      }
    }
    top += height + GROUP_GAP;
  }

  if (loose.length) {
    const count = Math.ceil(Math.sqrt(loose.length));
    const widths = Array.from({ length: count }, (_, col) => Math.max(...loose.filter((_, i) => i % count === col).map((b) => b.w)));
    for (let i = 0; i < loose.length; i += count) {
      const row = loose.slice(i, i + count);
      let x = left;
      row.forEach((b, col) => { positions[b.id] = { x, y: top }; x += widths[col] + ROW_GAP; });
      top += Math.max(...row.map((b) => b.h)) + ROW_GAP;
    }
  }

  // Ao organizar só uma seleção, o restante do canvas permanece parado.
  // Se o novo fluxo ocupar seu espaço, coloca a seleção logo abaixo do obstáculo.
  for (let pass = 0; pass <= obstacles.length; pass++) {
    const collisions = obstacles.filter((o) => boxes.some((b) => {
      const p = positions[b.id];
      return p.x < o.x + o.w + ROW_GAP && p.x + b.w + ROW_GAP > o.x && p.y < o.y + o.h + ROW_GAP && p.y + b.h + ROW_GAP > o.y;
    }));
    if (!collisions.length) break;
    const shift = Math.max(...collisions.map((o) => o.y + o.h)) + ROW_GAP - Math.min(...Object.values(positions).map((p) => p.y));
    for (const p of Object.values(positions)) p.y += shift;
  }
  for (const p of Object.values(positions)) { p.x = Math.round(p.x); p.y = Math.round(p.y); }
  return positions;
}
