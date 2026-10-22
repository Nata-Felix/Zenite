import { memo, useMemo } from "react";
import rough from "roughjs";
import { getStroke } from "perfect-freehand";
import type { DrawSpec } from "../../shared/types";
import { cssColor } from "./style";

const generator = rough.generator();
// Cores-sentinela: o roughjs só aceita cor concreta; trocamos pelas cores do tema ao pintar.
const STROKE = "#000001";
const FILL = "#000002";

interface Props {
  spec: DrawSpec;
  width: number;
  height: number;
}

interface PathInfo {
  d: string;
  kind: "stroke" | "fill" | "solid";
}

/** Contorno de um traço de lápis (perfect-freehand) como caminho SVG. */
function penPath(points: [number, number][], size: number): string {
  const outline = getStroke(points, { size, thinning: 0.55, smoothing: 0.5, streamline: 0.5, simulatePressure: true });
  if (!outline.length) return "";
  const [first, ...rest] = outline;
  return `M${first[0].toFixed(1)} ${first[1].toFixed(1)} ${rest.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} Z`;
}

function buildPaths(spec: DrawSpec, w: number, h: number): PathInfo[] {
  const sw = spec.strokeWidth;
  const pts = (spec.points ?? []).map(([x, y]) => [x * w, y * h] as [number, number]);
  if (spec.shape === "pen") return pts.length ? [{ d: penPath(pts, sw * 2.4), kind: "solid" }] : [];

  const options = {
    seed: spec.seed,
    roughness: spec.roughness,
    bowing: spec.roughness ? 1 : 0,
    stroke: STROKE,
    strokeWidth: sw,
    fill: spec.fill !== "transparent" ? FILL : undefined,
    fillStyle: spec.fillStyle,
    fillWeight: sw / 2,
    hachureGap: 4 + sw * 2,
    disableMultiStroke: spec.roughness === 0,
    preserveVertices: spec.roughness === 0,
  };
  const i = sw; // margem para o traço não ser cortado na borda
  const drawables = [];
  switch (spec.shape) {
    case "rectangle":
      drawables.push(generator.rectangle(i, i, Math.max(1, w - 2 * i), Math.max(1, h - 2 * i), options));
      break;
    case "frame":
      // Quadro: borda limpa (sem rabisco) e sem fundo; o nome fica no DrawNode, acima da borda.
      drawables.push(generator.rectangle(i, i, Math.max(1, w - 2 * i), Math.max(1, h - 2 * i), { ...options, roughness: 0, bowing: 0, fill: undefined, disableMultiStroke: true, preserveVertices: true }));
      break;
    case "ellipse":
      drawables.push(generator.ellipse(w / 2, h / 2, Math.max(1, w - 2 * i), Math.max(1, h - 2 * i), options));
      break;
    case "diamond":
      drawables.push(
        generator.polygon(
          [
            [w / 2, i],
            [w - i, h / 2],
            [w / 2, h - i],
            [i, h / 2],
          ],
          options,
        ),
      );
      break;
    case "line":
    case "arrow":
      if (pts.length >= 2) {
        drawables.push(generator.linearPath(pts, { ...options, fill: undefined }));
        if (spec.shape === "arrow") {
          const [x1, y1] = pts[pts.length - 2];
          const [x2, y2] = pts[pts.length - 1];
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const len = 12 + sw * 3;
          for (const side of [-1, 1]) {
            const a = angle + Math.PI - side * 0.45;
            drawables.push(generator.line(x2, y2, x2 + Math.cos(a) * len, y2 + Math.sin(a) * len, { ...options, fill: undefined }));
          }
        }
      }
      break;
    default:
      break;
  }
  return drawables.flatMap((d) =>
    generator.toPaths(d).map((p) => ({ d: p.d, kind: p.stroke === FILL ? ("fill" as const) : p.fill === FILL ? ("solid" as const) : ("stroke" as const) })),
  );
}

/** Pinta a forma no estilo Excalidraw, com cores do tema. */
function ShapeSvgImpl({ spec, width, height }: Props) {
  const paths = useMemo(() => buildPaths(spec, width, height), [spec, width, height]);
  const stroke = cssColor(spec.stroke);
  const fill = spec.fill === "transparent" ? "none" : spec.fill;
  const sw = spec.strokeWidth;
  const dash = spec.strokeStyle === "dashed" ? `${8 + sw} ${6 + sw}` : spec.strokeStyle === "dotted" ? `0.1 ${4 + sw * 2}` : undefined;
  return (
    <svg className="draw-svg" width={width} height={height} style={{ opacity: spec.opacity / 100 }}>
      {paths.map((p, i) => {
        const color = p.kind === "stroke" ? stroke : p.kind === "fill" ? fill : spec.shape === "pen" ? stroke : fill;
        return p.kind === "stroke" || p.kind === "fill" ? (
          <g key={i}>
            {/* Faixa invisível mais larga: deixa fácil clicar num traço fino. */}
            {p.kind === "stroke" && <path d={p.d} className="draw-hit" style={{ strokeWidth: spec.strokeWidth + 12 }} />}
            <path d={p.d} style={{ stroke: color, strokeWidth: p.kind === "fill" ? sw / 2 : sw, strokeDasharray: p.kind === "stroke" ? dash : undefined, fill: "none" }} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ) : (
          <path key={i} d={p.d} className="draw-solid" style={{ fill: color, stroke: "none" }} />
        );
      })}
    </svg>
  );
}

export const ShapeSvg = memo(ShapeSvgImpl);
