import { memo, useEffect, useState } from "react";
import { ArrowUp, ExternalLink, Folder, RefreshCw } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { DirEntry } from "../../shared/types";
import { humanSize, shortDate } from "../../shared/format";
import { INNER_PATH_TYPE, type CanvasFlowNode } from "../nodes";
import { fileIcon, joinPath, lastSegment, parentDir } from "../files/fileIcon";
import { ElementShell } from "./ElementShell";

const REFRESH_MS = 4000;

type Listing = { ok: true; entries: DirEntry[]; more: number } | { ok: false; error: string };

/** Explorador em miniatura: navega a partir da pasta do elemento, sem sair dela. */
function FolderNodeImpl({ data, selected }: NodeProps<CanvasFlowNode>) {
  const element = data.element!;
  const root = element.path ?? "";
  const [cwd, setCwd] = useState(root);
  const [listing, setListing] = useState<Listing | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => setCwd(root), [root]);

  useEffect(() => {
    let alive = true;
    const load = () => window.o.elements.listDir(cwd).then((l) => alive && setListing(l));
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [cwd, tick]);

  const atRoot = cwd === root;
  const relative = atRoot ? "" : cwd.slice(root.length).replace(/^[\\/]+/, "");
  const choose = async () => {
    const picked = await window.o.workspaces.pickDirectory();
    if (picked) data.actions.editElement(element.id, { path: picked });
  };

  const header = (
    <>
      <button className="icon-button nodrag" title="Voltar para a pasta de cima" disabled={atRoot} onClick={() => setCwd(parentDir(cwd))}>
        <ArrowUp size={13} />
      </button>
      <button className="icon-button nodrag" title="Atualizar" onClick={() => setTick((t) => t + 1)}>
        <RefreshCw size={13} />
      </button>
      <button className="icon-button nodrag" title="Abrir no Explorer" onClick={() => void window.o.elements.openPath(cwd)}>
        <ExternalLink size={13} />
      </button>
    </>
  );

  return (
    <ElementShell element={element} actions={data.actions} selected={!!selected} header={header} minWidth={260} minHeight={180}>
      <div className="folder-body">
        <div className="folder-path truncate" title={cwd}>
          <Folder size={12} />
          <span className="truncate">{relative ? `${lastSegment(root)} › ${relative.replace(/[\\/]/g, " › ")}` : root}</span>
        </div>
        {!listing ? (
          <div className="file-empty">Lendo a pasta…</div>
        ) : !listing.ok ? (
          <div className="file-empty">
            <strong>{listing.error}</strong>
            <span className="truncate" title={cwd}>
              {cwd || "Nenhuma pasta escolhida."}
            </span>
            {atRoot && (
              <button className="ghost nodrag" onClick={choose}>
                Escolher outra pasta
              </button>
            )}
          </div>
        ) : listing.entries.length === 0 ? (
          <div className="file-empty">Pasta vazia.</div>
        ) : (
          <ul className="folder-list nodrag nowheel">
            {listing.entries.map((e) => {
              const full = joinPath(cwd, e.name);
              const Icon = e.isDir ? Folder : fileIcon(e.name.includes(".") ? e.name.split(".").pop()! : "");
              return (
                <li
                  key={e.name}
                  className={e.isDir ? "is-dir" : ""}
                  draggable
                  title={e.isDir ? "Clique para entrar · arraste para o canvas" : "Duplo clique abre · arraste para o canvas"}
                  onDragStart={(ev) => {
                    ev.dataTransfer.setData(INNER_PATH_TYPE, full);
                    ev.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => e.isDir && setCwd(full)}
                  onDoubleClick={() => !e.isDir && void window.o.elements.openPath(full)}
                >
                  <Icon size={14} />
                  <span className="truncate">{e.name}</span>
                  <small>{e.isDir ? "" : humanSize(e.size)}</small>
                  <small className="folder-date">{shortDate(e.modified)}</small>
                </li>
              );
            })}
            {listing.more > 0 && <li className="more">e mais {listing.more}…</li>}
          </ul>
        )}
      </div>
    </ElementShell>
  );
}

export const FolderNode = memo(FolderNodeImpl);
