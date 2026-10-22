import { useEffect, useRef, useState } from "react";
import type { DrawShape } from "../../shared/types";
import { recognize } from "./recognize";
import { AREA_SHAPES, type Tool } from "./style";

type XY = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };

interface Props {
  tool: Tool;
  strokeWidth: number;
  /** Tela -> coordenadas do canvas. */
  toFlow(p: XY): XY;
  /** Cria o desenho no começo do gesto e devolve o id. */
  begin(shape: DrawShape, box: Box, points?: [number, number][]): string;
  update(id: string, box: Box, points?: [number, number][]): void;
  /** Troca a forma de um desenho em andamento ("Desenho → forma"). */
  reshape(id: string, shape: DrawShape, box: Box, points?: [number, number][]): void;
  /** `keep` = o gesto foi grande o bastante para virar desenho. */
  finish(id: string, keep: boolean): void;
  /** Borracha: o ponteiro passou por aqui (tela); `done` no fim do gesto apaga o que foi marcado. */
  erase(screen: XY, done: boolean): void;
  /** Balde: pinta o desenho que está neste ponto. */
  fill(screen: XY, at: XY): void;
}

/** Ferramentas que usam esta camada. A mão não usa: ela move o canvas sem cobrir terminais. */
export const OVERLAY_TOOLS: Tool[] = ["rectangle", "ellipse", "diamond", "line", "arrow", "pen", "text", "frame", "shape", "eraser", "laser", "bucket"];

/** Converte pontos absolutos em caixa + pontos relativos (0–1), com folga para o traço. */
function fitPoints(points: XY[], pad: number): { box: Box; rel: [number, number][] } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  const width = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const height = Math.max(...ys) - Math.min(...ys) + pad * 2;
  return { box: { x, y, width, height }, rel: points.map((p) => [(p.x - x) / width, (p.y - y) / height]) };
}

const boxOf = (points: XY[]): Box => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};

/** Rastro do laser: pontos de tela que somem em ~0,8 s. Não vira desenho. */
const LASER_MS = 800;

/**
 * Camada transparente sobre o canvas enquanto uma ferramenta de desenho está ativa:
 * transforma arrastar do mouse em forma, traço, seta, lápis, borracha, laser ou balde.
 */
export function DrawOverlay({ tool, strokeWidth, toFlow, begin, update, reshape, finish, erase, fill }: Props) {
  const gesture = useRef<{ id: string; start: XY; points: XY[]; shape: DrawShape } | null>(null);
  const erasing = useRef(false);
  const laser = useRef<{ x: number; y: number; t: number }[]>([]);
  const [, setFrame] = useState(0);

  // O rastro do laser vai sumindo sozinho, quadro a quadro, enquanto houver pontos.
  useEffect(() => {
    if (tool !== "laser") return;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      laser.current = laser.current.filter((p) => now - p.t < LASER_MS);
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tool]);

  if (!OVERLAY_TOOLS.includes(tool)) return null;
  const pad = 6 + strokeWidth * 2;

  const shapeFor = (start: XY, cur: XY, shift: boolean, shape: DrawShape, points: XY[]) => {
    if (AREA_SHAPES.includes(shape) || shape === "frame") {
      let w = cur.x - start.x;
      let h = cur.y - start.y;
      if (shift) {
        const s = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * s;
        h = Math.sign(h || 1) * s;
      }
      return { box: { x: Math.min(start.x, start.x + w), y: Math.min(start.y, start.y + h), width: Math.abs(w), height: Math.abs(h) } };
    }
    if (shape === "pen") {
      const fit = fitPoints(points, pad);
      return { box: fit.box, rel: fit.rel };
    }
    // Linha e seta: Shift prende em ângulos de 45°.
    let end = cur;
    if (shift) {
      const dx = cur.x - start.x;
      const dy = cur.y - start.y;
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      end = { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
    }
    const fit = fitPoints([start, end], pad);
    return { box: fit.box, rel: fit.rel };
  };

  /** Fim do "Desenho → forma": o rabisco vira a forma reconhecida (ou fica como lápis). */
  const settleShape = (id: string, points: XY[]) => {
    const r = recognize(points);
    if (r.shape === "line") {
      const fit = fitPoints([r.from, r.to], pad);
      reshape(id, "line", fit.box, fit.rel);
    } else if (r.shape !== "pen") {
      reshape(id, r.shape, boxOf(points));
    }
    finish(id, points.length > 1);
  };

  /** Ponto relativo à camada (ela começa depois da barra lateral, não no canto da janela). */
  const local = (e: React.PointerEvent<HTMLDivElement>): XY => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const trail = laser.current;
  const now = performance.now();

  return (
    <div
      className={`draw-overlay tool-${tool}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Sem isso, o mousedown que vem depois tira o foco da caixa de texto recém-criada.
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const screen = { x: e.clientX, y: e.clientY };
        if (tool === "laser") {
          laser.current.push({ ...local(e), t: performance.now() });
          return;
        }
        if (tool === "eraser") {
          erasing.current = true;
          erase(screen, false);
          return;
        }
        if (tool === "bucket") {
          fill(screen, toFlow(screen));
          return;
        }
        const start = toFlow(screen);
        // "Desenho → forma" começa como lápis; vira forma ao soltar.
        const shape: DrawShape = tool === "shape" ? "pen" : (tool as DrawShape);
        // O texto nasce ao soltar o botão, para o clique não cair no que está embaixo.
        if (shape === "text") return;
        const first = shapeFor(start, start, false, shape, [start]);
        const id = begin(shape, first.box, first.rel);
        gesture.current = { id, start, points: [start], shape };
      }}
      onPointerMove={(e) => {
        const screen = { x: e.clientX, y: e.clientY };
        if (tool === "laser") {
          if (e.buttons & 1) laser.current.push({ ...local(e), t: performance.now() });
          return;
        }
        if (tool === "eraser") {
          if (erasing.current) erase(screen, false);
          return;
        }
        const g = gesture.current;
        if (!g) return;
        const cur = toFlow(screen);
        if (g.shape === "pen") g.points.push(cur);
        const s = shapeFor(g.start, cur, e.shiftKey, g.shape, g.points);
        update(g.id, s.box, s.rel);
      }}
      onPointerUp={(e) => {
        if (tool === "eraser") {
          if (erasing.current) erase({ x: e.clientX, y: e.clientY }, true);
          erasing.current = false;
          return;
        }
        if (tool === "laser" || tool === "bucket") return;
        const g = gesture.current;
        gesture.current = null;
        if (!g) {
          if (tool === "text") {
            e.preventDefault();
            const at = toFlow({ x: e.clientX, y: e.clientY });
            finish(begin("text", { x: at.x, y: at.y - 18, width: 220, height: 44 }), true);
          }
          return;
        }
        if (tool === "shape") return settleShape(g.id, g.points);
        const cur = toFlow({ x: e.clientX, y: e.clientY });
        const moved = Math.hypot(cur.x - g.start.x, cur.y - g.start.y);
        finish(g.id, g.shape === "pen" ? g.points.length > 1 : moved >= 4);
      }}
    >
      {tool === "laser" && trail.length > 1 && (
        <svg className="laser-trail" width="100%" height="100%">
          {trail.slice(1).map((p, i) => {
            const prev = trail[i];
            const life = 1 - (now - p.t) / LASER_MS;
            return <line key={`${p.t}-${i}`} x1={prev.x} y1={prev.y} x2={p.x} y2={p.y} style={{ opacity: Math.max(0, life), strokeWidth: 2 + 4 * Math.max(0, life) }} />;
          })}
        </svg>
      )}
    </div>
  );
}
