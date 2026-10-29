import type { InstallProgress } from "../../shared/types";

const LABELS: Record<InstallProgress["phase"], string> = {
  preparando: "Preparando o WinGet…",
  baixando: "Baixando",
  instalando: "Instalando",
  concluido: "Concluindo…",
};

/** Barra de uma instalação pelo WinGet: com percentual quando ele informa, animada quando não. */
export function InstallProgressBar({ name, progress }: { name: string; progress: InstallProgress }) {
  const known = typeof progress.percent === "number";
  const label = progress.phase === "baixando" || progress.phase === "instalando" ? `${LABELS[progress.phase]} ${name}` : LABELS[progress.phase];
  return (
    <div className="install-progress" role="status" aria-live="polite">
      <div className="install-progress-label">
        <span>{label}{known ? "" : "…"}</span>
        {known && <span>{progress.percent}%</span>}
      </div>
      <div className={`install-progress-track${known ? "" : " indeterminate"}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? progress.percent : undefined}>
        <div className="install-progress-fill" style={known ? { width: `${progress.percent}%` } : undefined} />
      </div>
    </div>
  );
}
