import { useId, useMemo } from "react";
import { Background, useViewport } from "@xyflow/react";
import { BG_FLOW, BG_GAP, type CanvasBg } from "../canvasBackground";

// Deterministic per tile: stars never jump when panning, zooming or reopening.
export function starNoise(index: number, salt = 0): number {
  let n = Math.imul(index + 1, 374761393) ^ Math.imul(salt + 1, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function SpaceMarks({ bg, gap }: { bg: CanvasBg; gap: number }) {
  const tile = gap * 8;
  const r = bg.size;
  const dots = "var(--dots)";
  const cross = "var(--grid-cross)";
  const line = "var(--grid-line)";
  const marks = [];
  if (bg.pattern === "navigation") {
    for (let i = 0; i < 8; i++) {
      const p = i * gap;
      marks.push(<path key={`grid${i}`} d={`M ${p} 0 V ${tile} M 0 ${p} H ${tile}`} stroke={line} strokeWidth={0.7 * r} />);
      for (let j = 0; j < 8; j++) {
        const q = j * gap;
        marks.push(<path key={`tick${i}-${j}`} d={`M ${p - 2 * r} ${q} h ${4 * r} M ${p} ${q - 2 * r} v ${4 * r}`} stroke={cross} strokeWidth={0.7 * r} />);
      }
    }
    marks.push(<path key="major" d={`M 0 ${tile} V 0 H ${tile} M ${tile / 2} 0 V ${tile} M 0 ${tile / 2} H ${tile}`} stroke={cross} strokeWidth={r} opacity={0.35 + bg.detail * 0.65} />);
  } else {
    for (let i = 0; i < 64; i++) {
      let x = (i % 8 + 0.5) * gap;
      let y = (Math.floor(i / 8) + 0.5) * gap;
      if (bg.pattern === "starfield") {
        if (starNoise(i, 3) > 0.15 + bg.detail * 0.85) continue;
        x += (starNoise(i, 1) - 0.5) * gap * 0.85;
        y += (starNoise(i, 2) - 0.5) * gap * 0.85;
        marks.push(<circle key={i} cx={x} cy={y} r={(0.45 + starNoise(i, 4) * 0.85) * r} fill={dots} opacity={0.45 + starNoise(i, 5) * 0.55} />);
      } else if (bg.pattern === "coordinates") {
        const a = 4 * r, b = 1.5 * r;
        marks.push(<path key={i} d={`M ${x-a} ${y} h ${a-b} M ${x+b} ${y} h ${a-b} M ${x} ${y-a} v ${a-b} M ${x} ${y+b} v ${a-b}`} stroke={cross} strokeWidth={0.8 * r} />);
      } else if (starNoise(i, 6) < bg.detail) {
        const a = 3 * r, b = 0.65 * r;
        marks.push(<path key={i} d={`M ${x} ${y-a} L ${x+b} ${y-b} L ${x+a} ${y} L ${x+b} ${y+b} L ${x} ${y+a} L ${x-b} ${y+b} L ${x-a} ${y} L ${x-b} ${y-b} Z`} fill={dots} />);
      } else marks.push(<circle key={i} cx={x} cy={y} r={0.6 * r} fill={dots} />);
    }
  }
  return <g fill="none" opacity={bg.intensity}>{marks}</g>;
}

/** Shared by the picker and the infinite canvas; coordinates are in world units. */
export function SpaceBackgroundSvg({ bg, preview = false, x = 0, y = 0, zoom = 1 }: { bg: CanvasBg; preview?: boolean; x?: number; y?: number; zoom?: number }) {
  const id = useId();
  const gap = BG_GAP[bg.spacing] * (preview ? 0.6 : 1);
  const marks = useMemo(() => <SpaceMarks bg={bg} gap={gap} />, [bg, gap]);
  return <svg className={preview ? "bg-preview" : "react-flow__background canvas-space-bg"} aria-hidden="true">
    <defs><pattern id={id} width={gap * 8} height={gap * 8} patternUnits="userSpaceOnUse" patternTransform={`translate(${x % (gap * 8 * zoom)} ${y % (gap * 8 * zoom)}) scale(${zoom})`}>{marks}</pattern></defs>
    <rect width="100%" height="100%" fill="var(--bg)" />
    <rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>;
}

export function CanvasBackground({ bg }: { bg: CanvasBg }) {
  const { x, y, zoom } = useViewport();
  if (bg.pattern === "none") return null;
  if (bg.pattern === "dots" || bg.pattern === "grid" || bg.pattern === "cross") {
    const flow = BG_FLOW[bg.pattern];
    return <Background variant={flow.variant} gap={BG_GAP[bg.spacing]} size={flow.size * bg.size} lineWidth={(flow.lineWidth ?? 1) * bg.size} className={`canvas-bg bg-${bg.pattern}`} style={{ opacity: bg.intensity }} />;
  }
  return <SpaceBackgroundSvg bg={bg} x={x} y={y} zoom={zoom} />;
}
