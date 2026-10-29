import { isDrawing, nodeKind, nodeTitle, type CanvasState, type ElementKind } from "../shared/types";
import type { TowerMenu } from "./controlServer";
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
      ...(n.element?.flow?.type === "tower" ? { tower: towerMenu(n, canvas) } : {}),
      ...(viaTower(n.id, canvas).length ? { viaTower: viaTower(n.id, canvas) } : {}),
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

const AGENT_NAME: Record<string, string> = { codex: "Codex", claude: "Claude Code", antigravity: "Antigravity" };

/** Torre em palavras, para o zn list: cada rota, quando vale e quem faz o trabalho. */
export function towerMenu(node: CanvasState["nodes"][number], canvas: CanvasState): TowerMenu {
  const spec = node.element!.flow!;
  const executes = spec.decide === "execute";
  const linkedTo = (handle: string) => canvas.edges.filter((e) => e.source === node.id && e.sourceHandle === handle).map((e) => canvas.nodes.find((n) => n.id === e.target)).filter((n) => !!n && !isDrawing(n)).map((n) => `"${nodeTitle(n!)}" [${nodeKind(n!)}]`);
  const executor = (handle: string, run?: NonNullable<typeof spec.routes>[number]["run"]) => {
    if (executes && run?.agent) {
      const fb = run.fallback?.agent ? ` (sem limite: ${[AGENT_NAME[run.fallback.agent] ?? run.fallback.agent, run.fallback.model].filter(Boolean).join(" · ")})` : "";
      return `${[AGENT_NAME[run.agent] ?? run.agent, run.model || "modelo padrão", run.effort].filter(Boolean).join(" · ")}${fb}`;
    }
    const targets = linkedTo(handle);
    if (targets.length) return targets.join(", ");
    return executes ? (handle === "else" ? "volta para você: pergunte ao usuário" : "nada ligado") : "nada ligado";
  };
  return {
    executes,
    exclusive: executes && !!spec.exclusive,
    routes: [
      ...(spec.routes ?? []).filter((r) => r.label.trim()).map((r) => ({ label: r.label, ...(r.criteria?.trim() ? { criteria: r.criteria.trim() } : {}), executor: executor(r.id, r.run) })),
      { label: "Outros", executor: executor("else") },
    ],
  };
}

/** Torres (e rotas) que entregam trabalho a este nó: ele só deve ser usado por elas. */
export function viaTower(id: string, canvas: CanvasState): { tower: string; route: string }[] {
  return canvas.edges.flatMap((e) => {
    if (e.target !== id || !e.sourceHandle || e.sourceHandle === "else") return [];
    const tower = canvas.nodes.find((n) => n.id === e.source);
    const route = tower?.element?.flow?.type === "tower" ? tower.element.flow.routes?.find((r) => r.id === e.sourceHandle) : undefined;
    return route ? [{ tower: nodeTitle(tower!), route: route.label }] : [];
  });
}
