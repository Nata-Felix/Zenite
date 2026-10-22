import { useEffect, useState } from "react";
import { readPref, writePref } from "./prefs";
import { accentTextColor, normalizeAccentHex } from "./accentColor";

/** Cor de destaque do app. Cada uma tem uma versão para o tema claro e outra para o escuro. */
export const ACCENTS: { value: string; label: string; swatch: string }[] = [
  { value: "indigo", label: "Índigo", swatch: "#6b7cf0" },
  { value: "blue", label: "Azul", swatch: "#2f86e6" },
  { value: "green", label: "Verde", swatch: "#1fa36f" },
  { value: "orange", label: "Laranja", swatch: "#e0742a" },
  { value: "pink", label: "Rosa", swatch: "#d63f7a" },
  { value: "purple", label: "Roxo", swatch: "#9d5ce6" },
];

const KEY = "accent";
const EVENT = "zenite:accent";

export function accent(): string {
  const a = readPref(KEY, "indigo");
  return ACCENTS.some((x) => x.value === a) ? a : normalizeAccentHex(a) ?? "indigo";
}

export function customAccent(): string {
  return normalizeAccentHex(readPref("customAccent", "")) ?? "#8ea2ff";
}

function apply(): void {
  const root = document.documentElement, value = accent(), custom = normalizeAccentHex(value);
  root.dataset.accent = custom ? "custom" : value;
  if (custom) {
    root.style.setProperty("--custom-accent", custom);
    root.style.setProperty("--custom-on-accent", accentTextColor(custom));
  } else {
    root.style.removeProperty("--custom-accent");
    root.style.removeProperty("--custom-on-accent");
  }
}

export function setAccent(value: string): void {
  const custom = normalizeAccentHex(value);
  if (!custom && !ACCENTS.some((a) => a.value === value)) return;
  if (custom) writePref("customAccent", custom);
  writePref(KEY, custom ?? value);
  apply();
  window.dispatchEvent(new Event(EVENT));
}

export function useAccent(): string {
  const [a, setA] = useState(accent);
  useEffect(() => {
    const on = () => setA(accent());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return a;
}

apply();
