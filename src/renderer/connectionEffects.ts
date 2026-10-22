/** Efeitos do laboratório galaxy-animations-13-effects.zip, adaptados às curvas do canvas. */
export const CONNECTION_EFFECTS = [
  { id: "stardust", label: "Poeira estelar", description: "Partículas minúsculas fluem entre os elementos.", color: "#93baff", count: 25 },
  { id: "microcomets", label: "Microcometas", description: "Cometas com caudas luminosas seguem o fluxo.", color: "#71e9fa", count: 6 },
  { id: "plasma-pulse", label: "Pulso de plasma", description: "Descargas energéticas percorrem a ligação.", color: "#8d9bff", count: 6 },
  { id: "orbital-system", label: "Sistema orbital", description: "Pequenos sistemas orbitais atravessam a rota.", color: "#b39aff", count: 8 },
  { id: "warp", label: "Dobra espacial", description: "Anéis de energia acompanham o caminho.", color: "#b18aff", count: 7 },
  { id: "nebula", label: "Nebulosa pulsante", description: "Uma nuvem estelar se comprime e expande.", color: "#93b9ff", count: 44 },
  { id: "plasma-filaments", label: "Filamentos de plasma", description: "Fios de energia entrelaçados transportam os dados.", color: "#55dff7", count: 20 },
  { id: "ion-stream", label: "Corrente de íons", description: "Feixes elétricos transitam em impulsos.", color: "#8a9dff", count: 22 },
  { id: "galactic-helix", label: "Hélice galáctica", description: "Duas correntes orbitam o eixo da ligação.", color: "#bc9bff", count: 32 },
  { id: "resonance", label: "Anéis de ressonância", description: "Ondas circulares de energia percorrem a rota.", color: "#8fe6f1", count: 16 },
  { id: "star-shower", label: "Chuva de estrelas", description: "Rajadas de microestrelas transportam dados.", color: "#d0b0ff", count: 48 },
  { id: "helical-orbit", label: "Órbita helicoidal", description: "Partículas orbitais avançam ao redor da ligação.", color: "#7bdaca", count: 28 },
  { id: "aurora", label: "Aurora cósmica", description: "Véus luminosos ondulam sobre a ligação.", color: "#a88dff", count: 24 },
] as const;

export type ConnectionEffect = (typeof CONNECTION_EFFECTS)[number]["id"];
export type ConnectionAnimation = "classic" | ConnectionEffect;
export interface EffectOptions { color: string; activeSpeed: number; idleSpeed: number }
export const DEFAULT_EFFECT_OPTIONS: EffectOptions = { color: "", activeSpeed: 1, idleSpeed: 1 };
export const CONNECTION_TIMING = { idle: 2.4, active: 1.1 };

export function normalizeAnimation(value: unknown): ConnectionAnimation {
  return CONNECTION_EFFECTS.some((effect) => effect.id === value) ? value as ConnectionEffect : "classic";
}
export function normalizeEffectOptions(value: unknown): EffectOptions {
  const options = value && typeof value === "object" ? value as Partial<EffectOptions> : {};
  const speed = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : 1;
  return { color: typeof options.color === "string" && /^#[\da-f]{6}$/i.test(options.color) ? options.color : "", activeSpeed: speed(options.activeSpeed, 0.2, 4), idleSpeed: speed(options.idleSpeed, 0, 3) };
}

export interface RoutePoint { x: number; y: number }
export interface EffectRoute { points: RoutePoint[]; length: number; x: number; y: number; width: number; height: number }
export function sampleRoute(path: Pick<SVGPathElement, "getTotalLength" | "getPointAtLength">): EffectRoute {
  const length = Math.max(1, path.getTotalLength());
  const points = Array.from({ length: 97 }, (_, i) => { const p = path.getPointAtLength(length * i / 96); return { x: p.x, y: p.y }; });
  const x = Math.min(...points.map((p) => p.x)) - 32, y = Math.min(...points.map((p) => p.y)) - 32;
  return { points, length, x, y, width: Math.max(...points.map((p) => p.x)) - x + 32, height: Math.max(...points.map((p) => p.y)) - y + 32 };
}
export function routePoint(route: EffectRoute, fraction: number, offset = 0): RoutePoint & { angle: number } {
  // Os fios convergem no ponto de contato em vez de terminar ao lado do elemento.
  const distanceToEnd = Math.max(0, Math.min(fraction, 1 - fraction)) * route.length;
  offset *= Math.sin(Math.min(1, distanceToEnd / 24) * Math.PI / 2);
  const position = Math.max(0, Math.min(1, fraction)) * (route.points.length - 1);
  const i = Math.min(Math.floor(position), route.points.length - 2), blend = position - i;
  const a = route.points[i], b = route.points[i + 1], angle = Math.atan2(b.y - a.y, b.x - a.x);
  return { x: a.x + (b.x - a.x) * blend - Math.sin(angle) * offset - route.x, y: a.y + (b.y - a.y) * blend + Math.cos(angle) * offset - route.y, angle };
}

export interface EffectFrame { time: number; energy: number; travel?: number }
export type EffectShape =
  | { kind: "circle"; cx: number; cy: number; r: number; opacity: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; angle: number; opacity: number }
  | { kind: "path"; d: string; width: number; opacity: number };

/** Geometria vetorial: o mesmo desenho permanece nítido em qualquer zoom. */
export function connectionEffectFrame(route: EffectRoute, effect: ConnectionEffect, options: EffectOptions, state: EffectFrame, dt: number, active: boolean, reverse: boolean): EffectShape[] {
  const shapes: EffectShape[] = [];
  const index = CONNECTION_EFFECTS.findIndex((item) => item.id === effect), definition = CONNECTION_EFFECTS[index];
  if (!definition) return shapes;
  state.energy += ((active ? 1 : 0) - state.energy) * Math.min(1, dt * (active ? 5 : 2.5));
  const e = state.energy, dir = reverse ? -1 : 1;
  state.time += dt * (0.3 * options.idleSpeed * (1 - e) + 0.65 * options.activeSpeed * e);
  state.travel = (state.travel ?? 0) + dt * (options.idleSpeed / CONNECTION_TIMING.idle * (1 - e) + options.activeSpeed / CONNECTION_TIMING.active * e);
  const t = state.time, pos = (f: number) => reverse ? 1 - f : f;
  const line = (f1: number, y1: number, f2: number, y2: number, alpha: number, width = 1) => {
    const a = routePoint(route, f1, y1), b = routePoint(route, f2, y2);
    shapes.push({ kind: "path", d: `M${a.x},${a.y}L${b.x},${b.y}`, opacity: alpha, width });
  };
  const ring = (f: number, y: number, rx: number, ry: number, alpha: number, angle = 0) => {
    const p = routePoint(route, f, y);
    shapes.push({ kind: "ellipse", cx: p.x, cy: p.y, rx, ry, angle: (p.angle + angle) * 180 / Math.PI, opacity: alpha });
  };
  const dot = (f: number, y: number, r: number, alpha: number) => {
    const p = routePoint(route, f, y), radius = Math.max(1.1, r);
    shapes.push({ kind: "circle", cx: p.x, cy: p.y, r: radius * 3, opacity: alpha * 0.2 });
    shapes.push({ kind: "circle", cx: p.x, cy: p.y, r: radius, opacity: alpha });
  };
  if ([6, 7, 12].includes(index)) {
    for (let k = 0; k < (index === 12 ? 5 : 3); k++) {
      let d = "";
      for (let j = 0; j <= 85; j++) {
        const f = j / 85, p = routePoint(route, f, Math.sin(f * (index === 12 ? 12 : 22) - t * 8 * dir + k * 2.09) * (index === 12 ? 9 + e * 10 : 2 + e * 5));
        d += `${j === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      }
      shapes.push({ kind: "path", d, opacity: (0.18 + e * 0.2) * (index === 12 ? 1.3 : 1), width: index === 12 ? 3 : 1.4 });
    }
  }
  for (let j = 0; j < definition.count; j++) {
    const seed = j * 13.718, phase = ((j * 0.618033988749895) % 1 + state.travel * (1 + j % 3 * 0.09)) % 1;
    const f = pos(phase), edge = Math.sin(phase * Math.PI);
    let y = 0, r = 1.1, a = (0.65 + e * 0.35) * (0.4 + edge * 0.6);
    switch (index) {
      case 0: y = Math.sin(seed + t * 5) * 2.6; r = j % 5 === 0 ? 1.45 : 0.8; break;
      case 1: r = 2.2; line(f - dir * (8 + e * 30) / route.length, y, f, y, a * 0.8, 1 + e * 2); break;
      case 2: y = Math.sin(seed + phase * 18) * 2; r = 2 + e; line(f - dir * (5 + e * 25) / route.length, y, f, y, a * 0.85, 1.5 + e * 2); break;
      case 3: { const angle = phase * 21 - t * 14 + seed; y = Math.sin(angle) * (6 + e * 7); r = j % 3 === 0 ? 2.3 : 1.1; if (j % 2 === 0) ring(f, y, 9 + e * 4, 4 + e * 2, a * 0.5, angle * 0.2); break; }
      case 4: r = 2; ring(f, y, 8 + e * 4, 13 + e * 7, a * 0.65, -0.4); break;
      case 5: y = Math.sin(seed + t * 6) * (9 + Math.sin(t * 7 + seed) * 6 + e * 5); r = 0.6 + (j % 5 === 0 ? 0.65 : 0); break;
      case 6: y = Math.sin(phase * 25 - t * 11 + seed) * 4; r = 1.25; break;
      case 7: y = Math.sin(phase * 35 - t * 13 + seed) * 3; r = 1.3 + e * 0.6; if (j % 3 === 0) line(f - dir * (5 + e * 20) / route.length, y + 2, f, y, a, 1.5); break;
      case 8: { const angle = phase * 28 - t * 19 + seed; y = Math.sin(angle) * (7 + e * 7); a *= 0.7 + Math.cos(angle) * 0.2; r = j % 5 === 0 ? 1.8 : 1; break; }
      case 9: y = Math.sin(phase * 16 - t * 11 + seed) * (2 + e * 4); r = 1.3; if (j % 3 === 0) ring(f, 0, 4 + e * 9, 7 + e * 10, a * 0.65); break;
      case 10: y = Math.sin(j * 12.67) * 15 * (0.5 + e * 0.55); r = j % 6 === 0 ? 2.1 : 0.65; if (j % 7 === 0) { line(f - 3 / route.length, y, f + 3 / route.length, y, a, 0.8); line(f, y - 3, f, y + 3, a, 0.8); } break;
      case 11: { const angle = phase * 22 - t * 14 + seed; y = Math.sin(angle) * (8 + e * 5); r = j % 5 === 0 ? 2.4 : 1; if (j % 3 === 0) ring(f, y, 11, 4, a * 0.45, angle * 0.3); break; }
      case 12: y = Math.sin(phase * 18 - t * 9 + seed) * 10; r = 0.8 + e * 0.7; a *= 0.7; break;
    }
    dot(f, y, r, a);
  }
  if (index === 9) for (let k = 0; k < 4; k++) { const f = (state.travel + k * 0.25) % 1; ring(pos(f), 0, 3 + e * 7, 6 + e * 10, Math.sin(f * Math.PI) * (0.4 + e * 0.4)); }
  return shapes;
}
