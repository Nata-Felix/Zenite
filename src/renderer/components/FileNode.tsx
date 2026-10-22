import { memo, useEffect, useState } from "react";
import { ExternalLink, FolderSearch } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { FileInfo } from "../../shared/types";
import { humanSize, shortDate } from "../../shared/format";
import type { CanvasFlowNode } from "../nodes";
import { fileIcon, lastSegment, parentDir } from "../files/fileIcon";
import { ElementShell } from "./ElementShell";
import { useFlowStatus } from "./FlowNode";

/** O arquivo pode mudar fora do app (editor, agente): confere de tempos em tempos. */
const REFRESH_MS = 4000;

/** Qualquer arquivo do disco no canvas. Não é copiado: o elemento aponta para o original. */
function FileNodeImpl({ data, selected }: NodeProps<CanvasFlowNode>) {
  const element = data.element!;
  const path = element.path ?? "";
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [error, setError] = useState("");
  const status = useFlowStatus(element.id);

  useEffect(() => {
    let alive = true;
    const load = () => window.o.elements.fileInfo(path).then((i) => alive && setInfo(i));
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [path]);

  const open = async () => {
    const err = await window.o.elements.openPath(path);
    setError(err ? `Não consegui abrir: ${err}` : "");
  };
  const choose = async () => {
    const picked = await window.o.elements.pickFile();
    if (picked) data.actions.editElement(element.id, { path: picked });
  };

  const name = lastSegment(path);
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  const Icon = fileIcon(ext);
  const header = info?.exists ? (
    <>
      <button className="icon-button nodrag" title="Abrir com o programa padrão" onClick={open}>
        <ExternalLink size={13} />
      </button>
      <button className="icon-button nodrag" title="Mostrar na pasta (Explorer)" onClick={() => window.o.elements.revealPath(path)}>
        <FolderSearch size={13} />
      </button>
    </>
  ) : null;

  return (
    <ElementShell element={element} actions={data.actions} selected={!!selected} header={header} minWidth={240} minHeight={140}>
      <div className="file-content">
      <label className="file-flow-option nodrag" title="Respeita as permissões globais; Sandbox bloqueia a abertura externa."><input type="checkbox" checked={!!element.openOnFlow} onChange={e => data.actions.editElement(element.id, { openOnFlow: e.target.checked })} /> Abrir ao receber um fluxo</label>
      {element.openOnFlow && status && <div className={`flow-status ${status.state}`} role="status">{status.message ?? (status.state === "running" ? "Abrindo…" : "Abertura solicitada")}</div>}
      {!info ? (
        <div className="file-empty">Lendo o arquivo…</div>
      ) : !info.exists ? (
        <div className="file-empty">
          <strong>Arquivo não encontrado</strong>
          <span className="truncate" title={path}>
            {path || "Nenhum arquivo escolhido."}
          </span>
          <button className="ghost nodrag" onClick={choose}>
            Escolher outro arquivo
          </button>
        </div>
      ) : (
        <div className="file-body">
          <div className="file-card nodrag" onDoubleClick={open} title="Duplo clique abre o arquivo">
            <span className="file-icon">
              <Icon size={26} />
              {ext && <em>{ext.slice(0, 4)}</em>}
            </span>
            <span className="file-meta">
              <strong className="truncate" title={name}>
                {name}
              </strong>
              <span>
                {humanSize(info.size)} · {shortDate(info.modified)}
              </span>
              <span className="truncate file-dir" title={parentDir(path)}>
                {parentDir(path)}
              </span>
            </span>
          </div>
          {info.preview !== undefined ? (
            <pre className="file-preview nodrag nowheel">
              {info.preview}
              {info.truncated && "\n…"}
            </pre>
          ) : (
            <div className="file-nopreview">Sem pré-visualização para este tipo. Use “Abrir” para ver no programa padrão.</div>
          )}
          {error && <div className="file-error">{error}</div>}
        </div>
      )}
      </div>
    </ElementShell>
  );
}

export const FileNode = memo(FileNodeImpl);
