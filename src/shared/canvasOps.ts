import { arrowBindings, followArrows, frameMembers, type Piece } from "./attach";
import { connectionError } from "./connections";
import { FLOW_LABEL, FLOW_TYPE_LIST, newFlowSpec, outputsOf } from "./flows";
import {
  KIND_LABEL,
  nodeKind,
  nodeTitle,
  type CanvasEdge,
  type CanvasNode,
  type CanvasState,
  type DrawShape,
  type DrawSpec,
  type ElementSpec,
  type FlowSpec,
  type FlowType,
  type NodeKind,
  type TerminalSpec,
} from "./types";

/**
 * Mudanças no canvas pedidas pelo Sol (zn canvas/node/draw/flow/recruit...). O mesmo código roda
 * na interface (canvas aberto: entra no Ctrl+Z) e no processo principal (canvas fechado: direto no
 * arquivo). Um lote é tudo ou nada: se uma operação falha, nenhuma vale.
 */

type XY = { x: number; y: number };

/** Tamanho de cada tipo de nó ao nascer. */
export const NODE_SIZES: Record<NodeKind, { width: number; height: number }> = {
  terminal: { width: 640, height: 400 },
  note: { width: 360, height: 300 },
  image: { width: 420, height: 320 },
  video: { width: 520, height: 340 },
  web: { width: 900, height: 600 },
  file: { width: 380, height: 300 },
  folder: { width: 420, height: 420 },
  table: { width: 520, height: 260 },
  flow: { width: 280, height: 132 },
  skill: { width: 400, height: 400 },
  service: { width: 420, height: 520 },
  blackhole: { width: 200, height: 210 },
  draw: { width: 100, height: 60 },
};

export const NODE_KINDS = Object.keys(NODE_SIZES) as NodeKind[];
export const DRAW_SHAPES: DrawShape[] = ["rectangle", "ellipse", "diamond", "line", "arrow", "pen", "text", "frame"];

/** Estilo de um desenho novo quando o Sol não diz (o mesmo padrão da barra de desenho). */
export const DRAW_DEFAULTS: Omit<DrawSpec, "shape" | "seed"> = {
  stroke: "auto",
  fill: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  font: "hand",
  fontSize: 24,
  textAlign: "left",
};

export type Side = "right" | "left" | "below" | "above";

/** Onde pôr (ou para onde mover): ponto exato, ou ao lado de outro nó sem cobrir ninguém. */
interface Placement {
  at?: XY;
  near?: string;
  side?: Side;
  width?: number;
  height?: number;
}

export type CanvasOp =
  | ({
      op: "create";
      kind: NodeKind;
      title?: string;
      element?: Partial<ElementSpec>;
      terminal?: Partial<TerminalSpec>;
      draw?: Partial<DrawSpec>;
      /** Seta/linha: de um nó a outro (as pontas ficam presas a eles). */
      from?: string;
      to?: string;
      /** Lápis, linha e seta: pontos absolutos do canvas. */
      points?: [number, number][];
      /** Quadro: envolve estes nós. */
      around?: string[];
      /** Já nasce ligado a estes nós. */
      links?: string[];
      /** Nota e tabela: conteúdo inicial (quem grava os arquivos é o processo principal). */
      content?: string;
    } & Placement)
  | {
      op: "update";
      target: string;
      title?: string;
      x?: number;
      y?: number;
      dx?: number;
      dy?: number;
      near?: string;
      side?: Side;
      width?: number;
      height?: number;
      z?: number | "front" | "back";
      element?: Partial<ElementSpec>;
      flow?: Partial<FlowSpec>;
      terminal?: Partial<TerminalSpec>;
      draw?: Partial<DrawSpec>;
    }
  | { op: "delete"; target: string; /** Só apaga se for deste tipo (zn dismiss: só terminal). */ kind?: NodeKind }
  | { op: "connect"; from: string; to: string; output?: string }
  | { op: "disconnect"; from: string; to: string };

export interface OpResult {
  op: CanvasOp["op"];
  id: string;
  title: string;
  kind: NodeKind;
}

export interface OpsOutcome {
  state: CanvasState;
  results: OpResult[];
  /** Nós apagados: quem aplica encerra os terminais e manda os arquivos para a lixeira. */
  removed: CanvasNode[];
}

export class CanvasOpError extends Error {
  constructor(
    message: string,
    /** Qual operação do lote falhou (começa em 0). */
    public index: number,
  ) {
    super(message);
  }
}

export interface OpsContext {
  /** Quem pediu (o Sol): ponto de partida para "ao lado de" e nunca pode ser apagado. */
  callerId?: string;
  newId(): string;
  seed(): number;
}

const GAP = 80;

/** Nome que aparece para o Sol: título do elemento ou texto do desenho. */
export function labelOf(n: CanvasNode): string {
  if (n.kind === "draw") return n.draw?.text?.trim() || `${n.draw?.shape ?? "desenho"}`;
  return nodeTitle(n);
}

const pieceOf = (n: CanvasNode): Piece => ({ id: n.id, x: n.x, y: n.y, w: n.width, h: n.height, ...(n.draw ? { draw: n.draw } : {}) });

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, pad = 24): boolean {
  return a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;
}

export function applyCanvasOps(state: CanvasState, ops: CanvasOp[], ctx: OpsContext): OpsOutcome {
  let nodes = state.nodes.map((n) => ({ ...n }));
  let edges = state.edges.map((e) => ({ ...e }));
  const results: OpResult[] = [];
  const removed: CanvasNode[] = [];
  let index = 0;
  const fail = (message: string): never => {
    throw new CanvasOpError(message, index);
  };

  const find = (raw: unknown, what = "elemento"): CanvasNode => {
    const name = typeof raw === "string" ? raw.trim().replace(/^#/, "") : "";
    if (!name) fail(`Informe o nome do ${what}.`);
    const byId = nodes.filter((n) => n.id === name || (name.length >= 6 && n.id.startsWith(name)));
    if (byId.length === 1) return byId[0];
    const lower = name.toLowerCase();
    const byName = nodes.filter((n) => labelOf(n).toLowerCase() === lower);
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) fail(`Há ${byName.length} itens chamados "${name}". Use o id: ${byName.map((n) => `#${n.id.slice(0, 8)}`).join(", ")}.`);
    return fail(`"${name}" não existe neste canvas. Veja os nomes com: zn canvas`);
  };

  const uniqueTitle = (wanted: string, exceptId?: string): string => {
    const base = wanted.trim() || "Sem nome";
    const taken = new Set(nodes.filter((n) => n.id !== exceptId && n.kind !== "draw").map((n) => nodeTitle(n).toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
  };

  const box = (n: CanvasNode) => ({ x: n.x, y: n.y, width: n.width, height: n.height });

  /** Primeiro lugar livre ao lado do nó de referência (ou do Sol), andando até não cobrir ninguém. */
  const place = (size: { width: number; height: number }, p: Placement, selfId?: string): XY => {
    if (p.at) return { x: p.at.x, y: p.at.y };
    const anchor = p.near ? find(p.near) : nodes.find((n) => n.id === ctx.callerId);
    const side = p.side ?? "right";
    const solid = nodes.filter((n) => n.kind !== "draw" && n.id !== selfId && n.id !== anchor?.id);
    if (!anchor) {
      const right = solid.length ? Math.max(...solid.map((n) => n.x + n.width)) + GAP : 0;
      return { x: right, y: solid.length ? Math.min(...solid.map((n) => n.y)) : 0 };
    }
    const spot =
      side === "right" ? { x: anchor.x + anchor.width + GAP, y: anchor.y }
      : side === "left" ? { x: anchor.x - size.width - GAP, y: anchor.y }
      : side === "below" ? { x: anchor.x, y: anchor.y + anchor.height + GAP }
      : { x: anchor.x, y: anchor.y - size.height - GAP };
    for (let i = 0; i < 200; i++) {
      const hit = solid.find((n) => overlaps({ ...spot, ...size }, box(n)));
      if (!hit) break;
      if (side === "right" || side === "left") spot.y = hit.y + hit.height + 40;
      else spot.x = hit.x + hit.width + 40;
    }
    return spot;
  };

  const topZ = () => Math.max(0, ...nodes.filter((n) => n.kind !== "draw").map((n) => n.z ?? 0)) + 1;

  /** Pontos absolutos → caixa do desenho + pontos relativos a ela (0–1), como a barra de desenho guarda. */
  const fromPoints = (pts: [number, number][]) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(1, Math.max(...xs) - x);
    const height = Math.max(1, Math.max(...ys) - y);
    return { x, y, width, height, points: pts.map(([px, py]) => [(px - x) / width, (py - y) / height] as [number, number]) };
  };

  /** Ponto da borda de `b` na direção de `toward` (a seta para um pouco antes da borda). */
  const edgePoint = (b: CanvasNode, toward: XY, gap = 10): XY => {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const dx = toward.x - cx;
    const dy = toward.y - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const t = Math.min(dx ? b.width / 2 / Math.abs(dx) : Infinity, dy ? b.height / 2 / Math.abs(dy) : Infinity);
    const len = Math.hypot(dx, dy);
    return { x: cx + dx * t + (dx / len) * gap, y: cy + dy * t + (dy / len) * gap };
  };

  const removeNode = (n: CanvasNode) => {
    nodes = nodes.filter((m) => m.id !== n.id);
    edges = edges.filter((e) => e.source !== n.id && e.target !== n.id);
    removed.push(n);
  };

  const connect = (from: CanvasNode, to: CanvasNode, output?: string) => {
    if (from.kind === "draw" || to.kind === "draw") fail("Desenhos não se ligam; use uma seta: zn draw arrow --from A --to B.");
    const outputs = from.element?.flow ? outputsOf(from.element.flow) : [];
    let handle: string | undefined;
    if (outputs.length) {
      if (!output) fail(`"${labelOf(from)}" tem várias saídas; diga qual com --output: ${outputs.map((o) => `${o.id} (${o.label})`).join(", ")}.`);
      const hit = outputs.find((o) => o.id === output || o.label.toLowerCase() === output!.toLowerCase());
      if (!hit) fail(`"${labelOf(from)}" não tem a saída "${output}". Saídas: ${outputs.map((o) => `${o.id} (${o.label})`).join(", ")}.`);
      handle = hit!.id;
    } else if (output) fail(`"${labelOf(from)}" tem uma saída só; tire o --output.`);
    const err = connectionError(from.id, to.id, nodes.map((n) => ({ id: n.id, type: nodeKind(n) })), edges, handle);
    if (err) fail(`${labelOf(from)} → ${labelOf(to)}: ${err}`);
    edges.push({ id: handle ? `${from.id}:${handle}->${to.id}` : `${from.id}->${to.id}`, source: from.id, target: to.id, ...(handle ? { sourceHandle: handle } : {}) });
  };

  const flowSpec = (raw: Partial<FlowSpec> | undefined, base?: FlowSpec): FlowSpec => {
    const type = (raw?.type ?? base?.type) as FlowType | undefined;
    if (!type || !FLOW_TYPE_LIST.includes(type)) fail(`Tipo de astro inválido: ${type ?? "(nenhum)"}. Tipos: ${FLOW_TYPE_LIST.join(", ")}.`);
    const start = base && base.type === type ? base : newFlowSpec(type!);
    return { ...start, ...raw, type: type! };
  };

  const result = (op: CanvasOp["op"], n: CanvasNode) => results.push({ op, id: n.id, title: labelOf(n), kind: nodeKind(n) });

  for (const op of ops) {
    switch (op.op) {
      case "create": {
        const kind = op.kind;
        if (!NODE_KINDS.includes(kind)) fail(`Tipo desconhecido: ${String(kind)}. Tipos: ${NODE_KINDS.join(", ")}.`);
        const id = ctx.newId();
        let node: CanvasNode;
        if (kind === "draw") {
          const shape = op.draw?.shape;
          if (!shape || !DRAW_SHAPES.includes(shape)) fail(`Forma desconhecida: ${shape ?? "(nenhuma)"}. Formas: ${DRAW_SHAPES.join(", ")}.`);
          const draw: DrawSpec = { ...DRAW_DEFAULTS, ...op.draw, shape: shape!, seed: ctx.seed() };
          let frame: { x: number; y: number; width: number; height: number };
          if ((shape === "arrow" || shape === "line") && (op.from || op.to)) {
            if (!op.from || !op.to) fail("Seta presa precisa de --from e --to.");
            const a = find(op.from);
            const b = find(op.to);
            const ca = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
            const cb = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
            const p1 = edgePoint(a, cb);
            const p2 = edgePoint(b, ca);
            const r = fromPoints([[p1.x, p1.y], [p2.x, p2.y]]);
            frame = r;
            draw.points = r.points;
            if (op.title) draw.text = op.title;
          } else if (shape === "pen" || shape === "line" || shape === "arrow") {
            if (!op.points || op.points.length < 2) fail("Lápis, linha e seta precisam de --points (dois ou mais) ou de --from e --to.");
            const r = fromPoints(op.points!);
            frame = r;
            draw.points = r.points;
          } else if (shape === "frame" && op.around?.length) {
            const inside = op.around.map((t) => find(t));
            const pad = 40;
            const x = Math.min(...inside.map((n) => n.x)) - pad;
            const y = Math.min(...inside.map((n) => n.y)) - pad;
            frame = { x, y, width: Math.max(...inside.map((n) => n.x + n.width)) + pad - x, height: Math.max(...inside.map((n) => n.y + n.height)) + pad - y };
            draw.text = op.title ?? draw.text ?? "Quadro";
            draw.fill = op.draw?.fill ?? "transparent";
          } else {
            if (shape === "text") draw.text = op.draw?.text ?? op.title ?? "";
            if (shape === "frame") {
              draw.text = op.title ?? draw.text ?? "Quadro";
              draw.fill = op.draw?.fill ?? "transparent";
            }
            const fontSize = draw.fontSize ?? 24;
            const lines = (draw.text ?? "").split("\n");
            const size =
              shape === "text"
                ? { width: op.width ?? Math.max(40, Math.max(...lines.map((l) => l.length)) * fontSize * 0.6 + 8), height: op.height ?? lines.length * fontSize * 1.35 + 4 }
                : { width: op.width ?? (shape === "frame" ? 600 : 200), height: op.height ?? (shape === "frame" ? 400 : 120) };
            frame = { ...place(size, op), ...size };
          }
          if (shape === "text" && !draw.text?.trim()) fail("Texto vazio: diga o que escrever.");
          if (draw.points === undefined) delete draw.points;
          node = { id, kind: "draw", ...frame!, draw, z: shape === "frame" ? -20 : ["rectangle", "ellipse", "diamond"].includes(shape!) ? -10 : 10 };
        } else if (kind === "terminal") {
          const t = op.terminal ?? {};
          const size = { width: op.width ?? NODE_SIZES.terminal.width, height: op.height ?? NODE_SIZES.terminal.height };
          const terminal: TerminalSpec = {
            id,
            title: uniqueTitle(op.title ?? t.title ?? "Terminal"),
            command: t.command ?? "",
            cwd: t.cwd ?? "",
            ...(t.account ? { account: t.account } : {}),
            ...(t.accountName ? { accountName: t.accountName } : {}),
            ...(t.provider ? { provider: t.provider } : {}),
            ...(t.appearance ? { appearance: t.appearance } : {}),
          };
          node = { id, kind, ...place(size, op), ...size, terminal, z: topZ() };
        } else {
          const extra = { ...op.element };
          delete extra.id;
          delete extra.kind;
          let title = op.title ?? extra.title;
          if (kind === "flow") {
            extra.flow = flowSpec(extra.flow);
            title ??= FLOW_LABEL[extra.flow.type];
          }
          if ((kind === "file" || kind === "folder") && !extra.path) fail(`${KIND_LABEL[kind]} precisa do caminho no disco.`);
          if ((kind === "image" || kind === "video") && !extra.file) fail(`${KIND_LABEL[kind]} precisa de um arquivo.`);
          const element: ElementSpec = { ...extra, id, kind, title: uniqueTitle(title ?? KIND_LABEL[kind]) };
          const size = { width: op.width ?? NODE_SIZES[kind].width, height: op.height ?? NODE_SIZES[kind].height };
          node = { id, kind, ...place(size, op), ...size, element, z: topZ() };
        }
        nodes.push(node);
        for (const other of op.links ?? []) {
          const peer = find(other);
          // Astro com várias saídas não sabe por qual sair: a linha chega nele.
          if (node.element?.flow && outputsOf(node.element.flow).length) connect(peer, node);
          else connect(node, peer);
        }
        result("create", node);
        break;
      }

      case "update": {
        const found = find(op.target);
        const n = nodes.find((m) => m.id === found.id)!;
        if (op.title !== undefined) {
          if (n.kind === "draw") n.draw = { ...n.draw!, text: op.title };
          else if (n.terminal) n.terminal = { ...n.terminal, title: uniqueTitle(op.title, n.id) };
          else if (n.element) n.element = { ...n.element, title: uniqueTitle(op.title, n.id) };
        }
        const from = { x: n.x, y: n.y };
        if (op.width !== undefined) n.width = Math.max(1, op.width);
        if (op.height !== undefined) n.height = Math.max(1, op.height);
        if (op.x !== undefined) n.x = op.x;
        if (op.y !== undefined) n.y = op.y;
        if (op.dx) n.x += op.dx;
        if (op.dy) n.y += op.dy;
        if (op.near) Object.assign(n, place({ width: n.width, height: n.height }, { near: op.near, side: op.side }, n.id));
        const dx = n.x - from.x;
        const dy = n.y - from.y;
        if (dx || dy) {
          // Como ao arrastar: o quadro leva o que está dentro, e as setas presas acompanham.
          const pieces = nodes.map((m) => pieceOf(m.id === n.id ? { ...m, ...from } : m));
          const moving = new Set([n.id, ...(n.draw?.shape === "frame" ? frameMembers(pieces).get(n.id) ?? [] : [])]);
          for (const m of nodes) if (m.id !== n.id && moving.has(m.id)) Object.assign(m, { x: m.x + dx, y: m.y + dy });
          const arrows = followArrows(pieces, arrowBindings(pieces), new Map([...moving].map((id) => [id, { x: dx, y: dy }])), moving);
          for (const m of nodes) {
            const r = arrows.get(m.id);
            if (r) Object.assign(m, { x: r.x, y: r.y, width: r.w, height: r.h, draw: { ...m.draw!, points: r.points } });
          }
        }
        if (op.z !== undefined) {
          const zs = nodes.map((m) => m.z ?? 0);
          n.z = op.z === "front" ? Math.max(...zs) + 1 : op.z === "back" ? Math.min(...zs) - 1 : op.z;
        }
        if (op.element || op.flow) {
          if (!n.element) fail(`"${labelOf(n)}" é ${n.kind === "draw" ? "desenho" : "terminal"}; use as opções dele.`);
          const changes = { ...op.element };
          delete changes.id;
          delete changes.kind;
          delete changes.title;
          n.element = { ...n.element!, ...changes };
          if (op.flow) {
            if (n.kind !== "flow") fail(`"${labelOf(n)}" não é astro.`);
            n.element.flow = flowSpec(op.flow, n.element.flow);
            // Saídas que deixaram de existir (rota apagada, tipo trocado) levam as linhas delas.
            const outs = new Set(outputsOf(n.element.flow).map((o) => o.id));
            edges = edges.filter((e) => e.source !== n.id || !e.sourceHandle || outs.has(e.sourceHandle));
          }
        }
        if (op.terminal) {
          if (!n.terminal) fail(`"${labelOf(n)}" não é terminal.`);
          const t = { ...op.terminal };
          delete t.id;
          delete t.sun;
          delete t.title;
          n.terminal = { ...n.terminal!, ...t, ...(t.appearance ? { appearance: { ...n.terminal!.appearance, ...t.appearance } } : {}) };
        }
        if (op.draw) {
          if (!n.draw) fail(`"${labelOf(n)}" não é desenho.`);
          const d = { ...op.draw };
          delete d.seed;
          n.draw = { ...n.draw!, ...d };
        }
        result("update", n);
        break;
      }

      case "delete": {
        const n = find(op.target);
        if (n.id === ctx.callerId) fail("O Sol não pode se apagar.");
        if (op.kind && nodeKind(n) !== op.kind) fail(`"${labelOf(n)}" é ${n.kind === "draw" ? "desenho" : KIND_LABEL[nodeKind(n) as keyof typeof KIND_LABEL]}, não ${KIND_LABEL[op.kind as keyof typeof KIND_LABEL] ?? op.kind}.`);
        removeNode(n);
        result("delete", n);
        break;
      }

      case "connect": {
        const from = find(op.from);
        const to = find(op.to);
        connect(from, to, op.output);
        result("connect", from);
        break;
      }

      case "disconnect": {
        const a = find(op.from);
        const b = find(op.to);
        const before = edges.length;
        edges = edges.filter((e) => !((e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id)));
        if (edges.length === before) fail(`"${labelOf(a)}" e "${labelOf(b)}" não estão ligados.`);
        result("disconnect", a);
        break;
      }

      default:
        fail(`Operação desconhecida: ${(op as { op?: string }).op ?? "(nenhuma)"}.`);
    }
    index++;
  }

  return { state: { ...state, nodes, edges }, results, removed };
}

/** O canvas como o Sol lê: cada nó com tipo, nome, id curto, posição, tamanho e ligações. */
export function describeCanvas(state: CanvasState): { nodes: object[]; edges: object[] } {
  const label = new Map(state.nodes.map((n) => [n.id, labelOf(n)]));
  return {
    nodes: state.nodes.map((n) => ({
      id: n.id,
      kind: nodeKind(n),
      title: labelOf(n),
      x: Math.round(n.x),
      y: Math.round(n.y),
      width: Math.round(n.width),
      height: Math.round(n.height),
      ...(n.z !== undefined ? { z: n.z } : {}),
      ...(n.terminal?.sun ? { sun: true } : {}),
      ...(n.element?.flow ? { flow: n.element.flow.type } : {}),
      ...(n.draw ? { shape: n.draw.shape } : {}),
    })),
    edges: state.edges.map((e: CanvasEdge) => ({ from: label.get(e.source) ?? e.source, to: label.get(e.target) ?? e.target, ...(e.sourceHandle ? { output: e.sourceHandle } : {}) })),
  };
}

/** Pedido do processo principal para a interface aplicar um lote no canvas aberto. */
export interface CanvasOpsRequest {
  requestId: number;
  canvasId: string;
  callerId?: string;
  ops: CanvasOp[];
}

export type CanvasOpsReply = { ok: true; state: CanvasState; results: OpResult[] } | { ok: false; error: string; index?: number };

/** Aplica o lote e devolve a resposta pronta (erro vira resposta, não exceção). */
export function tryCanvasOps(state: CanvasState, ops: CanvasOp[], ctx: OpsContext): { reply: CanvasOpsReply; removed: CanvasNode[] } {
  try {
    const out = applyCanvasOps(state, ops, ctx);
    return { reply: { ok: true, state: out.state, results: out.results }, removed: out.removed };
  } catch (err) {
    const index = err instanceof CanvasOpError ? err.index : undefined;
    return { reply: { ok: false, error: (err as Error).message, ...(index !== undefined ? { index } : {}) }, removed: [] };
  }
}

/** Pedidos do Sol que só a tela sabe cumprir (organizar, enquadrar, print...). */
export type CanvasUiAction = "arrange" | "fit" | "summary" | "background" | "restart" | "shot";
export interface CanvasUiRequest {
  requestId: number;
  canvasId: string;
  action: CanvasUiAction;
  target?: string;
  value?: string;
}
export type CanvasUiReply = { ok: true; info?: string } | { ok: false; error: string };
