/**
 * Fluxo nas linhas do canvas. Quando um agente manda algo (pedido, resposta, leitura, escrita), a
 * linha entre os dois ganha um "beat" de pontinhos na direção do envio por alguns segundos. Depois,
 * a linha guarda o último sentido usado: o pulso normal continua correndo para aquele lado.
 */
export const BEAT_MS = 2600;

interface Flow {
  from: string;
  to: string;
  until: number;
}

const flows = new Map<string, Flow>();
const listeners = new Set<() => void>();
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const notify = () => listeners.forEach((l) => l());

export function recordFlow(from: string, to: string, now = Date.now()): void {
  if (!from || !to || from === to) return;
  flows.set(pairKey(from, to), { from, to, until: now + BEAT_MS });
  notify();
  // Fim do beat: a linha volta ao pulso normal, no mesmo sentido.
  setTimeout(notify, BEAT_MS + 30);
}

export function subscribeFlow(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Estado da linha source→target: "reverse" quando o último fluxo foi de target para source;
 * "beat" enquanto um envio acabou de acontecer. Devolve texto para o useSyncExternalStore comparar.
 */
export function flowState(source: string, target: string, now = Date.now()): "" | "forward" | "reverse" | "forward beat" | "reverse beat" {
  const f = flows.get(pairKey(source, target));
  if (!f) return "";
  const dir = f.from === source ? "forward" : "reverse";
  return now < f.until ? `${dir} beat` : dir;
}

if (typeof window !== "undefined" && window.o?.canvas?.onFlow) window.o.canvas.onFlow((from, to) => recordFlow(from, to));
