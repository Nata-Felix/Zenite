import type { Node } from "@xyflow/react";
import { File, Film, FolderOpen, Globe, Image as ImageIcon, StickyNote, Table2, Orbit, BookOpen, Plug, Eclipse, type LucideIcon } from "lucide-react";
import type { DrawSpec, ElementSpec, TerminalAppearance, TerminalSpec } from "../shared/types";

/** Ações que os nós pedem ao canvas. */
export interface NodeActions {
  /** Botão X: terminais e elementos pedem confirmação; desenhos saem na hora. */
  close(id: string): void;
  /** Remove de vez (já confirmado). */
  remove(ids: string[]): void;
  rename(id: string, title: string): void;
  terminalLoading(id: string, loading: boolean): void;
  updateElement(id: string, changes: Partial<ElementSpec>): void;
  /** Mudança feita pelo usuário (cor, configuração do astro...): entra no Ctrl+Z. */
  editElement(id: string, changes: Partial<ElementSpec>): void;
  /** Tamanho da fonte só deste terminal (undefined = o das Configurações). */
  terminalFontSize(id: string, size: number | undefined): void;
  /** Aba (Terminal/Chat), tema e tamanho da letra do chat deste terminal. */
  terminalChat(id: string, patch: Pick<TerminalAppearance, "view" | "chatTheme" | "chatFontSize">): void;
  /** Muda o estilo/texto de um ou mais desenhos. */
  updateDraw(ids: string[], patch: Partial<DrawSpec>): void;
  resizeDraw(id: string, width: number, height: number): void;
  /**
   * Guarda o estado do canvas antes de uma mudança (Ctrl+Z). Com `key`, mudanças seguidas na mesma
   * coisa viram um passo só. Devolve se guardou (não guarda se nada mudou desde o último).
   */
  snapshot(key?: string): boolean;
  /** Astro: roda o fluxo a partir dele. */
  runFlow(id: string): void;
  manageBlackHole(id: string): void;
  toggleBlackHole(id: string): void;
}

export type CanvasNodeData = {
  terminal?: TerminalSpec;
  /** Estado da sessão só na tela: não é salvo no canvas. */
  reloadVersion?: number;
  terminalLoading?: boolean;
  element?: ElementSpec;
  draw?: DrawSpec;
  /** Posição do cartão na visão resumida (salva com o canvas). */
  summaryPos?: { x: number; y: number };
  blackHoleCount?: number;
  blackHoleDrop?: boolean;
  blackHoleFolder?: { width: number; height: number };
  actions: NodeActions;
};

export type CanvasFlowNode = Node<CanvasNodeData>;

export const ELEMENT_STYLE: Record<ElementSpec["kind"], { label: string; create: string; color: string; icon: LucideIcon }> = {
  note: { label: "Nota", create: "Nova nota", color: "var(--c-note)", icon: StickyNote },
  image: { label: "Imagem", create: "Nova imagem", color: "var(--c-image)", icon: ImageIcon },
  video: { label: "Vídeo", create: "Novo vídeo", color: "var(--c-video)", icon: Film },
  web: { label: "Site", create: "Novo site", color: "var(--c-web)", icon: Globe },
  file: { label: "Arquivo", create: "Adicionar arquivo (qualquer tipo)", color: "var(--c-file)", icon: File },
  folder: { label: "Pasta", create: "Adicionar pasta (explorador)", color: "var(--c-folder)", icon: FolderOpen },
  table: { label: "Tabela", create: "Nova tabela", color: "var(--c-table)", icon: Table2 },
  flow: { label: "Astro", create: "Novo astro", color: "#c084fc", icon: Orbit },
  skill: { label: "Skill", create: "Adicionar skill ao canvas", color: "#c084fc", icon: BookOpen },
  service: { label: "Serviço", create: "Adicionar serviço externo", color: "#38bdf8", icon: Plug },
  blackhole: { label: "Buraco negro", create: "Novo buraco negro", color: "#c4a5ff", icon: Eclipse },
};

export function mediaUrl(file: string): string {
  return `o-media://arquivo/${encodeURIComponent(file)}`;
}

/** Tipo do arraste de um arquivo de dentro de um elemento "pasta" para o canvas. */
export const INNER_PATH_TYPE = "application/x-zenite-path";
