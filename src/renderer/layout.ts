/** Caixa de um elemento no canvas. */
export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Align = "left" | "center" | "right" | "top" | "middle" | "bottom";

const GAP = 40;

function bounds(boxes: Box[]) {
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { left, top, right, bottom };
}

/** Alinha pela borda ou pelo centro do conjunto. Devolve as novas posições. */
export function align(boxes: Box[], how: Align): Record<string, { x: number; y: number }> {
  const b = bounds(boxes);
  const out: Record<string, { x: number; y: number }> = {};
  for (const n of boxes) {
    let { x, y } = n;
    if (how === "left") x = b.left;
    if (how === "right") x = b.right - n.w;
    if (how === "center") x = (b.left + b.right) / 2 - n.w / 2;
    if (how === "top") y = b.top;
    if (how === "bottom") y = b.bottom - n.h;
    if (how === "middle") y = (b.top + b.bottom) / 2 - n.h / 2;
    out[n.id] = { x, y };
  }
  return out;
}

/** Mesmo espaço entre os elementos, mantendo o primeiro e o último no lugar. */
export function distribute(boxes: Box[], axis: "x" | "y"): Record<string, { x: number; y: number }> {
  const size = axis === "x" ? "w" : "h";
  const sorted = [...boxes].sort((a, b) => a[axis] - b[axis]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last[axis] + last[size] - first[axis];
  const used = sorted.reduce((s, n) => s + n[size], 0);
  const gap = sorted.length > 1 ? (span - used) / (sorted.length - 1) : 0;
  const out: Record<string, { x: number; y: number }> = {};
  let cursor = first[axis];
  for (const n of sorted) {
    out[n.id] = axis === "x" ? { x: cursor, y: n.y } : { x: n.x, y: cursor };
    cursor += n[size] + gap;
  }
  return out;
}

/** Grade quase quadrada, na ordem de leitura, a partir do canto do conjunto. */
export function grid(boxes: Box[]): Record<string, { x: number; y: number }> {
  const b = bounds(boxes);
  const order = [...boxes].sort((p, q) => Math.round(p.y / 80) - Math.round(q.y / 80) || p.x - q.x);
  const cols = Math.ceil(Math.sqrt(order.length));
  const colWidth = Array.from({ length: cols }, (_, c) => Math.max(...order.filter((_, i) => i % cols === c).map((n) => n.w)));
  const out: Record<string, { x: number; y: number }> = {};
  let y = b.top;
  for (let r = 0; r * cols < order.length; r++) {
    const row = order.slice(r * cols, r * cols + cols);
    let x = b.left;
    row.forEach((n, c) => {
      out[n.id] = { x, y };
      x += colWidth[c] + GAP;
    });
    y += Math.max(...row.map((n) => n.h)) + GAP;
  }
  return out;
}
