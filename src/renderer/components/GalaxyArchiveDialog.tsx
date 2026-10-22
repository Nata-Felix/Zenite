import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileDown, FileUp } from "lucide-react";
import type { GalaxyArchiveInfo, GalaxyArchiveOptions, WorkspaceIndex } from "../../shared/types";
import "./GalaxyArchiveDialog.css";

type Props = { mode: "export"; workspaceId: string; name: string; onClose(): void; onImported(index: WorkspaceIndex): void }
  | { mode: "import"; ticket: string; info: GalaxyArchiveInfo; onClose(): void; onImported(index: WorkspaceIndex): void };

export function GalaxyArchiveDialog(props: Props) {
  const exporting = props.mode === "export";
  const available = props.mode === "import" ? props.info.options : { contents: true, media: true, env: true };
  const [options, setOptions] = useState<GalaxyArchiveOptions>({ contents: available.contents, media: available.media, env: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const running = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const submit = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setError("");
    try {
      if (props.mode === "export") {
        window.dispatchEvent(new Event("zenite:flush-canvas"));
        const result = await window.o.galaxyArchive.export(props.workspaceId, options);
        if (result.ok) setSuccess(`Galáxia exportada para ${result.path}`);
        else if (!result.canceled) setError(result.error);
      } else {
        const result = await window.o.galaxyArchive.import(props.ticket, options);
        if (result.ok) { props.onImported(result.index); setSuccess("Galáxia importada. Ela está na barra lateral; sua galáxia atual foi mantida aberta."); }
        else setError(result.error);
      }
    } catch (e) { setError((e as Error).message); }
    finally { running.current = false; setBusy(false); }
  };
  const title = `${exporting ? "Exportar" : "Importar"} galáxia`;
  const Icon = exporting ? FileDown : FileUp;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={() => !busy && props.onClose()}>
      <div ref={dialog} className="dialog galaxy-archive-dialog" role="dialog" aria-modal="true" aria-labelledby="galaxy-archive-title" onMouseDown={e => e.stopPropagation()} onKeyDown={e => {
        if (e.key === "Escape" && !busy) { e.stopPropagation(); props.onClose(); }
        if (e.key === "Tab") {
          const items = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") ?? [])];
          const first = items[0], last = items.at(-1);
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }}>
        <h2 id="galaxy-archive-title"><Icon size={20} /> {title}</h2>
        {success ? <p className="dialog-text" role="status">{success}</p> : <>
          <p className="dialog-text"><strong>{props.mode === "export" ? props.name : props.info.name}</strong><br />{props.mode === "import" ? `${props.info.canvases} canvases · ${props.info.elements} elementos. Uma cópia nova será criada, sem substituir suas galáxias.` : "Inclui a Origem e todos os universos, com os elementos, suas configurações e conexões."}</p>
          <div className="galaxy-archive-options">
            {([
              ["contents", "Incluir conteúdos", "Textos das notas, tabelas, arquivos, pastas, skills e arquivos do projeto. Dependências e histórico Git ficam de fora."],
              ["media", "Incluir mídia", "Leva os arquivos de imagens e vídeos, além dos elementos no canvas."],
              ["env", "Incluir arquivos .env", "Leva .env e .env.* da Origem, dos universos e das pastas incluídas. Pode conter senhas e tokens; o pacote não é criptografado."],
            ] as const).map(([key, label, hint]) => <label className="galaxy-archive-option" key={key}>
              <input type="checkbox" checked={options[key]} disabled={busy || !available[key]} onChange={e => setOptions(current => ({ ...current, [key]: e.target.checked }))} />
              <span><strong>{label}</strong><small>{available[key] ? hint : "Não está incluído neste pacote."}</small></span>
            </label>)}
          </div>
          <p className="dialog-hint">Sem conteúdos ou mídia, os elementos continuam no canvas e podem ser preenchidos depois. Universos são copiados como pastas separadas, sem branches Git. Contas e sessões de login não são transportadas. Agendamentos chegam pausados.</p>
          {!exporting && <p className="dialog-hint">A importação não abre os terminais. Os comandos salvos são executados quando você abrir a galáxia importada.</p>}
          {error && <p className="dialog-error" role="alert">{error}</p>}
        </>}
        <div className="dialog-actions"><button className="ghost" autoFocus disabled={busy} onClick={props.onClose}>{success ? "Concluir" : "Cancelar"}</button>{!success && <button className="primary" disabled={busy} onClick={() => void submit()}>{busy ? "Aguarde…" : title}</button>}</div>
      </div>
    </div>, document.body,
  );
}
