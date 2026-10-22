import { useEffect, useState } from "react";
import type { AttentionInfo } from "../shared/types";

/** Terminais que precisam do usuário (vem do processo principal). */
let latest: Record<string, AttentionInfo> = {};
const listeners = new Set<() => void>();

const set = (all: Record<string, AttentionInfo>) => {
  latest = all;
  listeners.forEach((l) => l());
};
void window.o.attention.get().then(set);
window.o.attention.onChanged(set);

export function useAttentionAll(): Record<string, AttentionInfo> {
  const [all, setAll] = useState(latest);
  useEffect(() => {
    const update = () => setAll(latest);
    listeners.add(update);
    update();
    return () => void listeners.delete(update);
  }, []);
  return all;
}

export function useAttention(id: string): AttentionInfo | undefined {
  return useAttentionAll()[id];
}

/** O mais antigo primeiro: quem espera há mais tempo é atendido antes. */
export function attentionQueue(all: Record<string, AttentionInfo>): [string, AttentionInfo][] {
  return Object.entries(all).sort((a, b) => a[1].since - b[1].since);
}

// ---- Ir até um terminal (pode estar em outra galáxia ou universo) ----

let pendingFocus: string | null = null;
const focusListeners = new Set<(id: string) => void>();

/** Pede para o canvas enquadrar e focar o terminal assim que ele estiver na tela. */
export function requestFocus(id: string): void {
  pendingFocus = id;
  focusListeners.forEach((l) => l(id));
}

/** O canvas chama ao montar e escuta pedidos novos. Devolve o pedido pendente, se houver. */
export function onFocusRequest(listener: (id: string) => void): { pending: string | null; off: () => void } {
  focusListeners.add(listener);
  return { pending: pendingFocus, off: () => void focusListeners.delete(listener) };
}

export function focusHandled(id: string): void {
  if (pendingFocus === id) pendingFocus = null;
}

/** Desenha o selo da barra de tarefas (círculo vermelho com o número). */
export function badgeImage(count: number): string {
  if (!count) return "";
  const size = 32;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e5484d";
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.font = `bold ${count > 9 ? 17 : 21}px "Segoe UI", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(count > 99 ? "99+" : String(count), size / 2, size / 2 + 1);
  return c.toDataURL("image/png");
}
