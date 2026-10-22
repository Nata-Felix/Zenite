import type { DrawShape, DrawSpec } from "../../shared/types";

/**
 * Ferramentas da barra de desenho. Além das formas: "hand" move o canvas, "eraser" apaga desenhos,
 * "laser" aponta sem deixar rastro, "bucket" pinta uma forma e "shape" vira forma o que for rabiscado.
 */
export type Tool = "select" | DrawShape | "hand" | "eraser" | "laser" | "bucket" | "shape";

/** Ferramentas que criam desenho (mostram o painel de estilo enquanto ativas). */
export const DRAWING_TOOLS: Tool[] = ["rectangle", "ellipse", "diamond", "line", "arrow", "pen", "text", "frame", "shape", "bucket"];

/** Cores do traço. "auto" acompanha o tema (escuro no claro, claro no escuro). */
export const STROKE_COLORS = ["auto", "#e03131", "#f08c00", "#2f9e44", "#1971c2", "#9c36b5", "#c2255c", "#868e96"];
/** Fundos suaves que funcionam nos dois temas. */
export const FILL_COLORS = ["transparent", "#ffc9c9", "#ffec99", "#b2f2bb", "#a5d8ff", "#d0bfff", "#fcc2d7", "#dee2e6"];

export const STROKE_WIDTHS = [
  { value: 1, label: "Fina" },
  { value: 2, label: "Média" },
  { value: 4, label: "Grossa" },
];

export const FONT_SIZES = [
  { value: 16, label: "P" },
  { value: 24, label: "M" },
  { value: 36, label: "G" },
  { value: 56, label: "XG" },
];

export const FONTS: { value: NonNullable<DrawSpec["font"]>; label: string; family: string }[] = [
  { value: "hand", label: "Manuscrita", family: '"Caveat", "Segoe Print", cursive' },
  { value: "sans", label: "Normal", family: "var(--ui-font)" },
  { value: "serif", label: "Serifa", family: 'Georgia, "Times New Roman", serif' },
  { value: "mono", label: "Código", family: "var(--mono)" },
  { value: "comic", label: "Comic Sans", family: '"Comic Sans MS", "Comic Neue", "Chalkboard SE", cursive' },
];

export function fontFamily(font: DrawSpec["font"]): string {
  return (FONTS.find((f) => f.value === font) ?? FONTS[0]).family;
}

export function cssColor(color: string): string {
  return color === "auto" ? "var(--text)" : color;
}

/** Estilo usado pelos próximos desenhos (o usuário muda pelo painel). */
export type DrawStyle = Omit<DrawSpec, "shape" | "seed" | "points" | "text">;

export const DEFAULT_STYLE: DrawStyle = {
  stroke: "auto",
  fill: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  font: "hand",
  fontSize: 24,
  textAlign: "left",
};

/** Cores do balde: os fundos suaves e as cores fortes do traço. */
export const BUCKET_COLORS = [...FILL_COLORS.slice(1), ...STROKE_COLORS.slice(1)];

/** Tinta do balde: a cor escolhida no painel dele (sem escolha, azul claro). Pinta sempre sólido. */
export function bucketColor(style: DrawStyle): string {
  return style.fill !== "transparent" ? style.fill : "#a5d8ff";
}

/** Formas que têm área (as outras só têm traço). */
export const AREA_SHAPES: DrawShape[] = ["rectangle", "ellipse", "diamond"];

/** Formas com área ficam atrás dos elementos; traços e textos, na frente. */
export function defaultZ(shape: DrawShape): number {
  // Quadro fica atrás de tudo: o que está dentro dele aparece por cima.
  if (shape === "frame") return -20;
  return AREA_SHAPES.includes(shape) ? -10 : 10;
}

/** Só o traço é clicável (fundo transparente não "pega" o mouse). */
export function isHollow(spec: DrawSpec): boolean {
  if (spec.shape === "text") return false;
  if (spec.shape === "frame") return true;
  return !AREA_SHAPES.includes(spec.shape) || spec.fill === "transparent";
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Atalhos de uma tecla (como no Excalidraw: letra ou número). Q (trava) e Shift+X ficam no Canvas. */
export const TOOL_KEYS: Record<string, Tool> = {
  h: "hand", v: "select", "1": "select", r: "rectangle", "2": "rectangle", d: "diamond", "3": "diamond", o: "ellipse", "4": "ellipse",
  a: "arrow", "5": "arrow", l: "line", "6": "line", p: "pen", "7": "pen", t: "text", "8": "text", e: "eraser", "0": "eraser",
  f: "frame", k: "laser", b: "bucket",
};
