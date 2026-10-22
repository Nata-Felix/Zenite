import { useEffect, useRef, useState } from "react";
import { Cpu, X } from "lucide-react";
import { formatBytes, useTerminalStats } from "../statsBus";

/** Memória do terminal (shell + o que rodou nele). Clique abre a lista de processos. */
export function ProcessChip({ terminalId }: { terminalId: string }) {
  const stats = useTerminalStats(terminalId);
  const [open, setOpen] = useState(false);
  const [killing, setKilling] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close, true);
    return () => window.removeEventListener("mousedown", close, true);
  }, [open]);

  if (!stats) return null;
  const heavy = stats.total > 1.5 * 1024 ** 3;
  const list = [...stats.processes].sort((a, b) => Number(b.root) - Number(a.root) || b.rss - a.rss);

  return (
    <div className="process-chip-wrap nodrag" ref={box}>
      <button className={`process-chip${heavy ? " heavy" : ""}`} title="Memória deste terminal e de tudo que rodou nele. Clique para ver os processos." onClick={() => setOpen(!open)}>
        <Cpu size={11} /> {formatBytes(stats.total)}
      </button>
      {open && (
        <div className="process-popover nowheel">
          <div className="process-popover-head">
            <strong>Processos</strong>
            <span>{stats.processes.length} · {formatBytes(stats.total)}</span>
          </div>
          <ul>
            {list.map((p) => (
              <li key={p.pid}>
                <span className="process-name" title={`PID ${p.pid}`}>
                  {p.name}
                  {p.root && <em> (shell do terminal)</em>}
                </span>
                <span className="process-mem">{formatBytes(p.rss)}</span>
                {!p.root ? (
                  <button
                    className="icon-button danger"
                    title={`Encerrar ${p.name} (PID ${p.pid}) e os processos filhos dele`}
                    disabled={killing === p.pid}
                    onClick={async () => {
                      setKilling(p.pid);
                      await window.o.pty.killProcess(terminalId, p.pid);
                      setKilling(null);
                    }}
                  >
                    <X size={13} />
                  </button>
                ) : (
                  <span className="process-spacer" />
                )}
              </li>
            ))}
          </ul>
          <p className="process-hint">Para encerrar o terminal inteiro, use o × do cabeçalho.</p>
        </div>
      )}
    </div>
  );
}
