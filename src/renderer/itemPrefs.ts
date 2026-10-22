import { useEffect, useState } from "react";
import type { NodeKind } from "../shared/types";
import { readPref, writePref } from "./prefs";

export type ItemSize = "small" | "medium" | "large";

/** Tela dos cartões: ajustada ao cartão, ou emulando um monitor de 720p/1080p (ScreenFrame). */
export type ScreenMode = "fit" | "720p" | "1080p";
export const SCREEN_WIDTH: Record<ScreenMode, number | undefined> = { fit: undefined, "720p": 1280, "1080p": 1920 };

/** Padrões dos itens novos: tamanho de cada tipo e como a nota nasce. */
export interface ItemPrefs {
  sizes: Partial<Record<NodeKind, ItemSize>>;
  noteColor: string;
  /** Nota nova já mostra o Markdown formatado. */
  noteFormatted: boolean;
  /** Tamanho da tela em que sites, terminais e demais cartões são desenhados. */
  screen: ScreenMode;
}

export const DEFAULT_ITEMS: ItemPrefs = { sizes: {}, noteColor: "yellow", noteFormatted: false, screen: "fit" };

export const SIZE_SCALE: Record<ItemSize, number> = { small: 0.75, medium: 1, large: 1.35 };

/** Cores do papel da nota (a cor real vem do tema: funciona no claro e no escuro). */
export const NOTE_COLORS: { value: string; label: string; css: string }[] = [
  { value: "yellow", label: "Amarelo", css: "var(--c-note)" },
  { value: "blue", label: "Azul", css: "var(--c-web)" },
  { value: "green", label: "Verde", css: "var(--c-table)" },
  { value: "pink", label: "Rosa", css: "var(--c-image)" },
  { value: "purple", label: "Roxo", css: "var(--c-video)" },
  { value: "gray", label: "Cinza", css: "var(--c-file)" },
];

export function noteColorCss(value?: string): string {
  return (NOTE_COLORS.find((c) => c.value === value) ?? NOTE_COLORS[0]).css;
}

const KEY = "items";
const EVENT = "zenite:items";

export function itemPrefs(): ItemPrefs {
  return { ...DEFAULT_ITEMS, ...readPref<Partial<ItemPrefs>>(KEY, {}) };
}

export function setItemPrefs(patch: Partial<ItemPrefs>): void {
  writePref(KEY, { ...itemPrefs(), ...patch });
  window.dispatchEvent(new Event(EVENT));
}

export function useItemPrefs(): ItemPrefs {
  const [p, setP] = useState(itemPrefs);
  useEffect(() => {
    const on = () => setP(itemPrefs());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return p;
}
