import { useState } from "react";
import { createPortal } from "react-dom";
import type { CommitProposal, WorkspaceIndex, WorkspaceMeta } from "../../shared/types";
import { T } from "../vocab";
import { plural } from "../../shared/plural";

interface Props {
  workspace: WorkspaceMeta;
  onIndex(index: WorkspaceIndex): void;
  onClose(): void;
}

/** Propostas de commit deixadas pelos agentes no modo "só sugerir". */
export function ProposalsDialog({ workspace, onIndex, onClose }: Props) {
  const proposals = workspace.proposals ?? [];
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog proposals-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <h2>Propostas de commit</h2>
        <p className="dialog-text">
          Nesta galáxia os agentes não commitam: eles sugerem a mensagem e você decide. Edite e commite por aqui, ou faça o commit do seu jeito no
          terminal e descarte a proposta.
        </p>
        {proposals.length === 0 && <p className="dialog-hint">Nenhuma proposta pendente.</p>}
        {proposals.map((p) => (
          <ProposalCard key={p.id} workspace={workspace} proposal={p} onIndex={onIndex} />
        ))}
        <div className="dialog-actions">
          <button className="ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProposalCard({ workspace, proposal, onIndex }: { workspace: WorkspaceMeta; proposal: CommitProposal; onIndex(i: WorkspaceIndex): void }) {
  const [title, setTitle] = useState(proposal.title);
  const [why, setWhy] = useState(proposal.why);
  const [todo, setTodo] = useState(proposal.todo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const place = proposal.universeId ? (workspace.universes?.find((u) => u.id === proposal.universeId)?.name ?? "universo removido") : T.origin;

  return (
    <div className="proposal-card">
      <div className="proposal-meta">
        <strong>{proposal.agent}</strong> · {place} · {new Date(proposal.at).toLocaleString("pt-BR")} · {plural(proposal.files.length, "arquivo", "arquivos")}
      </div>
      <label>
        Título
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Por quê
        <textarea rows={2} value={why} onChange={(e) => setWhy(e.target.value)} />
      </label>
      <label>
        Pendente <small>opcional</small>
        <input value={todo} onChange={(e) => setTodo(e.target.value)} />
      </label>
      {error && <p className="dialog-error">{error}</p>}
      <div className="dialog-actions">
        <button className="ghost" disabled={busy} onClick={async () => onIndex(await window.o.proposals.discard(workspace.id, proposal.id))}>
          Descartar proposta
        </button>
        <button
          className="primary"
          disabled={busy || !title.trim() || !why.trim()}
          onClick={async () => {
            setBusy(true);
            setError("");
            const r = await window.o.proposals.apply(workspace.id, proposal.id, { title, why, todo });
            setBusy(false);
            if (!r.ok) setError(r.error ?? "Não consegui commitar.");
            onIndex(r.index);
          }}
        >
          {busy ? "Commitando…" : "Commitar com esta mensagem"}
        </button>
      </div>
    </div>
  );
}
