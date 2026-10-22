import { Position } from "@xyflow/react";

export const SUMMARY_SIZE = { width: 144, height: 136 };
export const SUN_SIZE = { width: 168, height: 176 };
export const ORB_SIZE = 88;
export const SUN_ORB_SIZE = 118;

interface Circle { x: number; y: number; radius: number }
interface SummaryGeometry {
  type?: string;
  measured?: { width?: number };
  width?: number;
  internals: { positionAbsolute: { x: number; y: number } };
  data: { terminal?: { sun?: boolean } };
}

/** O nome fica fora do círculo e não participa da geometria da ligação. */
export function summaryCircle(node: SummaryGeometry | undefined): Circle | undefined {
  if (node?.type === "blackhole") return { x: node.internals.positionAbsolute.x + (node.measured?.width ?? node.width ?? 200) / 2, y: node.internals.positionAbsolute.y + 60, radius: 28 };
  if (node?.type !== "summary") return;
  const sun = !!node.data.terminal?.sun;
  const radius = (sun ? SUN_ORB_SIZE : ORB_SIZE) / 2;
  return { x: node.internals.positionAbsolute.x + (sun ? SUN_SIZE.width : SUMMARY_SIZE.width) / 2, y: node.internals.positionAbsolute.y + radius, radius };
}

/** Ponto da borda que olha para o vizinho; funciona em qualquer quadrante. */
export function circleEndpoint(circle: Circle, toward: { x: number; y: number }, fallback = 1) {
  const dx = toward.x - circle.x, dy = toward.y - circle.y;
  const length = Math.hypot(dx, dy);
  const nx = length > 0.001 ? dx / length : fallback, ny = length > 0.001 ? dy / length : 0;
  const position = Math.abs(nx) >= Math.abs(ny) ? nx >= 0 ? Position.Right : Position.Left : ny >= 0 ? Position.Bottom : Position.Top;
  return { x: circle.x + nx * circle.radius, y: circle.y + ny * circle.radius, position };
}
