import { useEffect, useState } from "react";
import type { ITheme } from "@xterm/xterm";
import { readPref, writePref } from "./prefs";
import { resolvedTheme, TERMINAL_THEMES } from "./theme";
import type { TerminalAppearance } from "../shared/types";

/** Aparência dos terminais. Vale para todos, na hora. */
export interface TerminalPrefs {
  font: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: "block" | "bar" | "underline";
  cursorBlink: boolean;
  scrollback: number;
  /** "auto": o tema do próprio CLI (Claude Code, Antigravity); sem tema próprio, o claro/escuro do app. */
  colors: string;
}

export const DEFAULT_TERMINAL: TerminalPrefs = {
  font: "cascadia",
  fontSize: 13,
  lineHeight: 1.15,
  cursorStyle: "block",
  cursorBlink: true,
  scrollback: 5000,
  colors: "auto",
};

/** Fontes comuns no Windows; se faltar, cai na próxima da lista. */
export const TERMINAL_FONTS: { value: string; label: string; family: string }[] = [
  { value: "cascadia", label: "Cascadia Mono (padrão do Windows)", family: '"Cascadia Mono", "Cascadia Code", Consolas, "DejaVu Sans Mono", monospace' },
  { value: "cascadia-code", label: "Cascadia Code (com ligaduras)", family: '"Cascadia Code", "Cascadia Mono", Consolas, monospace' },
  { value: "consolas", label: "Consolas", family: 'Consolas, "Cascadia Mono", monospace' },
  { value: "jetbrains", label: "JetBrains Mono (se instalada)", family: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace' },
  { value: "fira", label: "Fira Code (se instalada)", family: '"Fira Code", "Cascadia Mono", Consolas, monospace' },
  { value: "courier", label: "Courier New", family: '"Courier New", Courier, monospace' },
];

const ansi = (c: string[]) => ({
  black: c[0],
  red: c[1],
  green: c[2],
  yellow: c[3],
  blue: c[4],
  magenta: c[5],
  cyan: c[6],
  white: c[7],
  brightBlack: c[8],
  brightRed: c[9],
  brightGreen: c[10],
  brightYellow: c[11],
  brightBlue: c[12],
  brightMagenta: c[13],
  brightCyan: c[14],
  brightWhite: c[15],
});

export const TERMINAL_COLOR_THEMES: { value: string; label: string; theme?: ITheme }[] = [
  { value: "auto", label: "Automático (segue o tema do CLI; sem tema, o do app)" },
  {
    value: "dracula",
    label: "Dracula",
    theme: {
      background: "#282a36",
      foreground: "#f8f8f2",
      cursor: "#f8f8f2",
      selectionBackground: "#44475a",
      ...ansi(["#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2", "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5", "#d6acff", "#ff92df", "#a4ffff", "#ffffff"]),
    },
  },
  {
    value: "one-dark",
    label: "One Dark",
    theme: {
      background: "#282c34",
      foreground: "#abb2bf",
      cursor: "#528bff",
      selectionBackground: "#3e4451",
      ...ansi(["#282c34", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#abb2bf", "#5c6370", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#ffffff"]),
    },
  },
  {
    value: "solarized-dark",
    label: "Solarized escuro",
    theme: {
      background: "#002b36",
      foreground: "#93a1a1",
      cursor: "#93a1a1",
      selectionBackground: "#073642",
      ...ansi(["#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5", "#586e75", "#cb4b16", "#859900", "#b58900", "#268bd2", "#6c71c4", "#2aa198", "#fdf6e3"]),
    },
  },
  {
    value: "solarized-light",
    label: "Solarized claro",
    theme: {
      background: "#fdf6e3",
      foreground: "#586e75",
      cursor: "#586e75",
      selectionBackground: "#eee8d5",
      ...ansi(["#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#93a1a1", "#586e75", "#cb4b16", "#859900", "#b58900", "#268bd2", "#6c71c4", "#2aa198", "#002b36"]),
    },
  },
  {
    value: "campbell",
    label: "Campbell (Windows Terminal)",
    theme: {
      background: "#0c0c0c",
      foreground: "#cccccc",
      cursor: "#ffffff",
      selectionBackground: "#3a3a3a",
      ...ansi(["#0c0c0c", "#c50f1f", "#13a10e", "#c19c00", "#0037da", "#881798", "#3a96dd", "#cccccc", "#767676", "#e74856", "#16c60c", "#f9f1a5", "#3b78ff", "#b4009e", "#61d6d6", "#f2f2f2"]),
    },
  },
];

const KEY = "terminal";
const EVENT = "zenite:terminal-prefs";

export function terminalPrefs(): TerminalPrefs {
  return { ...DEFAULT_TERMINAL, ...readPref<Partial<TerminalPrefs>>(KEY, {}) };
}

export function prefsForTerminal(global: TerminalPrefs, appearance?: TerminalAppearance): TerminalPrefs {
  return {
    ...global,
    font: appearance?.font ?? global.font,
    fontSize: appearance?.fontSize ?? global.fontSize,
    colors: appearance?.colors ?? global.colors,
  };
}

export function setTerminalPrefs(patch: Partial<TerminalPrefs>): void {
  writePref(KEY, { ...terminalPrefs(), ...patch });
  window.dispatchEvent(new Event(EVENT));
}

export function onTerminalPrefs(listener: (p: TerminalPrefs) => void): () => void {
  const on = () => listener(terminalPrefs());
  window.addEventListener(EVENT, on);
  return () => window.removeEventListener(EVENT, on);
}

export function useTerminalPrefs(): TerminalPrefs {
  const [p, setP] = useState(terminalPrefs);
  useEffect(() => onTerminalPrefs(setP), []);
  return p;
}

export function fontFamilyOf(p: TerminalPrefs): string {
  return (TERMINAL_FONTS.find((f) => f.value === p.font) ?? TERMINAL_FONTS[0]).family;
}

/**
 * Cores do terminal: o tema escolhido; em "auto", o tema do CLI (`cli`: "dark", "light" ou o nome de
 * um esquema, ex.: "solarized-dark"); sem tema do CLI, o do app (claro/escuro).
 */
export function colorsOf(p: TerminalPrefs, appTheme = resolvedTheme(), cli?: string | null): ITheme {
  const chosen = TERMINAL_COLOR_THEMES.find((t) => t.value === p.colors)?.theme;
  if (chosen) return chosen;
  if (cli) return TERMINAL_COLOR_THEMES.find((t) => t.value === cli)?.theme ?? TERMINAL_THEMES[cli.includes("light") ? "light" : "dark"];
  return TERMINAL_THEMES[appTheme];
}
