import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  MiniMap,
  Panel,
  ViewportPortal,
  ReactFlow,
  SelectionMode,
  ConnectionMode,
  type Connection,
  type FinalConnectionState,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import {
  nodeKind,
  type AccountMeta,
  type CanvasNode,
  type CanvasState,
  type CanvasClipboardState,
  type DrawShape,
  type DrawSpec,
  type ElementSpec,
  type FlowType,
  type NodeKind,
  type UniverseMeta,
  type WorkspaceIndex,
  type WorkspaceMeta,
  storedEdge,
} from "../shared/types";
import type { AgentPreset } from "./agents";
import { Dock } from "./components/Dock";
import { EmptyState } from "./components/EmptyState";
import { ExportCanvasDialog } from "./components/ExportCanvasDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MediaNode } from "./components/MediaNode";
import { NewTerminalDialog, type NewTerminalInput } from "./components/NewTerminalDialog";
import { NoteNode } from "./components/NoteNode";
import { IntegrationNode } from "./components/IntegrationNode";
import { PulseEdge, setCanvasMoving } from "./components/PulseEdge";
import { setInteracting } from "./interaction";
import { UniverseBar } from "./components/UniverseBar";
import { TerminalNode } from "./components/TerminalNode";
import { WebNode } from "./components/WebNode";
import { FileNode } from "./components/FileNode";
import { FolderNode } from "./components/FolderNode";
import { TableNode } from "./components/TableNode";
import { BlackHoleNode } from "./components/BlackHoleNode";
import { BlackHoleDialog } from "./components/BlackHoleDialog";
import { blackHoleOwners, projectBlackHoleEdges } from "../shared/blackHoles";
import { FlowNode, flowType, newFlowSpec, outputsOf } from "./components/FlowNode";
import { lastSegment } from "./files/fileIcon";
import { DrawNode } from "./draw/DrawNode";
import { DrawOverlay, OVERLAY_TOOLS, type Box } from "./draw/DrawOverlay";
import { DrawPanel } from "./draw/DrawPanel";
import { DrawToolbar } from "./draw/DrawToolbar";
import { AgentRail } from "./components/AgentRail";
import { CollapseButton, CollapsedTab, useCollapsed } from "./components/Collapsible";
import { AREA_SHAPES, bucketColor, DEFAULT_STYLE, DRAWING_TOOLS, TOOL_KEYS, defaultZ, isHollow, newSeed, type DrawStyle, type Tool } from "./draw/style";
import { ELEMENT_STYLE, INNER_PATH_TYPE, type CanvasFlowNode, type NodeActions } from "./nodes";
import { readPref, writePref } from "./prefs";
import { useTheme } from "./theme";
import { BG_PATTERNS, setCanvasBg, useCanvasBg } from "./canvasBackground";
import { CanvasBackground } from "./components/CanvasBackground";
import { onFocusRequest, requestFocus } from "./attentionBus";
import { useCommands } from "./commands";
import { canvasPrefs, useCanvasPrefs } from "./canvasPrefs";
import { itemPrefs, SIZE_SCALE } from "./itemPrefs";
import { align, distribute, grid, type Align, type Box as LayoutBox } from "./layout";
import { SelectionBar } from "./components/SelectionBar";
import { RemoveDialog } from "./components/RemoveDialog";
import { UnlinkDialog } from "./components/UnlinkDialog";
import { NodeOptions } from "./components/NodeOptions";
import { QuickConnection } from "./components/QuickConnection";
import { connectionError } from "./connections";
import { flushElementDrafts } from "./elementDrafts";
import { CanvasClipboardBar } from "./components/CanvasClipboardBar";
import { SUMMARY_SIZE, SUN_SIZE, SummaryNode } from "./components/SummaryNode";
import { autoLayout, type LayoutGaps } from "./autoLayout";
import { useZeniteOrbit } from "./useZeniteOrbit";
const ZeniteSpace = lazy(() => import("./components/ZeniteSpace"));
import { arrowBindings, followArrows, frameMembers, type Bindings, type Piece } from "./draw/attach";
import { labelOf, tryCanvasOps, type CanvasUiReply } from "../shared/canvasOps";

/** Espaços do Organizar na visão resumida (cartões de 220×64). */
const COMPACT_GAPS: LayoutGaps = { column: 90, row: 18, group: 48 };

/** Cada tipo de nó isolado: se um falhar, só ele mostra o erro. */
function guarded<P extends NodeProps<CanvasFlowNode>>(Inner: ComponentType<P>) {
  const Guarded = (props: P) => (
    <ErrorBoundary
      fallback={(error, retry) => (
        <div className="node-crash">
          <strong>Este elemento falhou ao desenhar.</strong>
          <span>{error.message}</span>
          <div>
            <button className="ghost" onClick={retry}>
              Tentar de novo
            </button>
            <button className="ghost" onClick={() => props.data.actions.close(props.id)}>
              Remover
            </button>
          </div>
        </div>
      )}
    >
      <Inner {...props} />
    </ErrorBoundary>
  );
  return Guarded;
}

const nodeTypes = {
  blackhole: guarded(BlackHoleNode),
  terminal: guarded(TerminalNode),
  note: guarded(NoteNode),
  image: guarded(MediaNode),
  video: guarded(MediaNode),
  web: guarded(WebNode),
  file: guarded(FileNode),
  folder: guarded(FolderNode),
  table: guarded(TableNode),
  flow: guarded(FlowNode),
  skill: guarded(IntegrationNode),
  service: guarded(IntegrationNode),
  draw: guarded(DrawNode),
  summary: guarded(SummaryNode),
};
const edgeTypes = { pulse: PulseEdge };
const defaultEdgeOptions = { type: "pulse" };
const SIZES = {
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
const HISTORY_LIMIT = 100;
const SAVE_DELAY_MS = 500;

/** Diálogo aberto: com preset escolhido e/ou posição (duplo clique no canvas). */
type DialogState = { preset?: AgentPreset; position?: { x: number; y: number } } | null;
type XY = { x: number; y: number };

interface Props {
  workspace: WorkspaceMeta;
  /** Universo na tela; ausente = Origem. */
  universe?: UniverseMeta;
  accounts: AccountMeta[];
  onIndex(index: WorkspaceIndex): void;
}

function titleOf(n: CanvasFlowNode): string {
  return n.data.terminal?.title ?? n.data.element?.title ?? "";
}

/** "Nota", "Nota 2"... sem repetir nomes do canvas (agentes chamam elementos pelo nome). */
function uniqueTitle(wanted: string, nodes: CanvasFlowNode[], exceptId?: string): string {
  const base = wanted.trim() || "Sem nome";
  const taken = new Set(nodes.filter((n) => n.id !== exceptId).map((n) => titleOf(n).toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

/** Nome do arquivo sem a pasta (e sem extensão, para arquivos). */
function baseName(path: string): string {
  const name = lastSegment(path);
  return name.replace(/\.[^.]+$/, "") || name;
}

/** Desenhos sem fundo deixam o clique passar, exceto no traço. */
function drawClass(spec: DrawSpec): string {
  return isHollow(spec) ? "draw-hollow" : "";
}

/** Campos de texto, terminais e sites recebem as teclas; os atalhos de desenho não. */
function typingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.closest) return false;
  return el.isContentEditable || !!el.closest("input, textarea, select, .terminal-host, .web-host, .note-text, webview");
}

function toFlow(n: CanvasNode, actions: NodeActions): CanvasFlowNode {
  if (n.kind === "draw" && n.draw) {
    return {
      id: n.id,
      type: "draw",
      position: { x: n.x, y: n.y },
      width: n.width,
      height: n.height,
      zIndex: n.z ?? defaultZ(n.draw.shape),
      className: drawClass(n.draw),
      connectable: false,
      data: { draw: n.draw, actions },
    };
  }
  return {
    id: n.id,
    type: nodeKind(n),
    position: { x: n.x, y: n.y },
    width: n.width,
    // Astro: a altura acompanha as saídas (Torre com várias rotas).
    height: n.kind === "flow" ? undefined : n.height,
    ...(n.z !== undefined ? { zIndex: n.z } : {}),
    dragHandle: ".drag-handle",
    data: { terminal: n.terminal, element: n.element, ...(n.summary ? { summaryPos: n.summary } : {}), actions },
  };
}

function toStored(n: CanvasFlowNode): CanvasNode {
  const kind = (n.type ?? "terminal") as CanvasNode["kind"];
  const size = SIZES[kind ?? "terminal"];
  return {
    id: n.id,
    kind,
    x: n.position.x,
    y: n.position.y,
    width: n.width ?? n.measured?.width ?? size.width,
    height: n.height ?? n.measured?.height ?? size.height,
    ...(n.data.terminal ? { terminal: n.data.terminal } : {}),
    ...(n.data.element ? { element: n.data.element } : {}),
    ...(n.data.draw ? { draw: n.data.draw } : {}),
    ...(n.zIndex !== undefined ? { z: n.zIndex } : {}),
    ...(n.data.summaryPos ? { summary: n.data.summaryPos } : {}),
  };
}

/** Movimentar um agrupador também desloca os membros que não foram movidos individualmente. */
function followBlackHoleMoves(before: CanvasFlowNode[], after: CanvasFlowNode[], compact: boolean): CanvasFlowNode[] {
  if (!before.some(n => n.type === "blackhole")) return after;
  const previous = new Map(before.map(n => [n.id, n]));
  const owners = blackHoleOwners(before.map(toStored));
  if (!owners.size) return after;
  const nextOwners = blackHoleOwners(after.map(toStored));
  const cardPoint = (n: CanvasFlowNode) => {
    if (!compact) return n.position;
    if (n.data.summaryPos) return n.data.summaryPos;
    const size = SIZES[(n.type ?? "terminal") as keyof typeof SIZES] ?? SIZES.terminal;
    const card = n.type === "blackhole" ? size : n.data.terminal?.sun ? SUN_SIZE : SUMMARY_SIZE;
    return { x: n.position.x + (n.width ?? size.width) / 2 - card.width / 2, y: n.position.y + (n.height ?? size.height) / 2 - card.height / 2 };
  };
  const byId = new Map(after.map(n => [n.id, n]));
  return after.map(n => {
    const group = owners.get(n.id);
    const old = previous.get(n.id), oldGroup = group && previous.get(group), newGroup = group && byId.get(group);
    if (!group || nextOwners.get(n.id) !== group || !old || !oldGroup || !newGroup) return n;
    const from = cardPoint(old), now = cardPoint(n), a = cardPoint(oldGroup), b = cardPoint(newGroup);
    if (from.x !== now.x || from.y !== now.y || a.x === b.x && a.y === b.y) return n;
    const at = { x: now.x + b.x - a.x, y: now.y + b.y - a.y };
    return compact ? { ...n, data: { ...n.data, summaryPos: at } } : { ...n, position: at };
  });
}

/** Camada acima de tudo o que já está no canvas: elemento novo nasce na frente (de terminais e desenhos). */
/** Nó do canvas como peça para as regras de quadro e seta presa (draw/attach.ts). */
function pieceOf(n: CanvasFlowNode): Piece {
  return { id: n.id, x: n.position.x, y: n.position.y, w: n.width ?? n.measured?.width ?? 0, h: n.height ?? n.measured?.height ?? 0, ...(n.data.draw ? { draw: n.data.draw } : {}) };
}

function topZ(ns: CanvasFlowNode[]): number {
  return Math.max(0, ...ns.map((n) => n.zIndex ?? 0)) + 1;
}

/** Estado do canvas guardado para o Ctrl+Z; `sig` compara dois estados sem contar a seleção. */
type Snap = { nodes: CanvasFlowNode[]; edges: Edge[]; sig: string };
function snapOf(nodes: CanvasFlowNode[], edges: Edge[]): Snap {
  return { nodes, edges, sig: JSON.stringify([nodes.map(toStored), edges.map(storedEdge)]) };
}
/** Ajustes seguidos no mesmo campo (renomear, configurar um astro) viram um passo só do Ctrl+Z. */
const SNAP_MERGE_MS = 1500;

/** Canvas da Origem de uma galáxia ou de um universo. É montado de novo a cada troca. */
export function Canvas({ workspace, universe, accounts, onIndex }: Props) {
  const canvasId = universe?.id ?? workspace.id;
  const projectDir = universe ? universe.path : workspace.dir;
  const [nodes, setBaseNodes] = useState<CanvasFlowNode[]>([]);
  const summaryRef = useRef(false);
  const setNodes: typeof setBaseNodes = useCallback(value => setBaseNodes(before => followBlackHoleMoves(before, typeof value === "function" ? value(before) : value, summaryRef.current)), []);
  const visibleNodes = () => {
    const collapsed = blackHoleOwners(nodesRef.current.map(toStored), true);
    return nodesRef.current.filter(n => !collapsed.has(n.id)).map(n => ({ id: n.id }));
  };
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [loaded, setLoaded] = useState(false);
  const revision = useRef(0);
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const transferBusy = useRef(false);
  const mounted = useRef(true);
  const [transferring, setTransferring] = useState(false);
  const [clipboard, setClipboard] = useState<CanvasClipboardState | null>(null);
  const [transferNotice, setTransferNotice] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [line, setLine] = useState<{ source: string; point: XY; handle?: string | null } | null>(null);
  const cancelLine = useCallback(() => setLine(null), []);
  const [minimap, setMinimap] = useState(() => readPref("minimap", false));
  const { theme } = useTheme();
  const bg = useCanvasBg();
  const cprefs = useCanvasPrefs();
  const flowRef = useRef<ReactFlowInstance<CanvasFlowNode, Edge> | null>(null);
  const latest = useRef<CanvasState | null>(null);
  const nodesRef = useRef<CanvasFlowNode[]>([]);
  nodesRef.current = nodes;
  // Ao abrir, a mão: arrastar o vazio move a tela, e terminais e elementos continuam clicáveis.
  const [tool, setTool] = useState<Tool>(() => canvasPrefs().startTool);
  const previousElementTool = useRef<Tool | null>(null);
  const [overElement, setOverElement] = useState(false);
  const restoreElementTool = () => {
    const previous = previousElementTool.current;
    previousElementTool.current = null;
    if (previous !== null) setTool(previous);
  };
  const selectElementTool = () => {
    if (previousElementTool.current === null && tool !== "select") previousElementTool.current = tool;
    setTool("select");
  };
  /**
   * Ferramenta de navegação em uso (Mão ou Seleção). Só muda quando o usuário aperta H ou V; depois de
   * desenhar, organizar, colar ou ligar, o canvas volta para ela (antes voltava sempre para a Seleção).
   */
  const navTool = useRef<"hand" | "select">(canvasPrefs().startTool);
  const toNav = () => setTool(navTool.current);
  /** Trava (Q): a ferramenta continua ativa depois de desenhar. */
  const [toolLocked, setToolLocked] = useState(() => readPref("drawLock", false));
  const lockTool = (on: boolean) => {
    setToolLocked(on);
    writePref("drawLock", on);
  };
  // Alt apertado: dá para arrastar qualquer elemento por qualquer ponto (não só pelo título).
  // Não é o Ctrl: com ele apertado não dava para clicar em links nem copiar dentro do terminal.
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === "Alt" && setAltHeld(true);
    const up = (e: KeyboardEvent) => e.key === "Alt" && setAltHeld(false);
    const reset = () => setAltHeld(false);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", reset);
    };
  }, []);
  const [drawStyle, setDrawStyle] = useState<DrawStyle>(() => ({ ...DEFAULT_STYLE, ...readPref("drawStyle", DEFAULT_STYLE) }));
  // Desfazer/refazer vale para tudo o que muda o canvas: posição, tamanho, nomes, configuração,
  // ligações, criar e remover. Terminais têm vida própria: o Ctrl+Z traz de volta um que foi fechado
  // (com um shell novo), mas nunca fecha um que está aberto.
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const lastSnap = useRef<{ key?: string; at: number }>({ at: 0 });
  /** O desenho em andamento guardou um passo no histórico (clique sem arrastar o tira de volta). */
  const drawPushed = useRef(false);
  const resizing = useRef(false);
  const [, setHistoryTick] = useState(0);
  // compact: a organização foi dos cartões da visão resumida (desfazer volta os cartões, não os elementos).
  const layoutHistory = useRef<{ positions: Record<string, XY>; shapes?: Record<string, { width: number; height: number; draw: DrawSpec }>; viewport: Viewport; compact?: boolean }[]>([]);
  const layoutFitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [layoutUndoCount, setLayoutUndoCount] = useState(0);
  useEffect(() => () => clearTimeout(layoutFitTimer.current), []);
  useEffect(() => {
    mounted.current = true;
    void window.o.canvasClipboard.get().then((value) => mounted.current && setClipboard(value));
    const off = window.o.canvasClipboard.onChanged(setClipboard);
    return () => { mounted.current = false; off(); };
  }, []);
  useEffect(() => {
    setInteracting("transfer", transferring);
    return () => setInteracting("transfer", false);
  }, [transferring]);
  useEffect(() => {
    if (!transferNotice) return;
    const timer = setTimeout(() => setTransferNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [transferNotice]);

  // Terminais e elementos pedem confirmação antes de sair (Del ou X); desenhos saem na hora (dá para desfazer).
  const [pendingRemove, setPendingRemove] = useState<string[] | null>(null);
  /** Linhas esperando a confirmação para desconectar (Del numa linha ou "Desvincular"). */
  const [pendingUnlink, setPendingUnlink] = useState<string[] | null>(null);
  const [editingBlackHole, setEditingBlackHole] = useState<string | null>(null);
  const [blackHoleDrop, setBlackHoleDrop] = useState<string | null>(null);
  const folderOffsets = useRef(new Map<string, { x: number; y: number }>());
  const folderViewport = useRef<{ id: string; viewport: Viewport } | null>(null);
  const actions = useMemo<NodeActions>(
    () => ({
      manageBlackHole(id) { setEditingBlackHole(id); },
      toggleBlackHole(id) {
        const node = nodesRef.current.find(n => n.id === id);
        if (!node?.data.element || node.type !== "blackhole") return;
        const spec = node.data.element.blackHole ?? { members: [], collapsed: true };
        const flow = flowRef.current;
        if (spec.collapsed && flow) folderViewport.current = { id, viewport: flow.getViewport() };
        if (!spec.collapsed && folderViewport.current?.id === id) {
          void flow?.setViewport(folderViewport.current.viewport, { duration: 320 });
          folderViewport.current = null;
        }
        this.editElement(id, { blackHole: { ...spec, collapsed: !spec.collapsed } });
        if (spec.collapsed) setTimeout(() => {
          const currentFlow = flowRef.current, shown = currentFlow?.getNode(id);
          const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
          if (!currentFlow || !shown || !pane || shown.data.element?.blackHole?.collapsed !== false) return;
          const folder = shown.data.blackHoleFolder ?? { width: 380, height: 260 };
          const width = 200 + folder.width, height = Math.max(230, folder.height);
          const zoom = Math.max(0.2, Math.min(1, (pane.width - 160) / width, (pane.height - 220) / height));
          void currentFlow.setViewport({ x: (pane.width - width * zoom) / 2 - shown.position.x * zoom,
            y: 110 + (pane.height - 220 - height * zoom) / 2 - (shown.position.y - 20) * zoom, zoom }, { duration: 420 });
        }, 100);
        if (!spec.collapsed) {
          const members = new Set(spec.members);
          setNodes(ns => ns.map(n => members.has(n.id) ? { ...n, selected: false } : n));
        }
      },
      close(id) {
        const node = nodesRef.current.find((n) => n.id === id);
        if (!node) return;
        if (node.type === "draw") this.remove([id]);
        else setPendingRemove([id]);
      },
      runFlow(id) {
        // O motor lê o canvas salvo: manda o estado de agora, com o que acabou de ser digitado.
        flushElementDrafts();
        const state: CanvasState = {
          version: 1,
          revision: revision.current,
          nodes: nodesRef.current.map(toStored),
          edges: edgesRef.current.map(storedEdge),
          viewport: flowRef.current?.getViewport() ?? { x: 0, y: 0, zoom: 1 },
        };
        void window.o.flows.run(canvasId, state, id).then((r) => {
          if (!r.ok && r.error) setTransferNotice(r.error);
        });
      },
      remove(ids) {
        flushElementDrafts();
        const found = nodesRef.current.filter((n) => ids.includes(n.id));
        if (!found.length) return;
        this.snapshot();
        const gone = new Set<string>();
        for (const node of found) {
          if (node.type === "terminal") window.o.pty.kill(node.id);
          else if (node.type !== "draw") window.o.elements.removed(toStored(node));
          gone.add(node.id);
        }
        setNodes((ns) => ns.filter((n) => !gone.has(n.id)).map(n => n.data.element?.blackHole ? { ...n, data: { ...n.data, element: { ...n.data.element, blackHole: { ...n.data.element.blackHole, members: n.data.element.blackHole.members.filter(id => !gone.has(id)) } } } } : n));
        setEdges((es) => es.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
      },
      rename(id, title) {
        this.snapshot(`rename:${id}`);
        setNodes((ns) =>
          ns.map((n) => {
            if (n.id !== id) return n;
            const t = uniqueTitle(title, ns, id);
            return {
              ...n,
              data: {
                ...n.data,
                ...(n.data.terminal ? { terminal: { ...n.data.terminal, title: t } } : {}),
                ...(n.data.element ? { element: { ...n.data.element, title: t } } : {}),
              },
            };
          }),
        );
      },
      updateElement(id, changes) {
        setNodes((ns) => ns.map((n) => (n.id === id && n.data.element ? { ...n, data: { ...n.data, element: { ...n.data.element, ...changes } } } : n)));
      },
      editElement(id, changes) {
        this.snapshot(`edit:${id}`);
        this.updateElement(id, changes);
      },
      terminalFontSize(id, size) {
        setNodes((ns) => ns.map((n) => (n.id === id && n.data.terminal ? { ...n, data: { ...n.data, terminal: { ...n.data.terminal, appearance: { ...n.data.terminal.appearance, fontSize: size } } } } : n)));
      },
      terminalLoading(id, loading) {
        setNodes((ns) => ns.map((n) => n.id === id && n.data.terminalLoading !== loading ? { ...n, data: { ...n.data, terminalLoading: loading } } : n));
      },
      updateDraw(ids, patch) {
        const wanted = new Set(ids);
        setNodes((ns) =>
          ns.map((n) => {
            if (!wanted.has(n.id) || !n.data.draw) return n;
            const draw = { ...n.data.draw, ...patch };
            return { ...n, className: drawClass(draw), data: { ...n.data, draw } };
          }),
        );
      },
      resizeDraw(id, width, height) {
        setNodes((ns) => ns.map((n) => (n.id === id && (n.width !== width || n.height !== height) ? { ...n, width, height } : n)));
      },
      snapshot(key) {
        const now = Date.now();
        const last = lastSnap.current;
        if (key && last.key === key && now - last.at < SNAP_MERGE_MS) {
          last.at = now;
          return false;
        }
        lastSnap.current = { key, at: now };
        const snap = snapOf(nodesRef.current, edgesRef.current);
        if (past.current[past.current.length - 1]?.sig === snap.sig) return false;
        past.current = [...past.current, snap].slice(-HISTORY_LIMIT);
        future.current = [];
        setHistoryTick((t) => t + 1);
        return true;
      },
    }),
    [],
  );

  useEffect(() => {
    window.o.canvas.load(canvasId).then((state) => {
      if (state) {
        revision.current = state.revision ?? 0;
        setNodes(state.nodes.map((n) => toFlow(n, actions)));
        setEdges(state.edges.map((e) => ({ ...e, type: "pulse" })));
        setViewport(state.viewport);
      }
      setLoaded(true);
    });
  }, [canvasId, actions]);

  // Mudanças feitas por agentes (criar nota/site, trocar imagem, navegar) chegam por aqui.
  useEffect(() => {
    window.o.canvas.mounted(canvasId);
    const off = window.o.canvas.onPatch((patch) => {
      if (patch.canvasId !== canvasId) return;
      if (patch.type === "add") {
        actions.snapshot();
        setNodes((ns) => [...ns, { ...toFlow(patch.node, actions), zIndex: topZ(ns) }]);
        if (patch.edge) setEdges((es) => [...es, { ...patch.edge!, type: "pulse" }]);
      } else {
        actions.updateElement(patch.id, patch.element);
      }
    });
    return () => {
      off();
      window.o.canvas.mounted(null);
    };
  }, [canvasId, actions]);

  // Lotes do Sol (zn canvas, node, draw, flow, recruit): aplica no estado de agora, num passo só
  // do Ctrl+Z, e responde ao processo principal. Lote vazio só lê o estado.
  useEffect(() => window.o.canvas.onOps((req) => {
    if (req.canvasId !== canvasId) return;
    flushElementDrafts();
    const state: CanvasState = {
      version: 1,
      revision: revision.current,
      nodes: nodesRef.current.map(toStored),
      edges: edgesRef.current.map(storedEdge),
      viewport: flowRef.current?.getViewport() ?? { x: 0, y: 0, zoom: 1 },
    };
    const { reply, removed } = tryCanvasOps(state, req.ops, { callerId: req.callerId, newId: () => crypto.randomUUID(), seed: newSeed });
    if (reply.ok && req.ops.length) {
      actions.snapshot();
      for (const n of removed) {
        if (nodeKind(n) === "terminal") window.o.pty.kill(n.id);
        else if (n.kind !== "draw") window.o.elements.removed(n);
      }
      const current = new Map(nodesRef.current.map((n) => [n.id, n]));
      const next = reply.state.nodes.map((n) => {
        const fresh = toFlow(n, actions);
        const old = current.get(n.id);
        return old ? { ...fresh, selected: old.selected, measured: old.measured, data: { ...fresh.data, reloadVersion: old.data.reloadVersion, terminalLoading: old.data.terminalLoading } } : fresh;
      });
      const nextEdges = reply.state.edges.map((e) => ({ ...e, type: "pulse" }));
      // O próximo lote pode chegar antes de a tela redesenhar: já parte deste estado.
      nodesRef.current = next;
      edgesRef.current = nextEdges;
      setNodes(next);
      setEdges(nextEdges);
      // O usuário vê o que o Sol fez (e pode desfazer com Ctrl+Z).
      const verb: Record<string, string> = { create: "criou", update: "mudou", delete: "apagou", connect: "ligou", disconnect: "desligou" };
      const said = reply.results.slice(0, 3).map((r) => `${verb[r.op] ?? r.op} "${r.title}"`).join(", ");
      setTransferNotice(`☀ Sol ${said}${reply.results.length > 3 ? ` e mais ${reply.results.length - 3}` : ""}. Ctrl+Z desfaz.`);
    }
    window.o.canvas.opsResult(req.requestId, reply);
  }), [canvasId, actions]);

  // Pedidos de tela do Sol (zn canvas arrange|fit|summary|background|screenshot, zn terminal restart).
  const uiRef = useRef<{ organize(): void; toggleSummary(): void; bg: typeof bg }>(null!);
  useEffect(() => window.o.canvas.onUi((req) => {
    if (req.canvasId !== canvasId) return;
    const reply = (r: CanvasUiReply) => window.o.canvas.uiResult(req.requestId, r);
    const u = uiRef.current;
    const flow = flowRef.current;
    let node: CanvasFlowNode | undefined;
    if (req.target) {
      const name = req.target.trim().replace(/^#/, "").toLowerCase();
      const hits = nodesRef.current.filter((n) => n.id === name || (name.length >= 6 && n.id.startsWith(name)) || labelOf(toStored(n)).toLowerCase() === name);
      if (hits.length !== 1) return reply({ ok: false, error: hits.length ? `Há ${hits.length} itens chamados "${req.target}"; use o #id.` : `"${req.target}" não existe neste canvas.` });
      node = hits[0];
    }
    switch (req.action) {
      case "arrange":
        u.organize();
        return reply({ ok: true });
      case "fit":
      case "shot":
        if (node) void flow?.fitView({ nodes: [{ id: node.id }], padding: 0.25, duration: 0, maxZoom: 1.2 });
        else void flow?.fitView({ nodes: visibleNodes(), padding: 0.15, duration: 0 });
        // Dá tempo de a tela redesenhar antes do print.
        return void setTimeout(() => reply({ ok: true }), req.action === "shot" ? 400 : 60);
      case "summary": {
        const want = req.value === "on" ? true : req.value === "off" ? false : !summaryRef.current;
        if (want !== summaryRef.current) u.toggleSummary();
        return reply({ ok: true, info: want ? "visão resumida" : "visão normal" });
      }
      case "background": {
        const wanted = (req.value ?? "").toLowerCase();
        const pattern = BG_PATTERNS.find((p) => p.value === wanted || p.label.toLowerCase() === wanted);
        if (!pattern) return reply({ ok: false, error: `Fundo desconhecido. Opções: ${BG_PATTERNS.map((p) => p.value).join(", ")}.` });
        setCanvasBg({ ...u.bg, pattern: pattern.value });
        return reply({ ok: true, info: pattern.label });
      }
      case "restart":
        if (node?.type !== "terminal") return reply({ ok: false, error: "Diga qual terminal reiniciar." });
        setNodes((ns) => ns.map((n) => (n.id === node!.id ? { ...n, data: { ...n.data, reloadVersion: (n.data.reloadVersion ?? 0) + 1, terminalLoading: true } } : n)));
        return reply({ ok: true });
      default:
        return reply({ ok: false, error: `Pedido de tela desconhecido: ${String(req.action)}.` });
    }
  }), [canvasId]);

  // Salva com atraso para não gravar a cada pixel arrastado.
  useEffect(() => {
    if (!loaded) return;
    const state: CanvasState = {
      version: 1,
      revision: revision.current,
      nodes: nodes.map(toStored),
      edges: edges.map(storedEdge),
      viewport,
    };
    latest.current = state;
    const timer = setTimeout(() => void window.o.canvas.save(canvasId, state), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [nodes, edges, viewport, loaded, canvasId]);

  // Ao trocar de canvas ou fechar a janela, grava na hora o que ainda estava no atraso.
  useEffect(() => {
    const flush = () => {
      flushElementDrafts();
      if (latest.current) window.o.canvas.saveNow(canvasId, latest.current);
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("zenite:flush-canvas", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("zenite:flush-canvas", flush);
      flush();
    };
  }, [canvasId]);

  // ---- Visão resumida (estilo n8n): cartões compactos no lugar dos elementos ----
  const [summary, setSummary] = useState(() => readPref("summaryView", false));
  const [headerCollapsed, setHeaderCollapsed] = useCollapsed("galaxy");
  const [toolsCollapsed, setToolsCollapsed] = useCollapsed("draw");
  /** Elemento aberto em zoom na visão resumida (mostra o elemento de verdade, o resto escurece). */
  const [expanded, setExpanded] = useState<string | null>(null);
  summaryRef.current = summary;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  /** Tamanho real e do cartão de cada elemento, para converter as posições do cartão para o elemento. */
  const summarySizes = useRef(new Map<string, { real: { width: number; height: number }; card: { width: number; height: number } }>());
  const realSize = (n: CanvasFlowNode) => {
    const fallback = SIZES[(n.type ?? "terminal") as keyof typeof SIZES] ?? SIZES.terminal;
    return { width: n.width ?? n.measured?.width ?? fallback.width, height: n.height ?? n.measured?.height ?? fallback.height };
  };
  const onNodesChange = useCallback((changes: NodeChange<CanvasFlowNode>[]) => {
    // A pasta desloca apenas a apresentação; arrastes voltam às coordenadas persistidas.
    changes = changes.map(ch => {
      if (ch.type !== "position" || !ch.position) return ch;
      const offset = folderOffsets.current.get(ch.id);
      return offset ? { ...ch, position: { x: ch.position.x - offset.x, y: ch.position.y - offset.y } } : ch;
    });
    // Começo de um redimensionamento (qualquer elemento): guarda o tamanho de antes para o Ctrl+Z.
    for (const ch of changes) {
      if (ch.type !== "dimensions" || ch.resizing === undefined) continue;
      if (ch.resizing && !resizing.current) actions.snapshot();
      resizing.current = ch.resizing;
    }
    if (!summaryRef.current) return setNodes((ns) => applyNodeChanges(changes, ns));
    // Na visão resumida, arrastar move só o cartão (posição própria); o elemento fica onde está na
    // visão normal. A medida do cartão não vira medida do elemento. O elemento aberto não se arrasta.
    const moved = new Map<string, { x: number; y: number }>();
    const rest = changes.filter((ch) => {
      if (!("id" in ch)) return true;
      if (ch.type === "dimensions" && ch.id !== expandedRef.current) return false;
      if (ch.type === "position") {
        if (ch.position && ch.id !== expandedRef.current) moved.set(ch.id, ch.position);
        return false;
      }
      return true;
    });
    setNodes((ns) => {
      const next = rest.length ? applyNodeChanges(rest, ns) : ns;
      return moved.size ? next.map((n) => (moved.has(n.id) ? { ...n, data: { ...n.data, summaryPos: moved.get(n.id)! } } : n)) : next;
    });
  }, [actions]);
  /** Onde o cartão fica: a posição própria da visão resumida ou, se nunca mexido, centrado no elemento. */
  const cardPosition = (n: CanvasFlowNode) => {
    if (n.data.summaryPos) return n.data.summaryPos;
    const real = realSize(n);
    const card = n.type === "blackhole" ? real : n.data.terminal?.sun ? SUN_SIZE : SUMMARY_SIZE;
    return { x: n.position.x + real.width / 2 - card.width / 2, y: n.position.y + real.height / 2 - card.height / 2 };
  };
  /** Nós mostrados: na visão resumida, cartões no lugar dos elementos (desenhos somem); o aberto fica inteiro. */
  // Na visão resumida o cartão do astro tem uma saída só: a linha de uma rota sai dela.
  const blackHoleMembership = useMemo(() => blackHoleOwners(nodes.map(toStored)), [nodes]);
  const collapsedMembership = useMemo(() => blackHoleOwners(nodes.map(toStored), true), [nodes]);
  const displayEdges = useMemo(() => {
    const projected = projectBlackHoleEdges(nodes.map(toStored), edges);
    return summary ? projected.map(e => e.sourceHandle && e.source !== expanded ? { ...e, sourceHandle: null } : e) : projected;
  }, [summary, edges, expanded, nodes]);
  const sizedNodes = useMemo(() => {
    if (!summary) return nodes;
    const sizes = new Map<string, { real: { width: number; height: number }; card: { width: number; height: number } }>();
    const shown = nodes
      .filter((n) => n.type !== "draw")
      .map((n): CanvasFlowNode => {
        const real = realSize(n);
        const card = n.data.terminal?.sun ? SUN_SIZE : SUMMARY_SIZE;
        const at = cardPosition(n);
        if (n.type === "blackhole") return { ...n, position: at, measured: real };
        // Aberto: o elemento de verdade aparece no lugar do cartão (centrado nele) e não se arrasta.
        if (n.id === expanded) {
          return { ...n, position: { x: at.x + card.width / 2 - real.width / 2, y: at.y + card.height / 2 - real.height / 2 }, draggable: false, zIndex: 1000, className: `${n.className ?? ""} summary-expanded-node` };
        }
        sizes.set(n.id, { real, card });
        return {
          ...n,
          type: "summary",
          position: at,
          width: card.width,
          height: card.height,
          // Não reaproveitar as medidas do cartão expandido: o React Flow as prioriza
          // ao recalcular os handles depois de arrastar ou mudar a seleção.
          measured: { width: card.width, height: card.height },
          dragHandle: undefined,
          className: expanded ? "summary-dimmed" : undefined,
        };
      });
    summarySizes.current = sizes;
    return shown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, nodes, expanded]);
  const openFolderOffsets = useRef(new Map<string, { x: number; y: number; compact: boolean }>());
  const displayNodes = useMemo(() => {
    const offsets = new Map<string, { x: number; y: number }>();
    const folders = new Map<string, { width: number; height: number }>();
    const open = new Set<string>();
    for (const group of sizedNodes) {
      if (group.type !== "blackhole" || group.data.element?.blackHole?.collapsed !== false) continue;
      open.add(group.id);
      const members = sizedNodes.filter(n => blackHoleMembership.get(n.id) === group.id);
      let offset = openFolderOffsets.current.get(group.id);
      if (!offset || offset.compact !== summary) {
        offset = { x: group.position.x + 250 - Math.min(...members.map(n => n.position.x), group.position.x + 250), y: group.position.y + 70 - Math.min(...members.map(n => n.position.y), group.position.y + 70), compact: summary };
        openFolderOffsets.current.set(group.id, offset);
      }
      let width = 380, height = 260;
      for (const member of members) {
        offsets.set(member.id, offset);
        width = Math.max(width, member.position.x + offset.x + (member.width ?? 340) - group.position.x - 200 + 36);
        height = Math.max(height, member.position.y + offset.y + (member.height ?? 240) - group.position.y + 56);
      }
      folders.set(group.id, { width, height });
    }
    for (const id of openFolderOffsets.current.keys()) if (!open.has(id)) openFolderOffsets.current.delete(id);
    folderOffsets.current = offsets;
    return sizedNodes.map(n => {
      if (collapsedMembership.has(n.id)) return { ...n, selected: false, selectable: false, draggable: false, focusable: false, className: `${n.className ?? ""} black-hole-contained`, domAttributes: { "aria-hidden": true as const } };
      if (n.type === "blackhole") return { ...n, connectable: false, data: { ...n.data, blackHoleDrop: blackHoleDrop === n.id, blackHoleFolder: folders.get(n.id), blackHoleCount: [...blackHoleMembership.values()].filter(id => id === n.id).length } };
      const offset = offsets.get(n.id);
      if (offset) return { ...n, zIndex: Math.max(n.zIndex ?? 0, 1), position: { x: n.position.x + offset.x, y: n.position.y + offset.y } };
      return n;
    });
  }, [sizedNodes, collapsedMembership, blackHoleMembership, blackHoleDrop, summary]);

  const orbit = useZeniteOrbit(displayNodes, displayEdges, theme === "dark");
  useEffect(() => { if (orbit.unlocked) setHeaderCollapsed(false); }, [orbit.unlocked]);
  const beforeOrbit = useRef<{ summary: boolean; viewport: Viewport } | null>(null);
  const stopOrbit = () => {
    orbit.setActive(false);
    const before = beforeOrbit.current;
    beforeOrbit.current = null;
    if (before) {
      setSummary(before.summary);
      void flowRef.current?.setViewport(before.viewport, { duration: 400 });
    }
  };
  const toggleOrbit = () => {
    if (orbit.active) return stopOrbit();
    beforeOrbit.current = { summary, viewport: flowRef.current?.getViewport() ?? viewport };
    setExpanded(null);
    setSummary(true);
    orbit.setActive(true);
    setHeaderCollapsed(false);
    toNav();
  };

  // Na visão resumida só os círculos são desenhados: o terminal de verdade (que inicia o
  // processo ao montar) só existe quando é aberto. Sem isto, abrir o canvas já resumido deixava
  // os agentes parados. Inicia cada terminal uma vez; ao abrir, a sessão é reaproveitada com o histórico.
  const startedInSummary = useRef(new Set<string>());
  useEffect(() => {
    if (!loaded || !summary) return;
    for (const n of nodes) {
      const t = n.data.terminal;
      if (!t || startedInSummary.current.has(n.id)) continue;
      startedInSummary.current.add(n.id);
      void window.o.pty.create({ id: n.id, command: t.command, cwd: t.cwd, account: t.account, provider: t.provider, sun: t.sun, cols: 120, rows: 32 }).catch(() => {});
    }
  }, [loaded, summary, nodes]);

  /** Abre um elemento da visão resumida: zoom até ele, o resto escurece. */
  const savedViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const openSummary = (id: string) => {
    const flow = flowRef.current;
    const n = nodesRef.current.find((x) => x.id === id);
    const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
    if (!flow || !n || !pane) return;
    const { width, height } = realSize(n);
    if (!expandedRef.current) savedViewport.current = flow.getViewport();
    setExpanded(id);
    const at = cardPosition(n);
    const folderOffset = folderOffsets.current.get(id) ?? { x: 0, y: 0 };
    const card = n.data.terminal?.sun ? SUN_SIZE : SUMMARY_SIZE;
    const zoom = Math.max(0.35, Math.min(1.25, (pane.width * 0.86) / width, (pane.height * 0.8) / height));
    void flow.setCenter(at.x + folderOffset.x + card.width / 2, at.y + folderOffset.y + card.height / 2, { zoom, duration: 260 });
  };
  const closeSummary = () => {
    if (!expandedRef.current) return;
    setExpanded(null);
    if (savedViewport.current) void flowRef.current?.setViewport(savedViewport.current, { duration: 240 });
    savedViewport.current = null;
  };
  const toggleSummary = () => {
    if (orbit.active) return stopOrbit();
    setExpanded(null);
    savedViewport.current = null;
    setSummary((s) => {
      writePref("summaryView", !s);
      return !s;
    });
    setTimeout(() => void flowRef.current?.fitView({ nodes: visibleNodes(), duration: 400, padding: 0.2 }), 60);
  };

  /** Só um Sol por canvas: promover um terminal tira o Sol dos outros. */
  const toggleSun = (id: string) => {
    const target = nodesRef.current.find((n) => n.id === id)?.data.terminal;
    if (!target) return;
    const on = !target.sun;
    actions.snapshot();
    setNodes((ns) => {
      return ns.map((n) => {
        const t = n.data.terminal;
        if (!t) return n;
        const sun = n.id === id ? on : false;
        if (!!t.sun === sun) return n;
        const { sun: _old, ...rest } = t;
        return { ...n, data: { ...n.data, terminal: sun ? { ...rest, sun: true } : rest } };
      });
    });
    if (!on) {
      void window.o.pty.promoteSun({ ...target, sun: false, cols: 120, rows: 32 }).then((result) => {
        if (!result.ok && mounted.current) setTransferNotice(result.error ?? "Não foi possível remover a função Sol.");
      }).catch((error: unknown) => { if (mounted.current) setTransferNotice(String(error)); });
    }
    if (on) {
      setTransferNotice("Promovendo a Sol…");
      void window.o.pty.promoteSun({ ...target, sun: true, cols: 120, rows: 32 }).then((result) => {
        if (!mounted.current || !nodesRef.current.find((n) => n.id === id)?.data.terminal?.sun) return;
        if (!result.ok) { setTransferNotice(result.error ?? "Não foi possível ativar Full Access para o Sol."); return; }
        if (result.restart) {
          setNodes((ns) => ns.map((n) => n.id === id ? { ...n, data: { ...n.data, reloadVersion: (n.data.reloadVersion ?? 0) + 1, terminalLoading: true } } : n));
          setTransferNotice("Sol ativado. Reabrindo o agente com Full Access…");
        } else setTransferNotice(result.fullAccess ? "Sol ativado com Full Access." : "Sol ativado. Permissões das configurações mantidas.");
      }).catch((error: unknown) => { if (mounted.current) setTransferNotice(`Não foi possível ativar Full Access: ${String(error)}`); });
    }
  };

  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((es) => {
    const projected = projectBlackHoleEdges(nodesRef.current.map(toStored), es);
    const logical = new Map(projected.map(e => [e.id, typeof e.data?.logicalEdgeId === "string" ? e.data.logicalEdgeId : e.id]));
    const mapped = changes.map(ch => "id" in ch ? { ...ch, id: logical.get(ch.id) ?? ch.id } : ch);
    const selected = new Set(mapped.flatMap(ch => ch.type === "select" && ch.selected ? [ch.id] : []));
    return applyEdgeChanges(mapped.map(ch => ch.type === "select" && selected.has(ch.id) ? { ...ch, selected: true } : ch), es);
  }), []);
  const addConnection = useCallback((c: Connection) => {
    if (connectionError(c.source, c.target, nodesRef.current, edgesRef.current, c.sourceHandle)) return;
    actions.snapshot();
    setEdges((es) => connectionError(c.source, c.target, nodesRef.current, es, c.sourceHandle) ? es : addEdge({ ...c, id: c.sourceHandle ? `${c.source}:${c.sourceHandle}->${c.target}` : `${c.source}->${c.target}` }, es));
  }, [actions]);
  // Astro com várias saídas (Torre, Gêmeos, Órbita) e a linha saiu sem dizer qual (visão resumida,
  // modo Linhas): um menu pergunta de qual saída ela parte.
  const [routePick, setRoutePick] = useState<{ connection: Connection; at: XY; outputs: { id: string; label: string }[] } | null>(null);
  const lastPointer = useRef<XY>({ x: 0, y: 0 });
  useEffect(() => {
    const up = (e: PointerEvent) => { lastPointer.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointerdown", up, true);
    return () => { window.removeEventListener("pointerup", up, true); window.removeEventListener("pointerdown", up, true); };
  }, []);
  const onConnect = useCallback((c: Connection) => {
    const spec = nodesRef.current.find((n) => n.id === c.source)?.data.element?.flow;
    const outputs = spec ? outputsOf(spec) : [];
    if (!c.sourceHandle && outputs.length > 1) return setRoutePick({ connection: c, at: lastPointer.current, outputs });
    addConnection(c);
  }, [addConnection]);
  // Arrastar a bolinha e soltar em qualquer parte de outro elemento já liga (não precisa acertar a
  // bolinha dele). Soltou no vazio: abre o modo Linhas, e o próximo clique num elemento conclui.
  const onConnectEnd = (e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode || !state.fromHandle) return;
    const p = "changedTouches" in e ? e.changedTouches[0] : e;
    const hit = document.elementsFromPoint(p.clientX, p.clientY).map((el) => el.closest<HTMLElement>(".react-flow__node")).find((el) => el && !el.classList.contains("react-flow__node-draw"));
    const other = hit?.dataset.id;
    const from = state.fromNode.id;
    const handle = state.fromHandle.type === "source" ? state.fromHandle.id ?? null : null;
    if (other && other !== from) {
      // Puxou da bolinha da esquerda (entrada): a linha vem do outro para este.
      if (state.fromHandle.type === "target") onConnect({ source: other, target: from, sourceHandle: null, targetHandle: null });
      else onConnect({ source: from, target: other, sourceHandle: handle, targetHandle: null });
      return;
    }
    if (!other && state.fromHandle.type === "source") setLine({ source: from, point: { x: p.clientX, y: p.clientY }, handle });
  };
  const finishLine = (target: string) => {
    if (!line) return;
    onConnect({ source: line.source, target, sourceHandle: line.handle ?? null, targetHandle: null });
    cancelLine();
  };

  // ---- Ir até um terminal (Ctrl+Shift+A, notificação clicada, busca) ----
  const focusTarget = useRef<string | null>(null);
  const tryFocus = useRef(() => {});
  tryFocus.current = () => {
    const id = focusTarget.current;
    const flow = flowRef.current;
    if (!id || !flow || !nodesRef.current.some((n) => n.id === id)) return;
    const group = blackHoleOwners(nodesRef.current.map(toStored), true).get(id);
    if (group) {
      actions.toggleBlackHole(group);
      setTimeout(() => tryFocus.current(), 80);
      return;
    }
    focusTarget.current = null;
    // Na visão resumida, ir até um elemento é abri-lo no lugar do que estiver aberto (o real fica
    // escondido atrás do cartão: enquadrar a posição real mostraria o elemento errado).
    if (summaryRef.current) openSummary(id);
    else void flow.fitView({ nodes: [{ id }], padding: 0.25, duration: 350, maxZoom: 1 });
    setNodes((ns) => ns.map((n) => (n.selected !== (n.id === id) ? { ...n, selected: n.id === id } : n)));
  };
  useEffect(() => {
    const r = onFocusRequest((id) => {
      focusTarget.current = id;
      tryFocus.current();
    });
    focusTarget.current = r.pending;
    return r.off;
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => tryFocus.current(), 60);
    return () => clearTimeout(t);
  }, [loaded]);

  // ---- Desenho ----

  const selectedDraws = nodes.filter((n) => n.selected && n.type === "draw");

  const restore = (from: typeof past, to: typeof future) => {
    const snap = from.current[from.current.length - 1];
    if (!snap) return;
    flushElementDrafts();
    from.current = from.current.slice(0, -1);
    to.current = [...to.current, snapOf(nodesRef.current, edgesRef.current)];
    lastSnap.current = { at: 0 };
    const current = new Map(nodesRef.current.map((n) => [n.id, n]));
    const wanted = new Set(snap.nodes.map((n) => n.id));
    // Elementos que somem ou voltam: os arquivos deles (nota, tabela, mídia) vão e vêm da lixeira.
    for (const n of nodesRef.current) if (!wanted.has(n.id) && n.type !== "terminal" && n.type !== "draw") window.o.elements.removed(toStored(n));
    for (const n of snap.nodes) if (!current.has(n.id) && n.type !== "terminal" && n.type !== "draw") window.o.elements.restored(toStored(n));
    const kept = nodesRef.current.filter((n) => n.type === "terminal" && !wanted.has(n.id));
    const next = [
      ...snap.nodes.map((n) => {
        const now = current.get(n.id);
        return { ...n, selected: false, data: { ...n.data, actions, reloadVersion: now?.data.reloadVersion, terminalLoading: now?.data.terminalLoading } };
      }),
      ...kept,
    ];
    const ids = new Set(next.map((n) => n.id));
    setNodes(next);
    setEdges(snap.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e, selected: false })));
    setHistoryTick((t) => t + 1);
  };
  const undo = () => restore(past, future);
  const redo = () => restore(future, past);

  const pickTool = (t: Tool) => {
    previousElementTool.current = null;
    cancelLine();
    if (t === "hand" || t === "select") navTool.current = t;
    setTool(t);
    if (t !== "select" && t !== "hand") setNodes((ns) => (ns.some((n) => n.selected) ? ns.map((n) => (n.selected ? { ...n, selected: false } : n)) : ns));
  };

  const changeStyle = (patch: Partial<DrawSpec>) => {
    const next = { ...drawStyle, ...patch };
    setDrawStyle(next);
    writePref("drawStyle", next);
    if (selectedDraws.length) {
      actions.snapshot();
      actions.updateDraw(
        selectedDraws.map((n) => n.id),
        patch,
      );
    }
  };

  const nodeName = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    return n?.data.terminal?.title ?? n?.data.element?.title ?? "sem nome";
  };
  /** Del: desenhos saem na hora; terminais, elementos e linhas selecionados pedem confirmação. */
  const deleteSelected = () => {
    const sel = nodes.filter((n) => n.selected);
    if (!sel.length) {
      const lines = edges.filter((e) => e.selected).map((e) => e.id);
      if (lines.length) setPendingUnlink(lines);
      return;
    }
    const draws = sel.filter((n) => n.type === "draw").map((n) => n.id);
    const others = sel.filter((n) => n.type !== "draw").map((n) => n.id);
    if (draws.length) actions.remove(draws);
    if (others.length) setPendingRemove(others);
  };

  const duplicateSelectedDraws = () => {
    if (!selectedDraws.length) return;
    actions.snapshot();
    const copies = selectedDraws.map((n) => ({ ...n, id: crypto.randomUUID(), position: { x: n.position.x + 24, y: n.position.y + 24 }, selected: true }));
    setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), ...copies]);
  };

  const restack = (front: boolean) => {
    if (!selectedDraws.length) return;
    actions.snapshot();
    const zs = nodesRef.current.map((n) => n.zIndex ?? 0);
    const z = front ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
    const ids = new Set(selectedDraws.map((n) => n.id));
    setNodes((ns) => ns.map((n) => (ids.has(n.id) ? { ...n, zIndex: z } : n)));
  };

  const beginDraw = (shape: DrawShape, box: Box, points?: [number, number][]) => {
    drawPushed.current = actions.snapshot();
    const id = crypto.randomUUID();
    const draw: DrawSpec = { ...drawStyle, shape, seed: newSeed(), ...(points ? { points } : {}), ...(shape === "text" ? { text: "" } : {}), ...(shape === "frame" ? { text: "Quadro", fill: "transparent" } : {}) };
    setNodes((ns) => [
      ...ns,
      { id, type: "draw", position: { x: box.x, y: box.y }, width: Math.max(1, box.width), height: Math.max(1, box.height), zIndex: defaultZ(shape), className: drawClass(draw), connectable: false, data: { draw, actions } },
    ]);
    return id;
  };

  const updateDrawing = (id: string, box: Box, points?: [number, number][]) => {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id
          ? { ...n, position: { x: box.x, y: box.y }, width: Math.max(1, box.width), height: Math.max(1, box.height), data: points ? { ...n.data, draw: { ...n.data.draw!, points } } : n.data }
          : n,
      ),
    );
  };

  /** "Desenho → forma": o rabisco em andamento vira a forma reconhecida. */
  const reshapeDrawing = (id: string, shape: DrawShape, box: Box, points?: [number, number][]) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id || !n.data.draw) return n;
        const { points: _old, ...rest } = n.data.draw;
        const draw: DrawSpec = { ...rest, shape, ...(points ? { points } : {}) };
        return { ...n, position: { x: box.x, y: box.y }, width: Math.max(1, box.width), height: Math.max(1, box.height), zIndex: defaultZ(shape), className: drawClass(draw), data: { ...n.data, draw } };
      }),
    );
  };

  /** Desenho embaixo de um ponto da tela (o mais de cima). Só desenhos: terminais e elementos nunca. */
  const drawAt = (screen: XY): string | undefined => {
    for (const el of document.elementsFromPoint(screen.x, screen.y)) {
      const id = (el as HTMLElement).closest?.(".react-flow__node-draw")?.getAttribute("data-id");
      if (id) return id;
    }
    return undefined;
  };

  /** Borracha: marca o que o ponteiro tocou e, no fim do gesto, apaga (Ctrl+Z desfaz). */
  const erasing = useRef(new Set<string>());
  const eraseAt = (screen: XY, done: boolean) => {
    const id = drawAt(screen);
    if (id && !erasing.current.has(id)) {
      erasing.current.add(id);
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, className: `${n.className ?? ""} erasing` } : n)));
    }
    if (!done) return;
    const ids = [...erasing.current];
    erasing.current.clear();
    if (ids.length) actions.remove(ids);
  };

  /** Balde: forma com área ganha o fundo escolhido; traço, seta e texto ganham a cor do traço. */
  const fillAt = (screen: XY, at: XY) => {
    let id = drawAt(screen);
    if (!id) {
      // Forma sem fundo só "pega" o mouse no traço: vale também clicar dentro dela.
      const inside = nodesRef.current.filter((n) => {
        const d = n.data.draw;
        const w = n.width ?? 0;
        const h = n.height ?? 0;
        return d && AREA_SHAPES.includes(d.shape) && at.x >= n.position.x && at.y >= n.position.y && at.x <= n.position.x + w && at.y <= n.position.y + h;
      });
      inside.sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0) || (a.width ?? 0) * (a.height ?? 0) - (b.width ?? 0) * (b.height ?? 0));
      id = inside[0]?.id;
    }
    const node = id ? nodesRef.current.find((n) => n.id === id) : undefined;
    if (!node?.data.draw) return;
    const patch: Partial<DrawSpec> = AREA_SHAPES.includes(node.data.draw.shape)
      ? { fill: bucketColor(drawStyle), fillStyle: "solid" }
      : { stroke: bucketColor(drawStyle) };
    actions.snapshot();
    actions.updateDraw([node.id], patch);
  };

  /** Quadro: ao arrastar, leva junto o que está inteiro dentro dele. */
  const frameDrag = useRef<{ id: string; from: XY; items: { id: string; x: number; y: number }[] } | null>(null);
  const startFrameDrag = (node: CanvasFlowNode) => {
    frameDrag.current = null;
    if (node.data.draw?.shape !== "frame") return;
    const fx = node.position.x;
    const fy = node.position.y;
    const fw = node.width ?? 0;
    const fh = node.height ?? 0;
    const items = nodesRef.current
      .filter((n) => n.id !== node.id && !n.selected)
      .filter((n) => n.position.x >= fx && n.position.y >= fy && n.position.x + (n.width ?? 0) <= fx + fw && n.position.y + (n.height ?? 0) <= fy + fh)
      .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
    frameDrag.current = { id: node.id, from: { x: fx, y: fy }, items };
  };
  /** Setas presas ao que está sendo arrastado: as pontas vão junto (draw/attach.ts). */
  const arrowDrag = useRef<{ id: string; from: XY; pieces: Piece[]; bindings: Bindings; moving: Set<string> } | null>(null);
  const startArrowDrag = (node: CanvasFlowNode) => {
    arrowDrag.current = null;
    const moving = new Set([node.id, ...nodesRef.current.filter((n) => n.selected).map((n) => n.id), ...(frameDrag.current?.items.map((i) => i.id) ?? [])]);
    const pieces = nodesRef.current.map(pieceOf);
    const bindings: Bindings = new Map([...arrowBindings(pieces)].filter(([id, b]) => !moving.has(id) && ((b.start && moving.has(b.start)) || (b.end && moving.has(b.end)))));
    if (!bindings.size) return;
    actions.snapshot();
    arrowDrag.current = { id: node.id, from: { ...node.position }, pieces, bindings, moving };
  };
  const moveArrowDrag = (node: CanvasFlowNode) => {
    const a = arrowDrag.current;
    if (!a || a.id !== node.id) return;
    const d = { x: node.position.x - a.from.x, y: node.position.y - a.from.y };
    const next = followArrows(a.pieces, a.bindings, new Map([...a.moving].map((id) => [id, d])), a.moving);
    setNodes((ns) => ns.map((n) => { const r = next.get(n.id); return r ? { ...n, position: { x: r.x, y: r.y }, width: r.w, height: r.h, data: { ...n.data, draw: { ...n.data.draw!, points: r.points } } } : n; }));
  };

  const moveFrameDrag = (node: CanvasFlowNode) => {
    const f = frameDrag.current;
    if (!f || f.id !== node.id || !f.items.length) return;
    const dx = node.position.x - f.from.x;
    const dy = node.position.y - f.from.y;
    const moved = new Map(f.items.map((i) => [i.id, { x: i.x + dx, y: i.y + dy }]));
    setNodes((ns) => ns.map((n) => (moved.has(n.id) ? { ...n, position: moved.get(n.id)! } : n)));
  };

  const finishDraw = (id: string, keep: boolean) => {
    if (!keep) {
      // Clique sem arrastar: desfaz a criação sem deixar rastro no histórico.
      if (drawPushed.current) past.current = past.current.slice(0, -1);
      setHistoryTick((t) => t + 1);
      setNodes((ns) => ns.filter((n) => n.id !== id));
      return;
    }
    if (tool === "pen" || toolLocked) return;
    toNav();
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, selected: true } : n.selected ? { ...n, selected: false } : n)));
  };

  /** Rodinha do mouse sobre a camada de desenho: mesmo zoom do canvas. */
  const onDrawWheel = (e: React.WheelEvent) => {
    const flow = flowRef.current;
    const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
    if (!flow || !pane) return;
    const vp = flow.getViewport();
    const zoom = Math.min(2, Math.max(0.2, vp.zoom * Math.exp(-e.deltaY * 0.002)));
    const px = e.clientX - pane.left;
    const py = e.clientY - pane.top;
    const next = { x: px - ((px - vp.x) * zoom) / vp.zoom, y: py - ((py - vp.y) * zoom) / vp.zoom, zoom };
    void flow.setViewport(next);
    setViewport(next);
  };

  // Atalhos do desenho (estilo Excalidraw). Valem só fora de terminais e campos de texto, e não
  // depois de clicar num elemento (terminal, nota, astro...): até clicar de novo no canvas vazio,
  // a tecla é do elemento. Sem isso, o A de quem ia digitar no Claude virava a Seta.
  const onElement = useRef(false);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      onElement.current = !!el?.closest?.(".react-flow__node:not(.react-flow__node-draw)");
      if (!onElement.current && !el?.closest?.(".dialog")) {
        const previous = previousElementTool.current;
        previousElementTool.current = null;
        if (previous !== null) setTool(previous);
      }
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, []);
  const keys = useRef({ undo, redo, pickTool, deleteSelected, duplicateSelectedDraws, tool, toolLocked, lockTool, closeSummary });
  keys.current = { undo, redo, pickTool, deleteSelected, duplicateSelectedDraws, tool, toolLocked, lockTool, closeSummary };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (transferBusy.current || typingTarget(e.target) || e.altKey) return;
      const k = keys.current;
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === "z" && !e.shiftKey) k.undo();
        else if ((key === "z" && e.shiftKey) || key === "y") k.redo();
        else if (key === "d") k.duplicateSelectedDraws();
        else return;
        e.preventDefault();
        return;
      }
      if (e.key === "Escape" && expandedRef.current) k.closeSummary();
      else if (e.key === "Escape" && folderViewport.current) actions.toggleBlackHole(folderViewport.current.id);
      else if (e.key === "Escape" && k.tool !== "select" && k.tool !== "hand") k.pickTool(navTool.current);
      else if (e.key === "Delete" || e.key === "Backspace") k.deleteSelected();
      else if (onElement.current || expandedRef.current) return; // letra do elemento, não do desenho
      else if (e.shiftKey && key === "x") k.pickTool("shape");
      else if (!e.shiftKey && key === "q") k.lockTool(!k.toolLocked);
      else if (!e.shiftKey && TOOL_KEYS[key]) k.pickTool(TOOL_KEYS[key]);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Organizar a seleção ----
  const selected = nodes.filter((n) => n.selected);
  const optionNode = selected.length === 1 && selected[0].type !== "draw" ? selected[0] : null;
  const lineSource = line && nodes.find((n) => n.id === line.source);
  useEffect(() => {
    if (line && optionNode?.id !== line.source) cancelLine();
  }, [line, optionNode?.id, cancelLine]);
  const boxOf = (n: CanvasFlowNode): LayoutBox => ({
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    w: n.width ?? n.measured?.width ?? 100,
    h: n.height ?? n.measured?.height ?? 100,
  });
  const arrange = (fn: (boxes: LayoutBox[]) => Record<string, { x: number; y: number }>) => {
    const chosen = nodesRef.current.filter((n) => n.selected);
    if (chosen.length < 2) return;
    actions.snapshot();
    const next = fn(chosen.map(boxOf));
    setNodes((ns) => ns.map((n) => (next[n.id] ? { ...n, position: next[n.id] } : n)));
  };
  const fitSelection = () => {
    const chosen = nodesRef.current.filter((n) => n.selected);
    if (chosen.length) void flowRef.current?.fitView({ nodes: chosen.map((n) => ({ id: n.id })), padding: 0.3, duration: 300, maxZoom: 1.2 });
  };
  const organizeAutomatically = (scope: "all" | "selection" | "smart") => {
    if (transferBusy.current) return;
    const collapsed = blackHoleOwners(nodesRef.current.map(toStored), true);
    const owners = blackHoleOwners(nodesRef.current.map(toStored));
    const visible = nodesRef.current.filter((n) => n.type !== "draw" && !collapsed.has(n.id));
    const selection = visible.filter((n) => n.selected);
    const picked = scope === "selection" || (scope === "smart" && selection.length >= 2) ? selection : visible;
    // O conteúdo de um Buraco negro (aberto ou fechado) é organizado à parte, dentro da pasta, e
    // vai junto quando o Buraco negro é organizado.
    const pickedIds = new Set(picked.map((n) => n.id));
    const chosen = [...picked, ...nodesRef.current.filter((n) => !pickedIds.has(n.id) && pickedIds.has(owners.get(n.id) ?? ""))];
    const inside = new Map<string, CanvasFlowNode[]>();
    for (const n of chosen) {
      const group = owners.get(n.id);
      if (group) inside.set(group, [...(inside.get(group) ?? []), n]);
    }
    const outer = chosen.filter((n) => !owners.has(n.id));
    if (outer.length < 2 && ![...inside.values()].some((m) => m.length >= 2)) return;
    const chosenIds = new Set(chosen.map((n) => n.id));
    const eligible = visible.filter((n) => !owners.has(n.id) || chosenIds.has(n.id));
    const ids = new Set(outer.map((n) => n.id));
    // Na visão resumida, organiza pelos cartões (220×64), não pelo tamanho real: senão sobra um
    // vão do tamanho de um terminal entre cartões pequenos. O centro do cartão é o centro do elemento.
    const compact = summaryRef.current;
    const cardOf = (n: CanvasFlowNode) => (n.type === "blackhole" ? realSize(n) : n.data.terminal?.sun ? SUN_SIZE : SUMMARY_SIZE);
    const layoutBox = (n: CanvasFlowNode): LayoutBox => {
      if (!compact) return boxOf(n);
      const card = cardOf(n);
      return { id: n.id, ...cardPosition(n), w: card.width, h: card.height };
    };
    // Quadros (draw/attach.ts): os elementos de um quadro andam em bloco, com o quadro, o título e
    // os desenhos de dentro. Vale para o quadro cujos elementos estão todos sendo organizados.
    const pieces = nodesRef.current.map(pieceOf);
    const blocks: { frame: string; members: string[]; box: LayoutBox }[] = [];
    const blockOf = new Map<string, string>();
    for (const [frame, members] of frameMembers(pieces)) {
      const elems = members.filter((m) => eligible.some((n) => n.id === m));
      if (!elems.length || !elems.every((m) => ids.has(m))) continue;
      const all = pieces.filter((p) => p.id === frame || members.includes(p.id));
      const x = Math.min(...all.map((p) => p.x));
      const y = Math.min(...all.map((p) => p.y));
      blocks.push({ frame, members, box: { id: frame, x, y, w: Math.max(...all.map((p) => p.x + p.w)) - x, h: Math.max(...all.map((p) => p.y + p.h)) - y } });
      elems.forEach((m) => blockOf.set(m, frame));
    }
    // Na visão resumida os desenhos não aparecem: o quadro só mantém os cartões dele juntos.
    const viaBlock = (id: string) => (compact ? id : blockOf.get(id) ?? id);
    const links = [
      ...projectBlackHoleEdges(nodesRef.current.map(toStored), edgesRef.current).filter(e => !e.hidden).map((e) => ({ source: viaBlock(e.source), target: viaBlock(e.target) })),
      ...(compact ? blocks.flatMap((b) => { const els = b.members.filter((m) => blockOf.get(m) === b.frame); return els.slice(1).map((m, i) => ({ source: els[i], target: m })); }) : []),
    ];
    const layoutBoxes = compact ? outer.map(layoutBox) : [...outer.filter((n) => !blockOf.has(n.id)).map(layoutBox), ...blocks.map((b) => b.box)];
    // Cartões são pequenos: espaços menores, para o conjunto caber legível na tela.
    const next = outer.length >= 2 ? autoLayout(layoutBoxes, links, eligible.filter((n) => !chosenIds.has(n.id)).map(layoutBox), compact ? COMPACT_GAPS : undefined) : {};
    // Posição nova de cada coisa que anda: elementos soltos, e quadro + tudo o que está nele.
    const moved = new Map<string, XY>();
    if (!compact) {
      for (const n of outer) if (!blockOf.has(n.id) && next[n.id]) moved.set(n.id, next[n.id]);
      for (const b of blocks) {
        const dx = next[b.frame].x - b.box.x;
        const dy = next[b.frame].y - b.box.y;
        for (const id of [b.frame, ...b.members]) {
          const p = pieces.find((q) => q.id === id)!;
          moved.set(id, { x: p.x + dx, y: p.y + dy });
        }
      }
    }
    // O organizador trabalha nas coordenadas persistidas. Uma pasta aberta acrescenta um
    // deslocamento visual: mantenha o conjunto organizado à direita da porta e abaixo do cabeçalho.
    // Corrigimos as posições, não só o desenho da moldura, para Ctrl+Z preservar a disposição anterior.
    const planned = (n: CanvasFlowNode) => compact ? next[n.id] ?? cardPosition(n) : moved.get(n.id) ?? n.position;
    // Dentro de cada Buraco negro: organiza só entre os membros, a partir do canto onde já estavam,
    // somando o quanto o próprio Buraco negro andou.
    for (const [groupId, members] of inside) {
      const group = nodesRef.current.find((n) => n.id === groupId);
      const boxes = members.map(layoutBox);
      const inner = members.length >= 2 ? autoLayout(boxes, edgesRef.current.filter((e) => owners.get(e.source) === groupId && owners.get(e.target) === groupId), [], compact ? COMPACT_GAPS : undefined) : Object.fromEntries(boxes.map((b) => [b.id, { x: b.x, y: b.y }]));
      const from = group ? (compact ? cardPosition(group) : group.position) : { x: 0, y: 0 };
      const to = group ? planned(group) : from;
      const dx = Math.min(...boxes.map((b) => b.x)) + to.x - from.x - Math.min(...Object.values(inner).map((p) => p.x));
      const dy = Math.min(...boxes.map((b) => b.y)) + to.y - from.y - Math.min(...Object.values(inner).map((p) => p.y));
      for (const member of members) {
        const position = { x: inner[member.id].x + dx, y: inner[member.id].y + dy };
        if (compact) next[member.id] = position;
        else moved.set(member.id, position);
      }
    }
    for (const group of nodesRef.current) {
      if (group.type !== "blackhole" || group.data.element?.blackHole?.collapsed !== false) continue;
      const members = chosen.filter(n => owners.get(n.id) === group.id);
      if (!members.length) continue;
      const offset = openFolderOffsets.current.get(group.id) ?? { x: 0, y: 0 };
      const origin = planned(group);
      const dx = Math.max(0, origin.x + 250 - offset.x - Math.min(...members.map(n => planned(n).x)));
      const dy = Math.max(0, origin.y + 70 - offset.y - Math.min(...members.map(n => planned(n).y)));
      if (!dx && !dy) continue;
      for (const member of members) {
        const point = planned(member);
        const position = { x: point.x + dx, y: point.y + dy };
        if (compact) next[member.id] = position;
        else moved.set(member.id, position);
      }
    }
    // Setas presas a um elemento que andou: a ponta vai junto (as de dentro de um quadro já andaram).
    const delta = new Map([...moved].map(([id, at]) => { const p = pieces.find((q) => q.id === id)!; return [id, { x: at.x - p.x, y: at.y - p.y }]; }));
    const arrows = compact ? new Map() : followArrows(pieces, arrowBindings(pieces), delta, new Set(moved.keys()));
    const current = (n: CanvasFlowNode) => (compact ? cardPosition(n) : n.position);
    const changed = compact ? chosen.some((n) => next[n.id] && (next[n.id].x !== current(n).x || next[n.id].y !== current(n).y)) : [...moved].some(([id, at]) => { const p = pieces.find((q) => q.id === id)!; return at.x !== p.x || at.y !== p.y; });
    if (changed) {
      actions.snapshot();
      const touched = compact ? chosen : nodesRef.current.filter((n) => moved.has(n.id) || arrows.has(n.id));
      layoutHistory.current = [...layoutHistory.current, {
        positions: Object.fromEntries(touched.map((n) => [n.id, { ...current(n) }])),
        // Setas redesenhadas: volta a caixa e os pontos de antes.
        shapes: Object.fromEntries(touched.filter((n) => arrows.has(n.id)).map((n) => [n.id, { width: n.width ?? 1, height: n.height ?? 1, draw: n.data.draw! }])),
        viewport: flowRef.current?.getViewport() ?? viewport,
        compact,
      }].slice(-20);
      setLayoutUndoCount(layoutHistory.current.length);
      // Compacto: mexe só nos cartões; os elementos continuam onde estão na visão normal.
      setNodes((ns) => ns.map((n) => {
        if (compact) return next[n.id] && chosenIds.has(n.id) ? { ...n, data: { ...n.data, summaryPos: next[n.id] } } : n;
        const a = arrows.get(n.id);
        if (a) return { ...n, position: { x: a.x, y: a.y }, width: a.w, height: a.h, data: { ...n.data, draw: { ...n.data.draw!, points: a.points } } };
        return moved.has(n.id) ? { ...n, position: moved.get(n.id)! } : n;
      }));
    }
    cancelLine();
    toNav();
    clearTimeout(layoutFitTimer.current);
    // Enquadra pelas posições recém-calculadas (não pelas desenhadas, que ainda podem ser as antigas).
    const boxes = chosen.filter((n) => !collapsed.has(n.id)).map((n) => {
      const position = (compact ? next[n.id] : moved.get(n.id)) ?? current(n);
      const offset = folderOffsets.current.get(n.id) ?? { x: 0, y: 0 };
      return { x: position.x + offset.x, y: position.y + offset.y, ...(compact ? cardOf(n) : realSize(n)) };
    });
    // Só o conteúdo de um Buraco negro fechado andou: nada visível para enquadrar.
    if (!boxes.length) return;
    const bounds = {
      x: Math.min(...boxes.map((b) => b.x)),
      y: Math.min(...boxes.map((b) => b.y)),
      width: Math.max(...boxes.map((b) => b.x + b.width)) - Math.min(...boxes.map((b) => b.x)),
      height: Math.max(...boxes.map((b) => b.y + b.height)) - Math.min(...boxes.map((b) => b.y)),
    };
    layoutFitTimer.current = setTimeout(() => {
      const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
      if (!mounted.current || !pane) return;
      // Folga de 20% em volta e no máximo 100%, como antes.
      const zoom = Math.max(0.1, Math.min(1, pane.width / (bounds.width * 1.4), pane.height / (bounds.height * 1.4)));
      void flowRef.current?.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { zoom, duration: 300 });
    }, 50);
  };
  uiRef.current = { organize: () => organizeAutomatically("all"), toggleSummary, bg };
  const undoLayout = () => {
    if (transferBusy.current) return;
    const previous = layoutHistory.current.pop();
    if (!previous) return;
    actions.snapshot();
    cancelLine();
    toNav();
    clearTimeout(layoutFitTimer.current);
    setLayoutUndoCount(layoutHistory.current.length);
    // Só as posições: nunca recria elementos removidos nem reinicia um terminal.
    setNodes((ns) => ns.map((n) => {
      if (!previous.positions[n.id]) return n;
      if (previous.compact) return { ...n, data: { ...n.data, summaryPos: previous.positions[n.id] } };
      const shape = previous.shapes?.[n.id];
      return shape ? { ...n, position: previous.positions[n.id], width: shape.width, height: shape.height, data: { ...n.data, draw: shape.draw } } : { ...n, position: previous.positions[n.id] };
    }));
    void flowRef.current?.setViewport(previous.viewport, { duration: 250 });
  };

  // ---- Navegação pelo teclado e comandos (busca rápida) ----

  /** Elementos em ordem de leitura: de cima para baixo, da esquerda para a direita. */
  const readingOrder = (onlyTerminals = false) =>
    nodesRef.current
      .filter((n) => n.type !== "draw" && (!onlyTerminals || n.type === "terminal"))
      .sort((a, b) => Math.round(a.position.y / 80) - Math.round(b.position.y / 80) || a.position.x - b.position.x);
  const step = (dir: 1 | -1) => {
    const order = readingOrder();
    if (!order.length) return;
    const current = order.findIndex((n) => n.selected);
    const next = order[(current + dir + order.length) % order.length] ?? order[0];
    requestFocus(next.id);
  };
  const toggleMinimap = () => {
    setMinimap((m) => {
      writePref("minimap", !m);
      return !m;
    });
  };
  useCommands((c) => {
    if (transferBusy.current) return;
    if (c === "new-terminal") setDialog({});
    else if (c === "select-all") {
      cancelLine();
      toNav();
      setNodes((ns) => {
        const hidden = blackHoleOwners(ns.map(toStored), true);
        return ns.map(n => ({ ...n, selected: !hidden.has(n.id) }));
      });
    }
    else if (c === "copy-selection") void transferSelection("copy");
    else if (c === "cut-selection") void transferSelection("cut");
    else if (c === "paste-selection") void transferSelection("paste");
    else if (c === "import-canvas") void transferSelection("import");
    else if (c === "toggle-summary") toggleSummary();
    else if (c === "export-canvas") { setExportError(""); setExportOpen(true); }
    else if (c.startsWith("new-flow:")) {
      const type = c.slice("new-flow:".length) as FlowType;
      void createElement("flow", undefined, { flow: newFlowSpec(type), title: flowType(type)?.label ?? "Astro" });
    }
    else if (c.startsWith("new-element:")) void createElement(c.slice("new-element:".length) as ElementSpec["kind"]);
    else if (c === "toggle-minimap") toggleMinimap();
    else if (c === "fit-view") void flowRef.current?.fitView({ nodes: visibleNodes(), duration: 250, padding: 0.15 });
    else if (c === "next-element") step(1);
    else if (c === "fit-selection") fitSelection();
    else if (c === "grid-selection") arrange(grid);
    else if (c === "auto-layout") organizeAutomatically("smart");
    else if (c === "auto-layout-all") organizeAutomatically("all");
    else if (c === "auto-layout-selection") organizeAutomatically("selection");
    else if (c === "undo-layout") undoLayout();
    else if (c === "prev-element") step(-1);
    else if (c.startsWith("select-terminal:")) {
      const t = readingOrder(true)[Number(c.split(":")[1]) - 1];
      if (t) requestFocus(t.id);
    }
  });
  useEffect(() => {
    // Ctrl+1…9: fixo (os outros atalhos ficam em shortcuts.ts e podem ser trocados).
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      if (!e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
        const t = readingOrder(true)[Number(e.code.slice(5)) - 1];
        if (!t) return;
        e.preventDefault();
        requestFocus(t.id);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Centro da área visível do canvas, em coordenadas do canvas. */
  const visibleCenter = (): XY => {
    const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
    const screen = pane ? { x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
    return flowRef.current?.screenToFlowPosition(screen) ?? { x: 0, y: 0 };
  };

  const transferSelection = async (mode: "copy" | "cut" | "paste" | "clear" | "import") => {
    if (transferBusy.current || !loaded) return;
    const selectedIds = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
    if ((mode === "copy" || mode === "cut") && !selectedIds.length) {
      setTransferNotice("Selecione um elemento do canvas primeiro.");
      return;
    }
    flushElementDrafts();
    cancelLine();
    clearTimeout(layoutFitTimer.current);
    transferBusy.current = true;
    setTransferring(true);
    const state: CanvasState = {
      version: 1, revision: revision.current,
      nodes: nodesRef.current.map(toStored),
      edges: edgesRef.current.map(storedEdge),
      viewport: flowRef.current?.getViewport() ?? viewport,
    };
    try {
      const api = window.o.canvasClipboard;
      const result = mode === "import" ? await window.o.canvas.import(canvasId, state, visibleCenter())
        : mode === "paste" ? await api.paste(canvasId, state, visibleCenter())
        : mode === "clear" ? await api.clear(canvasId, state)
        : await api.capture(canvasId, state, selectedIds, mode);
      // A transferência já está salva. Um canvas que foi desmontado não deve repintar a origem.
      if (!mounted.current) return;
      if (!result.ok) { if (!result.canceled) setTransferNotice(result.error); return; }
      if ((result.state.revision ?? 0) !== revision.current) {
        // O histórico de desenhos da origem não pode ressuscitar um id que foi movido.
        past.current = [];
        future.current = [];
        layoutHistory.current = [];
        setLayoutUndoCount(0);
        setHistoryTick((tick) => tick + 1);
      }
      revision.current = result.state.revision ?? 0;
      latest.current = result.state;
      const added = mode === "paste" || mode === "import";
      const hidden = blackHoleOwners(result.state.nodes, true);
      const chosen = new Set((added ? result.inserted : selectedIds).filter(id => !hidden.has(id)));
      setNodes((ns) => result.state.nodes.map((n) => {
        const existing = ns.find((old) => old.id === n.id);
        const flow = toFlow(n, actions);
        return { ...flow, selected: chosen.has(n.id), data: { ...flow.data, reloadVersion: existing?.data.reloadVersion, terminalLoading: existing?.data.terminalLoading } };
      }));
      setEdges(result.state.edges.map((e) => ({ ...e, type: "pulse" })));
      setClipboard(result.clipboard);
      const count = added ? result.inserted.length : selectedIds.length;
      setTransferNotice(mode === "copy" ? `${count} ${count === 1 ? "elemento copiado" : "elementos copiados"}.`
        : mode === "cut" ? "Recorte guardado. Abra o destino e pressione Ctrl+V."
        : mode === "clear" ? (result.restoredCanvasId ? "Recorte devolvido à origem." : "Área de transferência limpa.")
        : mode === "import" ? `${count} ${count === 1 ? "elemento importado" : "elementos importados"}.`
        : `${count} ${count === 1 ? "elemento colado" : "elementos colados"}.`);
      if (added) {
        toNav();
        setTimeout(() => {
          if (mounted.current) void flowRef.current?.fitView({ nodes: result.inserted.filter(id => !hidden.has(id)).map((id) => ({ id })), padding: 0.3, duration: 250, maxZoom: 1 });
        }, 50);
      }
    } catch (error) {
      if (mounted.current) setTransferNotice(`Não foi possível transferir: ${(error as Error).message}`);
    } finally {
      transferBusy.current = false;
      if (mounted.current) setTransferring(false);
    }
  };

  const exportCanvas = async (kinds: NodeKind[]) => {
    flushElementDrafts();
    setExportBusy(true);
    setExportError("");
    const state: CanvasState = {
      version: 1, revision: revision.current,
      nodes: nodesRef.current.map(toStored),
      edges: edgesRef.current.map(storedEdge),
      viewport: flowRef.current?.getViewport() ?? viewport,
    };
    try {
      const result = await window.o.canvas.export(state, kinds, universe ? `${workspace.name} - ${universe.name}` : workspace.name);
      if (!mounted.current) return;
      if (result.ok) {
        setExportOpen(false);
        setTransferNotice(`${result.count} ${result.count === 1 ? "item exportado" : "itens exportados"} para ${result.path}`);
      } else if (!result.canceled) setExportError(result.error);
    } catch (error) {
      if (mounted.current) setExportError((error as Error).message);
    } finally {
      if (mounted.current) setExportBusy(false);
    }
  };

  const addNode = (kind: keyof typeof SIZES, center: XY, data: Omit<CanvasFlowNode["data"], "actions">) => {
    actions.snapshot();
    const scale = SIZE_SCALE[itemPrefs().sizes[kind] ?? "medium"];
    const size = { width: Math.round(SIZES[kind].width * scale), height: Math.round(SIZES[kind].height * scale) };
    setNodes((ns) => [
      ...ns,
      {
        id: (data.terminal?.id ?? data.element?.id)!,
        type: kind,
        position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
        ...size,
        zIndex: topZ(ns),
        dragHandle: ".drag-handle",
        data: { ...data, actions },
      },
    ]);
  };

  const createTerminal = async (input: NewTerminalInput, useAsGalaxyDir: boolean) => {
    const at = dialog?.position;
    setDialog(null);
    if (useAsGalaxyDir) onIndex(await window.o.workspaces.update(workspace.id, { dir: input.cwd.trim() }));
    const id = crypto.randomUUID();
    addNode("terminal", at ?? visibleCenter(), { terminal: { id, ...input, title: uniqueTitle(input.title, nodesRef.current) } });
  };

  const createElement = async (kind: ElementSpec["kind"], at: XY = visibleCenter(), extra: Partial<ElementSpec> = {}) => {
    let base: Partial<ElementSpec> = extra;
    let title = extra.title ?? ELEMENT_STYLE[kind].label;
    if (kind === "blackhole" && !extra.blackHole) base = { ...base, blackHole: { members: [], collapsed: true } };
    if (kind === "skill" && !extra.path) {
      const picked = await window.o.elements.pickSkill();
      if (!picked) return;
      base = { ...base, path: picked.path }; title = picked.title;
    }
    if (kind === "service" && !extra.service) base = { ...base, service: { transport: "http", endpoint: "" } };
    if ((kind === "image" || kind === "video") && !extra.file) {
      const picked = await window.o.elements.pickMedia(kind);
      if (!picked) return;
      base = { file: picked.file };
      title = picked.name;
    }
    if ((kind === "file" || kind === "folder") && !extra.path) {
      const path = kind === "file" ? await window.o.elements.pickFile() : await window.o.workspaces.pickDirectory(projectDir || undefined);
      if (!path) return;
      base = { path };
      title = kind === "folder" ? lastSegment(path) : baseName(path);
    }
    const id = crypto.randomUUID();
    const note = kind === "note" ? { color: itemPrefs().noteColor, formatted: itemPrefs().noteFormatted || undefined } : {};
    addNode(kind, at, { element: { id, kind, ...note, ...base, title: uniqueTitle(title, nodesRef.current) } });
  };
  const groupSelection = () => {
    const chosen = nodesRef.current.filter(n => n.selected && n.type !== "blackhole" && n.type !== "draw");
    if (!chosen.length) return setTransferNotice("Selecione os elementos que deseja guardar.");
    const ids = new Set(chosen.map(n => n.id));
    const points = chosen.map(n => summaryRef.current ? cardPosition(n) : n.position);
    const at = { x: Math.min(...points.map(n => n.x)) - 150, y: Math.min(...points.map(n => n.y)) + 70 };
    actions.snapshot();
    setNodes(ns => ns.map(n => ({ ...n, selected: false, data: n.data.element?.blackHole ? { ...n.data, element: { ...n.data.element, blackHole: { ...n.data.element.blackHole, members: n.data.element.blackHole.members.filter(id => !ids.has(id)) } } } : n.data })));
    void createElement("blackhole", at, { blackHole: { members: [...ids], collapsed: true } });
  };
  const blackHoleToEdit = nodes.find(n => n.id === editingBlackHole && n.type === "blackhole");
  const receiveInBlackHole = (event: { clientX?: number; clientY?: number; changedTouches?: { clientX: number; clientY: number }[] | TouchList }, dragged: CanvasFlowNode[], commit = false) => {
    const pointer = event.clientX === undefined ? event.changedTouches?.[0] : { clientX: event.clientX, clientY: event.clientY! };
    const ids = new Set(dragged.filter(n => n.type !== "blackhole" && n.type !== "draw").map(n => n.id));
    const at = pointer && flowRef.current?.screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY });
    const target = at && ids.size ? displayNodes.find(n => n.type === "blackhole" && !dragged.some(d => d.id === n.id) && Math.hypot(at.x - n.position.x - 100, at.y - n.position.y - 60) <= 64) : undefined;
    setBlackHoleDrop(commit ? null : target?.id ?? null);
    if (!commit || !target) return;
    setNodes(ns => ns.map(n => {
      const group = n.data.element?.blackHole;
      if (!group) {
        if (!ids.has(n.id)) return n;
        if (target.data.element?.blackHole?.collapsed !== false) return { ...n, selected: false };
        const offset = openFolderOffsets.current.get(target.id) ?? { x: 0, y: 0 };
        const incoming = ns.filter(m => ids.has(m.id));
        const position = summary ? cardPosition(n) : n.position;
        const points = incoming.map(m => summary ? cardPosition(m) : m.position);
        const at = { x: position.x - Math.min(...points.map(p => p.x)) + target.position.x + 250 - offset.x,
          y: position.y - Math.min(...points.map(p => p.y)) + target.position.y + (target.data.blackHoleFolder?.height ?? 260) + 30 - offset.y };
        return summary ? { ...n, selected: false, data: { ...n.data, summaryPos: at } } : { ...n, selected: false, position: at };
      }
      const members = group.members.filter(id => !ids.has(id));
      if (n.id === target.id) members.push(...ids);
      return { ...n, data: { ...n.data, element: { ...n.data.element!, blackHole: { ...group, members } } } };
    }));
    setTransferNotice(`${ids.size === 1 ? "Elemento guardado" : `${ids.size} elementos guardados`} em ${target.data.element?.title}.`);
  };
  // "+ Canvas" no navegador do Zênite: o site entra no meio da área visível.
  const createElementRef = useRef(createElement);
  createElementRef.current = createElement;
  useEffect(() => window.o.system.onAddSite(({ url, title }) => {
    let name = title.trim();
    if (!name) try { name = new URL(url).hostname; } catch { name = "Site"; }
    void createElementRef.current("web", undefined, { url, title: name });
  }), []);

  /** Arrastar arquivos (imagem/vídeo) ou links para o canvas cria elementos ali. */
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const at = flowRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? visibleCenter();
    const files = [...e.dataTransfer.files];
    if (files.length) {
      let offset = 0;
      for (const f of files) {
        const path = window.o.elements.pathForFile(f);
        const spot = { x: at.x + offset, y: at.y + offset };
        offset += 40;
        // Imagem e vídeo ganham visualizador (cópia no app); o resto fica no lugar e vira arquivo/pasta.
        const imported = await window.o.elements.importMedia(path);
        if (imported) {
          await createElement(imported.kind, spot, { file: imported.file, title: imported.name });
          continue;
        }
        const info = await window.o.elements.fileInfo(path);
        if (info.exists) await createElement(info.isDir ? "folder" : "file", spot, { path, title: info.isDir ? lastSegment(path) : baseName(path) });
      }
      return;
    }
    // Arquivo arrastado de um elemento "pasta" do próprio canvas.
    const inner = e.dataTransfer.getData(INNER_PATH_TYPE);
    if (inner) {
      const info = await window.o.elements.fileInfo(inner);
      if (info.exists) await createElement(info.isDir ? "folder" : "file", at, { path: inner, title: info.isDir ? lastSegment(inner) : baseName(inner) });
      return;
    }
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (/^https?:\/\//i.test(url.trim())) await createElement("web", at, { url: url.trim().split(/\s+/)[0] });
  };

  if (!loaded) return <div className="canvas" />;

  return (
    <div className={`canvas tool-${tool}${summary ? " summary" : ""}${orbit.active ? " zenite-system" : ""}${expanded ? " summary-focus" : ""}${altHeld ? " alt-held" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
      onPointerMoveCapture={e => {
        if (e.buttons) return;
        const above = document.elementsFromPoint(e.clientX, e.clientY);
        setOverElement(above.some(el => el.closest('.react-flow__node:not(.react-flow__node-draw)')));
      }}
      onPointerDownCapture={e => {
        orbit.onPointerDown(e);
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('.dialog, .draw-dock, .react-flow__panel')) return;
        if (target.closest('.react-flow__node')) selectElementTool();
        else if (target.closest('.react-flow__pane, .draw-overlay')) restoreElementTool();
      }}
      onKeyDownCapture={e => { if (e.key === "Escape") { if (orbit.active) stopOrbit(); restoreElementTool(); } }}
    >
      <ReactFlow<CanvasFlowNode, Edge>
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(e, node) => {
          if (orbit.active) return stopOrbit();
          if (node.type === "blackhole" && (e.target as HTMLElement).closest(".black-hole-orb")) actions.toggleBlackHole(node.id);
          else if (summary && node.type === "summary") openSummary(node.id);
        }}
        onNodeMouseLeave={e => {
          if (e.buttons || document.querySelector('.dialog')) return;
          const element = (e.currentTarget as HTMLElement).closest('.react-flow__node');
          const focused = document.activeElement;
          if (!element?.contains(focused) || !focused?.matches('input, textarea, select, [contenteditable="true"], webview')) restoreElementTool();
        }}
        edgeTypes={edgeTypes}
        connectionMode={summary ? ConnectionMode.Loose : ConnectionMode.Strict}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeDragStart={(_e, node) => {
          setInteracting("drag", true);
          actions.snapshot();
          startFrameDrag(node);
          startArrowDrag(node);
        }}
        onNodeDrag={(e, node, dragged) => {
          moveFrameDrag(node);
          moveArrowDrag(node);
          receiveInBlackHole(e, dragged);
        }}
        onNodeDragStop={(e, _node, dragged) => {
          setInteracting("drag", false);
          frameDrag.current = null;
          arrowDrag.current = null;
          receiveInBlackHole(e, dragged, true);
        }}
        onSelectionDragStart={() => { actions.snapshot(); setInteracting("drag", true); }}
        onSelectionDrag={(e, dragged) => receiveInBlackHole(e, dragged)}
        onSelectionDragStop={(e, dragged) => { setInteracting("drag", false); receiveInBlackHole(e, dragged, true); }}
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        onPaneClick={(e) => {
          // Clicar fora do elemento aberto na visão resumida fecha o zoom.
          if (expandedRef.current) return closeSummary();
          if (e.detail === 2) setDialog({ position: flowRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
        }}
        zoomOnDoubleClick={false}
        // Padrão: arrastar com o esquerdo no vazio seleciona; Espaço + arrastar (ou o botão do meio) move a tela.
        // Mão (H): arrastar o vazio com o esquerdo move a tela. Selecionar (V): o esquerdo faz a caixa de
        // seleção e a tela move pelo botão escolhido nas configurações (o do meio, se lá estiver "esquerdo").
        panOnDrag={tool === "hand" ? true : cprefs.panButton === "right" ? [2] : [1]}
        panActivationKeyCode={cprefs.panButton === "space" ? "Space" : null}
        selectionOnDrag={tool !== "hand"}
        // Basta o retângulo tocar a janela (terminais e sites são grandes para envolver inteiros).
        selectionMode={SelectionMode.Partial}
        panOnScroll={cprefs.wheel === "pan"}
        zoomOnScroll={cprefs.wheel === "zoom"}
        onPaneContextMenu={(e) => cprefs.panButton === "right" && e.preventDefault()}
        defaultViewport={viewport}
        onMoveStart={() => {
          setCanvasMoving(true);
          setInteracting("move", true);
        }}
        onMoveEnd={(_e, vp) => {
          setCanvasMoving(false);
          setInteracting("move", false);
          setViewport(vp);
        }}
        // Backspace/Delete pertencem ao terminal; nunca apagam nós.
        deleteKeyCode={null}
        minZoom={orbit.active ? 0.1 : 0.2}
        maxZoom={2}
        colorMode={theme}
        proOptions={{ hideAttribution: true }}
      >
        <CanvasBackground bg={bg} />
        <ViewportPortal>{displayNodes.filter(n => n.data.blackHoleFolder).map(n => <div key={n.id} className="black-hole-folder" style={{ left: n.position.x + 200, top: n.position.y - 20, ...n.data.blackHoleFolder }}>
          <header><span>PASTA</span><strong>{n.data.element?.title}</strong><small>{n.data.blackHoleCount} elementos</small></header>
          {!n.data.blackHoleCount && <p>Arraste elementos até o Buraco negro para guardar aqui.</p>}
        </div>)}</ViewportPortal>
        <Panel position="top-left" className="universe-panel">
          {headerCollapsed
            ? <CollapsedTab side="top" label="a barra da galáxia" onClick={() => setHeaderCollapsed(false)}><strong>{universe ? `${workspace.name} · ${universe.name}` : workspace.name}</strong></CollapsedTab>
            : <><UniverseBar workspace={workspace} universe={universe} onIndex={onIndex} zenite={orbit.unlocked ? { active: orbit.active, toggle: toggleOrbit } : undefined} /><CollapseButton side="top" label="a barra da galáxia" onClick={() => setHeaderCollapsed(true)} /></>}
        </Panel>
        {folderViewport.current && nodes.some(n => n.id === folderViewport.current!.id && n.data.element?.blackHole?.collapsed === false) && !expanded && <Panel position="top-center" className="summary-close-panel">
          <button className="summary-close" onClick={() => { const id = folderViewport.current?.id; if (id) actions.toggleBlackHole(id); }}>Voltar ao canvas <kbd>Esc</kbd></button>
        </Panel>}
        {expanded && (
          <Panel position="top-center" className="summary-close-panel">
            <button className="summary-close" onClick={closeSummary} title="Voltar à visão resumida (Esc fora do terminal, ou clique fora)">
              Voltar à visão resumida <kbd>Esc</kbd>
            </button>
          </Panel>
        )}
        <Panel position="top-right" className="canvas-clipboard-panel">
          <CanvasClipboardBar clipboard={clipboard} notice={transferNotice} busy={transferring} onPaste={() => void transferSelection("paste")} onClear={() => void transferSelection("clear")} />
        </Panel>
        {selected.length >= 2 && (
          <Panel position="bottom-center" className="selection-panel">
            <SelectionBar
              count={selected.length}
              onAlign={(a: Align) => arrange((b) => align(b, a))}
              onDistribute={(axis) => arrange((b) => distribute(b, axis))}
              onGrid={() => arrange(grid)}
              onFit={fitSelection}
              onGroup={groupSelection}
              canAutoLayout={selected.filter((n) => n.type !== "draw").length >= 2}
              onAutoLayout={() => organizeAutomatically("selection")}
            />
          </Panel>
        )}
        {optionNode && !(optionNode.type === "blackhole" && optionNode.data.element?.blackHole?.collapsed === false) && (
          <Panel position="bottom-center" className="node-options-panel">
            <NodeOptions
              key={optionNode.id}
              node={optionNode} nodes={nodes} edges={edges} linking={line?.source === optionNode.id}
              onEdit={(title, appearance, role) => {
                actions.snapshot();
                setNodes((ns) => ns.map((n) => n.id === optionNode.id && n.data.terminal ? { ...n, data: { ...n.data, terminal: { ...n.data.terminal, title: uniqueTitle(title, ns, n.id), appearance, role: role || undefined } } } : n));
              }}
              onReload={() => setNodes((ns) => ns.map((n) => n.id === optionNode.id && !n.data.terminalLoading ? { ...n, data: { ...n.data, reloadVersion: (n.data.reloadVersion ?? 0) + 1, terminalLoading: true } } : n))}
              onFocus={requestFocus}
              onStartLine={(point) => { toNav(); setLine({ source: optionNode.id, point }); }}
              onConnect={finishLine} onCancelLine={cancelLine}
              onToggleSun={() => toggleSun(optionNode.id)}
              onUnlink={(other) => {
                const lines = edges.filter((e) => (e.source === optionNode.id && e.target === other) || (e.target === optionNode.id && e.source === other)).map((e) => e.id);
                if (lines.length) setPendingUnlink(lines);
              }}
              onClose={() => setNodes((ns) => ns.map((n) => n.selected ? { ...n, selected: false } : n))}
            />
          </Panel>
        )}
        {routePick && (
          <div className="route-pick-backdrop" onPointerDown={() => setRoutePick(null)}>
            <div className="route-pick" role="menu" style={{ left: routePick.at.x, top: routePick.at.y }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && setRoutePick(null)}>
              <strong>De qual saída?</strong>
              {routePick.outputs.map((o, i) => (
                <button key={o.id} role="menuitem" autoFocus={i === 0} onClick={() => { addConnection({ ...routePick.connection, sourceHandle: o.id }); setRoutePick(null); }}>{o.label}</button>
              ))}
            </div>
          </div>
        )}
        {line && lineSource && <QuickConnection source={lineSource} nodes={nodes} edges={edges} initialPoint={line.point} onConnect={finishLine} onCancel={cancelLine} />}
        {minimap && <MiniMap pannable zoomable className="minimap" />}
        <Dock
          onNew={(preset) => setDialog({ preset })}
          onNewElement={(kind) => void createElement(kind)}
          minimap={minimap}
          onToggleMinimap={toggleMinimap}
          canAutoLayout={nodes.filter((n) => n.type !== "draw").length >= 2}
          canUndoLayout={layoutUndoCount > 0}
          onAutoLayout={() => organizeAutomatically("all")}
          onUndoLayout={undoLayout}
          onFitCanvas={() => void flowRef.current?.fitView({ nodes: visibleNodes(), duration: 250, padding: 0.15 })}
          summary={summary}
          onToggleSummary={toggleSummary}
        />
      </ReactFlow>
      {orbit.active && orbit.plan && <Suspense fallback={<div className="zenite-space-loading">Abrindo o Zênite…</div>}><ZeniteSpace plan={orbit.plan} nodes={displayNodes} edges={displayEdges} onClose={stopOrbit} /></Suspense>}
      {transferring && <div className="canvas-transfer-busy" role="status" aria-label="Transferindo elementos" />}
      {exportOpen && (
        <ExportCanvasDialog
          counts={nodes.reduce<Partial<Record<NodeKind, number>>>((acc, n) => { const k = (n.type ?? "terminal") as NodeKind; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})}
          busy={exportBusy}
          error={exportError}
          onExport={(kinds) => void exportCanvas(kinds)}
          onCancel={() => setExportOpen(false)}
        />
      )}
      {OVERLAY_TOOLS.includes(tool) && (
        <div className="draw-layer" style={overElement ? { pointerEvents: "none" } : undefined} onWheel={onDrawWheel}>
          <DrawOverlay
            tool={tool}
            strokeWidth={drawStyle.strokeWidth}
            toFlow={(p) => flowRef.current?.screenToFlowPosition(p) ?? p}
            begin={beginDraw}
            update={updateDrawing}
            reshape={reshapeDrawing}
            finish={finishDraw}
            erase={eraseAt}
            fill={fillAt}
          />
        </div>
      )}
      <AgentRail nodes={nodes} />
      {toolsCollapsed && <div className="draw-dock"><CollapsedTab side="right" label="as ferramentas de desenho" onClick={() => setToolsCollapsed(false)} /></div>}
      {!toolsCollapsed && <div className="draw-dock">
        <CollapseButton side="right" label="as ferramentas de desenho" onClick={() => setToolsCollapsed(true)} />
        <DrawToolbar tool={tool} onTool={pickTool} locked={toolLocked} onLock={lockTool} canUndo={past.current.length > 0} canRedo={future.current.length > 0} onUndo={undo} onRedo={redo} />
        {(DRAWING_TOOLS.includes(tool) || selectedDraws.length > 0) && (
          <DrawPanel
            // Balde e "Desenho → forma" mostram as cores de forma com área (o balde pinta com o fundo escolhido).
            shapes={selectedDraws.length ? [...new Set(selectedDraws.map((n) => n.data.draw!.shape))] : [tool === "bucket" || tool === "shape" ? "rectangle" : (tool as DrawShape)]}
            style={selectedDraws.length ? { ...drawStyle, ...selectedDraws[0].data.draw! } : drawStyle}
            onChange={changeStyle}
            bucket={tool === "bucket" && !selectedDraws.length}
            selection={
              selectedDraws.length
                ? { onFront: () => restack(true), onBack: () => restack(false), onDuplicate: duplicateSelectedDraws, onDelete: () => actions.remove(selectedDraws.map((n) => n.id)) }
                : undefined
            }
          />
        )}
      </div>}
      {nodes.length === 0 && <EmptyState workspaceName={universe ? `${workspace.name} · ${universe.name}` : workspace.name} onPick={(preset) => setDialog({ preset })} />}
      {pendingUnlink && (
        <UnlinkDialog
          pairs={pendingUnlink.map((id) => edges.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e).map((e) => [nodeName(e.source), nodeName(e.target)] as [string, string])}
          onConfirm={() => {
            actions.snapshot();
            const gone = new Set(pendingUnlink);
            setEdges((es) => es.filter((e) => !gone.has(e.id)));
            setPendingUnlink(null);
          }}
          onCancel={() => setPendingUnlink(null)}
        />
      )}
      {pendingRemove && (
        <RemoveDialog
          nodes={pendingRemove.map((id) => nodes.find((n) => n.id === id)).filter((n): n is CanvasFlowNode => !!n)}
          onConfirm={() => {
            actions.remove(pendingRemove);
            setPendingRemove(null);
          }}
          onCancel={() => setPendingRemove(null)}
        />
      )}
      {blackHoleToEdit && <BlackHoleDialog title={blackHoleToEdit.data.element!.title}
        members={[...blackHoleMembership].filter(([, group]) => group === blackHoleToEdit.id).map(([id]) => id)}
        choices={nodes.filter(n => n.type !== "blackhole" && n.type !== "draw").map(n => {
          const owner = blackHoleMembership.get(n.id);
          return { id: n.id, kind: n.type, title: n.data.terminal?.title ?? n.data.element?.title ?? n.id, group: owner && owner !== blackHoleToEdit.id ? nodes.find(g => g.id === owner)?.data.element?.title : undefined };
        })} onClose={() => setEditingBlackHole(null)} onSave={ids => {
          actions.snapshot();
          const wanted = new Set(ids);
          setNodes(ns => ns.map(n => {
            const group = n.data.element?.blackHole;
            if (!group) return wanted.has(n.id) ? { ...n, selected: false } : n;
            return { ...n, data: { ...n.data, element: { ...n.data.element!, blackHole: { ...group, members: n.id === blackHoleToEdit.id ? ids : group.members.filter(id => !wanted.has(id)) } } } };
          }));
          setEditingBlackHole(null);
        }} />}
      {dialog && (
        <NewTerminalDialog defaultCwd={projectDir} offerGalaxyDir={!universe && !workspace.dir} initialPreset={dialog.preset} accounts={accounts} onIndex={onIndex} onCreate={createTerminal} onCancel={() => setDialog(null)} />
      )}
    </div>
  );
}
