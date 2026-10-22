import type { CanvasNode } from "./types";

/** Um elemento pertence a um grupo por vez. Não permite grupos aninhados nem referências soltas. */
export function blackHoleOwners(nodes: CanvasNode[], collapsedOnly = false): Map<string, string> {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const owners = new Map<string, string>();
  for (const group of nodes) {
    if (group.kind !== "blackhole" || !group.element?.blackHole) continue;
    for (const id of Array.isArray(group.element.blackHole.members) ? group.element.blackHole.members : []) {
      const member = byId.get(id);
      if (!member || member.kind === "draw" || member.kind === "blackhole" || owners.has(id)) continue;
      owners.set(id, group.id);
    }
  }
  if (collapsedOnly) for (const [id, group] of owners) if (byId.get(group)?.element?.blackHole?.collapsed === false) owners.delete(id);
  return owners;
}

type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; hidden?: boolean; data?: Record<string, unknown> };

/** Só a representação muda. IDs, rotas e extremos reais continuam no estado salvo e no motor. */
export function projectBlackHoleEdges<T extends EdgeLike>(nodes: CanvasNode[], edges: T[]): T[] {
  const owners = blackHoleOwners(nodes);
  const collapsed = blackHoleOwners(nodes, true);
  return edges.flatMap(edge => {
    const sourceGroup = owners.get(edge.source), targetGroup = owners.get(edge.target);
    if (sourceGroup && sourceGroup === targetGroup) return [{ ...edge, hidden: collapsed.has(edge.source) || edge.hidden }];
    const source = sourceGroup ?? edge.source;
    const target = targetGroup ?? edge.target;
    if (source === edge.source && target === edge.target) return edge;
    const data = { ...edge.data, originalSource: edge.source, originalTarget: edge.target, logicalEdgeId: edge.id };
    const segments: T[] = [{ ...edge, source, target, sourceHandle: source === edge.source ? edge.sourceHandle : null,
      targetHandle: target === edge.target ? edge.targetHandle : null, hidden: source === target,
      data }];
    if (sourceGroup && !collapsed.has(edge.source)) segments.push({ ...edge, id: `${edge.id}::black-hole-source`, source: edge.source, target: sourceGroup, targetHandle: null, data });
    if (targetGroup && !collapsed.has(edge.target)) segments.push({ ...edge, id: `${edge.id}::black-hole-target`, source: targetGroup, target: edge.target, sourceHandle: null, data });
    return segments;
  });
}

/** Copiar/recortar o agrupador leva seu conteúdo, sem depender da seleção invisível. */
export function withBlackHoleContents(nodes: CanvasNode[], selected: Iterable<string>): Set<string> {
  const ids = new Set(selected);
  const owners = blackHoleOwners(nodes);
  for (const [member, group] of owners) if (ids.has(group)) ids.add(member);
  return ids;
}

/** Após clonar/importar, as referências passam a apontar somente para as novas identidades. */
export function remapBlackHoleMembers(nodes: CanvasNode[], ids: Map<string, string>): void {
  for (const node of nodes) if (node.element?.blackHole) {
    const members = Array.isArray(node.element.blackHole.members) ? node.element.blackHole.members : [];
    node.element.blackHole = { ...node.element.blackHole, members: members.flatMap(id => ids.has(id) ? [ids.get(id)!] : []) };
  }
}
