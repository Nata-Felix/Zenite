import { useEffect, useState } from "react";
import type { TerminalStats } from "../shared/types";

/** Últimas estatísticas recebidas, por terminal. */
let latest: Record<string, TerminalStats> = {};
const listeners = new Set<() => void>();

window.o.pty.onStats((stats) => {
  latest = stats;
  listeners.forEach((l) => l());
});

export function useTerminalStats(id: string): TerminalStats | undefined {
  const [stats, setStats] = useState(() => latest[id]);
  useEffect(() => {
    const update = () => setStats(latest[id]);
    listeners.add(update);
    return () => void listeners.delete(update);
  }, [id]);
  return stats;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}
