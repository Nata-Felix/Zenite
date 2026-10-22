import { isDrawing, nodeKind, nodeTitle, type ElementKind } from "../shared/types";
import type { Item, Neighborhood } from "./controlServer";
import type { WorkspaceStore } from "./workspaceStore";

/**
 * Lê no canvas salvo quem é o terminal, o que está ligado a ele e o resto do canvas.
 * Ligações valem nos dois sentidos e só contam as diretas.
 */
export function neighborhoodFromStore(store: WorkspaceStore, terminalId: string, isSun: (id: string, canvasId: string) => boolean = () => false): Neighborhood | null {
  for (const place of store.places()) {
    const canvas = store.loadCanvas(place.canvasId);
    const me = canvas?.nodes.find((n) => n.id === terminalId);
    if (!canvas || !me) continue;
    const linkedIds = new Set<string>();
    for (const e of canvas.edges) {
      if (e.source === terminalId) linkedIds.add(e.target);
      if (e.target === terminalId) linkedIds.add(e.source);
    }
    linkedIds.delete(terminalId);
    const toItem = (n: (typeof canvas.nodes)[number]): Item => ({
      id: n.id,
      title: nodeTitle(n),
      kind: nodeKind(n) as ElementKind,
      ...(n.element?.file ? { file: n.element.file } : {}),
      ...(n.element?.url ? { url: n.element.url } : {}),
      ...(n.element?.path ? { path: n.element.path } : {}),
      ...(isSun(n.id, place.canvasId) ? { sun: true } : {}),
    });
    // Desenhos são decoração do usuário: não existem para os agentes.
    const nodes = canvas.nodes.filter((n) => !isDrawing(n));
    const others = nodes.filter((n) => n.id !== terminalId && !linkedIds.has(n.id));
    // O Sol também alcança o que está nos outros universos da galáxia (quem ele recrutou lá).
    if (isSun(me.id, place.canvasId)) {
      for (const other of store.places()) {
        if (other.canvasId === place.canvasId || other.workspace.id !== place.workspace.id) continue;
        others.push(...(store.loadCanvas(other.canvasId)?.nodes ?? []).filter((n) => !isDrawing(n)));
      }
    }
    return {
      me: { id: me.id, title: nodeTitle(me), ...(isSun(me.id, place.canvasId) ? { sun: true } : {}) },
      place: {
        galaxy: place.workspace.name,
        universe: place.universe?.name ?? null,
        branch: place.universe?.branch || null,
        dir: place.universe?.path ?? place.workspace.dir,
      },
      linked: nodes.filter((n) => linkedIds.has(n.id)).map(toItem),
      others: others.map(toItem),
    };
  }
  return null;
}
