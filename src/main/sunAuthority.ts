import type { CanvasState } from "../shared/types";

/** Autoridade da sessão do aplicativo. Nunca é restaurada de JSON ou de variáveis dos agentes. */
export class SunAuthority {
  private grants = new Map<string, string>();

  set(canvasId: string, terminalId: string, enabled: boolean): void {
    if (enabled) this.grants.set(canvasId, terminalId);
    else if (this.grants.get(canvasId) === terminalId) this.grants.delete(canvasId);
  }

  has(terminalId: string, canvasId: string): boolean {
    return this.grants.get(canvasId) === terminalId;
  }

  /** sun no arquivo é apenas apresentação; a permissão vem deste registro. */
  present(canvasId: string, state: CanvasState | null): CanvasState | null {
    if (!state) return null;
    return { ...state, nodes: state.nodes.map((node) => {
      if (!node.terminal) return node;
      const { sun: _untrusted, ...terminal } = node.terminal;
      return { ...node, terminal: this.has(node.id, canvasId) ? { ...terminal, sun: true } : terminal };
    }) };
  }
}
