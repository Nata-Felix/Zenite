/**
 * "Desenho → forma" (Shift+X): o rabisco vira a forma que ele parece. Fechado: retângulo, elipse ou
 * losango, o que tiver o contorno mais perto dos pontos. Aberto e quase reto: linha. O resto
 * continua como traço de lápis.
 */
export type Recognized = { shape: "rectangle" | "ellipse" | "diamond" } | { shape: "line"; from: XY; to: XY } | { shape: "pen" };
type XY = { x: number; y: number };

/** Distância de um ponto (já normalizado para a caixa, 0–1) ao contorno de cada forma. */
const toRect = (u: number, v: number) => Math.min(Math.abs(u), Math.abs(1 - u), Math.abs(v), Math.abs(1 - v));
const toEllipse = (u: number, v: number) => Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.5);
const toDiamond = (u: number, v: number) => Math.abs(Math.abs(u - 0.5) + Math.abs(v - 0.5) - 0.5) / Math.SQRT2;

export function recognize(points: XY[]): Recognized {
  if (points.length < 3) return { shape: "pen" };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const size = Math.max(w, h);
  if (size < 12) return { shape: "pen" };
  const first = points[0];
  const last = points[points.length - 1];

  // Aberto e quase reto: linha do começo ao fim.
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  if (chord > size * 0.6) {
    const deviation = Math.max(...points.map((p) => Math.abs((last.y - first.y) * p.x - (last.x - first.x) * p.y + last.x * first.y - last.y * first.x) / chord));
    if (deviation < Math.max(6, chord * 0.08)) return { shape: "line", from: first, to: last };
  }

  // Fechado: o fim volta perto do começo.
  if (chord > size * 0.3 || w < 8 || h < 8) return { shape: "pen" };
  const scores = { rectangle: 0, ellipse: 0, diamond: 0 };
  for (const p of points) {
    const u = (p.x - minX) / w;
    const v = (p.y - minY) / h;
    scores.rectangle += toRect(u, v);
    scores.ellipse += toEllipse(u, v);
    scores.diamond += toDiamond(u, v);
  }
  const best = (Object.keys(scores) as (keyof typeof scores)[]).sort((a, b) => scores[a] - scores[b])[0];
  // Nada parecido o bastante: fica o rabisco.
  return scores[best] / points.length < 0.12 ? { shape: best } : { shape: "pen" };
}
