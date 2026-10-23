export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const touches = (a: Box, b: Box, pad: number) =>
  a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;

/**
 * Lugar livre mais perto do desejado (canto superior esquerdo). Se o desejado já está livre, é ele.
 * Senão procura em volta, em meio-passos do tamanho do elemento, e fica com o mais próximo que não
 * cobre nem encosta em ninguém; sem lugar em volta, vai para baixo de tudo.
 */
export function nearestFreeSpot(size: { width: number; height: number }, wanted: { x: number; y: number }, obstacles: Box[], pad = 24, rings = 14): { x: number; y: number } {
  const free = (p: { x: number; y: number }) => !obstacles.some((o) => touches({ ...p, ...size }, o, pad));
  if (free(wanted)) return wanted;
  const sx = (size.width + pad) / 2;
  const sy = (size.height + pad) / 2;
  let best: { x: number; y: number } | undefined;
  let bestDistance = Infinity;
  for (let dx = -rings; dx <= rings; dx++) {
    for (let dy = -rings; dy <= rings; dy++) {
      const p = { x: Math.round(wanted.x + dx * sx), y: Math.round(wanted.y + dy * sy) };
      const distance = Math.hypot(dx * sx, dy * sy);
      if (distance < bestDistance && free(p)) { best = p; bestDistance = distance; }
    }
  }
  return best ?? { x: wanted.x, y: Math.max(...obstacles.map((o) => o.y + o.height)) + pad * 2 };
}
