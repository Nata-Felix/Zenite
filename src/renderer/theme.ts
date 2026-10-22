import { useEffect, useState } from "react";
import type { ITheme } from "@xterm/xterm";
import { readPref, writePref } from "./prefs";

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const media = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<(t: Theme) => void>();
let pref: ThemePref = readPref<ThemePref>("theme", "system");

export function resolvedTheme(): Theme {
  return pref === "system" ? (media.matches ? "dark" : "light") : pref;
}

function apply(): void {
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  listeners.forEach((l) => l(t));
}

export function setThemePref(next: ThemePref): void {
  pref = next;
  writePref("theme", next);
  apply();
}

export function themePref(): ThemePref {
  return pref;
}

export function onThemeChange(listener: (t: Theme) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

media.addEventListener("change", () => pref === "system" && apply());
apply();

/** Tema resolvido (claro/escuro) e a preferência, atualizados quando mudam. */
export function useTheme(): { theme: Theme; pref: ThemePref; setPref(p: ThemePref): void } {
  const [theme, setTheme] = useState(resolvedTheme);
  const [current, setCurrent] = useState(pref);
  useEffect(
    () =>
      onThemeChange((t) => {
        setTheme(t);
        setCurrent(pref);
      }),
    [],
  );
  return { theme, pref: current, setPref: setThemePref };
}

/** Cores dos terminais em cada tema. */
export const TERMINAL_THEMES: Record<Theme, ITheme> = {
  dark: {
    background: "#0c0d10",
    foreground: "#d4d8e0",
    cursor: "#e6e9ef",
    cursorAccent: "#0c0d10",
    selectionBackground: "#3a4560",
    black: "#1b1d23",
    brightBlack: "#5c6370",
  },
  light: {
    background: "#fcfcfd",
    foreground: "#1f2430",
    cursor: "#1f2430",
    cursorAccent: "#fcfcfd",
    selectionBackground: "#c9d2ff",
    black: "#2e3440",
    red: "#c4362f",
    green: "#2f8f46",
    yellow: "#966700",
    blue: "#2f5fd0",
    magenta: "#9b3fb5",
    cyan: "#0e7b8a",
    white: "#6b7385",
    brightBlack: "#5c6370",
    brightRed: "#d9473f",
    brightGreen: "#38a352",
    brightYellow: "#a87700",
    brightBlue: "#3b6fe0",
    brightMagenta: "#ad4ec7",
    brightCyan: "#12899a",
    brightWhite: "#8a92a3",
  },
};
