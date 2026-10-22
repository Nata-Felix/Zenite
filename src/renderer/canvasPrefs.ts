import { useEffect, useState } from "react";
import { readPref, writePref } from "./prefs";
import { normalizeAnimation, normalizeEffectOptions, type ConnectionAnimation, type EffectOptions } from "./connectionEffects";

/** Como o canvas se comporta e desenha as ligações. Vale na hora para todas as galáxias. */
export interface CanvasPrefs {
  edge: "bezier" | "smooth" | "step" | "straight";
  pulse: boolean;
  connectionAnimation: ConnectionAnimation;
  connectionEffect: EffectOptions;
  /** Oculta só o traço de base quando um efeito galáctico está escolhido. */
  hideConnectionLine: boolean;
  /**
   * Como arrastar a tela. "space" (padrão): Espaço + arrastar (ou botão do meio), e arrastar com o
   * esquerdo no vazio seleciona vários. "left": o esquerdo no vazio arrasta a tela.
   */
  panButton: "space" | "left" | "middle" | "right";
  /** Rodinha: zoom (padrão) ou mover a tela (zoom com Ctrl + rodinha). */
  wheel: "zoom" | "pan";
  /** Terminal recebe o foco do teclado quando o mouse passa por cima. */
  focusOnHover: boolean;
  /** Ferramenta ao abrir o canvas: Mão (arrastar o vazio move a tela) ou Caixa de seleção. */
  startTool: "hand" | "select";
}

export const DEFAULT_CANVAS: CanvasPrefs = { edge: "bezier", pulse: true, connectionAnimation: "classic", connectionEffect: { color: "", activeSpeed: 1, idleSpeed: 1 }, hideConnectionLine: false, panButton: "space", wheel: "zoom", focusOnHover: false, startTool: "hand" };

const KEY = "canvas";
const EVENT = "zenite:canvas-prefs";

// v2: o padrão de arrastar a tela virou Espaço + arrastar. Preferências salvas antes guardavam
// "left" como valor padrão (o objeto inteiro é gravado), então passam para o novo padrão uma vez.
type Stored = Partial<CanvasPrefs> & { v?: number };

export function canvasPrefs(): CanvasPrefs {
  const stored = readPref<Stored>(KEY, {});
  const animation = { connectionAnimation: normalizeAnimation(stored.connectionAnimation), connectionEffect: normalizeEffectOptions(stored.connectionEffect), hideConnectionLine: stored.hideConnectionLine === true };
  if ((stored.v ?? 1) < 2) {
    const migrated: Stored = { ...stored, v: 2, ...(stored.panButton === "left" ? { panButton: "space" } : {}) };
    writePref(KEY, migrated);
    const { v: _v, ...prefs } = migrated;
    return { ...DEFAULT_CANVAS, ...prefs, ...animation };
  }
  const { v: _v, ...prefs } = stored;
  return { ...DEFAULT_CANVAS, ...prefs, ...animation };
}

export function setCanvasPrefs(patch: Partial<CanvasPrefs>): void {
  writePref(KEY, { ...canvasPrefs(), ...patch, v: 2 });
  window.dispatchEvent(new Event(EVENT));
}

export function useCanvasPrefs(): CanvasPrefs {
  const [p, setP] = useState(canvasPrefs);
  useEffect(() => {
    const on = () => setP(canvasPrefs());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return p;
}
