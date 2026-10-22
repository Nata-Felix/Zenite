/** Esperas locais: não sobrevivem ao fechamento do aplicativo. Não executam ações nem concedem permissões. */
export class FlowWaits {
  private pending = new Map<string, Set<(input?: string) => void>>();

  wait(nodeId: string, seconds: number, signal: AbortSignal): Promise<string | undefined> {
    if (signal.aborted) return Promise.reject(new Error("Fluxo parado."));
    return new Promise((resolve, reject) => {
      const entries = this.pending.get(nodeId) ?? new Set();
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        entries.delete(receive);
        if (!entries.size) this.pending.delete(nodeId);
      };
      const receive = (input?: string) => { cleanup(); resolve(input); };
      const abort = () => { cleanup(); reject(new Error("Fluxo parado.")); };
      const timer = setTimeout(() => { cleanup(); reject(new Error("O sinal não chegou dentro do tempo limite.")); }, seconds * 1000);
      entries.add(receive);
      this.pending.set(nodeId, entries);
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  signal(nodeId: string, input?: string): { ok: boolean; error?: string } {
    const entries = this.pending.get(nodeId);
    if (!entries?.size) return { ok: false, error: "Este astro não está aguardando um sinal." };
    if (entries.size !== 1) return { ok: false, error: "Mais de uma execução aguarda neste astro. Pare as execuções extras antes de enviar o sinal." };
    [...entries][0](input);
    return { ok: true };
  }
}
