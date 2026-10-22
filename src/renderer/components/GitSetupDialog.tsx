import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GitRepoState, WorkspaceMeta } from "../../shared/types";
import { plural } from "../../shared/plural";

interface Props {
  workspace: WorkspaceMeta;
  state: GitRepoState;
  onClose(): void;
  onDone(): void;
}

type Step = "intro" | "review" | "identity";

/**
 * Liga o git numa galáxia: cria o repositório e um .gitignore seguro, mostra o que
 * entraria no primeiro commit e, se preciso, pede nome/e-mail do autor.
 */
export function GitSetupDialog({ workspace, state, onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>(state.isRepo ? "review" : "intro");
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    window.o.git.identity(workspace.id).then((id) => {
      setName(id.name);
      setEmail(id.email);
    });
    if (state.isRepo) void prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prepare = async () => {
    setBusy(true);
    setError("");
    const r = await window.o.git.init(workspace.id);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Não consegui ativar o git.");
    setFiles(r.files);
    setStep("review");
  };

  const commit = async () => {
    setBusy(true);
    setError("");
    const r = await window.o.git.firstCommit(workspace.id);
    setBusy(false);
    if (r.ok) return onDone();
    if (r.needsIdentity) setStep("identity");
    setError(r.error ?? "Não consegui fazer o commit.");
  };

  const saveIdentity = async () => {
    if (!name.trim() || !email.trim()) return setError("Preencha nome e e-mail.");
    await window.o.git.setIdentity(name, email);
    setStep("review");
    await commit();
  };

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => {
          // Pode estar aberto por cima de outro diálogo: Esc fecha só este.
          e.stopPropagation();
          if (e.key === "Escape") onClose();
        }}
      >
        <h2>Ativar git em “{workspace.name}”</h2>
        {step === "intro" && (
          <>
            <p className="dialog-text">
              O git é a memória do projeto: guarda cada versão dos arquivos e o <strong>porquê</strong> de cada mudança. Os agentes usam esse
              histórico para não reler tudo, e os universos paralelos dependem dele.
            </p>
            <ul className="check-list">
              <li>
                Cria o repositório em <code>{workspace.dir}</code>
              </li>
              <li>
                Cria um <code>.gitignore</code> que deixa de fora segredos (<code>.env</code>) e dependências (<code>node_modules</code>)
              </li>
              <li>Mostra a lista de arquivos antes do primeiro commit</li>
            </ul>
          </>
        )}
        {step === "review" && (
          <>
            <p className="dialog-text">
              {files.length ? (
                <>
                  <strong>{plural(files.length, "arquivo vai", "arquivos vão")}</strong> entrar no primeiro commit. Confira se não há nada sensível; para deixar algo de fora,
                  acrescente ao <code>.gitignore</code> e clique em Atualizar.
                </>
              ) : (
                "Nenhum arquivo para commitar ainda."
              )}
            </p>
            {files.length > 0 && (
              <ul className="file-list">
                {files.slice(0, 40).map((f) => (
                  <li key={f}>{f}</li>
                ))}
                {files.length > 40 && <li className="more">e mais {files.length - 40}…</li>}
              </ul>
            )}
          </>
        )}
        {step === "identity" && (
          <>
            <p className="dialog-text">O git registra quem fez cada commit. Informe seu nome e e-mail (fica salvo para todos os projetos).</p>
            <label>
              Nome
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              E-mail
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </>
        )}
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button className="ghost" onClick={onClose}>
            Cancelar
          </button>
          {step === "intro" && (
            <button className="primary" disabled={busy} onClick={prepare}>
              {busy ? "Ativando…" : "Ativar git"}
            </button>
          )}
          {step === "review" && (
            <>
              <button className="ghost" disabled={busy} onClick={prepare}>
                Atualizar lista
              </button>
              <button className="primary" disabled={busy || !files.length} onClick={commit}>
                {busy ? "Commitando…" : "Fazer o primeiro commit"}
              </button>
            </>
          )}
          {step === "identity" && (
            <button className="primary" disabled={busy} onClick={saveIdentity}>
              Salvar e commitar
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
