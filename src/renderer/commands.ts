import { useEffect, useRef } from "react";

/**
 * Comandos do app chamados de qualquer lugar (busca rápida, atalhos) e atendidos por quem
 * sabe fazê-los (canvas, barra lateral). Evita passar funções por vários componentes.
 */
export type Command =
  | "new-terminal"
  | `new-element:${string}`
  | `new-flow:${string}`
  | "open-settings"
  | "toggle-minimap"
  | "toggle-sidebar"
  | "fit-view"
  | "next-attention"
  | "fit-selection"
  | "grid-selection"
  | "auto-layout"
  | "auto-layout-all"
  | "auto-layout-selection"
  | "undo-layout"
  | "select-all"
  | "copy-selection"
  | "cut-selection"
  | "paste-selection"
  | "export-canvas"
  | "import-canvas"
  | "export-galaxy"
  | "import-galaxy"
  | "open-env"
  | "new-universe"
  | "toggle-zen"
  | "toggle-summary"
  | "open-palette"
  | `select-terminal:${number}`
  | "next-element"
  | "prev-element";

const EVENT = "zenite:command";

export function runCommand(command: Command): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: command }));
}

/** Atende comandos enquanto o componente está montado. */
export function useCommands(handler: (command: Command) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const on = (e: Event) => ref.current((e as CustomEvent<Command>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
}
