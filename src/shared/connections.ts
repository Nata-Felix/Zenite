type Node = { id: string; type?: string };
type Edge = { source: string; target: string };

/** As ligações dão acesso nos dois sentidos; uma constelação lista cada vizinho uma vez. */
export function connectedNodes<T extends Node>(id: string, nodes: T[], edges: Edge[]): T[] {
  const ids = new Set(edges.flatMap((e) => (e.source === id ? [e.target] : e.target === id ? [e.source] : [])));
  return nodes.filter((n) => n.id !== id && n.type !== "draw" && ids.has(n.id));
}

export function connectionError(source: string, target: string, nodes: Node[], edges: (Edge & { sourceHandle?: string | null })[], sourceHandle?: string | null): string | null {
  if (source === target) return "Escolha outro elemento para conectar.";
  if (nodes.some(n => (n.id === source || n.id === target) && n.type === "blackhole")) return "Abra o Buraco negro e conecte o elemento de dentro. O agrupador preserva as ligações existentes.";
  if (![source, target].every((id) => nodes.some((n) => n.id === id && n.type !== "draw"))) return "Escolha um terminal ou elemento do canvas.";
  // Saída com nome (Volta da Órbita, A/B do Gêmeos...): pode voltar a quem já está ligado.
  if (edges.some((e) => e.source === source && e.target === target && (e.sourceHandle ?? null) === (sourceHandle ?? null))) return "Estes elementos já estão conectados.";
  if (!sourceHandle && edges.some((e) => (e.source === source && e.target === target) || (e.source === target && e.target === source && !e.sourceHandle))) return "Estes elementos já estão conectados.";
  return null;
}
