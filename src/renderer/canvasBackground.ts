import { useEffect, useState } from "react";
import { BackgroundVariant } from "@xyflow/react";
import { readPref, writePref } from "./prefs";

export type SpacePattern = "stars" | "navigation" | "coordinates" | "starfield";
export type BgPattern = "dots" | "grid" | "cross" | "none" | SpacePattern;
export type BgSpacing = "small" | "medium" | "large";
export interface CanvasBg {
  pattern: BgPattern;
  spacing: BgSpacing;
  size: number;
  intensity: number;
  detail: number;
}

export const DEFAULT_BG: CanvasBg = { pattern: "dots", spacing: "medium", size: 1, intensity: 1, detail: 0.35 };

export const BG_PATTERNS: { value: BgPattern; label: string }[] = [
  { value: "dots", label: "Pontos" },
  { value: "grid", label: "Grade" },
  { value: "cross", label: "Cruzes" },
  { value: "none", label: "Liso" },
  { value: "stars", label: "Estrelas em malha" },
  { value: "navigation", label: "Navegação espacial" },
  { value: "coordinates", label: "Coordenadas estelares" },
  { value: "starfield", label: "Campo estelar" },
];

export const BG_SPACINGS: { value: BgSpacing; label: string }[] = [
  { value: "small", label: "Pequeno" },
  { value: "medium", label: "Médio" },
  { value: "large", label: "Grande" },
];

/** Distância entre pontos/linhas do fundo, em pixels do canvas. */
export const BG_GAP: Record<BgSpacing, number> = { small: 14, medium: 22, large: 36 };

/** Como o React Flow desenha cada padrão (variante, tamanho do ponto/linha). */
export const BG_FLOW: Record<"dots" | "grid" | "cross", { variant: BackgroundVariant; size: number; lineWidth?: number }> = {
  dots: { variant: BackgroundVariant.Dots, size: 1.2 },
  grid: { variant: BackgroundVariant.Lines, size: 1, lineWidth: 1 },
  cross: { variant: BackgroundVariant.Cross, size: 6, lineWidth: 1 },
};

const KEY = "canvasBg";
const EVENT = "zenite:canvas-bg";

export function normalizeCanvasBg(value: unknown): CanvasBg {
  const saved = value && typeof value === "object" ? value as Partial<CanvasBg> : {};
  const number = (v: unknown, fallback: number, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    // Padrão que saiu do app (Constelações, Foto) volta ao padrão.
    pattern: BG_PATTERNS.some((p) => p.value === saved.pattern) ? saved.pattern! : DEFAULT_BG.pattern,
    spacing: BG_SPACINGS.some((s) => s.value === saved.spacing) ? saved.spacing! : DEFAULT_BG.spacing,
    size: number(saved.size, DEFAULT_BG.size, 0.5, 2),
    intensity: number(saved.intensity, DEFAULT_BG.intensity, 0.2, 1),
    detail: number(saved.detail, DEFAULT_BG.detail, 0, 1),
  };
}

function read(): CanvasBg {
  return normalizeCanvasBg(readPref<unknown>(KEY, DEFAULT_BG));
}

/** Fundo escolhido; muda na hora em todo o app quando alguém chama setCanvasBg. */
export function useCanvasBg(): CanvasBg {
  const [bg, setBg] = useState(read);
  useEffect(() => {
    const on = () => setBg(read());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return bg;
}

export function setCanvasBg(bg: CanvasBg): void {
  writePref(KEY, normalizeCanvasBg(bg));
  window.dispatchEvent(new Event(EVENT));
}
