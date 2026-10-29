import type { ChatTheme } from "../shared/types";

/**
 * Temas da aba Chat: planetas do sistema solar e estrelas. Cada um define as cores do chat e
 * como desenhar o astro (ThemeOrb) e a cena do topo (.chat-backdrop):
 *  - limb: a borda de um astro grande entrando pelo canto (Sol, planetas rochosos, Júpiter);
 *  - horizon: um horizonte de luz no topo (Terra, Netuno);
 *  - orbit: linhas de órbita/anel cruzando o canto (Saturno, Urano);
 *  - streak: um risco de luz de estrela (Sirius, Vega, Betelgeuse).
 */
export interface ThemeSpec {
  value: ChatTheme;
  label: string;
  group: "Sistema solar" | "Estrelas";
  accent: string;
  /** Texto sobre o botão de enviar (fundo = accent). */
  onAccent: string;
  bg: string;
  header: string;
  bubble: string;
  scene: "limb" | "horizon" | "orbit" | "streak";
  /** Desenho do astro: estrela com raios, estrela cintilante ou planeta (cores da esfera). */
  orb:
    | { type: "sun"; core: [string, string, string]; ray: string }
    | { type: "star"; core: string; glow: string }
    | { type: "planet"; colors: [string, string, string]; bands?: string; craters?: boolean; land?: string; ring?: string };
}

export const THEMES: ThemeSpec[] = [
  { value: "sol", label: "Sol", group: "Sistema solar", accent: "#f5a524", onAccent: "#1a1004", bg: "#120d08", header: "#1c130a", bubble: "rgba(120, 72, 22, 0.42)", scene: "limb", orb: { type: "sun", core: ["#fff4c4", "#ffc24a", "#e8761c"], ray: "#ffb53d" } },
  { value: "mercurio", label: "Mercúrio", group: "Sistema solar", accent: "#d9dde3", onAccent: "#15171b", bg: "#0e0f12", header: "#17181c", bubble: "rgba(120, 124, 132, 0.28)", scene: "limb", orb: { type: "planet", colors: ["#d7d7d7", "#8c8c8c", "#3c3c3c"], craters: true } },
  { value: "venus", label: "Vênus", group: "Sistema solar", accent: "#f2cf8c", onAccent: "#1d1405", bg: "#110e09", header: "#1b160d", bubble: "rgba(150, 118, 60, 0.36)", scene: "limb", orb: { type: "planet", colors: ["#fff1d0", "#e2bf82", "#8f6a35"], bands: "rgba(255, 245, 220, 0.35)" } },
  { value: "terra", label: "Terra", group: "Sistema solar", accent: "#3b8bff", onAccent: "#ffffff", bg: "#06101f", header: "#0b1a33", bubble: "rgba(24, 70, 140, 0.45)", scene: "horizon", orb: { type: "planet", colors: ["#7fc4ff", "#2470d6", "#0b2d6b"], land: "#4caf6a" } },
  { value: "marte", label: "Marte", group: "Sistema solar", accent: "#ff7a59", onAccent: "#1d0a05", bg: "#130a08", header: "#20100b", bubble: "rgba(140, 52, 30, 0.42)", scene: "limb", orb: { type: "planet", colors: ["#ffb08a", "#d0532c", "#6b2010"], craters: true } },
  { value: "jupiter", label: "Júpiter", group: "Sistema solar", accent: "#f0b24a", onAccent: "#1d1204", bg: "#120d08", header: "#1d150c", bubble: "rgba(140, 96, 40, 0.42)", scene: "limb", orb: { type: "planet", colors: ["#fbe3c0", "#d39a5d", "#7a4a22"], bands: "rgba(150, 80, 30, 0.55)" } },
  { value: "saturno", label: "Saturno", group: "Sistema solar", accent: "#b77cff", onAccent: "#ffffff", bg: "#0f0b19", header: "#1a1229", bubble: "rgba(74, 44, 118, 0.5)", scene: "orbit", orb: { type: "planet", colors: ["#e9d4ff", "#a66cf0", "#5a2aa8"], ring: "#d9c0ff" } },
  { value: "urano", label: "Urano", group: "Sistema solar", accent: "#3fd6d0", onAccent: "#04201f", bg: "#061214", header: "#0a1e21", bubble: "rgba(24, 110, 112, 0.4)", scene: "orbit", orb: { type: "planet", colors: ["#c9fbf6", "#55c7c4", "#1c6b72"] } },
  { value: "netuno", label: "Netuno", group: "Sistema solar", accent: "#3b8bff", onAccent: "#ffffff", bg: "#070d1c", header: "#0c1530", bubble: "rgba(24, 52, 110, 0.5)", scene: "horizon", orb: { type: "planet", colors: ["#8cc2ff", "#2f6fe0", "#0d2a7a"], bands: "rgba(207, 228, 255, 0.35)" } },
  { value: "sirius", label: "Sirius", group: "Estrelas", accent: "#e8f1ff", onAccent: "#0b1220", bg: "#0a0d16", header: "#111726", bubble: "rgba(60, 80, 130, 0.42)", scene: "streak", orb: { type: "star", core: "#ffffff", glow: "#8fb8ff" } },
  { value: "vega", label: "Vega", group: "Estrelas", accent: "#a78bfa", onAccent: "#ffffff", bg: "#0c0b18", header: "#151329", bubble: "rgba(78, 62, 150, 0.45)", scene: "streak", orb: { type: "star", core: "#f4f0ff", glow: "#8b7cff" } },
  { value: "betelgeuse", label: "Betelgeuse", group: "Estrelas", accent: "#ff5a2c", onAccent: "#ffffff", bg: "#140806", header: "#22100b", bubble: "rgba(150, 40, 20, 0.45)", scene: "streak", orb: { type: "sun", core: ["#fff0c0", "#ff8a3c", "#c42a10"], ray: "#ff6a30" } },
];

export const themeSpec = (value?: string): ThemeSpec => THEMES.find((t) => t.value === value) ?? THEMES[0];

/** Variáveis CSS do tema, aplicadas no card (cabeçalho) e no chat. */
export function themeVars(theme: ChatTheme): React.CSSProperties {
  const t = themeSpec(theme);
  return {
    "--chat-accent": t.accent,
    "--chat-on-accent": t.onAccent,
    "--chat-accent-soft": `color-mix(in srgb, ${t.accent} 16%, transparent)`,
    "--chat-bg": t.bg,
    "--chat-header": t.header,
    "--chat-bubble": t.bubble,
    "--chat-bubble-line": `color-mix(in srgb, ${t.accent} 38%, transparent)`,
    "--tab-accent": t.accent,
  } as React.CSSProperties;
}
